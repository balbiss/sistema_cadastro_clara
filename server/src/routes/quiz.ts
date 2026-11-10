import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, gte, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, quizCliques, quizRespostas, quizzes } from '../db/schema.js';
import { colaboradoraPorCodigo, proximaDoRodizio } from '../lib/distribuicao.js';
import { registrarEvento } from '../lib/eventos.js';
import { exigir, PODE, requireAuth } from '../lib/auth.js';
import { criarCadastro } from '../lib/cadastros.js';
import { QUIZ_PADRAO, avaliar, completar, linkWhatsapp, quizPorSlug, quizPublico, slugLivre, slugify, type Quiz } from '../lib/quiz.js';
import { FINAIS } from '../lib/status.js';
import { soDigitos } from '../lib/util.js';
import crypto from 'node:crypto';
import multer from 'multer';
import { gravar, ler, lerParte, tamanho } from '../lib/storage.js';

// Quizzes de perfil (vários, cada um com link próprio). Público: /api/quiz-publico[/:slug] (sem login).
// Equipe: /api/quizzes (criar, editar, duplicar, ligar/desligar, excluir — só diretoria) e /api/quiz/respostas.
export const quizRouter = Router();
const soDiretoria = exigir(PODE.configurar, 'Só a diretoria mexe nos quizzes');
const APP = () => process.env.APP_URL || 'http://localhost:5185';
const linkDe = (q: { slug: string; padrao: boolean }) => APP() + (q.padrao ? '/quiz' : '/quiz/' + q.slug);

// trava simples contra robô: 30 envios por IP a cada hora (Wi-Fi de loja / operadora dividem o mesmo IP)
const envios = new Map<string, number[]>();
function muitosEnvios(ip: string) {
  const agora = Date.now();
  const lista = (envios.get(ip) || []).filter(t => agora - t < 3600_000);
  lista.push(agora); envios.set(ip, lista);
  if (envios.size > 5000) envios.clear();
  return lista.length > 30;
}

/** Telefone BR com DDI: 11 9xxxx-xxxx → 5511 9xxxx-xxxx */
const telefoneBr = (t: string) => { const d = soDigitos(t); return d.length === 10 || d.length === 11 ? '55' + d : d; };
const variantes = (tel: string) => [tel, tel.startsWith('55') ? tel.slice(2) : '55' + tel];

// ---------- público ----------
quizRouter.get(['/api/quiz-publico', '/api/quiz-publico/:slug'], async (req, res) => {
  const q = await quizPorSlug(req.params.slug);
  if (!q) return res.status(404).json({ error: 'Esse teste não existe (confira o link).' });
  res.json({ ...quizPublico(q.config), slug: q.slug });
});

const envio = z.object({
  nome: z.string().trim().min(3), telefone: z.string(), cidade: z.string().trim().max(120).optional(),
  respostas: z.record(z.string().max(600)), aceite: z.literal(true),
  origem: z.string().max(80).optional(), campanha: z.string().max(160).optional(),
  colaboradora: z.string().max(40).optional(), // ?c= do link pessoal
});

// Visita ao link (o quiz chama 1 vez por sessão do navegador) — base do "quantas pessoas clicaram".
const cliques = new Map<string, number[]>();
quizRouter.post(['/api/quiz-clique', '/api/quiz-clique/:slug'], async (req, res) => {
  const ip = String(req.ip || '');
  const agora = Date.now();
  const lista = (cliques.get(ip) || []).filter(t => agora - t < 3600_000);
  if (lista.length >= 60) return res.json({ ok: true }); // robô: não conta
  lista.push(agora); cliques.set(ip, lista); if (cliques.size > 5000) cliques.clear();
  const qz = await quizPorSlug(req.params.slug);
  if (!qz) return res.status(404).json({ error: 'Quiz não encontrado' });
  const b = req.body || {};
  const colab = await colaboradoraPorCodigo(b.colaboradora);
  const sessao = String(b.sessao || '').slice(0, 40) || null;
  if (sessao) {
    const [ja] = await db.select({ id: quizCliques.id }).from(quizCliques).where(and(eq(quizCliques.sessao, sessao), eq(quizCliques.quizId, qz.id))).limit(1);
    if (ja) return res.json({ ok: true });
  }
  await db.insert(quizCliques).values({ quizId: qz.id, origem: String(b.origem || '').slice(0, 80) || null, campanha: String(b.campanha || '').slice(0, 160) || null, colaboradoraId: colab?.id ?? null, sessao });
  res.json({ ok: true });
});

