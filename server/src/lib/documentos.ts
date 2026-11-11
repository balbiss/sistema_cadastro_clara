import path from 'node:path';
import crypto from 'node:crypto';
import type { cadastros, documentos } from '../db/schema.js';
import { DOC_NOME } from './status.js';
import { docsConfig } from './settings.js';
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

/** Documentos obrigatórios (Regras → Documentos). Os do avalista só quando há avalista aprovado no cadastro. */
export const docsExigidos = (c: Cadastro) => {
  const cfg = docsConfig();
  return [...cfg.titular, ...(c.avalistaId ? cfg.avalista : [])];
};
export const ehDocAvalista = (tipo: string) => tipo.startsWith('avalista_');

/** Situação da documentação: o documento vale o último enviado de cada tipo. Documento de avalista
 *  só conta se for do avalista que vale hoje (os do avalista recusado ficam na pasta dele). */
export function situacaoDocs(c: Cadastro, docs: Documento[]) {
  const ultimo = new Map<string, Documento>();
  for (const d of [...docs].sort((a, b) => a.id - b.id)) {
    if (ehDocAvalista(d.tipo) && d.avalistaId !== c.avalistaId) continue;
    ultimo.set(d.tipo, d);
  }
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
