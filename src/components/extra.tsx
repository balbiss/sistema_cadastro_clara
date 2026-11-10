import type { CSSProperties, ReactNode } from 'react'
import Swal from 'sweetalert2'
import { STATUS, situacaoNome } from '../lib/status'
import { prazoTexto } from '../lib/fmt'

export const toast = (title: string, icon: 'success' | 'error' | 'info' = 'success') =>
  void Swal.fire({ toast: true, position: 'top-end', icon, title, showConfirmButton: false, timer: 3200, timerProgressBar: true })

export function StatusPill({ status, grande, inicEtapa }: { status: string; grande?: boolean; inicEtapa?: string | null }) {
  const base = STATUS[status] || { nome: status, cor: '#d5d8db' }
  const nome = situacaoNome({ status, inicEtapa })
  const s = nome === base.nome ? base : { nome, cor: '#ffb98a' }
  return (
    <span style={{ display: 'inline-block', padding: grande ? '4px 10px' : '2px 8px', borderRadius: 2, background: s.cor, color: '#313942', fontSize: grande ? 13 : 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.02em', whiteSpace: 'nowrap' }}>
      {s.nome}
    </span>
  )
}

export function Prazo({ prazo }: { prazo?: string | null }) {
  const p = prazoTexto(prazo)
  if (!p) return <span style={{ color: 'var(--muted)' }}>—</span>
  return <span style={{ color: p.vencido ? '#d93025' : 'var(--muted)', fontWeight: p.vencido ? 700 : 400, whiteSpace: 'nowrap' }}>{p.texto}</span>
}

/** Cabeçalho de página no padrão do v2 (título PT Sans bold + ações à direita). */
export function PageHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontWeight: 700, fontSize: 26, margin: 0, color: '#5a2433' }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 14 }}>{subtitle}</p>}
      </div>
      {right && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{right}</div>}
    </div>
  )
}

export const vazio: CSSProperties = { padding: '36px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }

export function Carregando() {
  return <div style={vazio}><span style={{ display: 'inline-block', width: 22, height: 22, border: '3px solid var(--line)', borderTopColor: 'var(--terra)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /></div>
}

/** Logo da Clara (PNG branco usado como máscara) pintada na cor pedida — igual ao v2. */
export function ClaraLogo({ width, color, center }: { width: number | string; color: string; center?: boolean }) {
  const pos = center ? 'center' : 'left center'
  return <span role="img" aria-label="Clara Ferreira" style={{ display: 'block', width, aspectRatio: '1212 / 444', background: color, WebkitMaskImage: 'url(/logos/clara-ferreira-logo-white.png)', maskImage: 'url(/logos/clara-ferreira-logo-white.png)', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: pos, maskPosition: pos }} />
}

/** Pendência de alerta (só cobra) × pendência que trava a liberação. */
export function TipoPend({ p }: { p: { bloqueia?: boolean | null } }) {
  const [txt, cor, fundo] = p.bloqueia === false ? ['alerta', '#8a5a00', '#fff1d6'] : ['trava a liberação', '#b3261e', '#fdecea']
  return <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: cor, background: fundo, padding: '1px 6px', borderRadius: 2, marginRight: 6, whiteSpace: 'nowrap' }}>{txt}</span>
}
