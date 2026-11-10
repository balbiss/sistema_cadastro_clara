import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { getIntegracao } from './settings.js';

export type User = typeof users.$inferSelect;
const SECRET = process.env.JWT_SECRET || 'clara-cadastros-dev-local';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: User } }
}

export const assinarToken = (u: User) => jwt.sign({ sub: u.id }, SECRET, { expiresIn: '7d' });

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // ?token= só pra abrir arquivo em <img>/<a> (o navegador não manda header nesses casos)
  const raw = (req.headers.authorization || '').replace(/^Bearer /, '') || String(req.query.token || '');
  try {
    const { sub } = jwt.verify(raw, SECRET) as unknown as { sub: number };
    const [u] = await db.select().from(users).where(eq(users.id, Number(sub))).limit(1);
    if (!u || !u.active) return res.status(401).json({ error: 'Conta inativa' });
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: 'Faça login de novo' });
  }
}

// Item 10 do briefing: acesso limitado por cargo.
//  diretoria → tudo, inclusive regras, integração e usuários
//  analise → decide crédito, confere documentos, pendências
//  administrativo → confere documentos e pendências (não decide crédito)
export const PODE = {
  decidir: (u: User) => ['diretoria', 'analise'].includes(u.role),
  conferir: (u: User) => ['diretoria', 'analise', 'administrativo'].includes(u.role), // documentos e correção de dados
  relatorios: (u: User) => ['diretoria', 'analise', 'administrativo'].includes(u.role),
  abrirCadastro: (u: User) => u.role !== 'logistica',
  configurar: (u: User) => u.role === 'diretoria',
  transferir: (u: User) => u.role === 'diretoria', // gerência decide quem fica com o cadastro
};
export const exigir = (regra: (u: User) => boolean, msg: string) => (req: Request, res: Response, next: NextFunction) =>
  req.user && regra(req.user) ? next() : res.status(403).json({ error: msg });

/** Entrada do CRM: chave de API no header X-Api-Key (gerada na tela Integração). */
export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const { apiKey } = await getIntegracao();
  if (!apiKey || req.headers['x-api-key'] !== apiKey) return res.status(401).json({ error: 'Chave de API inválida' });
  next();
}
