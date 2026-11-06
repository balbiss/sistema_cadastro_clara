import { asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { quizRespostas, quizzes } from '../db/schema.js';
import { getSetting } from './settings.js';

// Quiz de perfil: 1ª etapa, link aberto (anúncio, bio do Instagram). Uma pergunta por tela,
// cada opção vale pontos; passou da nota de corte = perfil aprovado → vira cadastro e o CRM é avisado.
// Tudo editável pela diretoria na tela "Quiz de perfil". A pontuação nunca vai pro navegador.

export type Opcao = { id: string; texto: string; emoji?: string; pontos: number; elimina?: boolean };
export type Pergunta = {
  id: string; texto: string; ajuda?: string; tipo: 'escolha' | 'texto'; opcoes: Opcao[];
  /** só aparece se a resposta da pergunta `perguntaId` for uma das `opcoes` */
  mostrarSe?: { perguntaId: string; opcoes: string[] } | null;
};
export type Quiz = {
  ativo: boolean;
  titulo: string; subtitulo: string; vantagens: string[]; botaoComecar: string;
  perguntas: Pergunta[];
  notaCorte: number;
  pedirCidade: boolean;
  textoAnalisando: string;
  aprovado: { titulo: string; texto: string; botao: string; mensagemWhatsapp: string };
  reprovado: { titulo: string; texto: string };
  whatsapp: string; // número que recebe a mensagem da aprovada (só dígitos, com DDI). Vazio = sem botão.
  textoLgpd: string;
};

const op = (id: string, texto: string, pontos: number, extra: Partial<Opcao> = {}): Opcao => ({ id, texto, pontos, ...extra });
const esc = (id: string, texto: string, opcoes: Opcao[], extra: Partial<Pergunta> = {}): Pergunta => ({ id, texto, tipo: 'escolha', opcoes, ...extra });

// Ponto de partida (a Bel ajusta textos, pontos e nota de corte na tela).
export const QUIZ_PADRAO: Quiz = {
  ativo: true,
  titulo: 'Descubra se você tem o perfil para ser uma revendedora Clara Ferreira!',
  subtitulo: 'Responda o teste rápido (2 minutos) e veja na hora se você se qualifica.',
  vantagens: ['Sem investimento inicial', 'Maleta de semijoias consignada', 'Ganhe por cada peça vendida'],
  botaoComecar: 'Começar',
  perguntas: [
    esc('motivo', 'Por que você quer começar a vender semijoias agora?', [
      op('renda_extra', 'Renda extra', 1, { emoji: '💰' }), op('casa', 'Trabalhar de casa', 1, { emoji: '🏠' }),
      op('negocio', 'Ter meu próprio negócio', 1, { emoji: '🚀' }), op('independencia', 'Independência financeira', 1, { emoji: '✨' })]),
    esc('meta', 'Se você começasse hoje, quanto gostaria de ganhar por mês?', [
      op('ate500', 'Até R$ 500', 0), op('500a1000', 'R$ 500 a R$ 1.000', 0), op('1000a3000', 'R$ 1.000 a R$ 3.000', 0), op('mais3000', 'Mais de R$ 3.000', 0)]),
    esc('idade', 'Qual a sua idade?', [
      op('menor18', 'Menos de 18 anos', 0, { elimina: true }), op('18a24', '18 a 24 anos', 1), op('25a34', '25 a 34 anos', 2),
      op('35a44', '35 a 44 anos', 2), op('45a54', '45 a 54 anos', 1), op('55mais', '55 anos ou mais', 1)]),
    esc('filhos', 'Você tem filhos?', [
      op('nao', 'Não tenho filhos', 2), op('gravida', 'Estou grávida', 0), op('1', 'Sim, 1 filho', 2), op('2', 'Sim, 2 filhos', 1), op('3mais', 'Sim, 3 ou mais', 0)]),
    esc('filho_novo', 'Qual a idade do seu filho mais novo?', [
      op('0a2', 'Até 2 anos', 0), op('3a6', '3 a 6 anos', 1), op('7mais', '7 anos ou mais', 2)],
      { mostrarSe: { perguntaId: 'filhos', opcoes: ['1', '2', '3mais'] } }),
    esc('apoio', 'Você tem rede de apoio (família, marido) pra te ajudar na rotina e trabalhar com constância?', [
      op('total', 'Sim, tenho apoio total', 1), op('parcial', 'Tenho apoio parcial', 0), op('nao', 'Não tenho, mas consigo me organizar', 0)]),
    esc('casa', 'Sua casa é própria ou alugada?', [
      op('propria', 'Própria', 3, { emoji: '🏡' }), op('alugada', 'Alugada', 1, { emoji: '🔑' }), op('cedida', 'Moro com familiares / cedida', 0, { emoji: '👨‍👩‍👧' })]),
    esc('trabalho', 'Qual a sua situação de trabalho hoje?', [
      op('clt', 'Trabalho registrada (CLT)', 4), op('cnpj', 'Empreendedora com CNPJ', 4), op('aposentada', 'Aposentada / pensionista', 3),
      op('autonoma', 'Autônoma / renda informal', 1), op('lar', 'Do lar', 0), op('desempregada', 'Desempregada', 0)]),
    esc('renda_autonoma', 'Você marcou autônoma. Qual a sua renda mensal hoje?', [
      op('menos2000', 'Menos de R$ 2.000', 0), op('2000a3000', 'R$ 2.000 a R$ 3.000', 1), op('3000a4000', 'R$ 3.000 a R$ 4.000', 2), op('mais4000', 'Mais de R$ 4.000', 3)],
      { mostrarSe: { perguntaId: 'trabalho', opcoes: ['autonoma'] } }),
    { id: 'atividade', texto: 'Conta pra gente: qual a sua atividade hoje e há quanto tempo?', tipo: 'texto', opcoes: [],
      mostrarSe: { perguntaId: 'trabalho', opcoes: ['clt', 'cnpj', 'autonoma'] } },
    esc('vende', 'Hoje você já vende algum produto ou serviço?', [
      op('frequencia', 'Sim, vendo com frequência', 3), op('as_vezes', 'Sim, vendo às vezes', 2), op('ja_vendi', 'Hoje não, mas já vendi', 1), op('nunca', 'Nunca vendi', 0)]),
    esc('semijoias', 'Você já vendeu semijoias antes?', [
      op('sucesso', 'Sim, e deu certo', 3), op('nao_deu', 'Tentei, mas não deu certo', 0), op('nunca', 'Nunca vendi', 0)]),
    esc('instagram', 'Seu Instagram hoje está ativo?', [
      op('ativo', 'Sim, posto com frequência', 2), op('pouco', 'Tenho, mas posto pouco', 1), op('nao', 'Quase não uso', 0)]),
    esc('negativado', 'Seu nome está negativado hoje?', [
      op('limpo', 'Não, meu nome está limpo', 5), op('negativado', 'Sim, está negativado', 0)],
      { ajuda: 'Responda com sinceridade — com nome negativado ainda dá pra começar com avalista.' }),
    esc('regras', 'Você aceita as regras do consignado?', [
      op('sim', 'Sim, aceito as regras', 0), op('nao', 'Não', 0, { elimina: true })],
      { ajuda: 'Acerto no prazo combinado · reposição só depois do acerto · cuidado com as peças da maleta.' }),
  ],
  notaCorte: 13,
  pedirCidade: true,
  textoAnalisando: 'Estamos analisando o seu perfil…',
  aprovado: {
    titulo: 'Parabéns! Você tem o perfil para ser uma revendedora Clara Ferreira! 🎉',
    texto: 'Envie a mensagem no WhatsApp para garantir a sua vaga — uma consultora vai te atender e explicar os próximos passos.',
    botao: 'Enviar no WhatsApp',
    mensagemWhatsapp: 'Oi! Fiz o teste e tenho o perfil pra ser revendedora Clara Ferreira. Quero saber como começar!',
  },
  reprovado: {
    titulo: 'Não foi dessa vez — mas não desanima!',
    texto: 'Muitas das nossas revendedoras não passaram de primeira. Continue acompanhando a Clara Ferreira no Instagram, mantenha o seu CPF regularizado e tente de novo em 30 dias.',
  },
  whatsapp: '',
  textoLgpd: 'Concordo que a Clara Ferreira use estes dados para entrar em contato comigo sobre a revenda.',
};

/** Completa um quiz salvo com os campos do modelo (quiz antigo sem campo novo não quebra). */
export const completar = (q: Partial<Quiz> | null | undefined): Quiz => ({ ...QUIZ_PADRAO, ...(q || {}),
  aprovado: { ...QUIZ_PADRAO.aprovado, ...(q?.aprovado || {}) }, reprovado: { ...QUIZ_PADRAO.reprovado, ...(q?.reprovado || {}) } });

export const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'quiz';
export async function slugLivre(base: string, ignorarId?: number) {
  let slug = slugify(base), n = 1;
  for (;;) {
    const [x] = await db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.slug, slug)).limit(1);
    if (!x || x.id === ignorarId) return slug;
    slug = slugify(base) + '-' + ++n;
  }
}

