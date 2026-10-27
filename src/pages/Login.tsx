import { useState, type CSSProperties, type FormEvent } from 'react'
import { api } from '../lib/api'
import { ClaraLogo } from '../components/extra'

// Mesmo login do CRM Clara v2 (painel rosa à direita, logo vinho no branco).
const PANEL = '#f0d0d7'
const VINHO = '#5a2433'
const VINHO_BTN = '#8e2a46'
const VINHO_MUTED = '#85525f'
const field: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 10px', background: '#fff', borderRadius: 3, marginBottom: 16 }
const inputCss: CSSProperties = { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none', fontSize: 15, color: '#2c3e50' }

const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7884" strokeWidth="1.7"><circle cx="12" cy="9" r="4" /><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" /><circle cx="12" cy="12" r="10.5" /></svg>
)
const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7884" strokeWidth="1.7"><rect x="5" y="10.5" width="14" height="10.5" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.4" /></svg>
)

export default function Login() {
  const [email, setEmail] = useState(localStorage.getItem('cad_email') || '')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true); setErro('')
    try {
      const r = await api('POST', '/auth/login', { email, password: senha })
      localStorage.setItem('cad_token', r.token)
      localStorage.setItem('cad_user', JSON.stringify(r.user))
      localStorage.setItem('cad_email', email)
      window.location.href = '/'
    } catch {
      setErro('E-mail ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row-reverse' }}>
      <aside className="k-login-panel" style={{ width: 374, flex: 'none', background: PANEL, color: VINHO, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 39px', position: 'relative' }}>
        <div style={{ marginBottom: 40 }}><ClaraLogo width={190} color={VINHO} center /></div>
        <form onSubmit={entrar} style={{ width: '100%' }}>
          <label style={field}><UserIcon /><input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="E-mail" autoComplete="username" style={inputCss} /></label>
          <label style={field}><LockIcon /><input value={senha} onChange={e => setSenha(e.target.value)} type="password" required placeholder="Senha" autoComplete="current-password" style={inputCss} /></label>
          {erro && <p role="alert" style={{ color: '#b3261e', fontWeight: 700, fontSize: 14, margin: '-4px 0 12px' }}>{erro}</p>}
          <button type="submit" disabled={loading} style={{ width: '100%', height: 36, background: VINHO_BTN, color: '#fff', border: 'none', borderRadius: 3, fontSize: 15.5 }}>
            {loading ? 'Entrando…' : 'Login'}
          </button>
        </form>
        <span style={{ position: 'absolute', bottom: 28, fontSize: 13, letterSpacing: '.18em', textTransform: 'uppercase', color: VINHO_MUTED }}>Clara Ferreira · Cadastros</span>
      </aside>
      <main className="k-login-brand" style={{ flex: 1, minWidth: 0, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
        <ClaraLogo width="min(520px, 80%)" color={VINHO} center />
        <p style={{ margin: '28px 0 0', fontSize: 18, letterSpacing: '.04em', color: VINHO_MUTED }}>Novas revendedoras: do formulário à primeira carga.</p>
      </main>
    </div>
  )
}
