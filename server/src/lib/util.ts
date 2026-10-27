export const soDigitos = (s?: string | null) => (s || '').replace(/\D/g, '');

export function cpfValido(cpf?: string | null): boolean {
  const c = soDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(c[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

export function idade(dataNascimento?: string | null, hoje = new Date()): number | null {
  if (!dataNascimento) return null;
  const [a, m, d] = dataNascimento.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  let anos = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) anos--;
  return anos;
}

// compara nomes ignorando acento, caixa e espaços duplos
export const normalizaNome = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const cpfFmt = (s?: string | null) => soDigitos(s).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
export const dataBR = (d = new Date()) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Belem' });

// valor por extenso (reais inteiros) — a promissória exige
const UN = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ate999(n: number): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100;
  const resto = r < 20 ? UN[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + UN[r % 10] : '');
  return [CEM[c], resto].filter(Boolean).join(' e ');
}
export function valorExtenso(v: number): string {
  const n = Math.floor(Math.abs(v));
  if (n === 0) return 'zero reais';
  const mi = Math.floor(n / 1_000_000), mil = Math.floor((n % 1_000_000) / 1000), un = n % 1000;
  const partes = [
    mi ? ate999(mi) + (mi === 1 ? ' milhão' : ' milhões') : '',
    mil ? (mil === 1 ? 'mil' : ate999(mil) + ' mil') : '',
    un ? ate999(un) : '',
  ].filter(Boolean);
  const texto = partes.length > 1 && (un < 100 || un % 100 === 0) && un ? partes.slice(0, -1).join(' ') + ' e ' + partes.at(-1) : partes.join(' ');
  return texto + (n === 1 ? ' real' : (un === 0 && (mi || mil) && !mil && mi ? ' de reais' : ' reais'));
}