quizRouter.post(['/api/quiz-publico', '/api/quiz-publico/:slug'], async (req, res) => {
  const qz = await quizPorSlug(req.params.slug);
  if (!qz) return res.status(404).json({ error: 'Esse teste não existe (confira o link).' });
  const q = qz.config;
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
  // link pessoal (?c=) = prospecção ativa daquela colaboradora; sem ?origem= no link, a origem é o próprio quiz
  const colab = await colaboradoraPorCodigo(d.colaboradora);
  const origem = d.origem || (colab ? 'Prospecção ativa' : qz.nome);

  const [salva] = await db.insert(quizRespostas).values({
    nome: d.nome, telefone, cidade: d.cidade || null, respostas: d.respostas, itens: r.itens, pontos: r.pontos, aprovado: r.aprovado,
    eliminatorias: r.eliminatorias, origem, campanha: d.campanha || null, ip, quizId: qz.id, quizNome: qz.nome, colaboradoraId: colab?.id ?? null,
  }).returning();

  if (r.aprovado) {
    // já tem cadastro em andamento com esse WhatsApp? não duplica — só liga a resposta a ele
    const [aberto] = await db.select().from(cadastros)
      .where(and(inArray(cadastros.telefone, variantes(telefone)), notInArray(cadastros.status, FINAIS))).limit(1);
    // dona: quem mandou o link pessoal; senão o rodízio do tráfego (se estiver ligado)
    const rod = aberto || colab ? null : await proximaDoRodizio(d.campanha);
    const dona = colab || rod?.user || null;
    const cad = aberto || await criarCadastro({
      nome: d.nome, telefone, cidade: d.cidade, origem, campanha: d.campanha, doQuiz: true,
      consultoraNome: dona?.name, consultoraEmail: dona?.email,
      quiz: { respostaId: salva.id, pontos: r.pontos, quizId: qz.id, quizNome: qz.nome, itens: r.itens },
    }, 'cliente (quiz)');
    if (!aberto && dona) await registrarEvento(cad.id, 'consultora_definida',
      colab ? `Atendente: ${dona.name} (link pessoal dela — prospecção ativa)` : `Atendente: ${dona.name} (rodízio do tráfego, lista ${rod!.lista})`,
      'sistema', { consultoraNome: dona.name, consultoraEmail: dona.email, via: colab ? 'link_pessoal' : 'rodizio', lista: rod?.lista ?? null });
    await db.update(quizRespostas).set({ cadastroId: cad.id }).where(eq(quizRespostas.id, salva.id));
  }

  res.json(r.aprovado
    ? { aprovado: true, titulo: q.aprovado.titulo, texto: q.aprovado.texto, botao: q.aprovado.botao, whatsapp: linkWhatsapp(q, d.nome), imagem: q.aparencia.imagemAprovado || null }
    : { aprovado: false, titulo: q.reprovado.titulo, texto: q.reprovado.texto, imagem: q.aparencia.imagemReprovado || null });
});

