import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { settings } from '../db/schema.js';
import type { Acao } from './status.js';

export type Regras = {
  idadeMinima: number;
  acaoMenorIdade: Acao;
  acaoCpfDuplicado: Acao;
  acaoEnderecoIncompleto: Acao;
  naoConsultarRestricaoSemAvalista: boolean;
  limiteSemAvalista: number;
  limiteComAvalista: number;
  acaoAcimaLimite: Acao;
  palavrasCredorSemijoias: string[];
  acaoCredorSemijoias: Acao;
  acaoProtesto: Acao;
  acaoNomeDivergente: Acao;
  acaoAvalistaComRestricao: Acao;
  /** consulta ao SPC vale por esse tempo pro MESMO CPF (qualquer cadastro, qualquer colaboradora) */
  validadeConsultaMeses: number;
};

// Ponto de partida até a Bel definir as regras de verdade (o briefing diz que ainda estão em definição).
export const REGRAS_PADRAO: Regras = {
  idadeMinima: 18,
  acaoMenorIdade: 'analise_humana',
  acaoCpfDuplicado: 'analise_humana',
  acaoEnderecoIncompleto: 'analise_humana',
  naoConsultarRestricaoSemAvalista: true,
  limiteSemAvalista: 300,
  limiteComAvalista: 2000,
  acaoAcimaLimite: 'reprovar',
  palavrasCredorSemijoias: ['semijoia', 'semi joia', 'semi-joia', 'joias', 'bijuteria', 'folheado', 'acessorios'],
  acaoCredorSemijoias: 'analise_humana',
  acaoProtesto: 'analise_humana',
  acaoNomeDivergente: 'analise_humana',
  acaoAvalistaComRestricao: 'reprovar',
  validadeConsultaMeses: 3,
};

// Prazo de cada etapa em horas (item 3/10 do briefing). Passou do prazo = pendência vencida.
export type Prazos = Record<string, number>;
export const PRAZOS_PADRAO: Prazos = {
  quiz_aprovado: 24, // consultora chama a cliente que passou no quiz
  formulario_enviado: 48,
  pendente_avalista: 72,
  analise_humana: 24,
  aprovado: 72,
  aprovado_avalista: 72,
  aguardando_assinatura: 72,
  // inicialização (item 11) — "agendado" e "carga conferida" vencem na data marcada com a cliente
  inic_aguardando_agendamento: 48,
  inic_montagem: 48,
  inic_aguardando_pagamento: 72,
  inic_expedicao: 24,
  inic_em_transporte: 240,
};

// Modelos do contrato e da promissória (item 9). Provisórios até a Clara mandar os oficiais.
export type Modelos = { valorPadrao: number; contrato: string; promissoria: string };
export const MODELOS_PADRAO: Modelos = {
  valorPadrao: 3000,
  contrato: `CONTRATO DE REVENDA DE MERCADORIAS EM CONSIGNAÇÃO
[MODELO PROVISÓRIO — substituir pelo contrato oficial da Clara Ferreira Acessórios]

CONSIGNANTE: Clara Ferreira Acessórios.
CONSIGNATÁRIA (REVENDEDORA): {{nome}}, CPF {{cpf}}, residente em {{endereco}}.

1. A CONSIGNANTE entrega à REVENDEDORA mercadorias (semijoias e acessórios) em consignação, para revenda, até o limite de {{valor}}.
2. A REVENDEDORA se compromete a prestar contas das peças vendidas e devolver as não vendidas no fechamento combinado.
3. A REVENDEDORA responde pelas peças sob sua guarda, inclusive em caso de perda, extravio ou dano.
4. Como garantia, a REVENDEDORA emite nota promissória no valor de {{valor}}{{texto_avalista}}.
5. A primeira carga será entregue na modalidade {{modalidade}}.

{{cidade}}, {{data}}.

Cadastro {{codigo}}`,
  promissoria: `NOTA PROMISSÓRIA
[MODELO PROVISÓRIO — substituir pelo modelo oficial]

Valor: {{valor}}
Vencimento: à vista (na apresentação)

Pagarei por esta única via de NOTA PROMISSÓRIA a Clara Ferreira Acessórios, ou à sua ordem, a quantia de {{valor_extenso}} ({{valor}}), em moeda corrente.

Emitente: {{nome}} — CPF {{cpf}}
Endereço: {{endereco}}
{{linha_avalista}}
{{cidade}}, {{data}}.`,
};

