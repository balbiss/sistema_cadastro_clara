import type { CSSProperties, ReactNode } from 'react'
import { X } from 'lucide-react'

// Peças visuais no padrão do Kommo (cores via variáveis do index.css), usadas por todas as telas.

export const serif: CSSProperties = { fontFamily: "'PT Sans', Arial, sans-serif", fontWeight: 700 }

export const inputStyle: CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #C3C7CC', borderRadius: 3, background: '#fff', fontSize: 14, boxSizing: 'border-box' }
export const labelStyle: CSSProperties = { display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }

type Variant = 'primary' | 'ghost' | 'danger' | 'soft'
export function btn(variant: Variant = 'primary', extra: CSSProperties = {}): CSSProperties {
  const base: CSSProperties = { minHeight: 36, padding: '0 16px', borderRadius: 3, fontSize: 13, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
  const v: Record<Variant, CSSProperties> = {
    primary: { border: 'none', background: 'var(--terra)', color: '#fff' },
    ghost: { border: '1px solid #C3C7CC', background: '#fff', color: 'var(--ink)' },
    danger: { border: 'none', background: '#F86161', color: '#fff' },
    soft: { border: 'none', background: 'var(--terraSoft)', color: 'var(--terra)' },
  }
  return { ...base, ...v[variant], ...extra }
}

export function Modal({ title, subtitle, onClose, children, footer, width = 460 }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  return (
    <div className="modal-overlay" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,26,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 80 }}>
      <div className="modal-card" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(10,15,26,.25)', animation: 'fadeUp .14s ease' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '22px 24px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ ...serif, fontSize: 20, margin: 0 }}>{title}</h2>
            {subtitle && <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.55, margin: '6px 0 0' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} title="Fechar" style={{ width: 30, height: 30, border: '1px solid var(--line)', borderRadius: 8, background: 'none', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><X size={15} /></button>
        </div>
        <div style={{ padding: '0 24px 18px', overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px 20px', borderTop: '1px solid var(--line)' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function Card({ title, right, children, style, onHeaderClick }: { title?: ReactNode; right?: ReactNode; children?: ReactNode; style?: CSSProperties; onHeaderClick?: () => void }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 3, ...style }}>
      {title && (
        <div onClick={onHeaderClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', cursor: onHeaderClick ? 'pointer' : undefined }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{title}</span>
          {right}
        </div>
      )}
      {children !== undefined && children !== null && children !== false && <div style={{ padding: title ? '0 14px 14px' : 14 }}>{children}</div>}
    </div>
  )
}

export function Field({ label, value, empty, onClick }: { label: ReactNode; value: ReactNode; empty?: boolean; onClick?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 12.5 }}>
      <span style={{ color: 'var(--muted)', flex: 'none', maxWidth: '45%' }}>{label}</span>
      <span onClick={onClick} title={onClick ? 'Clique pra preencher' : undefined}
        style={{ textAlign: 'right', fontWeight: 600, color: empty ? 'var(--muted)' : 'var(--ink)', fontStyle: empty ? 'italic' : undefined, cursor: onClick ? 'pointer' : undefined, minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  )
}

export const PILL: CSSProperties = { fontSize: 11, fontWeight: 400, letterSpacing: '.02em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 2, whiteSpace: 'nowrap' }

export function Tag({ name, color, onRemove }: { name: string; color: string; onRemove?: () => void }) {
  return (
    <span title={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 160, padding: '1px 6px', borderRadius: 2, background: '#fff', border: '1px solid ' + color, color, fontSize: 11, fontWeight: 400, textTransform: 'uppercase', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {name}
      {onRemove && <button onClick={onRemove} title="Remover" style={{ border: 'none', background: 'none', color, padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>}
    </span>
  )
}

export function Dropdown({ open, children, style }: { open: boolean; children: ReactNode; style?: CSSProperties }) {
  if (!open) return null
  return (
    <div onClick={e => e.stopPropagation()}
      style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 6, boxShadow: '0 12px 28px rgba(8,17,31,.14)', animation: 'fadeUp .12s ease', minWidth: 190, ...style }}>
      {children}
    </div>
  )
}

export function MenuItem({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', border: 'none', background: 'none', borderRadius: 6, fontSize: 13, color: danger ? '#B42318' : 'var(--ink)' }}>{children}</button>
  )
}
