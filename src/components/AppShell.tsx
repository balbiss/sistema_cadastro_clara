import { useEffect, useState, type CSSProperties } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ClipboardCheck, FileSignature, Home, ListChecks, LogOut, Menu, PackageCheck, PanelLeft, PlugZap, SlidersHorizontal, Users, X, Sparkles, BarChart3, Network } from 'lucide-react'
import { api, usuarioAtual } from '../lib/api'
import { CARGO } from '../lib/status'
import { ClaraLogo } from './extra'

// Casca igual à do CRM Clara v2: menu lateral no rosa da Clara, texto/logo vinho, item ativo em branco.
const SB = { bg: '#f0d0d7', text: '#4a2430', muted: '#85525f', line: 'rgba(90,36,51,.14)', activeBg: '#ffffff', active: '#8e2a46', logo: '#5a2433' }

type Item = { path: string; label: string; icon: typeof Home; badge?: 'pendencias' | 'analise' | 'inicializacao'; soDiretoria?: boolean; cargos?: string[] }
const EQUIPE_CADASTRO = ['diretoria', 'analise', 'administrativo']
const NAV: Item[] = [
  { path: '/', label: 'Painel', icon: Home, cargos: [...EQUIPE_CADASTRO, 'consultora'] },
  { path: '/quiz-perfil', label: 'Quiz de perfil', icon: Sparkles, cargos: EQUIPE_CADASTRO },
  { path: '/cadastros', label: 'Cadastros', icon: ClipboardCheck, badge: 'analise', cargos: [...EQUIPE_CADASTRO, 'consultora'] },
  { path: '/inicializacao', label: 'Inicialização', icon: PackageCheck, badge: 'inicializacao' },
  { path: '/pendencias', label: 'Pendências', icon: ListChecks, badge: 'pendencias' },
  { path: '/relatorios', label: 'Relatórios', icon: BarChart3, cargos: EQUIPE_CADASTRO },
  { path: '/regras', label: 'Regras de análise', icon: SlidersHorizontal, cargos: EQUIPE_CADASTRO },
  { path: '/modelos', label: 'Contrato e promissória', icon: FileSignature, cargos: EQUIPE_CADASTRO },
  { path: '/operacao', label: 'Setores, alertas e LGPD', icon: Network, soDiretoria: true },
  { path: '/integracao', label: 'Integração com o CRM', icon: PlugZap, soDiretoria: true },
  { path: '/usuarios', label: 'Usuários', icon: Users, soDiretoria: true },
]

