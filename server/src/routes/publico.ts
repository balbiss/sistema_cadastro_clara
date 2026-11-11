import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { and, eq, ilike, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { assinaturas, cadastros, documentos, formalizacoes, pendencias } from '../db/schema.js';
import { analisar } from '../lib/analise.js';
import { mudarStatus, registrarEvento } from '../lib/eventos.js';
import { salvarArquivo, situacaoDocs } from '../lib/documentos.js';
import { DOC_NOME } from '../lib/status.js';
import { formalizacaoAtual } from '../lib/formalizacao.js';
import { avancar } from '../lib/liberacao.js';
import { nomeEtapaInic } from '../lib/inicializacao.js';
import { soDigitos } from '../lib/util.js';
import { conferirComIa, fecharPendenciaReenvio } from '../lib/ia.js';
import { apresentarAvalista, ErroAvalista, formularioAvalistaPublico, tentativas } from '../lib/avalistas.js';
import { getRegrasAvalista } from '../lib/settings.js';
import { ehDocAvalista } from '../lib/documentos.js';

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
  if (status === 'formulario_enviado' || status === 'quiz_aprovado') return 'formulario';
  if (status === 'pendente_avalista') return 'avalista';
  if (['aprovado', 'aprovado_avalista'].includes(status)) return 'documentos';
  if (status === 'aguardando_assinatura') return 'assinatura';
  if (status === 'inicializacao') return 'inicializacao';
  if (status === 'iniciada') return 'concluido';
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
    modalidade: c.modalidade,
    // relatório 2, item 3: quiz do avalista (sem pontos) e em qual tentativa ela está — nunca o motivo da recusa
    avalista: c.status === 'pendente_avalista' ? await (async () => {
      const t = await tentativas(c.id);
      return { ...formularioAvalistaPublico(await getRegrasAvalista()), tentativa: t.usadas + 1, max: t.max, outro: t.usadas > 0, podeOutro: t.podeOutro };
    })() : null,
    assinatura: await (async () => {
      if (c.status !== 'aguardando_assinatura') return null;
      const f = await formalizacaoAtual(c.id);
      const eu = f?.assinaturas.find(a => a.papel === 'titular');
      return f && { token: eu?.token, assinou: !!eu?.assinadoEm, avalistaPendente: f.assinaturas.some(a => a.papel === 'avalista' && !a.assinadoEm) };
    })(),
    // a cliente vê só o que interessa a ela: dia marcado, frete e rastreio
    inicializacao: c.status === 'inicializacao' ? { etapa: c.inicEtapa, etapaNome: nomeEtapaInic(c.inicEtapa), agendadoPara: c.inicializacao?.agendadoPara,
      valorFrete: c.inicializacao?.valorFrete, pago: !!c.inicializacao?.pagoEm, rastreio: c.inicializacao?.rastreio } : null,
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
const avalista = z.object({ nome: z.string().min(3), cpf: z.string(), telefone: z.string().optional(), dataNascimento: z.string(), endereco: endereco.partial().optional(),
  parentesco: z.string().optional(), respostas: z.record(z.string()).optional() });

const formulario = z.object({
  nome: z.string().min(3), cpf: z.string(), dataNascimento: z.string(), telefone: z.string(), email: z.string().optional(),
  endereco, declarouRestricao: z.boolean(), temAvalista: z.boolean(), avalista: avalista.optional(),
  modalidade: z.enum(['presencial', 'online']), aceiteLgpd: z.literal(true),
});

publicoRouter.post('/api/publico/:token/formulario', async (req, res) => {
  const c = await porToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'Link inválido' });
  if (c.status !== 'formulario_enviado' && c.status !== 'quiz_aprovado') return res.status(409).json({ error: 'Este formulário já foi enviado' });
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
  let av;
  try { av = await apresentarAvalista(c, p.data, CLIENTE); }
  catch (e) { if (e instanceof ErroAvalista) return res.status(409).json({ error: e.message }); throw e; }
  const [atual] = await db.select().from(cadastros).where(eq(cadastros.id, c.id));
  const comAvalista = await mudarStatus(atual, 'formulario_preenchido', `${av.ordem}º avalista informado — analisando`, CLIENTE);
  res.json({ ok: true });
  analisar(comAvalista).catch(err => console.error('Análise falhou para', c.codigo, err));
});

