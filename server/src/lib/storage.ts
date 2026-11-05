import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { Client } from 'minio';

// Onde ficam os arquivos do dossiê (fotos de documentos, comprovantes...).
// Com MINIO_ENDPOINT → MinIO próprio do cadastro (produção). Sem ele → pasta local (teste).
const endpoint = process.env.MINIO_ENDPOINT; // ex: http://minio-xxxx:9000
const BUCKET = process.env.MINIO_BUCKET || 'clara-cadastros';
export const PASTA = path.resolve(process.env.ARQUIVOS_DIR || 'data/arquivos');

let minio: Client | null = null;
if (endpoint) {
  const u = new URL(endpoint);
  minio = new Client({
    endPoint: u.hostname,
    port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80),
    useSSL: u.protocol === 'https:',
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
  });
}

export async function iniciarStorage() {
  if (!minio) return console.log('Arquivos: pasta local', PASTA);
  if (!(await minio.bucketExists(BUCKET))) await minio.makeBucket(BUCKET);
  console.log('Arquivos: MinIO bucket', BUCKET);
}

export async function gravar(chave: string, buf: Buffer, mime?: string) {
  if (minio) {
    await minio.putObject(BUCKET, chave, buf, buf.length, mime ? { 'Content-Type': mime } : {});
    return;
  }
  const dest = path.join(PASTA, chave);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

/** Devolve o arquivo pra mandar na resposta, ou null se não existir. */
export async function ler(chave: string): Promise<Readable | null> {
  if (chave.includes('..')) return null;
  if (minio) {
    try { return await minio.getObject(BUCKET, chave); } catch { return null; }
  }
  const caminho = path.join(PASTA, chave);
  if (!caminho.startsWith(PASTA) || !fs.existsSync(caminho)) return null;
  return fs.createReadStream(caminho);
}
