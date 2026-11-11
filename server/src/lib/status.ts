// Situações do cadastro. O CRM recebe o `status` em todo aviso e usa pra mover o card no funil.
export const STATUS = {
  quiz_aprovado: 'Qualificação aprovada',
  formulario_enviado: 'Formulário enviado',
  formulario_preenchido: 'Em análise de crédito',
  pendente_avalista: 'Aguardando avalista',
  analise_humana: 'Análise humana',
  aprovado: 'Crédito aprovado',
  aprovado_avalista: 'Crédito aprovado com avalista',
  documentos_ok: 'Documentação conferida',
  aguardando_assinatura: 'Aguardando assinatura',
  inicializacao: 'Cadastro aprovado',
  iniciada: 'Revendedora iniciada',
  reprovado: 'Reprovado',
  desistencia: 'Desistência',
} as const;
export type Status = keyof typeof STATUS;
export const statusNome = (s: string) => STATUS[s as Status] ?? s;
// Relatório de ajustes (06/11) item 1: "Cadastro aprovado" (liberada), "Iniciação agendada" e
// "Revendedora iniciada" são acontecimentos diferentes. O agendamento é uma sub-etapa da
// inicialização presencial; aqui vira uma situação própria pra tela e pro CRM.
export const AGENDADA = ['agendado', 'carga_pronta'];
export function situacao(c: { status: string; inicEtapa?: string | null }) {
  if (c.status === 'inicializacao' && AGENDADA.includes(c.inicEtapa || '')) return { chave: 'iniciacao_agendada', nome: 'Iniciação agendada' };
  return { chave: c.status, nome: statusNome(c.status) };
}
// Etapas em que o cadastro não anda mais (sem prazo, fora do "em andamento").
export const FINAIS: Status[] = ['iniciada', 'reprovado', 'desistencia'];

// Ações que uma regra pode tomar quando dispara (configuráveis na tela Regras).
export const ACOES = ['pendente_avalista', 'analise_humana', 'reprovar'] as const;
export type Acao = typeof ACOES[number];
export const acaoParaStatus = (a: Acao): Status => (a === 'reprovar' ? 'reprovado' : a);
// a mais grave vence quando várias regras disparam
export const gravidade = (a: Acao) => ACOES.indexOf(a);

export const DOCS_TITULAR = ['rg_frente', 'rg_verso', 'comprovante_residencia'] as const;
export const DOCS_AVALISTA = ['avalista_rg_frente', 'avalista_rg_verso', 'avalista_comprovante_residencia'] as const;
export const DOC_NOME: Record<string, string> = {
  rg_frente: 'RG ou CNH — frente',
  rg_verso: 'RG ou CNH — verso',
  comprovante_residencia: 'Comprovante de residência',
  comprovante_renda: 'Comprovante de renda',
  selfie_documento: 'Selfie segurando o documento',
  avalista_rg_frente: 'Avalista — RG ou CNH (frente)',
  avalista_rg_verso: 'Avalista — RG ou CNH (verso)',
  avalista_comprovante_residencia: 'Avalista — comprovante de residência',
  avalista_comprovante_renda: 'Avalista — comprovante de renda',
  avalista_selfie_documento: 'Avalista — selfie segurando o documento',
};
/** Tipos que a diretoria pode marcar como obrigatórios (tela Regras → Documentos). */
export const DOCS_POSSIVEIS = {
  titular: ['rg_frente', 'rg_verso', 'comprovante_residencia', 'comprovante_renda', 'selfie_documento'],
  avalista: ['avalista_rg_frente', 'avalista_rg_verso', 'avalista_comprovante_residencia', 'avalista_comprovante_renda', 'avalista_selfie_documento'],
};
