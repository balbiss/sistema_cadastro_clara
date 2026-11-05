import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, pendencias, type Inicializacao } from '../db/schema.js';
import { mudarStatus, registrarEvento } from './eventos.js';
import { getPrazos } from './settings.js';
import { brl } from './util.js';

type Cadastro = typeof cadastros.$inferSelect;

// Item 6 do briefing: inicialização presencial (matriz) e online (Correios). Cada sub-etapa tem
// prazo próprio; "agendado" e "carga conferida" vencem no dia marcado com a cliente.
// Por enquanto a revendedora conta como INICIADA quando a primeira carga é entregue (presencial)
// ou quando o recebimento é confirmado (online) — a Bel ainda vai confirmar esse momento.
export const ETAPAS_INIC = {
  presencial: [
    { chave: 'aguardando_agendamento', nome: 'Aguardando agendamento' },
    { chave: 'agendado', nome: 'Agendado — preparar carga' },
    { chave: 'carga_pronta', nome: 'Carga conferida — aguardando retirada' },
  ],
  online: [
    { chave: 'montagem', nome: 'Montagem da carga' },
    { chave: 'aguardando_pagamento', nome: 'Aguardando pagamento do frete' },
    { chave: 'expedicao', nome: 'Pago — expedir' },
    { chave: 'em_transporte', nome: 'Enviado — em transporte' },
  ],
} as const;
export type Modalidade = keyof typeof ETAPAS_INIC;
export const modalidadeDe = (c: Cadastro): Modalidade => (c.modalidade === 'online' ? 'online' : 'presencial');
export const nomeEtapaInic = (k?: string | null) => [...ETAPAS_INIC.presencial, ...ETAPAS_INIC.online].find(e => e.chave === k)?.nome || k || '';

// Ações da equipe: de quais sub-etapas podem sair, pra onde vão e o que exigem.
export const ACOES_INIC = {
  agendar: { modalidade: 'presencial', de: ['aguardando_agendamento', 'agendado', 'carga_pronta'], para: 'agendado', nome: 'Agendar retirada' },
  carga_conferida: { modalidade: 'presencial', de: ['agendado'], para: 'carga_pronta', nome: 'Carga separada e conferida' },
  entregar: { modalidade: 'presencial', de: ['carga_pronta'], para: 'iniciada', nome: 'Entregar carga na matriz' },
  informar_frete: { modalidade: 'online', de: ['montagem', 'aguardando_pagamento'], para: 'aguardando_pagamento', nome: 'Carga montada — informar frete' },
  confirmar_pagamento: { modalidade: 'online', de: ['aguardando_pagamento'], para: 'expedicao', nome: 'Confirmar pagamento' },
  enviar: { modalidade: 'online', de: ['expedicao'], para: 'em_transporte', nome: 'Enviar pelos Correios' },
  confirmar_recebimento: { modalidade: 'online', de: ['em_transporte'], para: 'iniciada', nome: 'Confirmar recebimento' },
} as const;
export type AcaoInic = keyof typeof ACOES_INIC;
export type DadosAcao = { data?: string; carga?: string; valorCarga?: number; valorFrete?: number; rastreio?: string; observacao?: string };

async function prazoDe(etapa: string, inic: Inicializacao) {
  if ((etapa === 'agendado' || etapa === 'carga_pronta') && inic.agendadoPara) return new Date(inic.agendadoPara);
  const horas = (await getPrazos())['inic_' + etapa];
  return horas ? new Date(Date.now() + horas * 3600_000) : null;
}

/** Liberado (item 10): entra na fila de inicialização da modalidade escolhida. */
export async function entrarNaInicializacao(c: Cadastro, autor: string) {
  const primeira = ETAPAS_INIC[modalidadeDe(c)][0].chave;
  const novo = await mudarStatus(c, 'inicializacao', 'Todos os requisitos cumpridos — liberada para inicialização', autor,
    { liberadoEm: new Date(), inicEtapa: primeira, inicializacao: {} }, await prazoDe(primeira, {}));
  await registrarEvento(c.id, 'liberado', `Liberada para inicialização ${modalidadeDe(c)} — ${nomeEtapaInic(primeira)}`, autor, { modalidade: modalidadeDe(c), etapa: primeira });
  return novo;
}

