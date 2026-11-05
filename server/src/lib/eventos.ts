import crypto from 'node:crypto';
import { and, asc, eq, inArray, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, eventos, users } from '../db/schema.js';
import { SETORES, getIntegracao, getPrazos, getSetores } from './settings.js';
import { statusNome, type Status } from './status.js';

type Cadastro = typeof cadastros.$inferSelect;

export const APP_URL = () => process.env.APP_URL || 'http://localhost:5185';
export const linkFormulario = (c: Pick<Cadastro, 'formToken'>) => `${APP_URL()}/f/${c.formToken}`;
export const linkDossie = (c: Pick<Cadastro, 'id'>) => `${APP_URL()}/cadastros/${c.id}`;

/** O que o CRM recebe sobre o cadastro em todo aviso (sem documento nem SPC completo — isso
 *  fica só aqui; o CRM abre pelo link do dossiê). */
export function resumoParaCrm(c: Cadastro) {
  return {
    id: c.id, codigo: c.codigo, crm_lead_id: c.crmLeadId, crm_contact_id: c.crmContactId,
    nome: c.nome, cpf: c.cpf, telefone: c.telefone, consultora: c.consultoraNome, origem: c.origem, campanha: c.campanha,
    status: c.status, status_nome: statusNome(c.status), motivo: c.motivo, decidido_por: c.decididoPor,
    modalidade: c.modalidade, valor_credito: c.valorCredito, liberado_em: c.liberadoEm, inicializacao_etapa: c.inicEtapa,
    inicializacao: c.inicializacao, iniciada_em: c.iniciadaEm, etapa_entrada_em: c.etapaEntradaEm, prazo_etapa: c.prazoEtapa,
    cidade: c.cidade, quiz: c.quiz ? { pontos: c.quiz.pontos, respostas: c.quiz.itens.map(i => ({ pergunta: i.pergunta, resposta: i.resposta })) } : null,
    link_formulario: linkFormulario(c), link_dossie: linkDossie(c),
  };
}

export async function registrarEvento(cadastroId: number, tipo: string, descricao: string, autor: string, dados?: unknown) {
  await db.insert(eventos).values({ cadastroId, tipo, descricao, autor, dados: dados ?? null });
  void enviarPendentesAoCrm();
}

/** Troca a etapa: grava data de entrada e prazo da nova etapa e avisa o CRM (que move o card). */
// prazo: quando a etapa vence numa data própria (ex.: dia agendado com a cliente), em vez do prazo padrão.
export async function mudarStatus(c: Cadastro, status: Status, motivo: string | null, autor: string, extra: Partial<Cadastro> = {}, prazo?: Date | null) {
  const prazos = await getPrazos();
  const agora = new Date();
  const horas = prazos[status];
  // item 7: etapa nova pode ser de outro setor → passa pro responsável padrão desse setor e registra a passagem
  const setores = await getSetores();
  const setorNovo = setores.etapas[status] || c.setor || null;
  const trocouSetor = !!setorNovo && setorNovo !== c.setor;
  const padrao = trocouSetor ? setores.responsaveis[setorNovo!] : null;
  // quem chama às vezes manda o cadastro inteiro em `extra`: só vale como troca manual se o responsável mudou de fato
  const trocaManual = extra.responsavelId !== undefined && extra.responsavelId !== c.responsavelId;
  const responsavelId = trocaManual ? extra.responsavelId! : padrao || c.responsavelId;
  const [novo] = await db.update(cadastros).set({
    ...extra, status, motivo, etapaEntradaEm: agora, updatedAt: agora, setor: setorNovo, responsavelId,
    prazoEtapa: prazo !== undefined ? prazo : horas ? new Date(agora.getTime() + horas * 3600_000) : null,
  }).where(eq(cadastros.id, c.id)).returning();
  await registrarEvento(c.id, 'status_alterado', `${statusNome(c.status)} → ${statusNome(status)}${motivo ? ' — ' + motivo : ''}`, autor,
    { de: c.status, para: status, motivo });
  if (trocouSetor && c.setor) {
    const [r] = responsavelId ? await db.select({ name: users.name }).from(users).where(eq(users.id, responsavelId)).limit(1) : [];
    const prazoTxt = novo.prazoEtapa ? novo.prazoEtapa.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
    await registrarEvento(c.id, 'passagem', `${SETORES[c.setor] || c.setor} → ${SETORES[setorNovo!] || setorNovo}: entregue por ${autor}, recebido por ${r?.name || 'setor (sem responsável definido)'}${prazoTxt ? ', prazo ' + prazoTxt : ''}`, autor,
      { de: c.setor, para: setorNovo, entregue_por: autor, recebido_por: r?.name || null, responsavel_id: responsavelId, prazo: novo.prazoEtapa });
  }
  return novo;
}

// ---------- entrega ao CRM (webhook) ----------
// Fila única em ordem de id: o CRM precisa receber os avisos na ordem em que aconteceram pra
// mover o card certo. O que falha tenta de novo a cada 30 s (até 10 vezes).
let rodando = false;
let deNovo = false;
const MAX_TENTATIVAS = 10;

export async function enviarPendentesAoCrm() {
  if (rodando) { deNovo = true; return; }
  rodando = true;
  try {
    do {
      deNovo = false;
      const { webhookUrl, webhookSecret } = await getIntegracao();
      const fila = await db.select().from(eventos)
        .where(and(inArray(eventos.crmStatus, webhookUrl ? ['pendente', 'falhou', 'sem_crm'] : ['pendente']), lt(eventos.crmTentativas, MAX_TENTATIVAS)))
        .orderBy(asc(eventos.id)).limit(200);
      for (const ev of fila) {
        if (!webhookUrl) {
          await db.update(eventos).set({ crmStatus: 'sem_crm' }).where(eq(eventos.id, ev.id));
          continue;
        }
        const [c] = await db.select().from(cadastros).where(eq(cadastros.id, ev.cadastroId)).limit(1);
        if (!c) continue;
        const corpo = JSON.stringify({
          evento: ev.tipo, descricao: ev.descricao, autor: ev.autor, ocorrido_em: ev.createdAt, dados: ev.dados,
          cadastro: resumoParaCrm(c),
        });
        const assinatura = 'sha256=' + crypto.createHmac('sha256', webhookSecret || '').update(corpo).digest('hex');
        try {
          const r = await fetch(webhookUrl, {
            method: 'POST', body: corpo, signal: AbortSignal.timeout(10_000),
            headers: { 'Content-Type': 'application/json', 'X-Cadastros-Evento': String(ev.id), 'X-Cadastros-Assinatura': assinatura },
          });
          if (!r.ok) throw new Error(`CRM respondeu ${r.status}`);
          await db.update(eventos).set({ crmStatus: 'enviado', crmTentativas: ev.crmTentativas + 1, crmErro: null }).where(eq(eventos.id, ev.id));
        } catch (err) {
          await db.update(eventos).set({ crmStatus: 'falhou', crmTentativas: ev.crmTentativas + 1, crmErro: (err as Error).message }).where(eq(eventos.id, ev.id));
          break; // não pula na frente: os seguintes esperam este passar
        }
      }
    } while (deNovo);
  } finally {
    rodando = false;
  }
}

export function iniciarFilaCrm() {
  setInterval(() => void enviarPendentesAoCrm(), 30_000);
  void enviarPendentesAoCrm();
}
