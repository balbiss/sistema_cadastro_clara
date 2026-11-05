import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, consultasCredito, documentos, eventos, pendencias, users } from '../db/schema.js';
import { exigir, PODE, requireAuth } from '../lib/auth.js';
import { criarCadastro } from '../lib/cadastros.js';
import { analisar, abrirPendencia } from '../lib/analise.js';
import { linkDossie, linkFormulario, mudarStatus, registrarEvento } from '../lib/eventos.js';
import { comprovanteNoPrazo, situacaoDocs } from '../lib/documentos.js';
import { ler } from '../lib/storage.js';
import { avancar, requisitosLiberacao } from '../lib/liberacao.js';
import { formalizacaoAtual, gerarFormalizacao, linkAssinatura } from '../lib/formalizacao.js';
import { ACOES_INIC, ETAPAS_INIC, ErroInic, executarAcao, modalidadeDe, trocarModalidade, type AcaoInic } from '../lib/inicializacao.js';
import { DOC_NOME, FINAIS, STATUS, statusNome, type Status } from '../lib/status.js';
import { soDigitos } from '../lib/util.js';

export const cadastrosRouter = Router();
cadastrosRouter.use('/api/cadastros', requireAuth);
cadastrosRouter.use('/api/pendencias', requireAuth);
cadastrosRouter.use('/api/documentos', requireAuth);
cadastrosRouter.use('/api/inicializacao', requireAuth);

const quem = (req: { user?: { name: string } }) => req.user?.name || 'sistema';

async function carregar(id: number) {
  const [c] = await db.select().from(cadastros).where(eq(cadastros.id, id)).limit(1);
  return c;
}

// ---------- lista + contadores ----------
cadastrosRouter.get('/api/cadastros/resumo', async (_req, res) => {
  const porStatus = await db.select({ status: cadastros.status, n: sql<number>`count(*)::int` }).from(cadastros).groupBy(cadastros.status);
  const [{ vencidos }] = await db.select({ vencidos: sql<number>`count(*)::int` }).from(cadastros)
    .where(and(lt(cadastros.prazoEtapa, new Date()), inArray(cadastros.status, Object.keys(STATUS).filter(s => !FINAIS.includes(s as Status)))));
  const [{ abertas }] = await db.select({ abertas: sql<number>`count(*)::int` }).from(pendencias).where(isNull(pendencias.resolvidaEm));
  res.json({ status: STATUS, porStatus: Object.fromEntries(porStatus.map(r => [r.status, r.n])), vencidos, pendenciasAbertas: abertas });
});