/** Trocou presencial ↔ online no meio da inicialização: volta pro começo da outra fila. */
export async function trocarModalidade(c: Cadastro, autor: string) {
  if (c.status !== 'inicializacao') return;
  const primeira = ETAPAS_INIC[modalidadeDe(c)][0].chave;
  await db.update(cadastros).set({ inicEtapa: primeira, etapaEntradaEm: new Date(), prazoEtapa: await prazoDe(primeira, {}), updatedAt: new Date() }).where(eq(cadastros.id, c.id));
  await registrarEvento(c.id, 'inicializacao', `Modalidade trocada para ${modalidadeDe(c)} — ${nomeEtapaInic(primeira)}`, autor, { modalidade: modalidadeDe(c), etapa: primeira });
}

export class ErroInic extends Error {}

export async function executarAcao(c: Cadastro, acao: AcaoInic, d: DadosAcao, autor: string) {
  const def = ACOES_INIC[acao];
  if (c.status !== 'inicializacao') throw new ErroInic('Este cadastro não está em inicialização');
  if (def.modalidade !== modalidadeDe(c)) throw new ErroInic(`"${def.nome}" é da inicialização ${def.modalidade}`);
  if (!(def.de as readonly string[]).includes(c.inicEtapa || '')) throw new ErroInic(`Não dá pra "${def.nome}" na etapa "${nomeEtapaInic(c.inicEtapa)}"`);
  // item 10: nada de inicializar com bloqueio aberto
  const abertas = await db.select().from(pendencias).where(and(eq(pendencias.cadastroId, c.id), isNull(pendencias.resolvidaEm), eq(pendencias.bloqueia, true)));
  if (abertas.length) throw new ErroInic('Resolva a pendência antes: ' + abertas[0].descricao);

  const inic: Inicializacao = { ...(c.inicializacao || {}) };
  let texto: string = def.nome;
  if (acao === 'agendar') {
    if (!d.data || isNaN(+new Date(d.data))) throw new ErroInic('Informe o dia e a hora da retirada');
    inic.agendadoPara = new Date(d.data).toISOString();
    texto = (c.inicEtapa === 'aguardando_agendamento' ? 'Retirada agendada para ' : 'Retirada reagendada para ') + new Date(d.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Belem' });
  }
  if (acao === 'carga_conferida' || acao === 'informar_frete') {
    if (!d.carga?.trim()) throw new ErroInic('Informe o número/código da carga');
    inic.carga = d.carga.trim();
    if (d.valorCarga != null) inic.valorCarga = d.valorCarga;
    texto = `Carga ${inic.carga}${inic.valorCarga ? ' (' + brl(inic.valorCarga) + ')' : ''} separada e conferida`;
  }
  if (acao === 'informar_frete') {
    if (d.valorFrete == null || d.valorFrete < 0) throw new ErroInic('Informe o valor do frete');
    inic.valorFrete = d.valorFrete;
    texto += ` — frete ${brl(d.valorFrete)} informado à cliente`;
  }
  if (acao === 'confirmar_pagamento') { inic.pagoEm = new Date().toISOString(); texto = 'Pagamento do frete confirmado — liberado para expedição'; }
  if (acao === 'enviar') {
    if (!d.rastreio?.trim()) throw new ErroInic('Informe o código de rastreamento');
    inic.rastreio = d.rastreio.trim().toUpperCase(); inic.enviadoEm = new Date().toISOString();
    texto = 'Enviada pelos Correios — rastreio ' + inic.rastreio;
  }
  if (d.observacao?.trim()) inic.observacao = d.observacao.trim();

  if (def.para === 'iniciada') {
    inic.entregueEm = new Date().toISOString(); inic.entreguePor = autor;
    await registrarEvento(c.id, 'inicializacao', acao === 'entregar' ? 'Primeira carga entregue na matriz' : 'Recebimento da primeira carga confirmado', autor, { acao, ...inic });
    return mudarStatus(c, 'iniciada', acao === 'entregar' ? 'Primeira carga entregue na matriz' : 'Primeira carga recebida', autor,
      { inicializacao: inic, inicEtapa: null, iniciadaEm: new Date() });
  }
  const [novo] = await db.update(cadastros).set({ inicializacao: inic, inicEtapa: def.para, etapaEntradaEm: new Date(), prazoEtapa: await prazoDe(def.para, inic), updatedAt: new Date() })
    .where(eq(cadastros.id, c.id)).returning();
  await registrarEvento(c.id, 'inicializacao', `${texto} → ${nomeEtapaInic(def.para)}`, autor, { acao, etapa: def.para, ...inic });
  return novo;
}
