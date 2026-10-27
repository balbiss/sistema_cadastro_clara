import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, documentos } from '../db/schema.js';
import { analisar } from '../lib/analise.js';
import { mudarStatus, registrarEvento } from '../lib/eventos.js';
import { salvarArquivo, situacaoDocs } from '../lib/documentos.js';
import { DOC_NOME } from '../lib/status.js';
import { soDigitos } from '../lib/util.js';

// Formulário que a cliente abre pelo link (sem login). O mesmo link serve pra tudo:
// preencher → completar avalista (se pedirem) → mandar documentos (depois de aprovada).
export const publicoRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const CLIENTE = 'cliente (formulário)';

async function porToken(token: string) {
  const [c] = await db.select().from(cadastros).where(eq(cadastros.formToken, token)).limit(1);
  return c;
}

// A cliente vê só o necessário: nunca o resultado do SPC nem o motivo interno.
function etapaCliente(status: string) {
  if (status === 'formulario_enviado') return 'formulario';
  if (status === 'pendente_avalista') return 'avalista';
  if (['aprovado', 'aprovado_avalista'].includes(status)) return 'documentos';
  if (status === 'documentos_ok') return 'concluido';
  if (status === 'reprovado' || status === 'desistencia') return 'encerrado';
  return 'em_analise';
}

publicoRouter.get('/api/publico/:token', async (req, res) => {
  const c = await porToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'Link inválido ou expirado' });
  const docs = await db.select().from(documentos).where(eq(documentos.cadastroId, c.id));
  const sd = situacaoDocs(c, docs);
  res.json({
    etapa: etapaCliente(c.status), nome: c.nome, telefone: c.telefone, email: c.email, cpf: c.cpf, consultora: c.consultoraNome,
    documentos: sd.itens.map(i => ({ tipo: i.tipo, nome: i.nome, enviado: !!i.doc && i.doc.status !== 'recusado', recusado: i.doc?.status === 'recusado', observacao: i.doc?.status === 'recusado' ? i.doc.observacao : null })),
  });
});

publicoRouter.post('/api/publico/:token/iniciar', async (req, res) => {
  const c = await porToken(req.params.token);
  if (!c) return res.status(404).end();
  if (!c.formIniciadoEm) {
    await db.update(cadastros).set({ formIniciadoEm: new Date() }).where(eq(cadastros.id, c.id));
    await registrarEvento(c.id, 'formulario_iniciado', 'Cliente abriu o formulário', CLIENTE);
  }
  res.json({ ok: true });
});

const endereco = z.object({ cep: z.string(), rua: z.string(), numero: z.string(), complemento: z.string().optional(), bairro: z.string(), cidade: z.string(), uf: z.string() });
const avalista = z.object({ nome: z.string().min(3), cpf: z.string(), telefone: z.string().optional(), dataNascimento: z.string(), endereco: endereco.partial().optional() });

const formulario = z.object({
  nome: z.string().min(3), cpf: z.string(), dataNascimento: z.string(), telefone: z.string(), email: z.string().optional(),
  endereco, declarouRestricao: z.boolean(), temAvalista: z.boolean(), avalista: avalista.optional(),
  modalidade: z.enum(['presencial', 'online']), aceiteLgpd: z.literal(true),
});

publicoRouter.post('/api/publico/:token/formulario', async (req, res) => {
  const c = await porToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'Link inválido' });
  if (c.status !== 'formulario_enviado') return res.status(409).json({ error: 'Este formulário já foi enviado' });
  const p = formulario.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Confira os campos obrigatórios', detalhes: p.error.flatten() });
  const d = p.data;
  const agora = new Date();
  const atualizado = { ...c,
    nome: d.nome.trim(), cpf: soDigitos(d.cpf), dataNascimento: d.dataNascimento, telefone: soDigitos(d.telefone), email: d.email || null,
    endereco: { ...d.endereco, cep: soDigitos(d.endereco.cep), uf: d.endereco.uf.toUpperCase() },
    declarouRestricao: d.declarouRestricao, temAvalista: d.temAvalista,
    avalista: d.temAvalista && d.avalista ? { ...d.avalista, cpf: soDigitos(d.avalista.cpf) } : null,
    modalidade: d.modalidade, aceiteLgpdEm: agora, formConcluidoEm: agora, formIniciadoEm: c.formIniciadoEm || agora,
  };
  // guarda o que foi enviado (formulário original, item 5) e segue pra análise
  await registrarEvento(c.id, 'formulario_concluido', 'Cliente enviou o formulário', CLIENTE, { formulario: d });
  const preenchido = await mudarStatus(c, 'formulario_preenchido', null, CLIENTE, atualizado);
  res.json({ ok: true });
  analisar(preenchido).catch(err => console.error('Análise falhou para', c.codigo, err));
});

publicoRouter.post('/api/publico/:token/avalista', async (req, res) => {
  const c = await porToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'Link inválido' });
  if (c.status !== 'pendente_avalista') return res.status(409).json({ error: 'Não estamos aguardando avalista neste cadastro' });
  const p = avalista.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Confira os dados do avalista', detalhes: p.error.flatten() });
  await registrarEvento(c.id, 'avalista_informado', `Avalista informado: ${p.data.nome}`, CLIENTE, { avalista: { ...p.data, cpf: soDigitos(p.data.cpf) } });
  const comAvalista = await mudarStatus(c, 'formulario_preenchido', 'Avalista informado — reanalisando', CLIENTE,
    { temAvalista: true, avalista: { ...p.data, cpf: soDigitos(p.data.cpf) } });
  res.json({ ok: true });
  analisar(comAvalista).catch(err => console.error('Análise falhou para', c.codigo, err));
});

publicoRouter.post('/api/publico/:token/documentos', upload.single('arquivo'), async (req, res) => {
  const c = await porToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'Link inválido' });
  if (!['aprovado', 'aprovado_avalista'].includes(c.status)) return res.status(409).json({ error: 'Ainda não é hora de enviar documentos' });
  const tipo = String(req.body.tipo || '');
  if (!DOC_NOME[tipo] || !req.file) return res.status(400).json({ error: 'Arquivo ou tipo de documento inválido' });
  if (!/^(image\/|application\/pdf)/.test(req.file.mimetype)) return res.status(400).json({ error: 'Envie foto ou PDF' });
  const arquivo = salvarArquivo(c.id, req.file.buffer, req.file.originalname);
  await db.insert(documentos).values({ cadastroId: c.id, tipo, arquivo, nomeOriginal: req.file.originalname, mime: req.file.mimetype, tamanho: req.file.size });
  await registrarEvento(c.id, 'documento_enviado', `Documento enviado: ${DOC_NOME[tipo]}`, CLIENTE, { tipo });
  const docs = await db.select().from(documentos).where(eq(documentos.cadastroId, c.id));
  const sd = situacaoDocs(c, docs);
  if (!sd.faltam.length) await registrarEvento(c.id, 'documentos_recebidos', 'Cliente enviou todos os documentos — aguardando conferência', CLIENTE);
  res.json({ ok: true, faltam: sd.faltam });
});
