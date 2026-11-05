import { and, eq, gt, inArray, isNotNull, isNull, like, notInArray, not } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, documentos, pendencias } from '../db/schema.js';
import { registrarEvento } from './eventos.js';
import { situacaoDocs } from './documentos.js';
import { formalizacaoAtual } from './formalizacao.js';
import { nomeEtapaInic } from './inicializacao.js';
import { FINAIS } from './status.js';
import { getOperacao, getSetores } from './settings.js';

// Item 9 do briefing ("lembretes de formulário não concluído", "aviso à equipe quando liberado",
// "alertas sobre inicializações paradas"). Rodam a cada 15 min: abrem uma pendência de ALERTA
// (não trava a liberação) pro responsável do setor e fecham sozinhas quando a situação se resolve.
type Cadastro = typeof cadastros.$inferSelect;
type Alerta = { chave: string; texto: string; setor: string };
const SISTEMA = 'sistema (alerta automático)';

async function alertasDe(c: Cadastro, agora: Date): Promise<Alerta[]> {
  const vencido = !!c.prazoEtapa && c.prazoEtapa < agora;
  const out: Alerta[] = [];
  if (vencido && ['quiz_aprovado', 'formulario_enviado'].includes(c.status))
    out.push({ chave: 'formulario_parado', setor: 'prospeccao', texto: c.status === 'quiz_aprovado'
      ? 'Passou no quiz e ainda não recebeu o formulário — chamar a cliente' : 'Cliente não concluiu o formulário — cobrar' });
  if (vencido && c.status === 'pendente_avalista')
    out.push({ chave: 'avalista_parado', setor: 'analise', texto: 'Avalista ainda não informado — cobrar a cliente' });
  if (vencido && c.status === 'analise_humana')
    out.push({ chave: 'analise_parada', setor: 'analise', texto: 'Análise humana passou do prazo — decidir o cadastro' });
  if (vencido && ['aprovado', 'aprovado_avalista'].includes(c.status)) {
    const sd = situacaoDocs(c, await db.select().from(documentos).where(eq(documentos.cadastroId, c.id)));
    if (sd.faltam.length) out.push({ chave: 'documentos_faltando', setor: 'administrativo', texto: 'Documentos faltando: ' + sd.faltam.join(', ') + ' — cobrar a cliente' });
    else if (sd.situacao === 'em_conferencia') out.push({ chave: 'documentos_conferir', setor: 'administrativo', texto: 'Documentos enviados esperando conferência' });
  }
  if (vencido && c.status === 'aguardando_assinatura') {
    const f = await formalizacaoAtual(c.id);
    const faltam = f?.assinaturas.filter(s => !s.assinadoEm).map(s => (s.papel === 'titular' ? 'cliente' : 'avalista')) || [];
    if (faltam.length) out.push({ chave: 'assinatura_atrasada', setor: 'administrativo', texto: 'Assinatura atrasada — falta ' + faltam.join(' e ') });
  }
  if (c.status === 'inicializacao') {
    if (['aguardando_agendamento', 'montagem'].includes(c.inicEtapa || ''))
      out.push({ chave: 'liberado', setor: 'logistica', texto: c.inicEtapa === 'montagem' ? 'Cadastro liberado — montar a 1ª carga (online)' : 'Cadastro liberado — agendar o início com a cliente' });
    else if (vencido) out.push({ chave: 'inicializacao_parada', setor: 'logistica', texto: `Inicialização parada em "${nomeEtapaInic(c.inicEtapa)}"` });
  }
  return out;
}

export async function rodarAlertas() {
  const op = await getOperacao();
  if (!op.alertas) return { abertos: 0, fechados: 0 };
  const agora = new Date();
  const setores = await getSetores();
  const ativos = await db.select().from(cadastros).where(and(notInArray(cadastros.status, FINAIS), isNull(cadastros.descartadoEm)));
  // cadastros de antes da divisão por setor: preenche o setor dono da etapa atual
  for (const c of ativos.filter(x => !x.setor)) {
    const setor = setores.etapas[c.status] || null;
    if (!setor) continue;
    await db.update(cadastros).set({ setor, responsavelId: c.responsavelId || setores.responsaveis[setor] || null }).where(eq(cadastros.id, c.id));
    c.setor = setor;
  }
  const abertas = await db.select().from(pendencias).where(and(isNull(pendencias.resolvidaEm), isNotNull(pendencias.alerta), like(pendencias.alerta, 'a:%')));
  const porCadastro = new Map<number, typeof abertas>();
  for (const p of abertas) porCadastro.set(p.cadastroId, [...(porCadastro.get(p.cadastroId) || []), p]);
  // alguém da equipe resolveu o alerta na mão: não reabre o mesmo alerta nas próximas 24h
  const manuais = await db.select({ cadastroId: pendencias.cadastroId, alerta: pendencias.alerta }).from(pendencias)
    .where(and(isNotNull(pendencias.resolvidaEm), like(pendencias.alerta, 'a:%'), gt(pendencias.resolvidaEm, new Date(+agora - 24 * 3600_000)), not(like(pendencias.resolvidaPor, 'sistema%'))));
  const silenciados = new Set(manuais.map(m => m.cadastroId + '|' + m.alerta));
  let abertos = 0, fechados = 0;
  const hoje = agora.toISOString().slice(0, 10);

  for (const c of ativos) {
    const devidos = await alertasDe(c, agora);
    const existentes = porCadastro.get(c.id) || [];
    for (const a of devidos) {
      const chave = 'a:' + a.chave;
      if (existentes.some(p => p.alerta === chave) || silenciados.has(c.id + '|' + chave)) continue;
      const resp = c.responsavelId || setores.responsaveis[a.setor] || null;
      const [p] = await db.insert(pendencias).values({ cadastroId: c.id, descricao: a.texto, criadaPor: SISTEMA, responsavelId: resp, prazo: hoje, alerta: chave, bloqueia: false }).returning();
      await registrarEvento(c.id, 'alerta', 'Alerta: ' + a.texto, SISTEMA, { pendencia_id: p.id, alerta: a.chave });
      abertos++;
    }
    for (const p of existentes) {
      if (devidos.some(a => 'a:' + a.chave === p.alerta)) continue;
      await db.update(pendencias).set({ resolvidaEm: agora, resolvidaPor: 'sistema (resolvido sozinho)' }).where(eq(pendencias.id, p.id));
      fechados++;
    }
  }
  // cadastro encerrado (reprovado/desistência/iniciada) não precisa mais de alerta
  const encerrados = abertas.filter(p => !ativos.some(c => c.id === p.cadastroId)).map(p => p.id);
  if (encerrados.length) {
    await db.update(pendencias).set({ resolvidaEm: agora, resolvidaPor: 'sistema (cadastro encerrado)' }).where(inArray(pendencias.id, encerrados));
    fechados += encerrados.length;
  }
  return { abertos, fechados };
}

export function iniciarAlertas() {
  const rodar = () => rodarAlertas().catch(err => console.error('Alertas falharam:', err));
  setTimeout(rodar, 60_000);
  setInterval(rodar, 15 * 60_000);
}