// ---------- imagens do quiz (logo, capa, perguntas, opções) ----------
// Públicas de propósito: aparecem no quiz aberto. Só ficam no "quiz/" do MinIO (nada de documento de cliente).
const TIPOS_IMG: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' };
const MIME_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' };
const uploadImg = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });
quizRouter.post('/api/quizzes/:id/imagem', requireAuth, soDiretoria, uploadImg.single('arquivo'), async (req, res) => {
  const [q] = await db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.id, Number(req.params.id))).limit(1);
  if (!q) return res.status(404).json({ error: 'Quiz não encontrado' });
  const ext = req.file && TIPOS_IMG[req.file.mimetype];
  if (!req.file || !ext) return res.status(400).json({ error: 'Envie imagem (JPG, PNG, WEBP, GIF) ou vídeo MP4/WEBM' });
  const video = req.file.mimetype.startsWith('video/');
  if (!video && req.file.size > 5 * 1024 * 1024) return res.status(400).json({ error: 'Imagem com mais de 5 MB — diminua antes de enviar' });
  const chave = `quiz/${q.id}/${crypto.randomBytes(10).toString('hex')}.${ext}`;
  await gravar(chave, req.file.buffer, req.file.mimetype);
  res.json({ url: '/api/quiz-midia/' + chave, video });
});
quizRouter.get(/^\/api\/quiz-midia\/(quiz\/\d+\/[a-f0-9]+\.(jpg|png|webp|gif|mp4|webm))$/, async (req, res) => {
  const chave = (req.params as any)[0] as string;
  const total = await tamanho(chave);
  if (total == null) return res.status(404).end();
  res.setHeader('Content-Type', MIME_EXT[chave.split('.').pop()!] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Accept-Ranges', 'bytes');
  // vídeo: entrega em pedaços (Range) — sem isso o iPhone não toca
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (m && (m[1] || m[2])) {
    const inicio = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
    const fim = m[1] && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (inicio >= total || inicio > fim) { res.setHeader('Content-Range', `bytes */${total}`); return res.status(416).end(); }
    const parte = await lerParte(chave, inicio, fim);
    if (!parte) return res.status(404).end();
    res.status(206).setHeader('Content-Range', `bytes ${inicio}-${fim}/${total}`);
    res.setHeader('Content-Length', String(fim - inicio + 1));
    return parte.pipe(res);
  }
  const arq = await ler(chave);
  if (!arq) return res.status(404).end();
  res.setHeader('Content-Length', String(total));
  arq.pipe(res);
});

// ---------- equipe: lista e CRUD ----------
quizRouter.use('/api/quizzes', requireAuth);

quizRouter.get('/api/quizzes', exigir(PODE.relatorios, 'Sem acesso aos quizzes'), async (_req, res) => {
  const lista = await db.select().from(quizzes).orderBy(desc(quizzes.padrao), asc(quizzes.id));
  const cont = await db.select({ quizId: quizRespostas.quizId, total: sql<number>`count(*)::int`, aprovadas: sql<number>`count(*) filter (where aprovado)::int`,
    ultima: sql<string>`max(created_at)` }).from(quizRespostas).groupBy(quizRespostas.quizId);
  const m = new Map(cont.map(c => [c.quizId, c]));
  res.json(lista.map(q => {
    const cfg = completar(q.config as Partial<Quiz>);
    return { id: q.id, nome: q.nome, slug: q.slug, padrao: q.padrao, ativo: cfg.ativo, perguntas: cfg.perguntas.length, notaCorte: cfg.notaCorte,
      whatsapp: !!cfg.whatsapp, link: linkDe(q), respostas: m.get(q.id)?.total || 0, aprovadas: m.get(q.id)?.aprovadas || 0,
      ultimaResposta: m.get(q.id)?.ultima || null, updatedAt: q.updatedAt };
  }));
});

quizRouter.get('/api/quizzes/:id', soDiretoria, async (req, res) => {
  const [q] = await db.select().from(quizzes).where(eq(quizzes.id, Number(req.params.id))).limit(1);
  if (!q) return res.status(404).json({ error: 'Quiz não encontrado' });
  res.json({ id: q.id, nome: q.nome, slug: q.slug, padrao: q.padrao, link: linkDe(q), quiz: completar(q.config as Partial<Quiz>) });
});

// novo: em branco (1 pergunta de exemplo), a partir do modelo da Clara, ou cópia de outro quiz
quizRouter.post('/api/quizzes', soDiretoria, async (req, res) => {
  const p = z.object({ nome: z.string().trim().min(2).max(80), base: z.enum(['modelo', 'branco']).default('modelo'), copiarDe: z.number().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Dê um nome ao quiz' });
  let config: Quiz;
  if (p.data.copiarDe) {
    const [o] = await db.select().from(quizzes).where(eq(quizzes.id, p.data.copiarDe)).limit(1);
    if (!o) return res.status(404).json({ error: 'Quiz de origem não encontrado' });
    config = completar(o.config as Partial<Quiz>);
  } else if (p.data.base === 'branco') {
    config = { ...QUIZ_PADRAO, perguntas: [{ id: 'p1', texto: 'Escreva aqui a primeira pergunta', tipo: 'escolha', opcoes: [{ id: 'o1', texto: 'Opção 1', pontos: 1 }, { id: 'o2', texto: 'Opção 2', pontos: 0 }] }], notaCorte: 1 };
  } else config = QUIZ_PADRAO;
  config = { ...config, ativo: false }; // nasce desligado: a Bel revisa e liga
  const [novo] = await db.insert(quizzes).values({ nome: p.data.nome, slug: await slugLivre(p.data.nome), config }).returning();
  res.status(201).json({ id: novo.id, slug: novo.slug, link: linkDe(novo) });
});

const imagem = z.string().max(300).regex(/^(\/api\/quiz-midia\/[a-z0-9/._-]+|https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\/[A-Za-z0-9_?=&/.-]+)$/).optional().or(z.literal('')).transform(v => v || undefined);
const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const opcao = z.object({ id: z.string().min(1), texto: z.string().min(1), emoji: z.string().max(8).optional(), imagem, pontos: z.coerce.number(), elimina: z.boolean().optional() });
const aparencia = z.object({ corPrincipal: cor, corFundo: cor, corTitulo: cor, corCabecalho: cor, logo: z.enum(['clara', 'propria', 'nenhuma']), logoUrl: imagem,
  capaUrl: imagem, layoutOpcoes: z.enum(['lista', 'grade']), imagemAprovado: imagem, imagemReprovado: imagem });
const pergunta = z.object({
  id: z.string().min(1), texto: z.string().min(2), ajuda: z.string().optional(), imagem, tipo: z.enum(['escolha', 'texto']),
  opcoes: z.array(opcao), mostrarSe: z.object({ perguntaId: z.string(), opcoes: z.array(z.string()) }).nullable().optional(),
});
const quizSchema = z.object({
  ativo: z.boolean(), aparencia, titulo: z.string(), subtitulo: z.string(), vantagens: z.array(z.string()), botaoComecar: z.string(),
  perguntas: z.array(pergunta).min(1), notaCorte: z.coerce.number(), pedirCidade: z.boolean(), textoAnalisando: z.string(),
  aprovado: z.object({ titulo: z.string(), texto: z.string(), botao: z.string(), mensagemWhatsapp: z.string() }),
  reprovado: z.object({ titulo: z.string(), texto: z.string() }), whatsapp: z.string(), textoLgpd: z.string(),
});

quizRouter.put('/api/quizzes/:id', soDiretoria, async (req, res) => {
  const id = Number(req.params.id);
  const [atual] = await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
  if (!atual) return res.status(404).json({ error: 'Quiz não encontrado' });
  const nome = String(req.body.nome || atual.nome).trim();
  if (nome.length < 2) return res.status(400).json({ error: 'Dê um nome ao quiz' });
  const slugPedido = req.body.slug !== undefined ? slugify(String(req.body.slug)) : atual.slug;
  if (slugPedido !== atual.slug) {
    const [ja] = await db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.slug, slugPedido)).limit(1);
    if (ja) return res.status(409).json({ error: `O link "${slugPedido}" já é de outro quiz` });
  }
  const p = quizSchema.safeParse(completar(req.body.quiz));
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
  const [salvo] = await db.update(quizzes).set({ nome, slug: slugPedido, config: q, updatedAt: new Date() }).where(eq(quizzes.id, id)).returning();
  res.json({ id, nome, slug: salvo.slug, padrao: salvo.padrao, link: linkDe(salvo), quiz: q });
});

// liga/desliga rápido pela lista
quizRouter.post('/api/quizzes/:id/ativo', soDiretoria, async (req, res) => {
  const [q] = await db.select().from(quizzes).where(eq(quizzes.id, Number(req.params.id))).limit(1);
  if (!q) return res.status(404).json({ error: 'Quiz não encontrado' });
  const cfg = { ...completar(q.config as Partial<Quiz>), ativo: !!req.body.ativo };
  await db.update(quizzes).set({ config: cfg, updatedAt: new Date() }).where(eq(quizzes.id, q.id));
  res.json({ ok: true, ativo: cfg.ativo });
});

// o padrão é o que abre em /quiz (link curto)
quizRouter.post('/api/quizzes/:id/padrao', soDiretoria, async (req, res) => {
  const [q] = await db.select().from(quizzes).where(eq(quizzes.id, Number(req.params.id))).limit(1);
  if (!q) return res.status(404).json({ error: 'Quiz não encontrado' });
  await db.update(quizzes).set({ padrao: false }).where(eq(quizzes.padrao, true));
  await db.update(quizzes).set({ padrao: true }).where(eq(quizzes.id, q.id));
  res.json({ ok: true });
});

// excluir: as respostas e cadastros que vieram dele CONTINUAM (com o nome do quiz guardado)
quizRouter.delete('/api/quizzes/:id', soDiretoria, async (req, res) => {
  const [q] = await db.select().from(quizzes).where(eq(quizzes.id, Number(req.params.id))).limit(1);
  if (!q) return res.status(404).json({ error: 'Quiz não encontrado' });
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(quizzes);
  if (n <= 1) return res.status(409).json({ error: 'Precisa existir pelo menos um quiz — desligue em vez de excluir' });
  await db.delete(quizzes).where(eq(quizzes.id, q.id));
  if (q.padrao) { // passa o link curto pro mais antigo que sobrou
    const [outro] = await db.select({ id: quizzes.id }).from(quizzes).orderBy(asc(quizzes.id)).limit(1);
    if (outro) await db.update(quizzes).set({ padrao: true }).where(eq(quizzes.id, outro.id));
  }
  res.json({ ok: true });
});

// ---------- respostas (relatório) ----------
quizRouter.get('/api/quiz/respostas', requireAuth, exigir(PODE.relatorios, 'Sem acesso às respostas do quiz'), async (req, res) => {
  const filtro = String(req.query.filtro || 'todas');
  const conds: SQL[] = [];
  if (filtro === 'aprovadas') conds.push(eq(quizRespostas.aprovado, true));
  if (filtro === 'reprovadas') conds.push(eq(quizRespostas.aprovado, false));
  if (req.query.quiz) conds.push(eq(quizRespostas.quizId, Number(req.query.quiz)));
  const onde = conds.length ? and(...conds) : undefined;
  const lista = await db.select().from(quizRespostas).where(onde).orderBy(desc(quizRespostas.id)).limit(500);
  const [tot] = await db.select({ total: sql<number>`count(*)::int`, aprovadas: sql<number>`count(*) filter (where aprovado)::int`,
    ultimos30: sql<number>`count(*) filter (where created_at >= now() - interval '30 days')::int`, media: sql<number>`coalesce(avg(pontos),0)::float` })
    .from(quizRespostas).where(req.query.quiz ? eq(quizRespostas.quizId, Number(req.query.quiz)) : undefined);
  const desde30 = new Date(Date.now() - 30 * 86400_000);
  const porOrigem = await db.select({ origem: quizRespostas.origem, total: sql<number>`count(*)::int`, aprovadas: sql<number>`count(*) filter (where aprovado)::int` })
    .from(quizRespostas).where(and(gte(quizRespostas.createdAt, desde30), req.query.quiz ? eq(quizRespostas.quizId, Number(req.query.quiz)) : undefined)).groupBy(quizRespostas.origem);
  res.json({ lista, resumo: tot, porOrigem });
});
