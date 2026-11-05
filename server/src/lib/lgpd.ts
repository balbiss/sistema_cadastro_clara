import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, consultasCredito, documentos, quizRespostas } from '../db/schema.js';
import { registrarEvento } from './eventos.js';
import { getLgpd, type Lgpd } from './settings.js';
import { remover } from './storage.js';

// Item 10 do briefing: "política de proteção, retenção e descarte de documentos".
// Cadastro reprovado/desistente há mais de N dias: apaga os ARQUIVOS (RG, comprovantes) e o
// resultado completo do SPC. Fica só o essencial pros indicadores (nome, etapa, motivo, datas).
// Quiz não aprovado há mais de N dias: apaga nome e WhatsApp. Revendedora iniciada: nada é apagado
// (contrato e documentos seguem válidos). Desligado até a empresa aprovar a política.
const dias = (n: number) => new Date(Date.now() - n * 86400_000);

async function alvos(l: Lgpd) {
  const cads = await db.select({ id: cadastros.id, status: cadastros.status }).from(cadastros).where(and(isNull(cadastros.descartadoEm), or(
    and(eq(cadastros.status, 'reprovado'), lt(cadastros.etapaEntradaEm, dias(l.diasReprovado))),
    and(eq(cadastros.status, 'desistencia'), lt(cadastros.etapaEntradaEm, dias(l.diasDesistencia))),
  )));
  const quiz = await db.select({ id: quizRespostas.id }).from(quizRespostas)
    .where(and(eq(quizRespostas.aprovado, false), lt(quizRespostas.createdAt, dias(l.diasQuizNaoAprovado)), sql`${quizRespostas.nome} <> '(descartado)'`));
  return { cads, quiz };
}

export async function previaDescarte(l?: Lgpd) {
  const { cads, quiz } = await alvos(l || await getLgpd());
  return { cadastros: cads.length, reprovados: cads.filter(c => c.status === 'reprovado').length, desistencias: cads.filter(c => c.status === 'desistencia').length, quiz: quiz.length };
}

export async function descartar(autor: string, forcar = false) {
  const l = await getLgpd();
  if (!l.ativo && !forcar) return { cadastros: 0, arquivos: 0, quiz: 0 };
  const { cads, quiz } = await alvos(l);
  let arquivos = 0;
  for (const c of cads) {
    const docs = await db.select().from(documentos).where(eq(documentos.cadastroId, c.id));
    for (const d of docs) { if (d.arquivo) { await remover(d.arquivo.replace(/\\/g, '/')); arquivos++; } }
    if (docs.length) await db.update(documentos).set({ arquivo: '', ia: null, observacao: 'Arquivo descartado (LGPD)' }).where(eq(documentos.cadastroId, c.id));
    await db.update(consultasCredito).set({ resultado: { descartado: true } }).where(eq(consultasCredito.cadastroId, c.id));
    await db.update(cadastros).set({ descartadoEm: new Date(), avalista: null, endereco: null, checagens: null }).where(eq(cadastros.id, c.id));
    await registrarEvento(c.id, 'descarte', `Documentos e dados de crédito descartados (política de retenção — ${docs.length} arquivo(s))`, autor);
  }
  if (quiz.length) await db.update(quizRespostas).set({ nome: '(descartado)', telefone: '', cidade: null, respostas: {}, ip: null }).where(inArray(quizRespostas.id, quiz.map(q => q.id)));
  return { cadastros: cads.length, arquivos, quiz: quiz.length };
}

export function iniciarLgpd() {
  const rodar = () => descartar('sistema (política de retenção)').then(r => { if (r.cadastros || r.quiz) console.log('LGPD: descarte', r); }).catch(err => console.error('LGPD falhou:', err));
  setTimeout(rodar, 5 * 60_000);
  setInterval(rodar, 24 * 3600_000);
}