export type Integracao ={ apiKey?: string; webhookUrl?: string; webhookSecret?: string };

export type CenarioSpc = 'nada_consta' | 'negativacao_pequena' | 'negativacao_media' | 'negativacao_grande' | 'credor_semijoias' | 'protesto' | 'nome_divergente';
// CPFs válidos usados só pelo SPC de teste — cada um devolve um cenário.
export const CENARIOS_PADRAO: Record<string, CenarioSpc> = {
  '52998224725': 'nada_consta',
  '11144477735': 'negativacao_pequena',
  '39053344705': 'negativacao_media',
  '15350946056': 'negativacao_grande',
  '28625587887': 'credor_semijoias',
  '74682489070': 'protesto',
  '06817283009': 'nome_divergente',
};

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!row || row.value == null) return fallback;
  return (typeof fallback === 'object' && !Array.isArray(fallback) ? { ...fallback, ...(row.value as object) } : row.value) as T;
}

export async function setSetting(key: string, value: unknown) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export const getRegras = () => getSetting<Regras>('regras', REGRAS_PADRAO);
export const getPrazos = () => getSetting<Prazos>('prazos', PRAZOS_PADRAO);
export const getIntegracao =() => getSetting<Integracao>('integracao', {});
export const getModelos = () => getSetting<Modelos>('modelos', MODELOS_PADRAO);
export const getCenarios =() => getSetting<Record<string, CenarioSpc>>('spc_cenarios', CENARIOS_PADRAO);

// ---------- Item 7: setor dono de cada etapa + responsável padrão de cada setor ----------
export const SETORES: Record<string, string> = {
  prospeccao: 'Prospecção', analise: 'Análise cadastral', administrativo: 'Administrativo / documental',
  logistica: 'Operação / Logística', comercial: 'Comercial / Consultoras', gestao: 'Gestão',
};
export type Setores = { etapas: Record<string, string>; responsaveis: Record<string, number | null> };
export const SETORES_PADRAO: Setores = {
  etapas: {
    quiz_aprovado: 'prospeccao', formulario_enviado: 'prospeccao',
    formulario_preenchido: 'analise', pendente_avalista: 'analise', analise_humana: 'analise',
    aprovado: 'administrativo', aprovado_avalista: 'administrativo', documentos_ok: 'administrativo', aguardando_assinatura: 'administrativo',
    inicializacao: 'logistica', iniciada: 'comercial', reprovado: 'analise', desistencia: 'prospeccao',
  },
  responsaveis: {},
};
export const getSetores = async (): Promise<Setores> => {
  const s = await getSetting<Partial<Setores>>('setores', {});
  return { etapas: { ...SETORES_PADRAO.etapas, ...(s.etapas || {}) }, responsaveis: { ...(s.responsaveis || {}) } };
};

// ---------- alertas automáticos e IA ----------
export type Operacao = { alertas: boolean; ia: boolean };
export const getOperacao = () => getSetting<Operacao>('operacao', { alertas: true, ia: true });

// ---------- Item 10: retenção e descarte (LGPD). Desligado até a empresa definir a política. ----------
export type Lgpd = { ativo: boolean; diasReprovado: number; diasDesistencia: number; diasQuizNaoAprovado: number };
export const LGPD_PADRAO: Lgpd = { ativo: false, diasReprovado: 180, diasDesistencia: 180, diasQuizNaoAprovado: 90 };
export const getLgpd = () => getSetting<Lgpd>('lgpd', LGPD_PADRAO);
