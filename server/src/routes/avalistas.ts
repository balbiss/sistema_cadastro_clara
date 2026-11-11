import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { avalistas, cadastros } from '../db/schema.js';
import { exigir, PODE, requireAuth } from '../lib/auth.js';
import { podeVer } from '../lib/escopo.js';
import { analisar, depoisDeAvalistaReprovado } from '../lib/analise.js';
import { mudarStatus, registrarEvento } from '../lib/eventos.js';
import { apresentarAvalista, decidirAvalista, ErroAvalista } from '../lib/avalistas.js';
import { carregarDocsConfig, DOCS_EXIGIDOS_PADRAO, getRegrasAvalista, REGRAS_AVALISTA_PADRAO, setSetting } from '../lib/settings.js';
import { ACOES, DOC_NOME, DOCS_POSSIVEIS, statusNome } from '../lib/status.js';
import { avancar } from '../lib/liberacao.js';

// Módulo de avalistas (relatório 2, item 3): a equipe inclui avalista pela candidata, decide na mão
// (análise humana) e a diretoria configura os requisitos e os documentos obrigatórios.
export const avalistasRouter = Router();
avalistasRouter.use(['/api/avalistas', '/api/config/avalista', '/api/config/documentos'], requireAuth);
const quem = (req: { user?: { name: string } }) => req.user?.name || 'sistema';
const soDiretoria = exigir(PODE.configurar, 'Só a diretoria mexe nas configurações');

const endereco = z.object({ cep: z.string(), rua: z.string(), numero: z.string(), complemento: z.string().optional(), bairro: z.string(), cidade: z.string(), uf: z.string() }).partial();
const dadosAvalista = z.object({
  nome: z.string().min(3), cpf: z.string().min(11), telefone: z.string().optional(), dataNascimento: z.string().optional(),
  endereco: endereco.optional(), parentesco: z.string().optional(), respostas: z.record(z.string()).optional(),
});
const AGUARDANDO = ['pendente_avalista', 'analise_humana'];

// A equipe registra o avalista que a candidata passou pelo WhatsApp (mesmo efeito do link da cliente).
avalistasRouter.post('/api/cadastros/:id/avalistas', requireAuth, exigir(PODE.abrirCadastro, 'Logística não inclui avalista'), async (req, res) => {
  const p = dadosAvalista.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Preencha nome e CPF do avalista', detalhes: p.error.flatten() });
  const [c] = await db.select().from(cadastros).where(eq(cadastros.id, Number(req.params.id))).limit(1);
  if (!c || !podeVer(req.user!, c)) return res.status(404).json({ error: 'Cadastro não encontrado' });
  if (!AGUARDANDO.includes(c.status)) return res.status(409).json({ error: `O cadastro está em "${statusNome(c.status)}" — só dá pra incluir avalista quando ele está aguardando avalista ou em análise humana` });
  let av;
  try { av = await apresentarAvalista(c, p.data, quem(req)); }
  catch (e) { if (e instanceof ErroAvalista) return res.status(409).json({ error: e.message }); throw e; }
  const [atual] = await db.select().from(cadastros).where(eq(cadastros.id, c.id));
  const emAnalise = await mudarStatus(atual, 'formulario_preenchido', `${av.ordem}º avalista incluído pela equipe — analisando`, quem(req));
  const final = await analisar(emAnalise, quem(req));
  res.json({ ok: true, avalistaId: av.id, status: final.status });
});

