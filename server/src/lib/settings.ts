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
};

// Prazo de cada etapa em horas (item 3/10 do briefing). Passou do prazo = pendência vencida.
export type Prazos = Record<string, number>;
export const PRAZOS_PADRAO: Prazos = {
  formulario_enviado: 48,
  pendente_avalista: 72,
  analise_humana: 24,
  aprovado: 72,
  aprovado_avalista: 72,
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
export const getCenarios = () => getSetting<Record<string, CenarioSpc>>('spc_cenarios', CENARIOS_PADRAO);
