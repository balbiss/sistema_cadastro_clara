import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, eventos, users } from '../db/schema.js';
import { assinarToken, exigir, PODE, requireApiKey, requireAuth } from '../lib/auth.js';
import { CENARIOS_PADRAO, MODELOS_PADRAO, PRAZOS_PADRAO, REGRAS_PADRAO, getCenarios, getIntegracao, getModelos, getPrazos, getRegras, setSetting } from '../lib/settings.js';
import { criarCadastro } from '../lib/cadastros.js';
import { enviarPendentesAoCrm, linkFormulario, mudarStatus, resumoParaCrm } from '../lib/eventos.js';
import { ACOES, STATUS } from '../lib/status.js';

export const configRouter = Router();
const soDiretoria = exigir(PODE.configurar, 'Só a diretoria mexe nas configurações');
const semSenha = (u: typeof users.$inferSelect) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active });

// ---------- login ----------
configRouter.post('/api/auth/login', async (req, res) => {
  const [u] = await db.select().from(users).where(eq(users.email, String(req.body.email || '').trim().toLowerCase())).limit(1);
  if (!u || !u.active || !bcrypt.compareSync(String(req.body.password || ''), u.passwordHash))
    return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  res.json({ token: assinarToken(u), user: semSenha(u) });
});
configRouter.get('/api/auth/me', requireAuth, (req, res) => res.json(semSenha(req.user!)));

