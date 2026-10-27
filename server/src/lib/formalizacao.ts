import crypto from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { assinaturas, cadastros, formalizacoes } from '../db/schema.js';
import { APP_URL, registrarEvento } from './eventos.js';
import { getModelos } from './settings.js';
import { brl, cpfFmt, dataBR, valorExtenso } from './util.js';

type Cadastro = typeof cadastros.$inferSelect;

// Item 9 do briefing: contrato + nota promissória + assinatura eletrônica. A assinatura ainda é
// SIMULADA (a Clara não escolheu o serviço — Clicksign, ZapSign, D4Sign…): cada signatário recebe um
// link, confere o texto, digita o CPF e aceita. Guarda data, IP, aparelho e o hash do texto assinado.
export const PROVEDOR_ASSINATURA = 'simulado';
export const linkAssinatura = (token: string) => `${APP_URL()}/assinar/${token}`;

const enderecoTexto = (c: Cadastro) => {
  const e = c.endereco || {};
  return e.rua ? `${e.rua}, ${e.numero}${e.complemento ? ' ' + e.complemento : ''} — ${e.bairro}, ${e.cidade}/${e.uf}` : '(endereço não informado)';
};
const temAvalista = (c: Cadastro) => !!c.avalista?.cpf && (c.status === 'aprovado_avalista' || !!c.temAvalista);

function preencher(modelo: string, c: Cadastro, valor: number) {
  const av = temAvalista(c) ? c.avalista! : null;
  const campos: Record<string, string> = {
    nome: c.nome, cpf: cpfFmt(c.cpf), endereco: enderecoTexto(c), cidade: c.endereco?.cidade || 'Belém', data: dataBR(),
    valor: brl(valor), valor_extenso: valorExtenso(valor), codigo: c.codigo,
    modalidade: c.modalidade === 'online' ? 'online (envio pelos Correios)' : 'presencial (retirada na matriz)',
    avalista_nome: av?.nome || '', avalista_cpf: av ? cpfFmt(av.cpf) : '',
    texto_avalista: av ? `, com aval de ${av.nome}, CPF ${cpfFmt(av.cpf)}` : '',
    linha_avalista: av ? `\nAvalista: ${av.nome} — CPF ${cpfFmt(av.cpf)}\n` : '',
  };
  return modelo.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in campos ? campos[k] : m));
}

export async function formalizacaoAtual(cadastroId: number) {
  const [f] = await db.select().from(formalizacoes)
    .where(and(eq(formalizacoes.cadastroId, cadastroId), isNull(formalizacoes.canceladaEm))).orderBy(desc(formalizacoes.id)).limit(1);
  if (!f) return null;
  const sig = await db.select().from(assinaturas).where(eq(assinaturas.formalizacaoId, f.id)).orderBy(assinaturas.id);
  return { ...f, assinaturas: sig, assinada: sig.length > 0 && sig.every(s => s.assinadoEm) };
}

/** Gera (ou refaz) o contrato e a promissória. Refazer cancela a versão anterior e as assinaturas dela. */
export async function gerarFormalizacao(c: Cadastro, autor: string, valor?: number) {
  const modelos = await getModelos();
  const v = Math.round(valor ?? c.valorCredito ?? modelos.valorPadrao);
  const anterior = await formalizacaoAtual(c.id);
  if (anterior) await db.update(formalizacoes).set({ canceladaEm: new Date() }).where(eq(formalizacoes.id, anterior.id));
  const contrato = preencher(modelos.contrato, c, v);
  const promissoria = preencher(modelos.promissoria, c, v);
  const hash = crypto.createHash('sha256').update(contrato + '\n---\n' + promissoria).digest('hex');
  const [f] = await db.insert(formalizacoes).values({
    cadastroId: c.id, versao: (anterior?.versao || 0) + 1, contrato, promissoria, valor: v, hash, provedor: PROVEDOR_ASSINATURA, criadoPor: autor,
  }).returning();
  const signatarios = [{ papel: 'titular', nome: c.nome, cpf: c.cpf || '' }];
  if (temAvalista(c)) signatarios.push({ papel: 'avalista', nome: c.avalista!.nome || 'Avalista', cpf: c.avalista!.cpf || '' });
  const criadas = await db.insert(assinaturas).values(signatarios.map(s => ({
    ...s, formalizacaoId: f.id, cadastroId: c.id, token: crypto.randomBytes(18).toString('base64url'),
  }))).returning();
  await db.update(cadastros).set({ valorCredito: v, updatedAt: new Date() }).where(eq(cadastros.id, c.id));
  // os links vão no aviso pro CRM mandar pelo WhatsApp
  await registrarEvento(c.id, 'formalizacao_gerada',
    `${anterior ? 'Contrato e promissória refeitos' : 'Contrato e promissória gerados'} (${brl(v)}) — aguardando ${criadas.length === 1 ? 'a assinatura da cliente' : 'assinatura da cliente e do avalista'}`,
    autor, { versao: f.versao, valor: v, hash, links: criadas.map(s => ({ papel: s.papel, nome: s.nome, link: linkAssinatura(s.token) })) });
  return f;
}
