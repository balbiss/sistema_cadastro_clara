import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { cadastros } from '../db/schema.js';

// Itens 7 e 10 do briefing: acesso limitado por cargo e necessidade.
//  diretoria      → tudo
//  analise        → decide crédito, confere documentos, todos os cadastros
//  administrativo → confere documentos e pendências, todos os cadastros
//  logistica      → só a fila de inicialização (liberadas e iniciadas): montar, entregar, expedir
//  consultora     → só os cadastros DELA (consultora do lead ou responsável): acompanha e faz a
//                   inicialização/entrega; não vê SPC nem arquivos de documento
export const CARGOS = ['diretoria', 'analise', 'administrativo', 'logistica', 'consultora'] as const;
export type Cargo = typeof CARGOS[number];
type U = { id: number; name: string; role: string };

export const STATUS_LOGISTICA = ['inicializacao', 'iniciada'];
export const restrito = (u: U) => u.role === 'logistica' || u.role === 'consultora';

/** Condição SQL dos cadastros que a pessoa enxerga (undefined = todos). */
export function filtroCadastros(u: U): SQL | undefined {
  if (u.role === 'logistica') return inArray(cadastros.status, STATUS_LOGISTICA);
  if (u.role === 'consultora') return or(eq(cadastros.responsavelId, u.id), sql`lower(trim(${cadastros.consultoraNome})) = lower(trim(${u.name}))`);
  return undefined;
}
export const comFiltro = (u: U, ...conds: (SQL | undefined)[]) => and(...[filtroCadastros(u), ...conds].filter(Boolean) as SQL[]);

/** Mesma regra pra um cadastro já carregado. */
export function podeVer(u: U, c: { status: string; responsavelId: number | null; consultoraNome: string | null }) {
  if (u.role === 'logistica') return STATUS_LOGISTICA.includes(c.status);
  if (u.role === 'consultora') return c.responsavelId === u.id || (c.consultoraNome || '').trim().toLowerCase() === u.name.trim().toLowerCase();
  return true;
}