// Decisão manual sobre UM avalista (ex.: análise humana, contestação). Fica registrada com nome e motivo.
avalistasRouter.post('/api/avalistas/:id/decisao', exigir(PODE.decidir, 'Só análise cadastral e diretoria decidem'), async (req, res) => {
  const p = z.object({ status: z.enum(['aprovado', 'reprovado']), motivo: z.string().min(3) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Escolha aprovar ou reprovar e escreva o motivo' });
  const [av] = await db.select().from(avalistas).where(eq(avalistas.id, Number(req.params.id))).limit(1);
  if (!av) return res.status(404).json({ error: 'Avalista não encontrado' });
  const [c] = await db.select().from(cadastros).where(eq(cadastros.id, av.cadastroId)).limit(1);
  const pode = ['formulario_preenchido', 'pendente_avalista', 'analise_humana', 'aprovado_avalista', 'reprovado'];
  if (!pode.includes(c.status)) return res.status(409).json({ error: `Com o cadastro em "${statusNome(c.status)}" não dá mais pra trocar a decisão do avalista` });
  if (av.status === 'substituido') return res.status(409).json({ error: 'Este avalista foi substituído por outro' });
  const motivo = p.data.motivo.trim();
  const depois = await decidirAvalista(c, av, p.data.status, motivo + ' (decisão manual)', quem(req));
  await registrarEvento(c.id, 'decisao_manual', `Decisão manual do ${av.ordem}º avalista: ${p.data.status === 'aprovado' ? 'aprovado' : 'não aprovado'} — ${motivo}`, quem(req),
    { avalista_id: av.id, para: p.data.status, motivo });
  let novo = depois;
  if (p.data.status === 'aprovado' && c.status !== 'aprovado_avalista')
    novo = await mudarStatus(depois, 'aprovado_avalista', `${av.ordem}º avalista (${av.nome}) aprovado — ${motivo}`, quem(req), { decididoPor: quem(req), decididoEm: new Date() });
  if (p.data.status === 'reprovado' && ['aprovado_avalista', 'analise_humana', 'formulario_preenchido'].includes(c.status))
    novo = await depoisDeAvalistaReprovado(depois, av.ordem, av.nome, motivo, quem(req));
  await avancar(novo, quem(req));
  res.json({ ok: true, status: novo.status });
});

// ---------- configuração (diretoria) ----------
const pergunta = z.object({
  id: z.string().min(1), texto: z.string().min(2), ajuda: z.string().optional(), tipo: z.enum(['escolha', 'texto']),
  opcoes: z.array(z.object({ id: z.string().min(1), texto: z.string().min(1), emoji: z.string().optional(), pontos: z.number(), elimina: z.boolean().optional() })),
  mostrarSe: z.object({ perguntaId: z.string(), opcoes: z.array(z.string()) }).nullable().optional(),
});
avalistasRouter.get('/api/config/avalista', async (_req, res) => {
  res.json({ regras: await getRegrasAvalista(), padrao: REGRAS_AVALISTA_PADRAO, acoes: ACOES });
});
avalistasRouter.put('/api/config/avalista', soDiretoria, async (req, res) => {
  const p = z.object({
    maxAvalistas: z.number().int().min(1).max(5), idadeMinima: z.number().int().min(18).max(100), idadeMaxima: z.number().int().min(0).max(120),
    parentescos: z.array(z.object({ id: z.string().min(1), nome: z.string().min(1), aceito: z.boolean() })).min(1),
    restricaoMaxima: z.number().min(0), aceitarProtesto: z.boolean(), scoreMinimo: z.number().int().min(0).max(1000),
    perguntas: z.array(pergunta), notaCorte: z.number().min(0), acaoEsgotou: z.enum(ACOES), intro: z.string().min(5),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Confira os campos', detalhes: p.error.flatten() });
  if (p.data.idadeMaxima && p.data.idadeMaxima < p.data.idadeMinima) return res.status(400).json({ error: 'A idade máxima tem que ser maior que a mínima' });
  if (!p.data.parentescos.some(x => x.aceito)) return res.status(400).json({ error: 'Deixe pelo menos um vínculo aceito' });
  await setSetting('regras_avalista', p.data);
  res.json({ ok: true });
});

avalistasRouter.get('/api/config/documentos', async (_req, res) => {
  const cfg = await carregarDocsConfig();
  const nomes = (l: string[]) => l.map(t => ({ tipo: t, nome: DOC_NOME[t] }));
  res.json({ exigidos: cfg, padrao: DOCS_EXIGIDOS_PADRAO, possiveis: { titular: nomes(DOCS_POSSIVEIS.titular), avalista: nomes(DOCS_POSSIVEIS.avalista) } });
});
avalistasRouter.put('/api/config/documentos', soDiretoria, async (req, res) => {
  const p = z.object({ titular: z.array(z.enum(DOCS_POSSIVEIS.titular as [string, ...string[]])).min(1), avalista: z.array(z.enum(DOCS_POSSIVEIS.avalista as [string, ...string[]])) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Marque pelo menos um documento da candidata' });
  await setSetting('documentos_exigidos', p.data);
  await carregarDocsConfig();
  res.json({ ok: true });
});
