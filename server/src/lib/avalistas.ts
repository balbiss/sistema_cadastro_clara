import { and, asc, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { assinaturas, avalistas, cadastros, documentos, pendencias, type Checagem, type ResultadoQuizAvalista } from '../db/schema.js';
import { getRegras, getRegrasAvalista, type RegrasAvalista } from './settings.js';
import { avaliar, type Quiz } from './quiz.js';
import { registrarEvento } from './eventos.js';
import type { ResultadoSpc } from './spc.js';
import { brl, cpfValido, idade, normalizaNome, soDigitos } from './util.js';

// Módulo de avalistas (relatório de ajustes 2, item 3). Cada candidata pode apresentar até N avalistas
// (Regras do avalista). Cada um tem quiz próprio, análise registrada, documentos na pasta dele e fica
// guardado mesmo se não for aprovado — o histórico nunca é sobrescrito. Só UM vale pro cadastro
// (cadastros.avalista_id): é ele que assina o contrato e de quem os documentos são exigidos.

type Cadastro = typeof cadastros.$inferSelect;
export type Avalista = typeof avalistas.$inferSelect;
export type DadosAvalista = {
  nome: string; cpf: string; telefone?: string | null; dataNascimento?: string | null;
  endereco?: Record<string, string | undefined> | null; parentesco?: string | null; respostas?: Record<string, string> | null;
};
export class ErroAvalista extends Error {}

export const STATUS_AVALISTA: Record<string, string> = { em_analise: 'Em análise', aprovado: 'Aprovado', reprovado: 'Não aprovado', substituido: 'Substituído' };

export const listarAvalistas = (cadastroId: number) =>
  db.select().from(avalistas).where(eq(avalistas.cadastroId, cadastroId)).orderBy(asc(avalistas.ordem));

/** O avalista "da vez": o aprovado ou o último ainda em análise. */
export async function avalistaVigente(cadastroId: number) {
  const [a] = await db.select().from(avalistas)
    .where(and(eq(avalistas.cadastroId, cadastroId), inArray(avalistas.status, ['em_analise', 'aprovado'])))
    .orderBy(desc(avalistas.ordem)).limit(1);
  return a || null;
}

export const nomeParentesco = (ra: RegrasAvalista, p?: string | null) => (p && ra.parentescos.find(x => x.id === p)?.nome) || p || null;
const quizDe = (ra: RegrasAvalista) => ({ perguntas: ra.perguntas, notaCorte: ra.notaCorte }) as unknown as Quiz;
function corrigirQuiz(ra: RegrasAvalista, respostas?: Record<string, string> | null): ResultadoQuizAvalista | null {
  if (!ra.perguntas.length) return null;
  const r = avaliar(quizDe(ra), respostas || {});
  return { pontos: r.pontos, eliminatorias: r.eliminatorias, faltando: r.faltando, itens: r.itens };
}
/** O que a candidata vê pra preencher (sem pontos e sem saber o que elimina). */
export function formularioAvalistaPublico(ra: RegrasAvalista) {
  return {
    intro: ra.intro, parentescos: ra.parentescos.map(p => ({ id: p.id, nome: p.nome })),
    perguntas: ra.perguntas.map(p => ({ id: p.id, texto: p.texto, ajuda: p.ajuda, tipo: p.tipo, mostrarSe: p.mostrarSe || null,
      opcoes: p.opcoes.map(o => ({ id: o.id, texto: o.texto, emoji: o.emoji })) })),
  };
}

const espelho = (a: Pick<Avalista, 'nome' | 'cpf' | 'telefone' | 'dataNascimento' | 'endereco'>) =>
  ({ nome: a.nome, cpf: a.cpf, telefone: a.telefone || undefined, dataNascimento: a.dataNascimento || undefined, endereco: a.endereco || undefined });

/** A candidata (pelo link) ou a equipe apresenta um avalista. Nunca apaga o anterior. */
export async function apresentarAvalista(c: Cadastro, d: DadosAvalista, autor: string): Promise<Avalista> {
  const ra = await getRegrasAvalista();
  const lista = await listarAvalistas(c.id);
  const cpf = soDigitos(d.cpf);
  if (cpf && cpf === soDigitos(c.cpf)) throw new ErroAvalista('O avalista não pode ser a própria candidata');
  if (lista.some(a => a.cpf === cpf)) throw new ErroAvalista('Esse avalista já foi apresentado neste cadastro');
  if (lista.length >= ra.maxAvalistas) throw new ErroAvalista(`Este cadastro já teve ${lista.length} avalista(s) — o limite é ${ra.maxAvalistas}`);
  const respostas = d.respostas || null;
  // o anterior que ainda estava em análise sai (fica no histórico como substituído)
  for (const a of lista.filter(x => x.status === 'em_analise'))
    await db.update(avalistas).set({ status: 'substituido', motivo: `Substituído pelo ${lista.length + 1}º avalista`, decididoEm: new Date(), decididoPor: autor }).where(eq(avalistas.id, a.id));
  const [novo] = await db.insert(avalistas).values({
    cadastroId: c.id, ordem: lista.length + 1, nome: d.nome.trim(), cpf, telefone: soDigitos(d.telefone) || null,
    dataNascimento: d.dataNascimento || null, endereco: (d.endereco as any) || null, parentesco: d.parentesco || null,
    respostas, quiz: corrigirQuiz(ra, respostas), informadoPor: autor,
  }).returning();
  await db.update(cadastros).set({ temAvalista: true, avalista: espelho(novo), updatedAt: new Date() }).where(eq(cadastros.id, c.id));
  await registrarEvento(c.id, 'avalista_informado', `${novo.ordem}º avalista informado: ${novo.nome}${novo.parentesco ? ' (' + nomeParentesco(ra, novo.parentesco) + ')' : ''}`, autor,
    { avalista_id: novo.id, ordem: novo.ordem, nome: novo.nome, parentesco: novo.parentesco });
  // a pendência "conseguir avalista" foi cumprida (senão trava a liberação lá na frente)
  const fechadas = await db.update(pendencias).set({ resolvidaEm: new Date(), resolvidaPor: autor })
    .where(and(eq(pendencias.cadastroId, c.id), isNull(pendencias.resolvidaEm), ilike(pendencias.descricao, 'Conseguir%avalista%'))).returning();
  for (const f of fechadas) await registrarEvento(c.id, 'pendencia_resolvida', 'Pendência resolvida: ' + f.descricao, autor, { pendencia_id: f.id });
  return novo;
}

export type ResultadoAvalista = { resultado: 'aprovado' | 'reprovado' | 'humano'; motivo: string; checagens: Checagem[] };

/** Requisitos do avalista (idade, parentesco, quiz) ANTES de gastar consulta; depois o SPC. */
export async function analisarAvalista(c: Cadastro, av: Avalista, consultar: (cpf: string, nome: string) => Promise<ResultadoSpc>): Promise<ResultadoAvalista> {
  const ra = await getRegrasAvalista();
  const regras = await getRegras();
  const checagens: Checagem[] = [];
  let reprova: string | null = null, humano: string | null = null;
  const check = (regra: string, ok: boolean, detalhe: string, efeito?: 'reprova' | 'humano') => {
    checagens.push({ regra: `Avalista ${av.ordem} — ${regra}`, ok, detalhe });
    if (!ok && efeito === 'reprova' && !reprova) reprova = `${regra}: ${detalhe}`;
    if (!ok && efeito === 'humano' && !humano) humano = `${regra}: ${detalhe}`;
  };
  const cpf = soDigitos(av.cpf);
  check('CPF', cpfValido(cpf) && cpf !== soDigitos(c.cpf), cpf === soDigitos(c.cpf) ? 'Mesmo CPF da candidata' : cpfValido(cpf) ? 'CPF válido' : 'CPF inválido', 'humano');

  const anos = idade(av.dataNascimento);
  const faixa = ra.idadeMaxima ? `de ${ra.idadeMinima} a ${ra.idadeMaxima} anos` : `a partir de ${ra.idadeMinima} anos`;
  if (anos === null) check('Idade', false, 'Data de nascimento não informada', 'humano');
  else check('Idade', anos >= ra.idadeMinima && (!ra.idadeMaxima || anos <= ra.idadeMaxima), `${anos} anos (aceito ${faixa})`, 'reprova');

  const restringe = ra.parentescos.some(p => !p.aceito);
  const par = av.parentesco ? ra.parentescos.find(p => p.id === av.parentesco || normalizaNome(p.nome) === normalizaNome(av.parentesco)) : null;
  if (!av.parentesco) check('Parentesco', !restringe, restringe ? 'Vínculo não informado' : 'Não informado (todos os vínculos são aceitos)', 'humano');
  else if (!par) check('Parentesco', false, `Vínculo “${av.parentesco}” não está na lista da empresa`, 'humano');
  else check('Parentesco', par.aceito, par.aceito ? `${par.nome} — aceito` : `${par.nome} — vínculo não aceito pela empresa`, 'reprova');

  const quiz = corrigirQuiz(ra, av.respostas); // corrige de novo: a direção pode ter mudado os pontos
  if (quiz) {
    await db.update(avalistas).set({ quiz }).where(eq(avalistas.id, av.id));
    const pesa = ra.notaCorte > 0 || ra.perguntas.some(p => p.opcoes.some(o => o.elimina));
    if (quiz.eliminatorias.length) check('Quiz do avalista', false, 'Resposta eliminatória: ' + quiz.eliminatorias.join('; '), 'reprova');
    else if (quiz.faltando.length && pesa) check('Quiz do avalista', false, 'Quiz incompleto: ' + quiz.faltando.join('; '), 'humano');
    else check('Quiz do avalista', quiz.pontos >= ra.notaCorte, ra.notaCorte ? `${quiz.pontos} pontos (mínimo ${ra.notaCorte})` : `${quiz.pontos} pontos${quiz.faltando.length ? ' (não respondeu tudo)' : ''}`, 'reprova');
  }
  // não passou nos requisitos: não gasta consulta ao SPC
  if (reprova) return { resultado: 'reprovado', motivo: reprova, checagens };
  if (humano) return { resultado: 'humano', motivo: humano, checagens };

  const spc = await consultar(cpf, av.nome);
  if (normalizaNome(spc.nomeConsultado) !== normalizaNome(av.nome))
    check('Nome confere', false, `Nome no SPC (“${spc.nomeConsultado}”) diferente do informado`, regras.acaoNomeDivergente === 'reprovar' ? 'reprova' : 'humano');
  check('Protestos', !spc.protestos.length || ra.aceitarProtesto, spc.protestos.length ? 'Protesto: ' + spc.protestos.map(p => `${p.cartorio} (${brl(p.valor)})`).join(', ') : 'Sem protestos', 'reprova');
  const total = spc.totalNegativado;
  check('Restrições no SPC', total <= ra.restricaoMaxima, total ? `${brl(total)} negativado (aceito até ${brl(ra.restricaoMaxima)})` : 'Nada consta', 'reprova');
  if (ra.scoreMinimo > 0 && spc.score != null) check('Score', spc.score >= ra.scoreMinimo, `Score ${spc.score} (mínimo ${ra.scoreMinimo})`, 'reprova');
  if (reprova) return { resultado: 'reprovado', motivo: reprova, checagens };
  if (humano) return { resultado: 'humano', motivo: humano, checagens };
  return { resultado: 'aprovado', motivo: 'Avalista atende aos requisitos e ao crédito', checagens };
}

/** Grava a decisão no avalista. Aprovado vira O avalista do cadastro (os outros aprovados saem). */
export async function decidirAvalista(c: Cadastro, av: Avalista, status: 'aprovado' | 'reprovado' | 'em_analise', motivo: string, autor: string, checagens?: Checagem[]) {
  const ra = await getRegrasAvalista();
  const agora = new Date();
  await db.update(avalistas).set({ status, motivo, decididoPor: autor, decididoEm: agora, ...(checagens ? { checagens } : {}) }).where(eq(avalistas.id, av.id));
  if (status === 'aprovado') {
    await db.update(avalistas).set({ status: 'substituido', motivo: `Substituído pelo ${av.ordem}º avalista (aprovado)`, decididoEm: agora, decididoPor: autor })
      .where(and(eq(avalistas.cadastroId, c.id), eq(avalistas.status, 'aprovado'), sql`${avalistas.id} <> ${av.id}`));
    await db.update(cadastros).set({ avalistaId: av.id, temAvalista: true, avalista: espelho(av), updatedAt: agora }).where(eq(cadastros.id, c.id));
  } else if (c.avalistaId === av.id) {
    await db.update(cadastros).set({ avalistaId: null, updatedAt: agora }).where(eq(cadastros.id, c.id));
  }
  if (status !== 'em_analise') {
    const nome = `${av.ordem}º avalista (${av.nome}${av.parentesco ? ', ' + nomeParentesco(ra, av.parentesco) : ''})`;
    await registrarEvento(c.id, status === 'aprovado' ? 'avalista_aprovado' : 'avalista_reprovado',
      `${nome} ${status === 'aprovado' ? 'aprovado' : 'não aprovado'}: ${motivo}`, autor, { avalista_id: av.id, ordem: av.ordem, motivo });
  }
  const [atual] = await db.select().from(cadastros).where(eq(cadastros.id, c.id));
  return atual;
}

/** Ainda dá pra apresentar outro avalista? */
export async function tentativas(cadastroId: number) {
  const ra = await getRegrasAvalista();
  const n = (await listarAvalistas(cadastroId)).length;
  return { usadas: n, max: ra.maxAvalistas, podeOutro: n < ra.maxAvalistas, acaoEsgotou: ra.acaoEsgotou };
}

/** Cadastros antigos (avalista num campo só): vira o 1º avalista, aprovado se o cadastro já seguiu com ele. */
export async function migrarAvalistasLegados() {
  const antigos = await db.select().from(cadastros)
    .where(and(isNull(cadastros.avalistaId), sql`${cadastros.avalista}->>'cpf' is not null`, sql`coalesce(${cadastros.avalista}->>'cpf','') <> ''`));
  let n = 0;
  for (const c of antigos) {
    const [ja] = await db.select({ id: avalistas.id }).from(avalistas).where(eq(avalistas.cadastroId, c.id)).limit(1);
    if (ja) continue;
    const [assinou] = await db.select({ id: assinaturas.id }).from(assinaturas).where(and(eq(assinaturas.cadastroId, c.id), eq(assinaturas.papel, 'avalista'))).limit(1);
    const [doc] = await db.select({ id: documentos.id }).from(documentos).where(and(eq(documentos.cadastroId, c.id), ilike(documentos.tipo, 'avalista_%'))).limit(1);
    const seguiu = c.status === 'aprovado_avalista' || !!assinou || !!doc;
    if (!seguiu) continue; // ainda em análise: a próxima análise cria o avalista
    const a = c.avalista!;
    const [av] = await db.insert(avalistas).values({
      cadastroId: c.id, ordem: 1, nome: a.nome || 'Avalista', cpf: soDigitos(a.cpf), telefone: soDigitos(a.telefone) || null,
      dataNascimento: a.dataNascimento || null, endereco: a.endereco || null, status: 'aprovado', motivo: 'Avalista do cadastro antes do módulo de avalistas',
      decididoPor: 'migração', decididoEm: c.decididoEm || new Date(), informadoPor: 'migração', createdAt: c.createdAt,
    }).returning();
    await db.update(cadastros).set({ avalistaId: av.id }).where(eq(cadastros.id, c.id));
    await db.update(documentos).set({ avalistaId: av.id }).where(and(eq(documentos.cadastroId, c.id), ilike(documentos.tipo, 'avalista_%'), isNull(documentos.avalistaId)));
    n++;
  }
  if (n) console.log(`Avalistas: ${n} cadastro(s) antigo(s) migrados para o módulo de avalistas`);
}

/** Avalista vindo do campo antigo do formulário (API antiga / cadastro anterior ao módulo). */
export async function avalistaDoFormulario(c: Cadastro, autor: string) {
  const a = c.avalista;
  if (!c.temAvalista || !soDigitos(a?.cpf)) return null;
  const lista = await listarAvalistas(c.id);
  if (lista.some(x => x.cpf === soDigitos(a!.cpf))) return null; // esse já foi analisado (e não está vigente)
  try { return await apresentarAvalista(c, { nome: a!.nome || 'Avalista', cpf: a!.cpf!, telefone: a!.telefone, dataNascimento: a!.dataNascimento, endereco: a!.endereco as any }, autor); }
  catch { return null; }
}


