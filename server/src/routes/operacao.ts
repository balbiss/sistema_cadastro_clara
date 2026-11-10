import { Router } from 'express';
import { z } from 'zod';
import { and, eq, gte, inArray, isNotNull, isNull, lte, notInArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, consultasCredito, eventos, formalizacoes, pendencias, quizRespostas, users } from '../db/schema.js';
import { exigir, PODE, requireAuth } from '../lib/auth.js';
import { rodarAlertas } from '../lib/alertas.js';
import { iaDisponivel } from '../lib/ia.js';
import { descartar, previaDescarte } from '../lib/lgpd.js';
import { jueriConfigurado, sincronizarJueri, ultimaSync } from '../lib/jueri.js';
import { podeVer } from '../lib/escopo.js';
import { FINAIS, STATUS, statusNome } from '../lib/status.js';
import { SETORES, getLgpd, getOperacao, getSetores, setSetting, type Lgpd } from '../lib/settings.js';

// Setores (item 7), alertas (item 9), LGPD (item 10) e relatórios do cadastro (item 8).
export const operacaoRouter = Router();
operacaoRouter.use('/api/operacao', requireAuth);
operacaoRouter.use('/api/relatorios', requireAuth);
const soDiretoria = exigir(PODE.configurar, 'Só a diretoria mexe nessas configurações');
const quem = (req: { user?: { name: string } }) => req.user?.name || 'sistema';

operacaoRouter.get('/api/operacao/config', soDiretoria, async (_req, res) => {
  const [setores, operacao, lgpd, equipe] = await Promise.all([getSetores(), getOperacao(), getLgpd(), db.select({ id: users.id, name: users.name, role: users.role, active: users.active }).from(users)]);
  res.json({ setores, nomesSetores: SETORES, etapas: STATUS, operacao, lgpd, equipe: equipe.filter(u => u.active), iaDisponivel: iaDisponivel(), previa: await previaDescarte(lgpd),
    jueri: { configurado: jueriConfigurado(), ultimaSync } });
});

