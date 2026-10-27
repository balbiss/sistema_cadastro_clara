// Mesmos códigos do servidor; cores pastel das etapas do Kommo (as mesmas do funil do CRM).
export const STATUS: Record<string, { nome: string; cor: string }> = {
  formulario_enviado: { nome: 'Formulário enviado', cor: '#fffeb2' },
  formulario_preenchido: { nome: 'Formulário preenchido', cor: '#ffcc66' },
  pendente_avalista: { nome: 'Pendente de avalista', cor: '#ffc8c8' },
  analise_humana: { nome: 'Análise humana', cor: '#e6e8ff' },
  aprovado: { nome: 'Aprovado', cor: '#ccff66' },
  aprovado_avalista: { nome: 'Aprovado com avalista', cor: '#87f2c0' },
  documentos_ok: { nome: 'Documentação conferida', cor: '#99ccff' },
  aguardando_assinatura: { nome: 'Aguardando assinatura', cor: '#e7d6ff' },
  inicializacao: { nome: 'Liberada — em inicialização', cor: '#ffd6a5' },
  iniciada: { nome: 'Revendedora iniciada', cor: '#a8e6a3' },
  reprovado: { nome: 'Reprovado', cor: '#ff8f92' },
  desistencia: { nome: 'Desistência', cor: '#d5d8db' },
}
export const ORDEM = Object.keys(STATUS)
export const ACAO_NOME: Record<string, string> = { pendente_avalista: 'Pedir avalista', analise_humana: 'Mandar pra análise humana', reprovar: 'Reprovar' }
export const CARGO: Record<string, string> = { diretoria: 'Diretoria', analise: 'Análise cadastral', administrativo: 'Administrativo / documental' }
export const FINAIS = ['iniciada', 'reprovado', 'desistencia']
// Sub-etapas da inicialização (item 6 do briefing)
export const ETAPA_INIC: Record<string, string> = {
  aguardando_agendamento: 'Aguardando agendamento', agendado: 'Agendado — preparar carga', carga_pronta: 'Carga conferida — aguardando retirada',
  montagem: 'Montagem da carga', aguardando_pagamento: 'Aguardando pagamento do frete', expedicao: 'Pago — expedir', em_transporte: 'Enviado — em transporte',
}
export const nomePrazo = (k: string) => STATUS[k]?.nome || (k.startsWith('inic_') ? 'Inicialização: ' + (ETAPA_INIC[k.slice(5)] || k) : k)
