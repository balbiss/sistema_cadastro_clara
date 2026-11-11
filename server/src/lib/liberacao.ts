import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { avalistas, cadastros, documentos, pendencias } from '../db/schema.js';
import { mudarStatus } from './eventos.js';
import { situacaoDocs } from './documentos.js';
import { formalizacaoAtual, gerarFormalizacao } from './formalizacao.js';
import { entrarNaInicializacao } from './inicializacao.js';

type Cadastro = typeof cadastros.$inferSelect;
const APROVADOS = ['aprovado', 'aprovado_avalista', 'documentos_ok', 'aguardando_assinatura', 'inicializacao', 'iniciada'];

/** Item 10 do briefing: o que precisa estar cumprido pra liberar a inicialização. */
export async function requisitosLiberacao(c: Cadastro) {
  const [docs, abertas, form, [av]] = await Promise.all([
    db.select().from(documentos).where(eq(documentos.cadastroId, c.id)),
    db.select().from(pendencias).where(and(eq(pendencias.cadastroId, c.id), isNull(pendencias.resolvidaEm), eq(pendencias.bloqueia, true))),
    formalizacaoAtual(c.id),
    c.avalistaId ? db.select().from(avalistas).where(eq(avalistas.id, c.avalistaId)).limit(1) : Promise.resolve([] as (typeof avalistas.$inferSelect)[]),
  ]);
  const sd = situacaoDocs(c, docs);
  const faltaAssinar = form?.assinaturas.filter(s => !s.assinadoEm).map(s => s.papel === 'titular' ? 'cliente' : 'avalista') || [];
  // relatório 2, item 3.8: com avalista, ele precisa estar aprovado (e os documentos/assinatura dele entram abaixo)
  const precisaAvalista = c.status === 'aprovado_avalista' || !!c.avalistaId;
  return [
    { chave: 'credito', nome: 'Crédito aprovado', ok: APROVADOS.includes(c.status) },
    ...(precisaAvalista ? [{ chave: 'avalista', nome: 'Avalista aprovado', ok: av?.status === 'aprovado',
      detalhe: av ? (av.status === 'aprovado' ? `${av.nome} (${av.ordem}º avalista)` : 'Avalista ainda não aprovado') : 'Nenhum avalista aprovado' }] : []),
    { chave: 'documentos', nome: 'Documentos conferidos', ok: sd.situacao === 'completa', detalhe: sd.situacao === 'completa' ? undefined : sd.faltam.length ? 'Faltam: ' + sd.faltam.join(', ') : 'Aguardando conferência' },
    { chave: 'assinaturas', nome: 'Contrato e promissória assinados', ok: !!form?.assinada, detalhe: !form ? 'Ainda não gerados' : faltaAssinar.length ? 'Falta assinar: ' + faltaAssinar.join(' e ') : undefined },
    { chave: 'pendencias', nome: 'Nenhuma pendência que trava a liberação', ok: abertas.length === 0, detalhe: abertas.length ? abertas.map(p => p.descricao).join('; ') : undefined },
  ];
}

/** Anda o cadastro sozinho quando os requisitos da próxima etapa estão cumpridos:
 *  aprovado → (documentos conferidos) → contrato gerado → (tudo assinado) → liberado p/ inicialização. */
export async function avancar(c: Cadastro, autor: string): Promise<Cadastro> {
  if (['aprovado', 'aprovado_avalista'].includes(c.status)) {
    const req = await requisitosLiberacao(c);
    if (['documentos', 'pendencias', 'avalista'].some(k => req.find(r => r.chave === k)?.ok === false)) return c;
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
