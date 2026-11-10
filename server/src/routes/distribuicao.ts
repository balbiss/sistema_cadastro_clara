import { Router } from 'express';
import { z } from 'zod';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { quizzes, users } from '../db/schema.js';
import { exigir, PODE, requireAuth } from '../lib/auth.js';
import { garantirCodigo, getRodizio } from '../lib/distribuicao.js';
import { setSetting } from '../lib/settings.js';

// Tela "Links e rodízio": link pessoal de cada colaboradora (prospecção ativa), rodízio do tráfego
// e o resultado por campanha (cliques → respostas → aprovadas → cadastros → iniciadas).
export const distribuicaoRouter = Router();
distribuicaoRouter.use('/api/distribuicao', requireAuth);
const APP = () => process.env.APP_URL || 'http://localhost:5185';

distribuicaoRouter.get('/api/distribuicao', async (req, res) => {
  const u = req.user!;
  const diretoria = PODE.configurar(u);
  const lista = (await db.select().from(quizzes).orderBy(asc(quizzes.id)))
    .map(q => ({ id: q.id, nome: q.nome, slug: q.slug, padrao: q.padrao, ativo: !!(q.config as { ativo?: boolean })?.ativo, link: APP() + (q.padrao ? '/quiz' : '/quiz/' + q.slug) }));
  const pessoas = diretoria
    ? await db.select().from(users).where(eq(users.active, true)).orderBy(asc(users.name))
    : [u];
  const links = [];
  for (const p of pessoas) links.push({ id: p.id, name: p.name, email: p.email, role: p.role, codigo: await garantirCodigo(p) });
  res.json({ quizzes: lista, links, rodizio: diretoria ? await getRodizio() : null, podeConfigurar: diretoria });
});

distribuicaoRouter.put('/api/distribuicao/rodizio', exigir(PODE.configurar, 'Só a diretoria mexe no rodízio'), async (req, res) => {
  const ids = z.array(z.number().int()).max(100);
  const p = z.object({
    ativo: z.boolean(), participantes: ids,
    campanhas: z.array(z.object({ campanha: z.string().trim().min(1).max(160), participantes: ids })).max(50),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Confira o rodízio (cada campanha precisa de nome)' });
  if (p.data.ativo && !p.data.participantes.length && !p.data.campanhas.some(c => c.participantes.length))
    return res.status(400).json({ error: 'Escolha pelo menos uma pessoa pro rodízio' });
  const atual = await getRodizio();
  await setSetting('rodizio', { ...p.data, vez: atual.vez }); // a "vez" de cada lista continua de onde parou
  res.json({ ok: true });
});

// Resultado por campanha e por link pessoal no período (item 5.2: conferir com os cliques da Meta)
distribuicaoRouter.get('/api/distribuicao/trafego', exigir(PODE.relatorios, 'Sem acesso aos relatórios'), async (req, res) => {
  const de = String(req.query.de || new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
  const ate = String(req.query.ate || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return res.status(400).json({ error: 'Datas inválidas' });
  const ini = de + 'T00:00:00-03:00', fim = ate + 'T23:59:59.999-03:00';
  const linhas = async (chave: 'campanha' | 'colaboradora_id') => {
    const r = await db.execute(sql.raw(`
      WITH cl AS (SELECT ${chave} AS k, count(*)::int AS n FROM quiz_cliques WHERE created_at BETWEEN '${ini}' AND '${fim}' GROUP BY 1),
      rs AS (SELECT r.${chave} AS k, count(*)::int AS respostas, count(*) FILTER (WHERE r.aprovado)::int AS aprovadas,
                    count(DISTINCT r.cadastro_id)::int AS cadastros,
                    count(DISTINCT r.cadastro_id) FILTER (WHERE c.status = 'iniciada')::int AS iniciadas
             FROM quiz_respostas r LEFT JOIN cadastros c ON c.id = r.cadastro_id
             WHERE r.created_at BETWEEN '${ini}' AND '${fim}' GROUP BY 1)
      SELECT coalesce(cl.k, rs.k) AS k, coalesce(cl.n, 0) AS cliques, coalesce(rs.respostas, 0) AS respostas,
             coalesce(rs.aprovadas, 0) AS aprovadas, coalesce(rs.cadastros, 0) AS cadastros, coalesce(rs.iniciadas, 0) AS iniciadas
      FROM cl FULL OUTER JOIN rs ON coalesce(cl.k::text, '') = coalesce(rs.k::text, '') ORDER BY 2 DESC, 3 DESC`));
    return ((r as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])) as { k: string | number | null; cliques: number; respostas: number; aprovadas: number; cadastros: number; iniciadas: number }[];
  };
  const [porCampanha, porColab, equipe] = await Promise.all([linhas('campanha'), linhas('colaboradora_id'), db.select({ id: users.id, name: users.name }).from(users)]);
  const nome = new Map(equipe.map(e => [e.id, e.name]));
  res.json({
    de, ate,
    campanhas: porCampanha.map(l => ({ ...l, campanha: l.k })),
    colaboradoras: porColab.filter(l => l.k != null).map(l => ({ ...l, id: Number(l.k), nome: nome.get(Number(l.k)) || '—' })),
  });
});
