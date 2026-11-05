import path from 'node:path';
import crypto from 'node:crypto';
import type { cadastros, documentos } from '../db/schema.js';
import { DOCS_AVALISTA, DOCS_TITULAR, DOC_NOME } from './status.js';
import { gravar } from './storage.js';

type Cadastro = typeof cadastros.$inferSelect;
type Documento = typeof documentos.$inferSelect;

// Arquivos do dossiê ficam fora do banco (MinIO em produção, pasta local em teste); só saem pela API, com login.
export async function salvarArquivo(cadastroId: number, buf: Buffer, nomeOriginal: string, mime?: string) {
  const ext = path.extname(nomeOriginal).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
  const rel = String(cadastroId) + '/' + crypto.randomBytes(12).toString('hex') + ext;
  await gravar(rel, buf, mime);
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

/** Comprovante de residência: até 3 meses (política proposta no item 5). */
export function comprovanteNoPrazo(dataEmissao: string, hoje = new Date()) {
  const limite = new Date(hoje);
  limite.setMonth(limite.getMonth() - 3);
  return new Date(dataEmissao + 'T12:00:00') >= limite;
}