// ---------- regras de análise (item 4: "políticas configuradas pela empresa") ----------
configRouter.get('/api/config/regras', requireAuth, async (_req, res) => {
  res.json({ regras: await getRegras(), prazos: await getPrazos(), cenarios: await getCenarios(), acoes: ACOES, status: STATUS,
    padrao: { regras: REGRAS_PADRAO, prazos: PRAZOS_PADRAO, cenarios: CENARIOS_PADRAO } });
});
configRouter.put('/api/config/regras', requireAuth, soDiretoria, async (req, res) => {
  const acao = z.enum(ACOES);
  const p = z.object({
    regras: z.object({
      idadeMinima: z.number().int().min(16).max(100), acaoMenorIdade: acao, acaoCpfDuplicado: acao, acaoEnderecoIncompleto: acao,
      naoConsultarRestricaoSemAvalista: z.boolean(), limiteSemAvalista: z.number().min(0), limiteComAvalista: z.number().min(0),
      acaoAcimaLimite: acao, palavrasCredorSemijoias: z.array(z.string()), acaoCredorSemijoias: acao, acaoProtesto: acao,
      acaoNomeDivergente: acao, acaoAvalistaComRestricao: acao,
    }),
    prazos: z.record(z.number().min(0)),
    cenarios: z.record(z.enum(['nada_consta', 'negativacao_pequena', 'negativacao_media', 'negativacao_grande', 'credor_semijoias', 'protesto', 'nome_divergente'])),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Valores inválidos', detalhes: p.error.flatten() });
  if (p.data.regras.limiteComAvalista < p.data.regras.limiteSemAvalista) return res.status(400).json({ error: 'O limite com avalista tem que ser maior que o sem avalista' });
  await setSetting('regras', p.data.regras);
  await setSetting('prazos', p.data.prazos);
  await setSetting('spc_cenarios', p.data.cenarios);
  res.json({ ok: true });
});

// ---------- modelos do contrato e da promissória (item 9) ----------
configRouter.get('/api/config/modelos', requireAuth, async (_req, res) => {
  res.json({ modelos: await getModelos(), padrao: MODELOS_PADRAO });
});
configRouter.put('/api/config/modelos', requireAuth, soDiretoria, async (req, res) => {
  const p = z.object({ valorPadrao: z.number().positive(), contrato: z.string().min(20), promissoria: z.string().min(20) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Preencha o valor padrão e os dois modelos' });
  await setSetting('modelos', p.data);
  res.json({ ok: true });
});

// ---------- usuários ----------
configRouter.get('/api/usuarios', requireAuth, async (_req, res) => {
  res.json((await db.select().from(users).orderBy(users.name)).map(semSenha));
});
configRouter.post('/api/usuarios', requireAuth, soDiretoria, async (req, res) => {
  const p = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), role: z.enum(['diretoria', 'analise', 'administrativo']) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Preencha nome, e-mail, senha (mín. 6) e cargo' });
  try {
    const [u] = await db.insert(users).values({ name: p.data.name, email: p.data.email.toLowerCase(), passwordHash: bcrypt.hashSync(p.data.password, 10), role: p.data.role }).returning();
    res.json(semSenha(u));
  } catch {
    res.status(409).json({ error: 'Já existe usuário com esse e-mail' });
  }
});
configRouter.patch('/api/usuarios/:id', requireAuth, soDiretoria, async (req, res) => {
  const set: Partial<typeof users.$inferInsert> = {};
  if (typeof req.body.active === 'boolean') set.active = req.body.active;
  if (['diretoria', 'analise', 'administrativo'].includes(req.body.role)) set.role = req.body.role;
  if (req.body.password) set.passwordHash = bcrypt.hashSync(String(req.body.password), 10);
  if (req.user!.id === Number(req.params.id) && set.active === false) return res.status(400).json({ error: 'Você não pode desativar a si mesmo' });
  await db.update(users).set(set).where(eq(users.id, Number(req.params.id)));
  res.json({ ok: true });
});

// ---------- integração com o CRM ----------
configRouter.get('/api/config/integracao', requireAuth, soDiretoria, async (_req, res) => {
  const integ = await getIntegracao();
  const log = await db.select({ id: eventos.id, tipo: eventos.tipo, descricao: eventos.descricao, crmStatus: eventos.crmStatus, crmTentativas: eventos.crmTentativas, crmErro: eventos.crmErro, createdAt: eventos.createdAt, codigo: cadastros.codigo, nome: cadastros.nome })
    .from(eventos).innerJoin(cadastros, eq(cadastros.id, eventos.cadastroId)).orderBy(desc(eventos.id)).limit(60);
  res.json({ ...integ, apiUrl: (process.env.API_URL || 'http://localhost:3013') + '/api/integracao', log });
});
configRouter.put('/api/config/integracao', requireAuth, soDiretoria, async (req, res) => {
  const atual = await getIntegracao();
  await setSetting('integracao', { ...atual, webhookUrl: String(req.body.webhookUrl || '').trim() || undefined });
  void enviarPendentesAoCrm();
  res.json({ ok: true });
});
configRouter.post('/api/config/integracao/gerar-chave', requireAuth, soDiretoria, async (_req, res) => {
  const atual = await getIntegracao();
  const novo = { ...atual, apiKey: 'cad_' + crypto.randomBytes(24).toString('hex'), webhookSecret: atual.webhookSecret || crypto.randomBytes(24).toString('hex') };
  await setSetting('integracao', novo);
  res.json(novo);
});
configRouter.post('/api/config/integracao/reenviar', requireAuth, soDiretoria, async (_req, res) => {
  await db.update(eventos).set({ crmStatus: 'pendente', crmTentativas: 0 }).where(inArray(eventos.crmStatus, ['falhou', 'sem_crm']));
  void enviarPendentesAoCrm();
  res.json({ ok: true });
});

// Entrada do CRM (X-Api-Key): a consultora clica "Enviar formulário" no card → o CRM chama aqui,
// recebe o link e manda pelo WhatsApp. Mesmo lead de novo = mesmo cadastro (não duplica).
configRouter.post('/api/integracao/cadastros', requireApiKey, async (req, res) => {
  const p = z.object({
    crm_lead_id: z.union([z.string(), z.number()]).transform(String), crm_contact_id: z.union([z.string(), z.number()]).transform(String).optional(),
    nome: z.string().min(2), telefone: z.string().optional(), email: z.string().optional(), cpf: z.string().optional(),
    consultora: z.string().optional(), origem: z.string().optional(), campanha: z.string().optional(),
    cadastro_id: z.coerce.number().int().optional(), // veio do aviso quiz_aprovado: continua o MESMO cadastro
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Campos obrigatórios: crm_lead_id e nome', detalhes: p.error.flatten() });
  const d = p.data;
  let [existe] = await db.select().from(cadastros).where(eq(cadastros.crmLeadId, d.crm_lead_id)).limit(1);
  if (!existe && d.cadastro_id) {
    const [doQuiz] = await db.select().from(cadastros).where(eq(cadastros.id, d.cadastro_id)).limit(1);
    if (doQuiz && (!doQuiz.crmLeadId || doQuiz.crmLeadId === d.crm_lead_id)) {
      await db.update(cadastros).set({ crmLeadId: d.crm_lead_id, crmContactId: d.crm_contact_id || doQuiz.crmContactId, consultoraNome: d.consultora || doQuiz.consultoraNome, updatedAt: new Date() }).where(eq(cadastros.id, doQuiz.id));
      existe = { ...doQuiz, crmLeadId: d.crm_lead_id, consultoraNome: d.consultora || doQuiz.consultoraNome };
    }
  }
  // cadastro do quiz: a consultora mandou o formulário completo → passa pra "Formulário enviado"
  if (existe?.status === 'quiz_aprovado') {
    existe = await mudarStatus(existe, 'formulario_enviado', null, d.consultora || 'CRM', { formEnviadoEm: new Date() });
  }
  const c = existe || await criarCadastro({ nome: d.nome, telefone: d.telefone, email: d.email, cpf: d.cpf, crmLeadId: d.crm_lead_id, crmContactId: d.crm_contact_id,
    consultoraNome: d.consultora, origem: d.origem, campanha: d.campanha }, 'CRM');
  res.status(existe ? 200 : 201).json({ ...resumoParaCrm(c), ja_existia: !!existe, link_formulario: linkFormulario(c) });
});
configRouter.get('/api/integracao/cadastros/:crmLeadId', requireApiKey, async (req, res) => {
  const [c] = await db.select().from(cadastros).where(eq(cadastros.crmLeadId, req.params.crmLeadId)).limit(1);
  if (!c) return res.status(404).json({ error: 'Nenhum cadastro para esse lead' });
  res.json(resumoParaCrm(c));
});

// "CRM de teste": recebe os avisos localmente enquanto a ponte no v2 não fica pronta.
const recebidos: unknown[] = [];
configRouter.post('/api/crm-teste/webhook', (req, res) => {
  recebidos.unshift({ recebidoEm: new Date(), evento: req.headers['x-cadastros-evento'], corpo: req.body });
  recebidos.length = Math.min(recebidos.length, 500);
  res.json({ ok: true });
});
configRouter.get('/api/crm-teste/recebidos', requireAuth, (_req, res) => res.json(recebidos));

