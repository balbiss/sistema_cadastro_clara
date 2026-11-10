import { and, desc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, consultasCredito, pendencias, type Checagem } from '../db/schema.js';
import { consultarCpf, PROVEDOR, type ResultadoSpc } from './spc.js';
import { getRegras, type Regras } from './settings.js';
import { mudarStatus, registrarEvento } from './eventos.js';
import { acaoParaStatus, gravidade, statusNome, type Acao, type Status } from './status.js';
import { brl, cpfValido, idade, normalizaNome, soDigitos } from './util.js';

type Cadastro = typeof cadastros.$inferSelect;
type Disparo = { acao: Acao; motivo: string };

/** Item 4 do briefing: pré-qualificação → (consulta SPC conforme elegibilidade) → análise
 *  automática → um dos 5 resultados, sempre com o motivo e cada checagem registrada. */
export async function analisar(c: Cadastro, autor = 'automático') {
  const regras = await getRegras();
  const checagens: Checagem[] = [];
  const disparos: Disparo[] = [];
  const check = (regra: string, ok: boolean, detalhe: string, acao?: Acao) => {
    checagens.push({ regra, ok, detalhe });
    if (!ok && acao) disparos.push({ acao, motivo: detalhe });
  };
  const decidir = async (status: Status, motivo: string) => {
    const novo = await mudarStatus(c, status, motivo, autor, { checagens, decididoPor: 'automático', decididoEm: new Date() });
    if (status === 'pendente_avalista') await abrirPendencia(c.id, 'Conseguir avalista com a cliente', autor);
    if (status === 'analise_humana') await abrirPendencia(c.id, 'Analisar cadastro: ' + motivo, autor);
    return novo;
  };
  const pior = () => disparos.reduce((a, b) => (gravidade(b.acao) > gravidade(a.acao) ? b : a));

  // ---- pré-qualificação (antes de gastar consulta) ----
  const cpf = soDigitos(c.cpf);
  check('CPF válido', cpfValido(cpf), cpfValido(cpf) ? 'CPF válido' : 'CPF inválido', 'analise_humana');
  const anos = idade(c.dataNascimento);
  check('Idade mínima', anos !== null && anos >= regras.idadeMinima,
    anos === null ? 'Data de nascimento não informada' : `${anos} anos (mínimo ${regras.idadeMinima})`, regras.acaoMenorIdade);
  const e = c.endereco || {};
  const faltando = (['cep', 'rua', 'numero', 'bairro', 'cidade', 'uf'] as const).filter(k => !e[k]);
  check('Endereço completo', !faltando.length, faltando.length ? 'Falta no endereço: ' + faltando.join(', ') : 'Endereço completo', regras.acaoEnderecoIncompleto);
  if (cpf) {
    const outros = await db.select({ codigo: cadastros.codigo, status: cadastros.status }).from(cadastros)
      .where(and(eq(cadastros.cpf, cpf), ne(cadastros.id, c.id)));
    check('Cadastro duplicado', !outros.length,
      outros.length ? 'CPF já tem cadastro: ' + outros.map(o => `${o.codigo} (${statusNome(o.status)})`).join(', ') : 'Nenhum outro cadastro com este CPF',
      regras.acaoCpfDuplicado);
  }
  if (disparos.length) { const p = pior(); return decidir(acaoParaStatus(p.acao), p.motivo); }

  // ---- regra comercial: declarou restrição e não tem avalista → não consulta ----
  if (regras.naoConsultarRestricaoSemAvalista && c.declarouRestricao && !c.temAvalista) {
    check('Restrição declarada sem avalista', false, 'Declarou restrição e não tem avalista — SPC não consultado');
    await registrarEvento(c.id, 'spc_nao_consultado', 'SPC não consultado: declarou restrição e não tem avalista', autor);
    return decidir('pendente_avalista', 'Declarou restrição financeira e não tem avalista');
  }

  // ---- consulta do titular ----
  const spc = await consultar(c, 'titular', cpf, c.nome, autor);
  avaliarSpc(spc, c.nome, regras, check, 'Titular');
  if (disparos.length) { const p = pior(); return decidir(acaoParaStatus(p.acao), p.motivo); }

  const total = spc.totalNegativado;
  if (total <= regras.limiteSemAvalista) {
    check('Limite sem avalista', true, total ? `Restrições de ${brl(total)} — dentro do limite de ${brl(regras.limiteSemAvalista)}` : 'Nada consta');
    return decidir('aprovado', total ? `Restrições de ${brl(total)}, dentro do limite` : 'Nada consta no SPC');
  }
  if (total > regras.limiteComAvalista) {
    check('Limite com avalista', false, `Restrições de ${brl(total)} — acima de ${brl(regras.limiteComAvalista)}`);
    return decidir(acaoParaStatus(regras.acaoAcimaLimite), `Restrições de ${brl(total)}, acima do limite com avalista`);
  }
  check('Precisa de avalista', false, `Restrições de ${brl(total)} — exige avalista (entre ${brl(regras.limiteSemAvalista)} e ${brl(regras.limiteComAvalista)})`);

  // ---- avalista ----
  const av = c.avalista || {};
  const avCpf = soDigitos(av.cpf);
  if (!c.temAvalista || !avCpf) return decidir('pendente_avalista', `Restrições de ${brl(total)} — precisa de avalista`);
  check('CPF do avalista válido', cpfValido(avCpf) && avCpf !== cpf, avCpf === cpf ? 'Avalista com o mesmo CPF da titular' : cpfValido(avCpf) ? 'CPF válido' : 'CPF do avalista inválido', 'analise_humana');
  const avAnos = idade(av.dataNascimento);
  check('Idade do avalista', avAnos !== null && avAnos >= 18, avAnos === null ? 'Nascimento do avalista não informado' : `Avalista com ${avAnos} anos`, 'analise_humana');
  if (disparos.length) { const p = pior(); return decidir(acaoParaStatus(p.acao), p.motivo); }

  const spcAv = await consultar(c, 'avalista', avCpf, av.nome || '', autor);
  const limpo = spcAv.situacao === 'nada_consta';
  check('Avalista sem restrições', limpo, limpo ? 'Nada consta para o avalista' : `Avalista com restrições (${brl(spcAv.totalNegativado)}${spcAv.protestos.length ? ', protesto' : ''})`,
    regras.acaoAvalistaComRestricao);
  if (normalizaNome(spcAv.nomeConsultado) !== normalizaNome(av.nome))
    check('Nome do avalista confere', false, `Nome no SPC (“${spcAv.nomeConsultado}”) diferente do informado`, regras.acaoNomeDivergente);
  if (disparos.length) { const p = pior(); return decidir(acaoParaStatus(p.acao), p.motivo); }
  return decidir('aprovado_avalista', `Restrições de ${brl(total)} da titular, avalista aprovado`);
}