publicoRouter.post('/api/publico/:token/documentos', upload.single('arquivo'), async (req, res) => {
  const c = await porToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'Link inválido' });
  if (!['aprovado', 'aprovado_avalista'].includes(c.status)) return res.status(409).json({ error: 'Ainda não é hora de enviar documentos' });
  const tipo = String(req.body.tipo || '');
  if (!DOC_NOME[tipo] || !req.file) return res.status(400).json({ error: 'Arquivo ou tipo de documento inválido' });
  if (ehDocAvalista(tipo) && !c.avalistaId) return res.status(400).json({ error: 'Este cadastro não tem avalista aprovado' });
  if (!/^(image\/|application\/pdf)/.test(req.file.mimetype)) return res.status(400).json({ error: 'Envie foto ou PDF' });
  const arquivo = await salvarArquivo(c.id, req.file.buffer, req.file.originalname, req.file.mimetype);
  const [novoDoc] = await db.insert(documentos).values({ cadastroId: c.id, tipo, arquivo, avalistaId: ehDocAvalista(tipo) ? c.avalistaId : null, nomeOriginal: req.file.originalname, mime: req.file.mimetype, tamanho: req.file.size }).returning();
  await fecharPendenciaReenvio(c.id, tipo, CLIENTE);
  await registrarEvento(c.id, 'documento_enviado', `Documento enviado: ${DOC_NOME[tipo]}`, CLIENTE, { tipo });
  const docs = await db.select().from(documentos).where(eq(documentos.cadastroId, c.id));
  const sd = situacaoDocs(c, docs);
  if (!sd.faltam.length) await registrarEvento(c.id, 'documentos_recebidos', 'Cliente enviou todos os documentos — aguardando conferência', CLIENTE);
  res.json({ ok: true, faltam: sd.faltam });
  conferirComIa(novoDoc.id).catch(err => console.error('IA falhou no documento', novoDoc.id, err));
});

// ---------- assinatura eletrônica (item 9) — SIMULADA até a Clara escolher o serviço ----------
async function porTokenAssinatura(token: string) {
  const [a] = await db.select().from(assinaturas).where(eq(assinaturas.token, token)).limit(1);
  if (!a) return null;
  const [f] = await db.select().from(formalizacoes).where(eq(formalizacoes.id, a.formalizacaoId)).limit(1);
  const [c] = await db.select().from(cadastros).where(eq(cadastros.id, a.cadastroId)).limit(1);
  return { a, f, c };
}

publicoRouter.get('/api/assinatura/:token', async (req, res) => {
  const r = await porTokenAssinatura(req.params.token);
  if (!r) return res.status(404).json({ error: 'Link de assinatura inválido' });
  const { a, f, c } = r;
  res.json({
    papel: a.papel, nome: a.nome, cadastroNome: c.nome, codigo: c.codigo, assinadoEm: a.assinadoEm,
    cancelada: !!f.canceladaEm, valor: f.valor, versao: f.versao, hash: f.hash, contrato: f.contrato, promissoria: f.promissoria, provedor: f.provedor,
  });
});

publicoRouter.post('/api/assinatura/:token', async (req, res) => {
  const r = await porTokenAssinatura(req.params.token);
  if (!r) return res.status(404).json({ error: 'Link de assinatura inválido' });
  const { a, f, c } = r;
  if (f.canceladaEm) return res.status(409).json({ error: 'Este contrato foi substituído. Peça o link novo à sua consultora.' });
  if (a.assinadoEm) return res.status(409).json({ error: 'Você já assinou' });
  if (c.status !== 'aguardando_assinatura') return res.status(409).json({ error: 'Este cadastro não está aguardando assinatura' });
  if (req.body.aceite !== true) return res.status(400).json({ error: 'Marque que leu e concorda' });
  if (soDigitos(req.body.cpf) !== a.cpf) return res.status(400).json({ error: 'CPF não confere com o de quem deve assinar' });
  const agora = new Date();
  await db.update(assinaturas).set({ assinadoEm: agora, ip: req.ip || null, userAgent: String(req.headers['user-agent'] || '').slice(0, 300) })
    .where(and(eq(assinaturas.id, a.id), eq(assinaturas.formalizacaoId, f.id)));
  const quemAssinou = a.papel === 'titular' ? 'cliente' : 'avalista';
  await registrarEvento(c.id, 'assinatura', `Contrato e promissória assinados pela ${quemAssinou} (${a.nome})`, `${a.nome} (${quemAssinou})`,
    { papel: a.papel, versao: f.versao, hash: f.hash, ip: req.ip, provedor: f.provedor });
  const todas = await db.select().from(assinaturas).where(eq(assinaturas.formalizacaoId, f.id));
  if (todas.every(x => x.assinadoEm)) {
    await db.update(formalizacoes).set({ concluidaEm: agora }).where(eq(formalizacoes.id, f.id));
    await registrarEvento(c.id, 'formalizacao_concluida', 'Todas as assinaturas recebidas', 'sistema', { versao: f.versao, hash: f.hash });
    await avancar(c, 'sistema');
  }
  res.json({ ok: true });
});
