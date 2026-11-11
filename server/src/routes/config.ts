import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, eventos, pendencias, users } from '../db/schema.js';
import { assinarToken, exigir, PODE, requireApiKey, requireAuth } from '../lib/auth.js';
import { CENARIOS_PADRAO, MODELOS_PADRAO, PRAZOS_PADRAO, REGRAS_PADRAO, getCenarios, getIntegracao, getModelos, getPrazos, getRegras, setSetting } from '../lib/settings.js';
import { criarCadastro } from '../lib/cadastros.js';
import { enviarPendentesAoCrm, linkFormulario, mudarStatus, registrarEvento, resumoParaCrm } from '../lib/eventos.js';
import { ACOES, STATUS, situacao } from '../lib/status.js';
import { CARGOS } from '../lib/escopo.js';

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
      validadeConsultaMeses: z.number().int().min(0).max(24),
      scoreMinimo: z.number().int().min(0).max(1000).default(0), acaoScoreBaixo: acao.default('analise_humana'),
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
  const p = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), role: z.enum(CARGOS) }).safeParse(req.body);
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
  if ((CARGOS as readonly string[]).includes(req.body.role)) set.role = req.body.role;
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

// Entrada do CRM (X-Api-Key): a atendente clica "Formulário de cadastro" na conversa → o CRM chama
// aqui com o lead e QUEM é a atendente (nome + e-mail + id no CRM), recebe o link e manda pelo WhatsApp.
// Mesmo lead de novo = mesmo cadastro (não duplica). Cadastro que já é de OUTRA atendente não troca de
// dona sozinho: devolve o aviso e abre pendência pra gerência decidir (relatório de ajustes, item 4).
configRouter.post('/api/integracao/cadastros', requireApiKey, async (req, res) => {
  const id = z.union([z.string(), z.number()]).transform(String);
  const p = z.object({
    crm_lead_id: id, crm_contact_id: id.optional(),
    nome: z.string().min(2), telefone: z.string().optional(), email: z.string().optional(), cpf: z.string().optional(),
    consultora: z.string().optional(), consultora_email: z.string().optional(), crm_user_id: id.optional(),
    origem: z.string().optional(), campanha: z.string().optional(),
    cadastro_id: z.coerce.number().int().optional(), // veio do aviso quiz_aprovado: continua o MESMO cadastro
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Campos obrigatórios: crm_lead_id e nome', detalhes: p.error.flatten() });
  const d = p.data;
  const email = d.consultora_email?.trim().toLowerCase() || undefined;
  const dona = { consultoraNome: d.consultora || null, consultoraEmail: email || null, crmUserId: d.crm_user_id || null };
  let [existe] = await db.select().from(cadastros).where(eq(cadastros.crmLeadId, d.crm_lead_id)).limit(1);
  if (!existe && d.cadastro_id) {
    const [doQuiz] = await db.select().from(cadastros).where(eq(cadastros.id, d.cadastro_id)).limit(1);
    if (doQuiz && (!doQuiz.crmLeadId || doQuiz.crmLeadId === d.crm_lead_id)) {
      await db.update(cadastros).set({ crmLeadId: d.crm_lead_id, crmContactId: d.crm_contact_id || doQuiz.crmContactId, updatedAt: new Date() }).where(eq(cadastros.id, doQuiz.id));
      existe = { ...doQuiz, crmLeadId: d.crm_lead_id };
    }
  }
  let aviso: string | null = null;
  if (existe && d.consultora) {
    const semDona = !existe.consultoraNome && !existe.consultoraEmail;
    const mesma = (!!email && existe.consultoraEmail === email) || (!!d.crm_user_id && existe.crmUserId === d.crm_user_id)
      || (!existe.consultoraEmail && (existe.consultoraNome || '').trim().toLowerCase() === d.consultora.trim().toLowerCase());
    if (semDona) {
      // ex.: veio do quiz (tráfego) sem ninguém — a 1ª atendente que manda o formulário fica com ele
      [existe] = await db.update(cadastros).set({ ...dona, updatedAt: new Date() }).where(eq(cadastros.id, existe.id)).returning();
      await registrarEvento(existe.id, 'consultora_definida', 'Atendente do cadastro: ' + d.consultora, d.consultora, { ...dona });
    } else if (mesma) {
      // mesma pessoa: completa e-mail/id se o cadastro antigo só tinha o nome
      if (!existe.consultoraEmail || !existe.crmUserId)
        [existe] = await db.update(cadastros).set({ consultoraEmail: existe.consultoraEmail || dona.consultoraEmail, crmUserId: existe.crmUserId || dona.crmUserId }).where(eq(cadastros.id, existe.id)).returning();
    } else {
      const desde = existe.createdAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      aviso = 'Esta pessoa já tem cadastro (' + existe.codigo + ', ' + situacao(existe).nome + ') com ' + (existe.consultoraNome || 'outra atendente')
        + ', iniciado em ' + desde + '. A gerência foi avisada pra decidir quem fica com ele.';
      const chave = 'abordagem:' + (email || d.consultora);
      const [aberta] = await db.select({ id: pendencias.id }).from(pendencias).where(and(eq(pendencias.cadastroId, existe.id), eq(pendencias.alerta, chave), isNull(pendencias.resolvidaEm))).limit(1);
      if (!aberta) {
        await db.insert(pendencias).values({ cadastroId: existe.id, alerta: chave, bloqueia: false, criadaPor: d.consultora,
          descricao: 'Gerência: ' + d.consultora + ' também está atendendo esta pessoa (cadastro de ' + (existe.consultoraNome || '—') + '). Decidir quem fica com o cadastro.' });
        await registrarEvento(existe.id, 'nova_abordagem', d.consultora + ' pediu o formulário de um cadastro que é de ' + (existe.consultoraNome || 'outra atendente'), d.consultora,
          { nova: dona, atual: { nome: existe.consultoraNome, email: existe.consultoraEmail, crm_user_id: existe.crmUserId } });
      }
    }
  }
  // cadastro do quiz: a atendente mandou o formulário completo → passa pra "Formulário enviado"
  if (existe?.status === 'quiz_aprovado' && !aviso) {
    existe = await mudarStatus(existe, 'formulario_enviado', null, d.consultora || 'CRM', { formEnviadoEm: new Date() });
  }
  const c = existe || await criarCadastro({ nome: d.nome, telefone: d.telefone, email: d.email, cpf: d.cpf, crmLeadId: d.crm_lead_id, crmContactId: d.crm_contact_id,
    consultoraNome: d.consultora, consultoraEmail: email, crmUserId: d.crm_user_id,
    origem: d.origem || (d.consultora ? 'Prospecção ativa' : undefined), campanha: d.campanha }, d.consultora || 'CRM');
  res.status(existe ? 200 : 201).json({ ...resumoParaCrm(c), ja_existia: !!existe, aviso, link_formulario: linkFormulario(c) });
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

