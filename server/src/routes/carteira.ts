import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { avalistas, cadastros, documentos, eventos, pendencias, quizRespostas, users } from '../db/schema.js';
import { exigir, PODE, requireAuth } from '../lib/auth.js';
import { situacaoDocs } from '../lib/documentos.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { situacao } from '../lib/status.js';

// Relatório de ajustes 2, itens 4 e 6: painel individual da colaboradora — a carteira dela (kanban ou
// lista), em que situação cada candidata está, os números do mês, a meta e o ranking da equipe.
// "Carteira" = cadastros em que ela é a atendente (link pessoal, rodízio, CRM ou transferência).
export const carteiraRouter = Router();
carteiraRouter.use(['/api/carteira', '/api/config/metas'], requireAuth);

export type Metas = { padrao: number | null; porUsuario: Record<string, number | null> };
const getMetas = () => getSetting<Metas>('metas', { padrao: null, porUsuario: {} });

// situações do item 4.2 (a ordem é a das colunas do kanban)
export const GRUPOS: { chave: string; nome: string }[] = [
  { chave: 'qualificada', nome: 'Qualificação aprovada' },
  { chave: 'em_analise', nome: 'Em análise de crédito' },
  { chave: 'precisa_avalista', nome: 'Precisa de avalista' },
  { chave: 'avalista_em_analise', nome: 'Avalista em análise' },
  { chave: 'credito_aprovado', nome: 'Crédito aprovado' },
  { chave: 'documentacao', nome: 'Documentação pendente' },
  { chave: 'cadastro_aprovado', nome: 'Cadastro aprovado' },
  { chave: 'aguardando_agendamento', nome: 'Aguardando agendamento' },
  { chave: 'agendada', nome: 'Iniciação agendada' },
  { chave: 'iniciada', nome: 'Revendedora iniciada' },
  { chave: 'reprovado', nome: 'Reprovada na análise' },
  { chave: 'desistencia', nome: 'Desistência' },
];

const mesAtual = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7); // Belém (UTC-3)
const limites = (mes: string) => {
  const ini = new Date(`${mes}-01T00:00:00-03:00`);
  const fim = new Date(ini); fim.setUTCMonth(fim.getUTCMonth() + 1);
  return { ini, fim };
};
const daAtendente = (u: { name: string; email: string }) =>
  sql`(lower(${cadastros.consultoraEmail}) = ${u.email.toLowerCase()} or lower(trim(${cadastros.consultoraNome})) = ${u.name.trim().toLowerCase()})`;

