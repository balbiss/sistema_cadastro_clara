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