// Painel: números do setor, o que precisa de atenção agora e as últimas movimentações.
cadastrosRouter.get('/api/cadastros/painel', async (_req, res) => {
  const agora = new Date();
  const porStatus = Object.fromEntries((await db.select({ status: cadastros.status, n: sql<number>`count(*)::int` }).from(cadastros).groupBy(cadastros.status)).map(r => [r.status, r.n]));
  const [tempos] = await db.select({
    horas: sql<number>`coalesce(avg(extract(epoch from (${cadastros.decididoEm} - ${cadastros.formConcluidoEm})) / 3600), 0)::float`,
    novos30: sql<number>`count(*) filter (where ${cadastros.createdAt} > now() - interval '30 days')::int`,
  }).from(cadastros);
  const docsAConferir = await db.selectDistinct({ id: documentos.cadastroId }).from(documentos).where(eq(documentos.status, 'enviado'));
  const docsIds = new Set(docsAConferir.map(d => d.id));
  const [{ abertas }] = await db.select({ abertas: sql<number>`count(*)::int` }).from(pendencias).where(isNull(pendencias.resolvidaEm));

  const candidatos = await db.select().from(cadastros).where(sql`${cadastros.status} not in ('reprovado','desistencia','iniciada')`).orderBy(asc(cadastros.prazoEtapa)).limit(300);
  const atencao = candidatos.map(c => {
    const vencido = !!c.prazoEtapa && c.prazoEtapa < agora;
    const razao = c.status === 'analise_humana' ? 'Aguardando decisão' : docsIds.has(c.id) ? 'Documentos para conferir'
      : c.status === 'inicializacao' && c.inicEtapa === 'aguardando_agendamento' ? 'Agendar início'
      : vencido ? (c.status === 'inicializacao' ? 'Inicialização parada' : c.status === 'aguardando_assinatura' ? 'Assinatura atrasada' : 'Prazo vencido') : null;
    return razao ? { id: c.id, codigo: c.codigo, nome: c.nome, status: c.status, motivo: c.motivo, prazoEtapa: c.prazoEtapa, vencido, razao } : null;
  }).filter(Boolean).slice(0, 8);

  const recentes = await db.select({ id: eventos.id, tipo: eventos.tipo, descricao: eventos.descricao, autor: eventos.autor, createdAt: eventos.createdAt, cadastroId: cadastros.id, nome: cadastros.nome })
    .from(eventos).innerJoin(cadastros, eq(cadastros.id, eventos.cadastroId))
    .where(inArray(eventos.tipo, ['status_alterado', 'decisao_manual', 'documento_conferido', 'documento_recusado', 'documentos_recebidos', 'formulario_enviado', 'avalista_informado', 'assinatura', 'liberado', 'inicializacao']))
    .orderBy(desc(eventos.id)).limit(6);

  const [{ iniciadas30 }] = await db.select({ iniciadas30: sql<number>`count(*)::int` }).from(cadastros).where(sql`${cadastros.iniciadaEm} > now() - interval '30 days'`);
  const total = Object.values(porStatus).reduce((a, b) => a + b, 0);
  const aprovados = ['aprovado', 'aprovado_avalista', 'documentos_ok', 'aguardando_assinatura', 'inicializacao', 'iniciada'].reduce((a, k) => a + (porStatus[k] || 0), 0);
  res.json({
    porStatus, total, aprovados, reprovados: porStatus.reprovado || 0,
    emAndamento: total - FINAIS.reduce((a, k) => a + (porStatus[k] || 0), 0),
    taxaAprovacao: aprovados + (porStatus.reprovado || 0) ? aprovados / (aprovados + (porStatus.reprovado || 0)) : null,
    horasMediasDecisao: tempos.horas, novos30: tempos.novos30,
    vencidos: candidatos.filter(c => c.prazoEtapa && c.prazoEtapa < agora).length,
    pendenciasAbertas: abertas, docsAConferir: docsIds.size,
    iniciadas: porStatus.iniciada || 0, emInicializacao: porStatus.inicializacao || 0, iniciadas30,
    atencao, recentes,
  });
});

cadastrosRouter.get('/api/cadastros', async (req, res) => {
  const conds = [];
  if (req.query.status) conds.push(eq(cadastros.status, String(req.query.status)));
  if (req.query.vencidos === '1') conds.push(lt(cadastros.prazoEtapa, new Date()));
  const q = String(req.query.q || '').trim();
  if (q) {
    const dig = soDigitos(q);
    conds.push(or(ilike(cadastros.nome, `%${q}%`), ilike(cadastros.codigo, `%${q}%`), ...(dig ? [ilike(cadastros.cpf, `%${dig}%`), ilike(cadastros.telefone, `%${dig}%`)] : []))!);
  }
  const rows = await db.select().from(cadastros).where(conds.length ? and(...conds) : undefined).orderBy(desc(cadastros.updatedAt)).limit(300);
  const ids = rows.map(r => r.id);
  const pend = ids.length ? await db.select({ id: pendencias.cadastroId, n: sql<number>`count(*)::int` }).from(pendencias)
    .where(and(inArray(pendencias.cadastroId, ids), isNull(pendencias.resolvidaEm))).groupBy(pendencias.cadastroId) : [];
  const resp = ids.length ? await db.select({ id: users.id, name: users.name }).from(users) : [];
  const pm = new Map(pend.map(p => [p.id, p.n]));
  const um = new Map(resp.map(u => [u.id, u.name]));
  res.json(rows.map(r => ({
    id: r.id, codigo: r.codigo, nome: r.nome, cpf: r.cpf, telefone: r.telefone, consultora: r.consultoraNome, origem: r.origem,
    status: r.status, statusNome: statusNome(r.status), motivo: r.motivo, etapaEntradaEm: r.etapaEntradaEm, prazoEtapa: r.prazoEtapa,
    responsavel: r.responsavelId ? um.get(r.responsavelId) || null : null, pendencias: pm.get(r.id) || 0, createdAt: r.createdAt,
    crmLeadId: r.crmLeadId,
  })));
});