carteiraRouter.get('/api/carteira', async (req, res) => {
  const eu = req.user!;
  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : mesAtual();
  const { ini, fim } = limites(mes);
  // a equipe de cadastro e a diretoria olham a carteira de qualquer colaboradora; a consultora só a dela
  let alvo = eu;
  if (req.query.userId && Number(req.query.userId) !== eu.id) {
    if (!PODE.relatorios(eu)) return res.status(403).json({ error: 'Você só vê a sua carteira' });
    const [u] = await db.select().from(users).where(eq(users.id, Number(req.query.userId))).limit(1);
    if (!u) return res.status(404).json({ error: 'Pessoa não encontrada' });
    alvo = u;
  }

  const lista = await db.select().from(cadastros).where(and(daAtendente(alvo), isNull(cadastros.descartadoEm))).orderBy(desc(cadastros.updatedAt)).limit(1000);
  const ids = lista.map(c => c.id);
  const [docs, avs, pends, aprovEv, agendEv] = ids.length ? await Promise.all([
    db.select().from(documentos).where(inArray(documentos.cadastroId, ids)),
    db.select({ cadastroId: avalistas.cadastroId, status: avalistas.status }).from(avalistas).where(inArray(avalistas.cadastroId, ids)),
    db.select({ id: pendencias.cadastroId, n: sql<number>`count(*)::int` }).from(pendencias).where(and(inArray(pendencias.cadastroId, ids), isNull(pendencias.resolvidaEm))).groupBy(pendencias.cadastroId),
    // aprovação de crédito: 1ª vez que o cadastro entrou em "aprovado"
    db.select({ id: eventos.cadastroId, em: sql<string>`min(${eventos.createdAt})` }).from(eventos)
      .where(and(inArray(eventos.cadastroId, ids), eq(eventos.tipo, 'status_alterado'), sql`${eventos.dados}->>'para' in ('aprovado','aprovado_avalista')`)).groupBy(eventos.cadastroId),
    db.select({ id: eventos.cadastroId, em: sql<string>`max(${eventos.createdAt})` }).from(eventos)
      .where(and(inArray(eventos.cadastroId, ids), eq(eventos.tipo, 'inicializacao'), sql`${eventos.dados}->>'acao' = 'agendar'`)).groupBy(eventos.cadastroId),
  ]) : [[], [], [], [], []];
  const docsDe = new Map<number, typeof docs>();
  for (const d of docs) docsDe.set(d.cadastroId, [...(docsDe.get(d.cadastroId) || []), d]);
  const avEmAnalise = new Set(avs.filter(a => a.status === 'em_analise').map(a => a.cadastroId));
  const pm = new Map(pends.map(p => [p.id, p.n]));
  const aprovadoEm = new Map(aprovEv.map(a => [a.id, new Date(a.em)]));
  const agendadoEm = new Map(agendEv.map(a => [a.id, new Date(a.em)]));
  const agora = new Date();

  const itens = lista.map(c => {
    let grupo: string, detalhe: string | null = null;
    const sd = ['aprovado', 'aprovado_avalista'].includes(c.status) ? situacaoDocs(c, docsDe.get(c.id) || []) : null;
    switch (c.status) {
      case 'quiz_aprovado': case 'formulario_enviado': grupo = 'qualificada'; detalhe = c.status === 'formulario_enviado' ? (c.formIniciadoEm ? 'Abriu o formulário' : 'Formulário enviado') : 'Mandar o formulário'; break;
      case 'formulario_preenchido': case 'analise_humana': grupo = avEmAnalise.has(c.id) ? 'avalista_em_analise' : 'em_analise'; break;
      case 'pendente_avalista': grupo = 'precisa_avalista'; break;
      case 'aprovado': case 'aprovado_avalista': {
        const enviados = (docsDe.get(c.id) || []).length;
        grupo = enviados ? 'documentacao' : 'credito_aprovado';
        detalhe = sd!.faltam.length ? 'Faltam: ' + sd!.faltam.join(', ') : 'Documentos em conferência';
        break;
      }
      case 'documentos_ok': case 'aguardando_assinatura': grupo = 'documentacao'; detalhe = 'Falta assinar o contrato'; break;
      case 'inicializacao':
        grupo = ['agendado', 'carga_pronta'].includes(c.inicEtapa || '') ? 'agendada' : c.inicEtapa === 'aguardando_agendamento' ? 'aguardando_agendamento' : 'cadastro_aprovado';
        break;
      default: grupo = c.status; // iniciada | reprovado | desistencia
    }
    return {
      id: c.id, codigo: c.codigo, nome: c.nome, telefone: c.telefone, cidade: c.endereco?.cidade || c.cidade || null, origem: c.origem, campanha: c.campanha,
      grupo, detalhe, situacao: situacao(c).nome, status: c.status, motivo: c.motivo,
      criadoEm: c.createdAt, aprovadoEm: aprovadoEm.get(c.id) || null, liberadoEm: c.liberadoEm, valorCredito: c.valorCredito,
      agendadoPara: c.inicializacao?.agendadoPara || null, iniciadaEm: c.iniciadaEm, modalidade: c.modalidade,
      pendencias: pm.get(c.id) || 0, vencido: !!c.prazoEtapa && c.prazoEtapa < agora && !['iniciada', 'reprovado', 'desistencia'].includes(c.status),
    };
  });
  const noMes = (d: Date | string | null | undefined) => !!d && new Date(d) >= ini && new Date(d) < fim;
  const conta = (g: string[]) => itens.filter(i => g.includes(i.grupo)).length;
  const numeros = {
    novos: itens.filter(i => noMes(i.criadoEm)).length,
    emAnalise: conta(['em_analise', 'avalista_em_analise', 'precisa_avalista']),
    aprovacoes: itens.filter(i => noMes(i.aprovadoEm)).length,
    cadastrosAprovados: itens.filter(i => noMes(i.liberadoEm)).length,
    pendentes: itens.filter(i => i.pendencias > 0 || i.vencido || ['documentacao', 'precisa_avalista'].includes(i.grupo)).length,
    agendamentos: lista.filter(c => noMes(agendadoEm.get(c.id))).length,
    agendadasAgora: conta(['agendada']),
    iniciacoes: itens.filter(i => noMes(i.iniciadaEm)).length,
    // item 5.2 do 1º relatório: das que entraram no mês, quantas já iniciaram
    iniciaramDoMes: itens.filter(i => noMes(i.criadoEm) && i.iniciadaEm).length,
  };
  // quiz não aprovado pelo link pessoal dela (item 4.2: "não preencheram os requisitos de qualificação")
  const naoQualificou = await db.select({ id: quizRespostas.id, nome: quizRespostas.nome, pontos: quizRespostas.pontos, createdAt: quizRespostas.createdAt }).from(quizRespostas)
    .where(and(eq(quizRespostas.colaboradoraId, alvo.id), eq(quizRespostas.aprovado, false), gte(quizRespostas.createdAt, ini), lt(quizRespostas.createdAt, fim)))
    .orderBy(desc(quizRespostas.id)).limit(200);

  // últimos 6 meses (iniciações) — a "corrida" mês a mês
  const meses: { mes: string; iniciacoes: number; aprovacoes: number }[] = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(`${mes}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - k);
    const m = d.toISOString().slice(0, 7); const l = limites(m);
    const dentro = (x: Date | string | null) => !!x && new Date(x) >= l.ini && new Date(x) < l.fim;
    meses.push({ mes: m, iniciacoes: itens.filter(i => dentro(i.iniciadaEm)).length, aprovacoes: itens.filter(i => dentro(i.aprovadoEm)).length });
  }

  // ranking do mês (iniciações, depois aprovações) entre quem tem carteira
  const rk = await db.select({
    nome: sql<string>`coalesce(nullif(trim(${cadastros.consultoraNome}), ''), ${cadastros.consultoraEmail})`,
    iniciacoes: sql<number>`count(*) filter (where ${cadastros.iniciadaEm} >= ${ini.toISOString()}::timestamptz and ${cadastros.iniciadaEm} < ${fim.toISOString()}::timestamptz)::int`,
    aprovados: sql<number>`count(*) filter (where ${cadastros.liberadoEm} >= ${ini.toISOString()}::timestamptz and ${cadastros.liberadoEm} < ${fim.toISOString()}::timestamptz)::int`,
  }).from(cadastros).where(and(sql`coalesce(nullif(trim(${cadastros.consultoraNome}), ''), ${cadastros.consultoraEmail}) is not null`, isNull(cadastros.descartadoEm)))
    .groupBy(sql`1`);
  const ranking = rk.filter(r => r.iniciacoes || r.aprovados).sort((a, b) => b.iniciacoes - a.iniciacoes || b.aprovados - a.aprovados).slice(0, 10)
    .map((r, i) => ({ ...r, posicao: i + 1, eu: r.nome.trim().toLowerCase() === alvo.name.trim().toLowerCase() }));

  const metas = await getMetas();
  const meta = metas.porUsuario[String(alvo.id)] ?? metas.padrao ?? null;
  const equipe = PODE.relatorios(eu) ? await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.active, true)).orderBy(users.name) : [];
  res.json({ mes, pessoa: { id: alvo.id, nome: alvo.name, eu: alvo.id === eu.id }, grupos: GRUPOS, itens, numeros, naoQualificou, meses, ranking, meta, equipe, podeMetas: PODE.configurar(eu) });
});

// ---------- metas (item 6.1): meta de iniciações por mês, padrão da equipe ou por pessoa ----------
carteiraRouter.get('/api/config/metas', async (_req, res) => {
  res.json({ metas: await getMetas(), equipe: await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.active, true)).orderBy(users.name) });
});
carteiraRouter.put('/api/config/metas', exigir(PODE.configurar, 'Só a diretoria define metas'), async (req, res) => {
  const n = z.number().int().min(0).max(999).nullable();
  const p = z.object({ padrao: n, porUsuario: z.record(n) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Metas inválidas' });
  await setSetting('metas', p.data);
  res.json({ ok: true });
});
