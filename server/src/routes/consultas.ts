import { Router } from 'express';
import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, consultasCredito } from '../db/schema.js';
import { exigir, PODE, requireAuth } from '../lib/auth.js';
import { getRegras } from '../lib/settings.js';
import { statusNome } from '../lib/status.js';
import { soDigitos } from '../lib/util.js';

// Item 2.4 do relatório de ajustes (06/11): histórico e auditoria das consultas ao SPC — quem foi
// consultado, quando, score, negativações, consultas repetidas (reaproveitadas = sem custo) e a lupa
// com a consulta completa. "Médios": não aprovados por negativação que talvez passem com risco.
export const consultasRouter = Router();
consultasRouter.use('/api/consultas-spc', requireAuth, exigir(PODE.relatorios, 'Sem acesso às consultas de crédito'));

const NAO_APROVADOS = ['reprovado', 'pendente_avalista', 'analise_humana', 'desistencia'];
const r = consultasCredito.resultado;
const negCount = sql<number>`coalesce(jsonb_array_length(${r}->'negativacoes'), 0)::int`;
const total = sql<number>`coalesce((${r}->>'totalNegativado')::numeric, 0)::float`;

consultasRouter.get('/api/consultas-spc', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const conds: (SQL | undefined)[] = [];
  if (q) {
    const dig = soDigitos(q);
    conds.push(dig.length >= 3 ? or(ilike(consultasCredito.cpf, `%${dig}%`), ilike(cadastros.nome, `%${q}%`)) : or(ilike(cadastros.nome, `%${q}%`), ilike(consultasCredito.nome, `%${q}%`)));
  }
  if (req.query.de) conds.push(gte(consultasCredito.createdAt, new Date(String(req.query.de) + 'T00:00:00-03:00')));
  if (req.query.ate) conds.push(lte(consultasCredito.createdAt, new Date(String(req.query.ate) + 'T23:59:59-03:00')));
  if (req.query.tipo === 'pagas') conds.push(isNull(consultasCredito.reaproveitadaDe));
  if (req.query.tipo === 'reaproveitadas') conds.push(isNotNull(consultasCredito.reaproveitadaDe));
  const medios = req.query.medios === '1';
  if (medios) {
    conds.push(eq(consultasCredito.pessoa, 'titular'), inArray(cadastros.status, NAO_APROVADOS), sql`${negCount} > 0`);
    const max = Number(req.query.valorMax);
    if (max > 0) conds.push(sql`${total} <= ${max}`);
  }
  const where = and(...conds.filter(Boolean) as SQL[]);
  const linhas = await db.select({
    id: consultasCredito.id, cpf: consultasCredito.cpf, pessoa: consultasCredito.pessoa, nome: consultasCredito.nome, autor: consultasCredito.autor,
    provedor: consultasCredito.provedor, em: consultasCredito.createdAt, reaproveitadaDe: consultasCredito.reaproveitadaDe,
    score: sql<number | null>`(${r}->>'score')::int`, negativacoes: negCount, total, protestos: sql<number>`coalesce(jsonb_array_length(${r}->'protestos'), 0)::int`,
    situacao: sql<string>`${r}->>'situacao'`, descartada: sql<boolean>`coalesce((${r}->>'descartado')::boolean, false)`,
    cadastroId: cadastros.id, codigo: cadastros.codigo, cadastroNome: cadastros.nome, status: cadastros.status, motivo: cadastros.motivo, consultora: cadastros.consultoraNome,
    // quantas vezes esse CPF já apareceu (pagas + reaproveitadas)
    vezesCpf: sql<number>`(select count(*) from consultas_credito x where x.cpf = ${consultasCredito.cpf})::int`,
  }).from(consultasCredito).innerJoin(cadastros, eq(cadastros.id, consultasCredito.cadastroId))
    .where(where).orderBy(medios ? sql`${total} asc` : desc(consultasCredito.id)).limit(500);

  const [resumo] = await db.select({
    pagas: sql<number>`count(*) filter (where ${consultasCredito.reaproveitadaDe} is null)::int`,
    reaproveitadas: sql<number>`count(*) filter (where ${consultasCredito.reaproveitadaDe} is not null)::int`,
    cpfs: sql<number>`count(distinct ${consultasCredito.cpf})::int`,
    cpfsPagosMaisDeUmaVez: sql<number>`(select count(*) from (select cpf from consultas_credito where reaproveitada_de is null group by cpf having count(*) > 1) t)::int`,
  }).from(consultasCredito).innerJoin(cadastros, eq(cadastros.id, consultasCredito.cadastroId)).where(where);

  res.json({
    validadeMeses: (await getRegras()).validadeConsultaMeses,
    resumo,
    linhas: linhas.map(l => ({ ...l, cadastroNome: l.cadastroNome, pessoaNome: l.nome || l.cadastroNome, statusNome: statusNome(l.status) })),
  });
});

// Lupa: a consulta completa + todas as consultas do mesmo CPF
consultasRouter.get('/api/consultas-spc/:id', async (req, res) => {
  const [c] = await db.select().from(consultasCredito).where(eq(consultasCredito.id, Number(req.params.id))).limit(1);
  if (!c) return res.status(404).json({ error: 'Consulta não encontrada' });
  const historico = await db.select({
    id: consultasCredito.id, em: consultasCredito.createdAt, pessoa: consultasCredito.pessoa, autor: consultasCredito.autor, reaproveitadaDe: consultasCredito.reaproveitadaDe,
    cadastroId: cadastros.id, codigo: cadastros.codigo, cadastroNome: cadastros.nome, status: cadastros.status, consultora: cadastros.consultoraNome,
  }).from(consultasCredito).innerJoin(cadastros, eq(cadastros.id, consultasCredito.cadastroId))
    .where(eq(consultasCredito.cpf, c.cpf)).orderBy(desc(consultasCredito.id));
  res.json({ consulta: c, historico: historico.map(h => ({ ...h, statusNome: statusNome(h.status) })) });
});
