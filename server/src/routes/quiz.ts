import { Router } from 'express';
import { z } from 'zod';
import { and, desc, gte, inArray, notInArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, quizRespostas } from '../db/schema.js';
import { exigir, PODE, requireAuth } from '../lib/auth.js';
import { criarCadastro } from '../lib/cadastros.js';
import { QUIZ_PADRAO, avaliar, getQuiz, linkWhatsapp, quizPublico, salvarQuiz, type Quiz } from '../lib/quiz.js';
import { FINAIS } from '../lib/status.js';
import { soDigitos } from '../lib/util.js';

// Quiz de perfil (1ª etapa, link aberto). Rotas em /api/quiz-publico (sem login) e /api/quiz (equipe).
export const quizRouter = Router();
const soDiretoria = exigir(PODE.configurar, 'Só a diretoria mexe no quiz');
const linkPublico = () => (process.env.APP_URL || 'http://localhost:5185') + '/quiz';

// trava simples contra robô: 8 envios por IP a cada hora
const envios = new Map<string, number[]>();
function muitosEnvios(ip: string) {
  const agora = Date.now();
  const lista = (envios.get(ip) || []).filter(t => agora - t < 3600_000);
  lista.push(agora); envios.set(ip, lista);
  if (envios.size > 5000) envios.clear();
  return lista.length > 8;
}

/** Telefone BR com DDI: 11 9xxxx-xxxx → 5511 9xxxx-xxxx */
const telefoneBr = (t: string) => { const d = soDigitos(t); return d.length === 10 || d.length === 11 ? '55' + d : d; };
const variantes = (tel: string) => [tel, tel.startsWith('55') ? tel.slice(2) : '55' + tel];

quizRouter.get('/api/quiz-publico', async (_req, res) => {
  const q = await getQuiz();
  res.json(quizPublico(q));
});

const envio = z.object({
  nome: z.string().trim().min(3), telefone: z.string(), cidade: z.string().trim().max(120).optional(),
  respostas: z.record(z.string().max(600)), aceite: z.literal(true),
  origem: z.string().max(80).optional(), campanha: z.string().max(160).optional(),
});

quizRouter.post('/api/quiz-publico', async (req, res) => {
  const q = await getQuiz();
  if (!q.ativo) return res.status(403).json({ error: 'O teste está fechado no momento.' });
  const ip = String(req.ip || '');
  if (muitosEnvios(ip)) return res.status(429).json({ error: 'Muitas tentativas. Tente de novo mais tarde.' });
  const p = envio.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Confira nome, WhatsApp e o aceite.' });
  const d = p.data;
  const telefone = telefoneBr(d.telefone);
  if (telefone.length < 12 || telefone.length > 13) return res.status(400).json({ error: 'WhatsApp inválido — confira o DDD e o número.' });
  if (q.pedirCidade && !d.cidade) return res.status(400).json({ error: 'Informe a sua cidade.' });

  const r = avaliar(q, d.respostas);
  if (r.faltando.length) return res.status(400).json({ error: 'Faltou responder: ' + r.faltando[0] });

  const [salva] = await db.insert(quizRespostas).values({
    nome: d.nome, telefone, cidade: d.cidade || null, respostas: d.respostas, itens: r.itens, pontos: r.pontos, aprovado: r.aprovado,
    eliminatorias: r.eliminatorias, origem: d.origem || 'Quiz', campanha: d.campanha || null, ip,
  }).returning();

  if (r.aprovado) {
    // já tem cadastro em andamento com esse WhatsApp? não duplica — só liga a resposta a ele
    const [aberto] = await db.select().from(cadastros)
      .where(and(inArray(cadastros.telefone, variantes(telefone)), notInArray(cadastros.status, FINAIS))).limit(1);
    const cad = aberto || await criarCadastro({
      nome: d.nome, telefone, cidade: d.cidade, origem: d.origem || 'Quiz', campanha: d.campanha, doQuiz: true,
      quiz: { respostaId: salva.id, pontos: r.pontos, itens: r.itens },
    }, 'cliente (quiz)');
    await db.update(quizRespostas).set({ cadastroId: cad.id }).where(sql`id = ${salva.id}`);
  }

  res.json(r.aprovado
    ? { aprovado: true, titulo: q.aprovado.titulo, texto: q.aprovado.texto, botao: q.aprovado.botao, whatsapp: linkWhatsapp(q, d.nome) }
    : { aprovado: false, titulo: q.reprovado.titulo, texto: q.reprovado.texto });
});