/** 1ª vez: o quiz único antigo (setting 'quiz') vira o quiz padrão "Quiz de perfil", no mesmo link /quiz. */
export async function garantirQuizzes() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(quizzes);
  if (n > 0) return;
  const antigo = await getSetting<Partial<Quiz> | null>('quiz', null as any);
  const [q] = await db.insert(quizzes).values({ slug: 'perfil', nome: 'Quiz de perfil', padrao: true, config: completar(antigo && Object.keys(antigo).length ? antigo : QUIZ_PADRAO) }).returning();
  // respostas de antes (quando só existia 1 quiz) passam a contar nele
  await db.update(quizRespostas).set({ quizId: q.id, quizNome: q.nome }).where(isNull(quizRespostas.quizId));
}

/** Quiz pelo link: /quiz/:slug, ou o padrão em /quiz. */
export async function quizPorSlug(slug?: string) {
  const [row] = slug
    ? await db.select().from(quizzes).where(eq(quizzes.slug, slug)).limit(1)
    : await db.select().from(quizzes).orderBy(desc(quizzes.padrao), asc(quizzes.id)).limit(1);
  return row ? { ...row, config: completar(row.config as Partial<Quiz>) } : null;
}

/** O que o navegador recebe: sem pontos e sem saber o que elimina. */
export function quizPublico(q: Quiz) {
  return {
    ativo: q.ativo, titulo: q.titulo, subtitulo: q.subtitulo, vantagens: q.vantagens, botaoComecar: q.botaoComecar,
    pedirCidade: q.pedirCidade, textoAnalisando: q.textoAnalisando, textoLgpd: q.textoLgpd,
    perguntas: q.perguntas.map(p => ({ id: p.id, texto: p.texto, ajuda: p.ajuda, tipo: p.tipo, mostrarSe: p.mostrarSe || null,
      opcoes: p.opcoes.map(o => ({ id: o.id, texto: o.texto, emoji: o.emoji })) })),
  };
}

