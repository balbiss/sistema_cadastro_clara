import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, documentos, pendencias } from '../db/schema.js';
import { mudarStatus } from './eventos.js';
import { situacaoDocs } from './documentos.js';
import { formalizacaoAtual, gerarFormalizacao } from './formalizacao.js';
import { entrarNaInicializacao } from './inicializacao.js';

type Cadastro = typeof cadastros.$inferSelect;
const APROVADOS = ['aprovado', 'aprovado_avalista', 'documentos_ok', 'aguardando_assinatura', 'inicializacao', 'iniciada'];

/** Item 10 do briefing: o que precisa estar cumprido pra liberar a inicialização. */
export async function requisitosLiberacao(c: Cadastro) {
  const [docs, abertas, form] = await Promise.all([
    db.select().from(documentos).where(eq(documentos.cadastroId, c.id)),
    db.select().from(pendencias).where(and(eq(pendencias.cadastroId, c.id), isNull(pendencias.resolvidaEm))),
    formalizacaoAtual(c.id),
  ]);
  const sd = situacaoDocs(c, docs);
  const faltaAssinar = form?.assinaturas.filter(s => !s.assinadoEm).map(s => s.papel === 'titular' ? 'cliente' : 'avalista') || [];
  return [
    { chave: 'credito', nome: 'Crédito aprovado', ok: APROVADOS.includes(c.status) },
    { chave: 'documentos', nome: 'Documentos conferidos', ok: sd.situacao === 'completa', detalhe: sd.situacao === 'completa' ? undefined : sd.faltam.length ? 'Faltam: ' + sd.faltam.join(', ') : 'Aguardando conferência' },
    { chave: 'assinaturas', nome: 'Contrato e promissória assinados', ok: !!form?.assinada, detalhe: !form ? 'Ainda não gerados' : faltaAssinar.length ? 'Falta assinar: ' + faltaAssinar.join(' e ') : undefined },
    { chave: 'pendencias', nome: 'Nenhuma pendência aberta', ok: abertas.length === 0, detalhe: abertas.length ? abertas.map(p => p.descricao).join('; ') : undefined },
  ];
}

/** Anda o cadastro sozinho quando os requisitos da próxima etapa estão cumpridos:
 *  aprovado → (documentos conferidos) → contrato gerado → (tudo assinado) → liberado p/ inicialização. */
export async function avancar(c: Cadastro, autor: string): Promise<Cadastro> {
  if (['aprovado', 'aprovado_avalista'].includes(c.status)) {
    const req = await requisitosLiberacao(c);
    if (!req.find(r => r.chave === 'documentos')!.ok || !req.find(r => r.chave === 'pendencias')!.ok) return c;
    c = await mudarStatus(c, 'documentos_ok', 'Todos os documentos conferidos', autor);
  }
  if (c.status === 'documentos_ok') {
    await gerarFormalizacao(c, autor);
    const [atual] = await db.select().from(cadastros).where(eq(cadastros.id, c.id));
    return mudarStatus(atual, 'aguardando_assinatura', 'Contrato e promissória enviados para assinatura', autor);
  }
  if (c.status === 'aguardando_assinatura') {
    const req = await requisitosLiberacao(c);
    if (req.every(r => r.ok)) return entrarNaInicializacao(c, autor);
  }
  return c;
}
