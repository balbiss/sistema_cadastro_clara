import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';

// Com DATABASE_URL usa um Postgres de verdade (servidor); sem ela, o PGlite grava em ./data/pg
// (teste local, sem Docker).
const url = process.env.DATABASE_URL;
let pglite: PGlite | undefined;

function make() {
  if (url) return drizzlePg(postgres(url), { schema });
  const dir = path.resolve(process.env.PGLITE_DIR || 'data/pg');
  fs.mkdirSync(dir, { recursive: true });
  pglite = new PGlite(dir);
  return drizzlePglite(pglite, { schema });
}

export const db = make() as unknown as ReturnType<typeof drizzlePg<typeof schema>>;

export async function initDb() {
  if (pglite) await pglite.exec(schema.DDL);
  else for (const stmt of schema.DDL.split(';').map(s => s.trim()).filter(Boolean)) await db.execute(sql.raw(stmt));

  // primeiro acesso: em produção cria só a diretoria das envs BOOTSTRAP_ADMIN_*; sem elas, usuários de teste (senha 123456)
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  if (n > 0) return;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL, senha = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (email && senha) {
    await db.insert(schema.users).values({ name: process.env.BOOTSTRAP_ADMIN_NAME || 'Diretoria', email, passwordHash: bcrypt.hashSync(senha, 10), role: 'diretoria' });
    console.log('Usuário inicial da diretoria criado:', email);
    return;
  }
  const hash = bcrypt.hashSync('123456', 10);
  await db.insert(schema.users).values([
    { name: 'Diretoria Teste', email: 'diretoria@teste.local', passwordHash: hash, role: 'diretoria' },
    { name: 'Análise Teste', email: 'analise@teste.local', passwordHash: hash, role: 'analise' },
    { name: 'Administrativo Teste', email: 'administrativo@teste.local', passwordHash: hash, role: 'administrativo' },
  ]);
  console.log('Usuários de teste criados: diretoria@ / analise@ / administrativo@teste.local — senha 123456');
}
