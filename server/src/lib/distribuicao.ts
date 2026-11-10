import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { getSetting, setSetting } from './settings.js';
import { slugify } from './quiz.js';

// Relatório de ajustes (06/11) item 3: de onde veio a candidata e quem fica com ela.
//  - Prospecção ativa: a colaboradora manda o SEU link (?c=codigo) → o cadastro é dela, fora do rodízio.
//  - Tráfego pago: link sem código → rodízio entre as colaboradoras escolhidas (pode ter uma lista por campanha).

type U = typeof users.$inferSelect;

/** Código curto do link pessoal (ex.: "natalia-k3"). Gerado uma vez por pessoa. */
export async function garantirCodigo(u: U): Promise<string> {
  if (u.codigo) return u.codigo;
  const base = slugify(u.name.split(' ')[0] || 'colab').slice(0, 14);
  for (let i = 0; i < 20; i++) {
    const codigo = base + '-' + crypto.randomBytes(2).toString('hex').slice(0, 3);
    try {
      const [r] = await db.update(users).set({ codigo }).where(eq(users.id, u.id)).returning({ codigo: users.codigo });
      return r.codigo!;
    } catch { /* código repetido: tenta outro */ }
  }
  throw new Error('Não consegui gerar o código do link');
}

export async function colaboradoraPorCodigo(codigo?: string | null) {
  const c = String(codigo || '').trim().toLowerCase();
  if (!c) return null;
  const [u] = await db.select().from(users).where(and(eq(users.codigo, c), eq(users.active, true))).limit(1);
  return u || null;
}

export type Rodizio = {
  ativo: boolean;
  /** lista geral (vale pra qualquer campanha sem lista própria) */
  participantes: number[];
  /** lista própria de uma campanha (o nome da campanha é o utm_campaign / ?campanha= do link) */
  campanhas: { campanha: string; participantes: number[] }[];
  /** de quem é a vez em cada lista ('*' = geral) — o sistema mantém sozinho */
  vez: Record<string, number>;
};
export const RODIZIO_PADRAO: Rodizio = { ativo: false, participantes: [], campanhas: [], vez: {} };
export const getRodizio = async (): Promise<Rodizio> => ({ ...RODIZIO_PADRAO, ...(await getSetting<Partial<Rodizio>>('rodizio', {})) } as Rodizio);

const norm = (s?: string | null) => String(s || '').trim().toLowerCase();

// uma escolha por vez (dois quizzes ao mesmo tempo não pegam a mesma pessoa)
let fila: Promise<unknown> = Promise.resolve();

/** Próxima colaboradora do rodízio pra essa campanha (null = rodízio desligado ou sem ninguém ativo). */
export function proximaDoRodizio(campanha?: string | null): Promise<{ user: U; lista: string } | null> {
  const vez = fila.then(async () => {
    const r = await getRodizio();
    if (!r.ativo) return null;
    const propria = campanha ? r.campanhas.find(c => norm(c.campanha) === norm(campanha) && c.participantes.length) : undefined;
    const chave = propria ? 'c:' + norm(propria.campanha) : '*';
    const ids = propria ? propria.participantes : r.participantes;
    if (!ids.length) return null;
    const ativos = await db.select().from(users).where(and(inArray(users.id, ids), eq(users.active, true)));
    const ordem = ids.map(id => ativos.find(a => a.id === id)).filter(Boolean) as U[];
    if (!ordem.length) return null;
    // volta pro começo quando passa do fim; quem saiu da lista é pulado
    const ultimo = r.vez[chave];
    const pos = ultimo == null ? -1 : ordem.findIndex(u => u.id === ultimo);
    const escolhida = ordem[(pos + 1) % ordem.length];
    await setSetting('rodizio', { ...r, vez: { ...r.vez, [chave]: escolhida.id } });
    return { user: escolhida, lista: propria ? 'campanha ' + propria.campanha : 'geral' };
  });
  fila = vez.catch(() => null);
  return vez;
}