operacaoRouter.put('/api/operacao/config', soDiretoria, async (req, res) => {
  const p = z.object({
    setores: z.object({ etapas: z.record(z.string()), responsaveis: z.record(z.number().nullable()) }),
    operacao: z.object({ alertas: z.boolean(), ia: z.boolean() }),
    lgpd: z.object({ ativo: z.boolean(), diasReprovado: z.coerce.number().min(30), diasDesistencia: z.coerce.number().min(30), diasQuizNaoAprovado: z.coerce.number().min(30) }),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Confira os campos (prazo mínimo de guarda: 30 dias)' });
  for (const s of Object.values(p.data.setores.etapas)) if (!SETORES[s]) return res.status(400).json({ error: 'Setor inválido: ' + s });
  await setSetting('setores', p.data.setores);
  await setSetting('operacao', p.data.operacao);
  await setSetting('lgpd', p.data.lgpd);
  res.json({ ok: true, previa: await previaDescarte(p.data.lgpd as Lgpd) });
});

operacaoRouter.post('/api/operacao/jueri/sincronizar', exigir(PODE.relatorios, 'Sem permissão'), async (_req, res) => {
  if (!jueriConfigurado()) return res.status(400).json({ error: 'Jueri não configurado no servidor' });
  res.json(await sincronizarJueri());
});
operacaoRouter.post('/api/operacao/jueri/cadastro/:id', async (req, res) => {
  if (!jueriConfigurado()) return res.status(400).json({ error: 'Jueri não configurado no servidor' });
  const [c] = await db.select().from(cadastros).where(eq(cadastros.id, Number(req.params.id))).limit(1);
  if (!c || !podeVer(req.user!, c)) return res.status(404).json({ error: 'Cadastro não encontrado' });
  if (!['inicializacao', 'iniciada'].includes(c.status)) return res.status(409).json({ error: 'Só revendedora liberada/iniciada é ligada ao Jueri' });
  const r = await sincronizarJueri(c.id);
  const [atual] = await db.select({ jueriId: cadastros.jueriId, jueri: cadastros.jueri }).from(cadastros).where(eq(cadastros.id, c.id));
  res.json({ ...r, ...atual });
});
operacaoRouter.post('/api/operacao/alertas/rodar', soDiretoria, async (_req, res) => res.json(await rodarAlertas()));
operacaoRouter.post('/api/operacao/lgpd/descartar', soDiretoria, async (req, res) => {
  const l = await getLgpd();
  if (!l.ativo) return res.status(400).json({ error: 'Ligue a política de descarte e salve antes' });
  res.json(await descartar(quem(req) + ' (descarte manual)'));
});

// ---------- Relatórios (item 8 — parte do cadastro) ----------
const APROV = ['aprovado', 'aprovado_avalista', 'documentos_ok', 'aguardando_assinatura', 'inicializacao', 'iniciada'];
const DOCS_OK = ['documentos_ok', 'aguardando_assinatura', 'inicializacao', 'iniciada'];
const horas = (a?: Date | null, b?: Date | null) => (a && b ? (+b - +a) / 3600_000 : null);
const media = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null && x >= 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

operacaoRouter.get('/api/relatorios', exigir(PODE.relatorios, 'Relatórios: só diretoria, análise e administrativo'), async (req, res) => {
  const ate = req.query.ate ? new Date(String(req.query.ate) + 'T23:59:59') : new Date();
  const de = req.query.de ? new Date(String(req.query.de) + 'T00:00:00') : new Date(+ate - 90 * 86400_000);
  const conds = [gte(cadastros.createdAt, de), lte(cadastros.createdAt, ate)];
  if (req.query.modalidade) conds.push(String(req.query.modalidade) === 'indefinida' ? isNull(cadastros.modalidade) : eq(cadastros.modalidade, String(req.query.modalidade)));
  if (req.query.origem) conds.push(eq(cadastros.origem, String(req.query.origem)));
  if (req.query.consultora) conds.push(eq(cadastros.consultoraNome, String(req.query.consultora)));
  const lista = await db.select().from(cadastros).where(and(...conds));
  const ids = lista.map(c => c.id);

  const [evs, consultas, forms] = ids.length ? await Promise.all([
    db.select({ cadastroId: eventos.cadastroId, dados: eventos.dados }).from(eventos).where(and(inArray(eventos.cadastroId, ids), eq(eventos.tipo, 'status_alterado'))),
    db.selectDistinct({ cadastroId: consultasCredito.cadastroId }).from(consultasCredito).where(inArray(consultasCredito.cadastroId, ids)),
    db.selectDistinct({ cadastroId: formalizacoes.cadastroId }).from(formalizacoes).where(and(inArray(formalizacoes.cadastroId, ids), isNotNull(formalizacoes.concluidaEm))),
  ]) : [[], [], []];
  const passou = new Map<number, Set<string>>();
  for (const c of lista) passou.set(c.id, new Set([c.status]));
  for (const e of evs) { const para = (e.dados as any)?.para; if (para) passou.get(e.cadastroId)?.add(para); }
  const comSpc = new Set(consultas.map(x => x.cadastroId)), assinado = new Set(forms.map(x => x.cadastroId));
  const algum = (id: number, ss: string[]) => ss.some(s => passou.get(id)!.has(s));

  const marcos = (c: typeof lista[number]) => ({
    enviado: !!c.formEnviadoEm || !!c.formConcluidoEm || algum(c.id, ['formulario_enviado']),
    iniciado: !!c.formIniciadoEm || !!c.formConcluidoEm,
    concluido: !!c.formConcluidoEm,
    spc: comSpc.has(c.id),
    aprovado: algum(c.id, APROV),
    avalista: algum(c.id, ['aprovado_avalista']),
    reprovado: algum(c.id, ['reprovado']),
    docsOk: algum(c.id, DOCS_OK),
    assinado: assinado.has(c.id) || algum(c.id, ['inicializacao', 'iniciada']),
    liberado: !!c.liberadoEm,
    iniciada: !!c.iniciadaEm,
    desistencia: c.status === 'desistencia',
  });
  const M = new Map(lista.map(c => [c.id, marcos(c)]));
  const conta = (k: keyof ReturnType<typeof marcos>, sub = lista) => sub.filter(c => M.get(c.id)![k]).length;

  const funil = [
    { chave: 'abertos', nome: 'Cadastros abertos', n: lista.length },
    { chave: 'enviado', nome: 'Formulário enviado', n: conta('enviado') },
    { chave: 'iniciado', nome: 'Formulário iniciado', n: conta('iniciado') },
    { chave: 'concluido', nome: 'Formulário concluído', n: conta('concluido') },
    { chave: 'spc', nome: 'SPC consultado', n: conta('spc') },
    { chave: 'aprovado', nome: 'Crédito aprovado', n: conta('aprovado') },
    { chave: 'docsOk', nome: 'Documentação completa', n: conta('docsOk') },
    { chave: 'assinado', nome: 'Contrato assinado', n: conta('assinado') },
    { chave: 'liberado', nome: 'Cadastro aprovado (liberada)', n: conta('liberado') },
    { chave: 'iniciada', nome: 'Revendedora iniciada', n: conta('iniciada') },
  ];
  const decisoes = { aprovados: conta('aprovado'), comAvalista: conta('avalista'), reprovados: conta('reprovado'), desistencias: conta('desistencia'),
    pendentes: lista.filter(c => ['formulario_preenchido', 'pendente_avalista', 'analise_humana'].includes(c.status)).length };

  const tempos = [
    { nome: 'Entrada → formulário concluído', horas: media(lista.map(c => horas(c.createdAt, c.formConcluidoEm))) },
    { nome: 'Formulário → decisão de crédito', horas: media(lista.map(c => horas(c.formConcluidoEm, c.decididoEm))) },
    { nome: 'Decisão → liberação', horas: media(lista.map(c => horas(c.decididoEm, c.liberadoEm))) },
    { nome: 'Liberação → iniciada', horas: media(lista.map(c => horas(c.liberadoEm, c.iniciadaEm))) },
    { nome: 'Entrada → iniciada (total)', horas: media(lista.map(c => horas(c.createdAt, c.iniciadaEm))) },
  ];

  // resultado depois de iniciada (Jueri): o LTV usa VENDA REAL — sem dado de venda fica null, nunca o consignado
  const carteiraDe = (sub: typeof lista) => {
    const ini = sub.filter(c => c.iniciadaEm), lig = ini.filter(c => c.jueri && !c.jueri.erro);
    const comVenda = lig.filter(c => c.jueri!.faturamento != null);
    const soma = (f: (j: NonNullable<typeof lig[number]['jueri']>) => number) => lig.reduce((s, c) => s + f(c.jueri!), 0);
    return {
      iniciadas: ini.length, ligadasJueri: lig.length, ativasHoje: lig.filter(c => c.jueri!.ativa).length,
      inadimplentes: lig.filter(c => c.jueri!.inadimplente).length,
      pedidosMedio: lig.length ? soma(j => j.pedidos) / lig.length : null,
      primeiraCargaMedia: lig.length ? soma(j => j.primeiraCarga?.valor || 0) / lig.length : null,
      valorConsignado: soma(j => j.valorConsignado),
      faturamento: comVenda.length ? comVenda.reduce((s, c) => s + (c.jueri!.faturamento || 0), 0) : null,
      ltv: comVenda.length ? comVenda.reduce((s, c) => s + (c.jueri!.faturamento || 0), 0) / comVenda.length : null,
      comDadoDeVenda: comVenda.length,
    };
  };
  const agrupar = (chave: (c: typeof lista[number]) => string) => {
    const g = new Map<string, typeof lista>();
    for (const c of lista) { const k = chave(c); g.set(k, [...(g.get(k) || []), c]); }
    return [...g.entries()].map(([nome, sub]) => ({
      nome, total: sub.length, concluidos: conta('concluido', sub), aprovados: conta('aprovado', sub), reprovados: conta('reprovado', sub),
      iniciadas: conta('iniciada', sub), conversao: sub.length ? conta('iniciada', sub) / sub.length : 0,
      diasAteIniciar: (() => { const h = media(sub.map(c => horas(c.createdAt, c.iniciadaEm))); return h == null ? null : h / 24; })(),
      carteira: carteiraDe(sub),
    })).sort((a, b) => b.total - a.total);
  };
  const mod = (c: typeof lista[number]) => (c.modalidade === 'presencial' ? 'Presencial (matriz)' : c.modalidade === 'online' ? 'Online (envio)' : 'Ainda não definida');

  const motivos = (st: string) => {
    const m = new Map<string, number>();
    for (const c of lista.filter(x => x.status === st)) { const k = (c.motivo || 'Sem motivo registrado').slice(0, 120); m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n).slice(0, 10);
  };

  // retrato de agora (independe do período): onde os cadastros estão parados e com quem
  const agora = new Date();
  const abertos = await db.select().from(cadastros).where(notInArray(cadastros.status, FINAIS));
  const parados = Object.keys(STATUS).filter(s => !FINAIS.includes(s as any)).map(s => {
    const sub = abertos.filter(c => c.status === s);
    return { status: s, nome: statusNome(s), n: sub.length, vencidos: sub.filter(c => c.prazoEtapa && c.prazoEtapa < agora).length };
  }).filter(x => x.n);
  const equipe = await db.select({ id: users.id, name: users.name }).from(users);
  const nomeU = new Map(equipe.map(u => [u.id, u.name]));
  const pends = await db.select({ resp: pendencias.responsavelId, bloqueia: pendencias.bloqueia, prazo: pendencias.prazo }).from(pendencias).where(isNull(pendencias.resolvidaEm));
  const porResp = new Map<string, { cadastros: number; pendencias: number; vencidas: number }>();
  const hoje = agora.toISOString().slice(0, 10);
  for (const c of abertos) { const k = c.responsavelId ? nomeU.get(c.responsavelId) || '?' : 'Sem responsável'; const v = porResp.get(k) || { cadastros: 0, pendencias: 0, vencidas: 0 }; v.cadastros++; porResp.set(k, v); }
  for (const p of pends) { const k = p.resp ? nomeU.get(p.resp) || '?' : 'Sem responsável'; const v = porResp.get(k) || { cadastros: 0, pendencias: 0, vencidas: 0 }; v.pendencias++; if (p.prazo && p.prazo < hoje) v.vencidas++; porResp.set(k, v); }
  const porSetor = Object.entries(SETORES).map(([k, nome]) => ({ setor: k, nome, n: abertos.filter(c => c.setor === k).length })).filter(x => x.n);

  const [quiz] = await db.select({ total: sql<number>`count(*)::int`, aprovadas: sql<number>`count(*) filter (where aprovado)::int` })
    .from(quizRespostas).where(and(gte(quizRespostas.createdAt, de), lte(quizRespostas.createdAt, ate)));
  const filtros = {
    origens: [...new Set((await db.selectDistinct({ o: cadastros.origem }).from(cadastros)).map(x => x.o).filter(Boolean))],
    consultoras: [...new Set((await db.selectDistinct({ o: cadastros.consultoraNome }).from(cadastros)).map(x => x.o).filter(Boolean))],
  };

  res.json({
    periodo: { de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10) }, filtros, quiz,
    funil, decisoes, tempos, carteira: carteiraDe(lista), jueri: { configurado: jueriConfigurado(), ultimaSync },
    porOrigem: agrupar(c => c.origem || 'Sem origem'), porConsultora: agrupar(c => c.consultoraNome || 'Sem consultora'),
    porModalidade: agrupar(mod), porSafra: agrupar(c => c.createdAt.toISOString().slice(0, 7)).sort((a, b) => a.nome.localeCompare(b.nome)),
    motivosReprovacao: motivos('reprovado'), motivosDesistencia: motivos('desistencia'),
    agora: { parados, porResponsavel: [...porResp.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.pendencias - a.pendencias), porSetor },
    linhas: lista.map(c => ({ codigo: c.codigo, nome: c.nome, origem: c.origem, campanha: c.campanha, consultora: c.consultoraNome, modalidade: c.modalidade,
      status: statusNome(c.status), motivo: c.motivo, entrada: c.createdAt, formConcluido: c.formConcluidoEm, decidido: c.decididoEm, liberado: c.liberadoEm, iniciada: c.iniciadaEm })),
  });
});
