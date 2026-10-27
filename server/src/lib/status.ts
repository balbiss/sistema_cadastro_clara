// Situações do cadastro. O CRM recebe o `status` em todo aviso e usa pra mover o card no funil.
export const STATUS = {
  formulario_enviado: 'Formulário enviado',
  formulario_preenchido: 'Formulário preenchido',
  pendente_avalista: 'Pendente de avalista',
  analise_humana: 'Análise humana',
  aprovado: 'Aprovado',
  aprovado_avalista: 'Aprovado com avalista',
  documentos_ok: 'Documentação conferida',
  aguardando_assinatura: 'Aguardando assinatura',
  inicializacao: 'Liberada — em inicialização',
  iniciada: 'Revendedora iniciada',
  reprovado: 'Reprovado',
  desistencia: 'Desistência',
} as const;
export type Status = keyof typeof STATUS;
export const statusNome = (s: string) => STATUS[s as Status] ?? s;
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
  avalista_rg_frente: 'Avalista — RG ou CNH (frente)',
  avalista_rg_verso: 'Avalista — RG ou CNH (verso)',
  avalista_comprovante_residencia: 'Avalista — comprovante de residência',
};
