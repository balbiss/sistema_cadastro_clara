import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, documentos, pendencias } from '../db/schema.js';
import { DOCS_AVALISTA, DOCS_TITULAR, DOC_NOME } from './status.js';
import { mudarStatus } from './eventos.js';

type Cadastro = typeof cadastros.$inferSelect;
type Documento = typeof documentos.$inferSelect;

// Arquivos do dossiê ficam fora do banco, numa pasta privada (só saem pela API, com login).
export const PASTA = path.resolve(process.env.ARQUIVOS_DIR || 'data/arquivos');

export function salvarArquivo(cadastroId: number, buf: Buffer, nomeOriginal: string) {
  const ext = path.extname(nomeOriginal).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
  const rel = path.join(String(cadastroId), crypto.randomBytes(12).toString('hex') + ext);
  fs.mkdirSync(path.join(PASTA, String(cadastroId)), { recursive: true });
  fs.writeFileSync(path.join(PASTA, rel), buf);
  return rel;
}

export const docsExigidos = (c: Cadastro) => [...DOCS_TITULAR, ...(c.status === 'aprovado_avalista' || c.temAvalista && c.avalista?.cpf ? DOCS_AVALISTA : [])];

/** Situação da documentação: o documento vale o último enviado de cada tipo. */
export function situacaoDocs(c: Cadastro, docs: Documento[]) {
  const ultimo = new Map<string, Documento>();
  for (const d of [...docs].sort((a, b) => a.id - b.id)) ultimo.set(d.tipo, d);
  const itens = docsExigidos(c).map(tipo => ({ tipo, nome: DOC_NOME[tipo], doc: ultimo.get(tipo) || null }));
  const faltam = itens.filter(i => !i.doc || i.doc.status === 'recusado');
  const aConferir = itens.filter(i => i.doc?.status === 'enviado');
  const situacao = faltam.length ? 'incompleta' : aConferir.length ? 'em_conferencia' : 'completa';
  return { itens, situacao, faltam: faltam.map(i => i.nome) };
}

/** Item 10: só libera (Documentação conferida) com tudo conferido e nenhuma pendência aberta. */
export async function tentarLiberar(c: Cadastro, autor: string) {
  if (!['aprovado', 'aprovado_avalista'].includes(c.status)) return c;
  const docs = await db.select().from(documentos).where(eq(documentos.cadastroId, c.id));
  if (situacaoDocs(c, docs).situacao !== 'completa') return c;
  const abertas = await db.select({ id: pendencias.id }).from(pendencias).where(and(eq(pendencias.cadastroId, c.id), isNull(pendencias.resolvidaEm)));
  if (abertas.length) return c;
  return mudarStatus(c, 'documentos_ok', 'Todos os documentos conferidos', autor);
}

/** Comprovante de residência: até 3 meses (política proposta no item 5). */
export function comprovanteNoPrazo(dataEmissao: string, hoje = new Date()) {
  const limite = new Date(hoje);
  limite.setMonth(limite.getMonth() - 3);
  return new Date(dataEmissao + 'T12:00:00') >= limite;
}