// ---------- equipe ----------
quizRouter.get('/api/quiz/config', requireAuth, soDiretoria, async (_req, res) => {
  res.json({ quiz: await getQuiz(), link: linkPublico() });
});

const opcao = z.object({ id: z.string().min(1), texto: z.string().min(1), emoji: z.string().max(8).optional(), pontos: z.coerce.number(), elimina: z.boolean().optional() });
const pergunta = z.object({
  id: z.string().min(1), texto: z.string().min(2), ajuda: z.string().optional(), tipo: z.enum(['escolha', 'texto']),
  opcoes: z.array(opcao), mostrarSe: z.object({ perguntaId: z.string(), opcoes: z.array(z.string()) }).nullable().optional(),
});
const quizSchema = z.object({
  ativo: z.boolean(), titulo: z.string(), subtitulo: z.string(), vantagens: z.array(z.string()), botaoComecar: z.string(),
  perguntas: z.array(pergunta).min(1), notaCorte: z.coerce.number(), pedirCidade: z.boolean(), textoAnalisando: z.string(),
  aprovado: z.object({ titulo: z.string(), texto: z.string(), botao: z.string(), mensagemWhatsapp: z.string() }),
  reprovado: z.object({ titulo: z.string(), texto: z.string() }), whatsapp: z.string(), textoLgpd: z.string(),
});

quizRouter.put('/api/quiz/config', requireAuth, soDiretoria, async (req, res) => {
  const p = quizSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Confira o quiz: toda pergunta precisa de texto e as de escolha precisam de opções.', detalhes: p.error.flatten() });
  const q = p.data as Quiz;
  const ids = new Set<string>();
  for (const x of q.perguntas) {
    if (ids.has(x.id)) return res.status(400).json({ error: 'Duas perguntas com o mesmo código: ' + x.id });
    ids.add(x.id);
    if (x.tipo === 'escolha' && x.opcoes.length < 2) return res.status(400).json({ error: `A pergunta "${x.texto}" precisa de pelo menos 2 opções.` });
    if (x.mostrarSe && !q.perguntas.some(o => o.id === x.mostrarSe!.perguntaId)) x.mostrarSe = null;
  }
  q.whatsapp = soDigitos(q.whatsapp);
  await salvarQuiz(q);
  res.json({ quiz: q });
});

quizRouter.post('/api/quiz/config/padrao', requireAuth, soDiretoria, async (_req, res) => {
  await salvarQuiz(QUIZ_PADRAO);
  res.json({ quiz: QUIZ_PADRAO });
});

quizRouter.get('/api/quiz/respostas', requireAuth, async (req, res) => {
  const filtro = String(req.query.filtro || 'todas');
  const cond = filtro === 'aprovadas' ? sql`aprovado = true` : filtro === 'reprovadas' ? sql`aprovado = false` : sql`true`;
  const lista = await db.select().from(quizRespostas).where(cond).orderBy(desc(quizRespostas.id)).limit(500);
  const desde30 = new Date(Date.now() - 30 * 86400_000);
  const [tot] = await db.select({ total: sql<number>`count(*)::int`, aprovadas: sql<number>`count(*) filter (where aprovado)::int`,
    ultimos30: sql<number>`count(*) filter (where created_at >= ${desde30})::int`, media: sql<number>`coalesce(avg(pontos),0)::float` }).from(quizRespostas);
  const porOrigem = await db.select({ origem: quizRespostas.origem, total: sql<number>`count(*)::int`, aprovadas: sql<number>`count(*) filter (where aprovado)::int` })
    .from(quizRespostas).where(gte(quizRespostas.createdAt, desde30)).groupBy(quizRespostas.origem);
  res.json({ lista, resumo: tot, porOrigem });
});