export function AppShell() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const user = usuarioAtual()
  const [aberto, setAberto] = useState(localStorage.getItem('cad_sidebar') !== 'fechado')
  const [mobile, setMobile] = useState(false)
  const [badges, setBadges] = useState({ pendencias: 0, analise: 0, inicializacao: 0 })

  useEffect(() => {
    const carregar = () => api('GET', '/cadastros/resumo').then(r => setBadges({ pendencias: r.pendenciasAbertas, analise: r.porStatus.analise_humana || 0, inicializacao: r.porStatus.inicializacao || 0 })).catch(() => {})
    carregar()
    const t = setInterval(carregar, 30_000)
    return () => clearInterval(t)
  }, [pathname])
  useEffect(() => setMobile(false), [pathname])

  const itens = NAV.filter(i => (!i.soDiretoria || user?.role === 'diretoria') && (!i.cargos || i.cargos.includes(user?.role || '')))
  const ativo = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p))
  const sair = () => { localStorage.removeItem('cad_token'); localStorage.removeItem('cad_user'); window.location.href = '/login' }
  const alternar = () => setAberto(o => { localStorage.setItem('cad_sidebar', o ? 'fechado' : 'aberto'); return !o })

  const row = (on: boolean, mob: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: mob ? '11px 12px' : '8px 12px', border: 'none', borderRadius: 6,
    background: on ? SB.activeBg : 'transparent', color: on ? SB.active : SB.text, fontSize: 15, fontWeight: on ? 700 : 400, textAlign: 'left',
  })
  const lista = (mob = false) => itens.map(i => {
    const n = i.badge ? badges[i.badge] : 0
    const texto = mob || aberto
    return (
      <button key={i.path} title={i.label} onClick={() => navigate(i.path)} style={row(ativo(i.path), mob)}>
        <i.icon size={19} strokeWidth={1.7} style={{ flex: 'none' }} />
        {texto && <span style={{ flex: 1 }}>{i.label}</span>}
        {texto && n > 0 && <span style={{ minWidth: 20, height: 18, padding: '0 6px', borderRadius: 9, background: '#e53935', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>}
      </button>
    )
  })
  const rodape = (mob = false) => (
    <div style={{ borderTop: `1px solid ${SB.line}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#fff', color: SB.active, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontSize: 13 }}>
        {(user?.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
      </span>
      {(mob || aberto) && <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
        <div style={{ fontSize: 12, color: SB.muted }}>{CARGO[user?.role || ''] || ''}</div>
      </div>}
      {(mob || aberto) && <button onClick={sair} title="Sair" style={{ border: 'none', background: 'none', color: SB.text, display: 'flex', padding: 4 }}><LogOut size={18} /></button>}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <aside className="app-sidebar" style={{ width: aberto ? 240 : 68, background: SB.bg, color: SB.text, display: 'flex', flexDirection: 'column', height: '100vh', position: 'fixed', top: 0, left: 0, zIndex: 50, transition: 'width .18s ease', overflow: 'hidden' }}>
        <div style={{ flex: 'none', height: 64, padding: '0 14px 0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {aberto ? <ClaraLogo width={150} color={SB.logo} /> : <b style={{ color: SB.logo, fontSize: 18, width: '100%', textAlign: 'center' }}>CF</b>}
          {aberto && <button onClick={alternar} title="Recolher menu" style={{ border: 'none', background: 'none', color: SB.text, padding: 4, display: 'flex' }}><PanelLeft size={20} strokeWidth={1.6} /></button>}
        </div>
        {!aberto && <button onClick={alternar} title="Abrir menu" style={{ border: 'none', background: 'none', color: SB.text, padding: '0 0 8px', display: 'flex', justifyContent: 'center' }}><PanelLeft size={20} strokeWidth={1.6} /></button>}
        <div style={{ borderTop: `1px solid ${SB.line}`, margin: '0 12px' }} />
        {aberto && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: SB.muted, margin: '14px 22px 4px' }}>Novos cadastros</div>}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 10px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>{lista()}</nav>
        {rodape()}
      </aside>

      <div className="content-col" style={{ marginLeft: aberto ? 240 : 68, minWidth: 0, display: 'flex', flexDirection: 'column', transition: 'margin-left .18s ease' }}>
        <div className="topbar-mobile" style={{ alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 30 }}>
          <button onClick={() => setMobile(true)} aria-label="Abrir menu" style={{ width: 38, height: 38, border: '1px solid var(--line)', borderRadius: 6, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Menu size={19} /></button>
          <ClaraLogo width={110} color={SB.logo} />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Cadastros</span>
        </div>
        <main className="app-main" style={{ flex: 1, padding: 24, minWidth: 0 }}>
          <Outlet />
        </main>
      </div>

      {mobile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
          <div onClick={() => setMobile(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(10,15,26,.45)' }} />
          <aside style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 'min(86vw, 300px)', background: SB.bg, color: SB.text, display: 'flex', flexDirection: 'column', animation: 'slideInLeft .18s ease' }}>
            <div style={{ height: 60, padding: '0 14px 0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <ClaraLogo width={140} color={SB.logo} />
              <button onClick={() => setMobile(false)} style={{ border: 'none', background: 'none', color: SB.text, display: 'flex' }}><X size={20} /></button>
            </div>
            <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 12px' }}>{lista(true)}</nav>
            {rodape(true)}
          </aside>
        </div>
      )}
    </div>
  )
}