function avaliarSpc(spc: ResultadoSpc, nome: string, r: Regras, check: (regra: string, ok: boolean, detalhe: string, acao?: Acao) => void, quem: string) {
  const nomeOk = normalizaNome(spc.nomeConsultado) === normalizaNome(nome);
  check(`Nome confere (${quem})`, nomeOk, nomeOk ? 'Nome igual ao do SPC' : `Nome no SPC (“${spc.nomeConsultado}”) diferente do formulário`, r.acaoNomeDivergente);
  const palavras = r.palavrasCredorSemijoias.map(normalizaNome).filter(Boolean);
  const semijoias = spc.negativacoes.filter(n => palavras.some(p => normalizaNome(n.credor).includes(p) || normalizaNome(n.natureza).includes(p)));
  check('Credor de semijoias', !semijoias.length,
    semijoias.length ? 'Restrição com revenda de semijoias: ' + semijoias.map(n => `${n.credor} (${brl(n.valor)})`).join(', ') : 'Nenhuma restrição ligada a semijoias',
    r.acaoCredorSemijoias);
  check('Protestos', !spc.protestos.length,
    spc.protestos.length ? 'Protesto: ' + spc.protestos.map(p => `${p.cartorio} (${brl(p.valor)})`).join(', ') : 'Sem protestos', r.acaoProtesto);
}

/** Itens 2.2/2.3 do relatório de ajustes: cada consulta é paga, então o MESMO CPF só é consultado de
 *  novo depois do prazo das Regras (validadeConsultaMeses), não importa o cadastro nem a colaboradora.
 *  Dentro do prazo, a consulta original é reaproveitada e fica registrada como "reaproveitada" (custo zero). */
async function consultar(c: Cadastro, pessoa: 'titular' | 'avalista', cpf: string, nome: string, autor: string) {
  const { validadeConsultaMeses } = await getRegras();
  const desde = new Date(); desde.setMonth(desde.getMonth() - (validadeConsultaMeses ?? 3));
  const [original] = validadeConsultaMeses > 0 ? await db.select().from(consultasCredito)
    .where(and(eq(consultasCredito.cpf, cpf), isNull(consultasCredito.reaproveitadaDe), gt(consultasCredito.createdAt, desde),
      sql`coalesce((${consultasCredito.resultado}->>'descartado')::boolean, false) = false`))
    .orderBy(desc(consultasCredito.id)).limit(1) : [];
  if (original) {
    const [jaNoCadastro] = await db.select({ id: consultasCredito.id }).from(consultasCredito)
      .where(and(eq(consultasCredito.cadastroId, c.id), eq(consultasCredito.cpf, cpf), or(eq(consultasCredito.id, original.id), eq(consultasCredito.reaproveitadaDe, original.id)))).limit(1);
    if (!jaNoCadastro) {
      await db.insert(consultasCredito).values({ cadastroId: c.id, pessoa, cpf, nome, autor, provedor: original.provedor, resultado: original.resultado, reaproveitadaDe: original.id });
      const quando = original.createdAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      await registrarEvento(c.id, 'spc_reaproveitado', `SPC (${pessoa}) não consultado de novo: reaproveitada a consulta de ${quando} (prazo de ${validadeConsultaMeses} meses)`, autor,
        { pessoa, consulta_original: original.id, consultado_em: original.createdAt });
    }
    return original.resultado as ResultadoSpc;
  }
  const resultado = await consultarCpf(cpf, nome);
  await db.insert(consultasCredito).values({ cadastroId: c.id, pessoa, cpf, nome, autor, provedor: PROVEDOR, resultado });
  await registrarEvento(c.id, 'spc_consultado',
    `SPC consultado (${pessoa}): ${resultado.situacao === 'nada_consta' ? 'nada consta' : 'com restrições — ' + brl(resultado.totalNegativado)}`,
    autor, { pessoa, situacao: resultado.situacao, total: resultado.totalNegativado, protestos: resultado.protestos.length, score: resultado.score ?? null });
  return resultado;
}

export async function abrirPendencia(cadastroId: number, descricao: string, autor: string, responsavelId?: number | null, prazo?: string | null) {
  const [p] = await db.insert(pendencias).values({ cadastroId, descricao, criadaPor: autor, responsavelId: responsavelId ?? null, prazo: prazo ?? null }).returning();
  await registrarEvento(cadastroId, 'pendencia_criada', 'Pendência: ' + descricao, autor, { pendencia_id: p.id });
  return p;
}