// ---------- novo cadastro (manual, quando o lead não veio do CRM) ----------
cadastrosRouter.post('/api/cadastros', async (req, res) => {
  const p = z.object({ nome: z.string().min(2), telefone: z.string().optional(), cpf: z.string().optional(), consultoraNome: z.string().optional(), origem: z.string().optional(), campanha: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Informe pelo menos o nome' });
  const c = await criarCadastro(p.data, quem(req));
  res.json({ id: c.id, codigo: c.codigo, linkFormulario: linkFormulario(c) });
});

// ---------- dossiê (item 5) ----------
cadastrosRouter.get('/api/cadastros/:id', async (req, res) => {
  const c = await carregar(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Cadastro não encontrado' });
  const [consultas, docs, pends, evs, equipe] = await Promise.all([
    db.select().from(consultasCredito).where(eq(consultasCredito.cadastroId, c.id)).orderBy(desc(consultasCredito.id)),
    db.select().from(documentos).where(eq(documentos.cadastroId, c.id)).orderBy(desc(documentos.id)),
    db.select().from(pendencias).where(eq(pendencias.cadastroId, c.id)).orderBy(asc(pendencias.id)),
    db.select().from(eventos).where(eq(eventos.cadastroId, c.id)).orderBy(desc(eventos.id)),
    db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.active, true)),
  ]);
  const sd = situacaoDocs(c, docs);
  const form = await formalizacaoAtual(c.id);
  res.json({
    formalizacao: form && { ...form, assinaturas: form.assinaturas.map(a => ({ ...a, link: linkAssinatura(a.token) })) },
    liberacao: await requisitosLiberacao(c),
    inicializacao: { etapas: ETAPAS_INIC[modalidadeDe(c)], acoes: Object.entries(ACOES_INIC).filter(([, a]) => a.modalidade === modalidadeDe(c)).map(([k, a]) => ({ chave: k, ...a })) },
    cadastro: { ...c, statusNome: statusNome(c.status), linkFormulario: linkFormulario(c), linkDossie: linkDossie(c) },
    consultas, pendencias: pends, eventos: evs, equipe,
    documentos: docs.map(d => ({ ...d, nome: DOC_NOME[d.tipo] || d.tipo })),
    situacaoDocs: { situacao: sd.situacao, faltam: sd.faltam, itens: sd.itens.map(i => ({ tipo: i.tipo, nome: i.nome, docId: i.doc?.id ?? null, status: i.doc?.status ?? 'faltando' })) },
    podeDecidir: PODE.decidir(req.user!),
  });
});

// ---------- decisão manual (análise humana / contestação) ----------
const DECISOES: Status[] = ['aprovado', 'aprovado_avalista', 'pendente_avalista', 'reprovado'];
cadastrosRouter.post('/api/cadastros/:id/decisao', exigir(PODE.decidir, 'Só análise cadastral e diretoria decidem crédito'), async (req, res) => {
  const p = z.object({ status: z.enum(DECISOES as [Status, ...Status[]]), motivo: z.string().min(3) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Escolha a decisão e escreva o motivo' });
  const c = await carregar(Number(req.params.id));
  if (!c) return res.status(404).end();
  if (!['analise_humana', 'pendente_avalista', 'reprovado', 'aprovado', 'aprovado_avalista'].includes(c.status))
    return res.status(409).json({ error: `Não dá pra decidir um cadastro em "${statusNome(c.status)}"` });
  const novo = await mudarStatus(c, p.data.status, p.data.motivo, quem(req), { decididoPor: quem(req), decididoEm: new Date() });
  await registrarEvento(c.id, 'decisao_manual', `Decisão manual: ${statusNome(p.data.status)} — ${p.data.motivo}`, quem(req), { de: c.status, para: p.data.status, motivo: p.data.motivo });
  // decidiu → a pendência "Analisar cadastro" deixa de fazer sentido
  if (c.status === 'analise_humana') await db.update(pendencias).set({ resolvidaEm: new Date(), resolvidaPor: quem(req) })
    .where(and(eq(pendencias.cadastroId, c.id), isNull(pendencias.resolvidaEm), ilike(pendencias.descricao, 'Analisar cadastro%')));
  if (p.data.status === 'pendente_avalista') await abrirPendencia(c.id, 'Conseguir avalista com a cliente', quem(req));
  res.json({ ok: true, status: novo.status });
});

cadastrosRouter.post('/api/cadastros/:id/reanalisar', exigir(PODE.decidir, 'Só análise cadastral e diretoria'), async (req, res) => {
  const c = await carregar(Number(req.params.id));
  if (!c) return res.status(404).end();
  if (!c.formConcluidoEm) return res.status(409).json({ error: 'A cliente ainda não preencheu o formulário' });
  if (!['formulario_preenchido', 'pendente_avalista', 'analise_humana', 'aprovado', 'aprovado_avalista', 'reprovado'].includes(c.status))
    return res.status(409).json({ error: `Não dá pra reanalisar um cadastro em "${statusNome(c.status)}"` });
  await registrarEvento(c.id, 'reanalise', 'Análise automática refeita', quem(req));
  const novo = await analisar(c, quem(req));
  res.json({ ok: true, status: novo.status });
});

// Correção de dados (erro cadastral / contestação): guarda antes e depois.
cadastrosRouter.patch('/api/cadastros/:id', async (req, res) => {
  const c = await carregar(Number(req.params.id));
  if (!c) return res.status(404).end();
  const campos = ['nome', 'telefone', 'email', 'cpf', 'dataNascimento', 'endereco', 'avalista', 'modalidade', 'responsavelId', 'consultoraNome'] as const;
  const mudou: Record<string, { antes: unknown; depois: unknown }> = {};
  const set: Record<string, unknown> = {};
  for (const k of campos) if (k in req.body && JSON.stringify(req.body[k]) !== JSON.stringify(c[k])) {
    let v = req.body[k];
    if (k === 'cpf' || k === 'telefone') v = soDigitos(v) || null;
    mudou[k] = { antes: c[k], depois: v };
    set[k] = v;
  }
  if (!Object.keys(set).length) return res.json({ ok: true });
  await db.update(cadastros).set({ ...set, updatedAt: new Date() }).where(eq(cadastros.id, c.id));
  if ('responsavelId' in set) {
    // item 7: transferência registra quem entregou e quem recebeu
    const nomes = await db.select({ id: users.id, name: users.name }).from(users);
    const nm = (id: unknown) => nomes.find(u => u.id === id)?.name || 'ninguém';
    await registrarEvento(c.id, 'responsavel_alterado', `Responsável: ${nm(c.responsavelId)} → ${nm(set.responsavelId)}`, quem(req), { de: c.responsavelId, para: set.responsavelId });
    delete mudou.responsavelId;
  }
  if ('modalidade' in set) await trocarModalidade({ ...c, ...set } as typeof c, quem(req));
  if (Object.keys(mudou).length) await registrarEvento(c.id, 'dados_alterados', 'Dados corrigidos: ' + Object.keys(mudou).join(', '), quem(req), mudou);
  res.json({ ok: true });
});

cadastrosRouter.post('/api/cadastros/:id/desistencia', async (req, res) => {
  const motivo = String(req.body.motivo || '').trim();
  if (motivo.length < 3) return res.status(400).json({ error: 'Escreva o motivo da desistência' });
  const c = await carregar(Number(req.params.id));
  if (!c) return res.status(404).end();
  if (FINAIS.includes(c.status as Status)) return res.status(409).json({ error: `Cadastro já está em "${statusNome(c.status)}"` });
  await mudarStatus(c, 'desistencia', motivo, quem(req), { inicEtapa: null });
  res.json({ ok: true });
});

// ---------- documentos ----------
cadastrosRouter.post('/api/documentos/:id/conferir', async (req, res) => {
  const p = z.object({ status: z.enum(['conferido', 'recusado']), observacao: z.string().optional(), dataEmissao: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Dados inválidos' });
  const [d] = await db.select().from(documentos).where(eq(documentos.id, Number(req.params.id))).limit(1);
  if (!d) return res.status(404).end();
  const c = await carregar(d.cadastroId);
  let { status, observacao } = p.data;
  const ehComprovante = d.tipo.endsWith('comprovante_residencia');
  if (status === 'conferido' && ehComprovante) {
    if (!p.data.dataEmissao) return res.status(400).json({ error: 'Informe a data do comprovante de residência' });
    if (!comprovanteNoPrazo(p.data.dataEmissao)) { status = 'recusado'; observacao = 'Comprovante com mais de 3 meses — envie um mais recente'; }
  }
  if (status === 'recusado' && !observacao) return res.status(400).json({ error: 'Diga o motivo da recusa (a cliente vai ver)' });
  await db.update(documentos).set({ status, observacao: observacao || null, dataEmissao: p.data.dataEmissao || null, conferidoPor: quem(req), conferidoEm: new Date() }).where(eq(documentos.id, d.id));
  const nome = DOC_NOME[d.tipo] || d.tipo;
  if (status === 'recusado') {
    await registrarEvento(c.id, 'documento_recusado', `${nome} recusado: ${observacao}`, quem(req), { tipo: d.tipo, motivo: observacao });
    await abrirPendencia(c.id, `Reenviar ${nome}: ${observacao}`, quem(req));
  } else {
    await registrarEvento(c.id, 'documento_conferido', `${nome} conferido`, quem(req), { tipo: d.tipo });
    await avancar(c, quem(req));
  }
  res.json({ ok: true, status });
});

cadastrosRouter.get('/api/documentos/:id/arquivo', async (req, res) => {
  const [d] = await db.select().from(documentos).where(eq(documentos.id, Number(req.params.id))).limit(1);
  if (!d) return res.status(404).end();
  const arq = await ler(d.arquivo.replace(/\\/g, '/'));
  if (!arq) return res.status(404).end();
  res.setHeader('Content-Type', d.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(d.nomeOriginal || 'documento')}"`);
  arq.pipe(res);
});

// ---------- pendências (item 3/7: responsável e prazo) ----------
cadastrosRouter.post('/api/cadastros/:id/pendencias', async (req, res) => {
  const p = z.object({ descricao: z.string().min(3), responsavelId: z.number().nullable().optional(), prazo: z.string().nullable().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Descreva a pendência' });
  const c = await carregar(Number(req.params.id));
  if (!c) return res.status(404).end();
  const pend = await abrirPendencia(c.id, p.data.descricao, quem(req), p.data.responsavelId, p.data.prazo);
  res.json(pend);
});

cadastrosRouter.post('/api/pendencias/:id/resolver', async (req, res) => {
  const [p] = await db.update(pendencias).set({ resolvidaEm: new Date(), resolvidaPor: quem(req) })
    .where(and(eq(pendencias.id, Number(req.params.id)), isNull(pendencias.resolvidaEm))).returning();
  if (!p) return res.status(404).json({ error: 'Pendência não encontrada ou já resolvida' });
  await registrarEvento(p.cadastroId, 'pendencia_resolvida', 'Pendência resolvida: ' + p.descricao, quem(req), { pendencia_id: p.id });
  const c = await carregar(p.cadastroId);
  await avancar(c, quem(req));
  res.json({ ok: true });
});

cadastrosRouter.get('/api/pendencias', async (req, res) => {
  const rows = await db.select({
    id: pendencias.id, descricao: pendencias.descricao, prazo: pendencias.prazo, responsavelId: pendencias.responsavelId, createdAt: pendencias.createdAt,
    cadastroId: cadastros.id, codigo: cadastros.codigo, nome: cadastros.nome, status: cadastros.status,
  }).from(pendencias).innerJoin(cadastros, eq(cadastros.id, pendencias.cadastroId))
    .where(and(isNull(pendencias.resolvidaEm), req.query.minhas === '1' ? eq(pendencias.responsavelId, req.user!.id) : undefined))
    .orderBy(asc(pendencias.prazo), asc(pendencias.id));
  res.json(rows.map(r => ({ ...r, statusNome: statusNome(r.status) })));
});

// ---------- formalização (item 9): refazer contrato/promissória com outro valor ----------
cadastrosRouter.post('/api/cadastros/:id/formalizacao', exigir(PODE.decidir, 'Só análise cadastral e diretoria'), async (req, res) => {
  const valor = Number(req.body.valor);
  if (!(valor > 0)) return res.status(400).json({ error: 'Informe o valor da promissória' });
  const c = await carregar(Number(req.params.id));
  if (!c) return res.status(404).end();
  if (c.status !== 'aguardando_assinatura') return res.status(409).json({ error: 'Só dá pra refazer enquanto aguarda assinatura' });
  await gerarFormalizacao(c, quem(req), valor);
  res.json({ ok: true });
});

// ---------- inicialização (item 6/11) ----------
cadastrosRouter.post('/api/cadastros/:id/inicializacao', async (req, res) => {
  const acao = String(req.body.acao || '') as AcaoInic;
  if (!(acao in ACOES_INIC)) return res.status(400).json({ error: 'Ação inválida' });
  const c = await carregar(Number(req.params.id));
  if (!c) return res.status(404).end();
  const p = z.object({ data: z.string().optional(), carga: z.string().optional(), valorCarga: z.number().optional(), valorFrete: z.number().optional(), rastreio: z.string().optional(), observacao: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Dados inválidos' });
  try {
    const novo = await executarAcao(c, acao, p.data, quem(req));
    res.json({ ok: true, status: novo.status, etapa: novo.inicEtapa });
  } catch (e) {
    if (e instanceof ErroInic) return res.status(409).json({ error: e.message });
    throw e;
  }
});

// Fila da inicialização: liberadas (por sub-etapa) + iniciadas nos últimos 30 dias.
cadastrosRouter.get('/api/inicializacao', async (_req, res) => {
  const rows = await db.select().from(cadastros)
    .where(or(eq(cadastros.status, 'inicializacao'), and(eq(cadastros.status, 'iniciada'), sql`${cadastros.iniciadaEm} > now() - interval '30 days'`)))
    .orderBy(asc(cadastros.prazoEtapa)).limit(500);
  const ids = rows.map(r => r.id);
  const pend = ids.length ? await db.select({ id: pendencias.cadastroId, n: sql<number>`count(*)::int` }).from(pendencias)
    .where(and(inArray(pendencias.cadastroId, ids), isNull(pendencias.resolvidaEm))).groupBy(pendencias.cadastroId) : [];
  const pm = new Map(pend.map(p => [p.id, p.n]));
  const [{ assinatura }] = await db.select({ assinatura: sql<number>`count(*)::int` }).from(cadastros).where(inArray(cadastros.status, ['documentos_ok', 'aguardando_assinatura']));
  res.json({
    etapas: ETAPAS_INIC, acoes: ACOES_INIC, aguardandoAssinatura: assinatura,
    cadastros: rows.map(r => ({ id: r.id, codigo: r.codigo, nome: r.nome, telefone: r.telefone, consultora: r.consultoraNome, cidade: r.endereco?.cidade || null,
      modalidade: modalidadeDe(r), status: r.status, etapa: r.inicEtapa, inicializacao: r.inicializacao || {}, prazoEtapa: r.prazoEtapa,
      etapaEntradaEm: r.etapaEntradaEm, liberadoEm: r.liberadoEm, iniciadaEm: r.iniciadaEm, valorCredito: r.valorCredito, pendencias: pm.get(r.id) || 0 })),
  });
});