export const perguntaVisivel = (p: Pergunta, resp: Record<string, string>) =>
  !p.mostrarSe || p.mostrarSe.opcoes.includes(resp[p.mostrarSe.perguntaId]);

/** Confere as respostas, soma os pontos e decide. Ignora resposta de pergunta que não devia aparecer. */
export function avaliar(q: Quiz, respostas: Record<string, string>) {
  let pontos = 0; const eliminatorias: string[] = []; const faltando: string[] = [];
  const itens: { pergunta: string; resposta: string; pontos: number }[] = [];
  for (const p of q.perguntas) {
    if (!perguntaVisivel(p, respostas)) continue;
    const r = String(respostas[p.id] ?? '').trim();
    if (!r) { faltando.push(p.texto); continue; }
    if (p.tipo === 'texto') { itens.push({ pergunta: p.texto, resposta: r.slice(0, 500), pontos: 0 }); continue; }
    const o = p.opcoes.find(x => x.id === r);
    if (!o) { faltando.push(p.texto); continue; }
    pontos += o.pontos;
    if (o.elimina) eliminatorias.push(`${p.texto} → ${o.texto}`);
    itens.push({ pergunta: p.texto, resposta: o.texto, pontos: o.pontos });
  }
  const aprovado = !eliminatorias.length && pontos >= q.notaCorte;
  return { pontos, aprovado, eliminatorias, faltando, itens };
}

export function linkWhatsapp(q: Quiz, nome: string) {
  const num = q.whatsapp.replace(/\D/g, '');
  if (!num) return null;
  const msg = q.aprovado.mensagemWhatsapp + (nome ? `\nMeu nome é ${nome.split(' ')[0]}.` : '');
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}
