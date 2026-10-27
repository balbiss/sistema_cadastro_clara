// Datas sempre no formato brasileiro (nunca a data crua do banco).
export const dataBR = (s?: string | null) => (s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('pt-BR') : '—')
export const dataHoraBR = (s?: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
export const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const cpfFmt = (s?: string | null) => { const d = (s || '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : s || '—' }
export const telFmt = (s?: string | null) => { const d = (s || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length === 11 ? d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : d.length === 10 ? d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3') : s || '—' }

/** "vence em 2 d" / "venceu há 3 h" */
export function prazoTexto(prazo?: string | null): { texto: string; vencido: boolean } | null {
  if (!prazo) return null
  const diff = new Date(prazo).getTime() - Date.now()
  const h = Math.round(Math.abs(diff) / 3600_000)
  const q = h >= 48 ? Math.round(h / 24) + ' d' : Math.max(h, 1) + ' h'
  return diff < 0 ? { texto: 'venceu há ' + q, vencido: true } : { texto: 'vence em ' + q, vencido: false }
}
export function desde(s?: string | null) {
  if (!s) return '—'
  const h = (Date.now() - new Date(s).getTime()) / 3600_000
  return h < 1 ? 'agora há pouco' : h < 48 ? `há ${Math.round(h)} h` : `há ${Math.round(h / 24)} d`
}
