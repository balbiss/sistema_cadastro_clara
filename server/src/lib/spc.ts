import { getCenarios, type CenarioSpc } from './settings.js';
import { soDigitos } from './util.js';

export type Negativacao = { credor: string; valor: number; data: string; natureza: string };
export type Protesto = { cartorio: string; valor: number; data: string };
export type ResultadoSpc = {
  nomeConsultado: string;
  situacao: 'nada_consta' | 'com_restricoes';
  negativacoes: Negativacao[];
  protestos: Protesto[];
  totalNegativado: number;
};

// Provedor de consulta. Por enquanto só existe o "simulado": a Bel ainda não definiu o bureau
// (SPC Brasil, Serasa, Boa Vista...). Quando definir, entra aqui um provedor real com a mesma saída.
export const PROVEDOR = process.env.SPC_PROVEDOR || 'simulado';

export async function consultarCpf(cpf: string, nomeInformado: string): Promise<ResultadoSpc> {
  if (PROVEDOR !== 'simulado') throw new Error(`Provedor de crédito "${PROVEDOR}" ainda não implementado`);
  const cenarios = await getCenarios();
  return simular(cenarios[soDigitos(cpf)] || 'nada_consta', nomeInformado);
}

function simular(cenario: CenarioSpc, nome: string): ResultadoSpc {
  const neg = (credor: string, valor: number, natureza = 'Dívida comercial'): Negativacao => ({ credor, valor, data: '2025-11-03', natureza });
  const r: ResultadoSpc = { nomeConsultado: nome, situacao: 'com_restricoes', negativacoes: [], protestos: [], totalNegativado: 0 };
  switch (cenario) {
    case 'negativacao_pequena': r.negativacoes = [neg('Operadora Telefonia S.A.', 180)]; break;
    case 'negativacao_media': r.negativacoes = [neg('Banco Popular S.A.', 620, 'Cartão de crédito'), neg('Loja de Móveis Ltda', 230)]; break;
    case 'negativacao_grande': r.negativacoes = [neg('Financeira Crédito Fácil', 3800, 'Empréstimo'), neg('Varejo Total S.A.', 520)]; break;
    case 'credor_semijoias': r.negativacoes = [neg('Brilho Semijoias Revenda Ltda', 450, 'Consignado de mercadoria')]; break;
    case 'protesto': r.protestos = [{ cartorio: '2º Tabelionato de Protesto', valor: 900, data: '2025-08-14' }]; break;
    case 'nome_divergente': r.nomeConsultado = 'Nome Completamente Diferente da Silva'; r.situacao = 'nada_consta'; break;
    default: r.situacao = 'nada_consta';
  }
  r.totalNegativado = r.negativacoes.reduce((s, n) => s + n.valor, 0);
  if (!r.negativacoes.length && !r.protestos.length) r.situacao = 'nada_consta';
  return r;
}
