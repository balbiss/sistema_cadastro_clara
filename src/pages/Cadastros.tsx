import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Copy, Plus, Search } from 'lucide-react'
import { api } from '../lib/api'
import { FINAIS, ORDEM, STATUS } from '../lib/status'
import { cpfFmt, desde, telFmt } from '../lib/fmt'
import { Modal, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, PageHeader, Prazo, StatusPill, toast, vazio } from '../components/extra'

type Linha = { id: number; codigo: string; nome: string; cpf: string | null; telefone: string | null; consultora: string | null; origem: string | null; status: string; motivo: string | null; etapaEntradaEm: string; prazoEtapa: string | null; responsavel: string | null; pendencias: number; crmLeadId: string | null }

export default function Cadastros() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const vencidos = params.get('vencidos') === '1'
  const [q, setQ] = useState('')
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [contagem, setContagem] = useState<Record<string, number>>({})
  const [novo, setNovo] = useState(false)

  const carregar = () => {
    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    if (vencidos) qs.set('vencidos', '1')
    if (q.trim()) qs.set('q', q.trim())
    api('GET', '/cadastros?' + qs).then(setLinhas)
    api('GET', '/cadastros/resumo').then(r => setContagem(r.porStatus))
  }
  useEffect(() => { const t = setTimeout(carregar, q ? 250 : 0); return () => clearTimeout(t) }, [status, vencidos, q])
  const filtro = (s: string, v = false) => setParams(s ? { status: s } : v ? { vencidos: '1' } : {})
  const total = Object.values(contagem).reduce((a, b) => a + b, 0)

  return (
    <div>
      <PageHeader title="Cadastros" subtitle="Novas revendedoras — formulário, análise de crédito e documentos"
        right={<button style={btn('primary')} onClick={() => setNovo(true)}><Plus size={16} /> Novo cadastro</button>} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <Chip on={!status && !vencidos} onClick={() => filtro('')} cor="#fff">Todos <b>{total}</b></Chip>
        {ORDEM.map(s => <Chip key={s} on={status === s} onClick={() => filtro(s)} cor={STATUS[s].cor}>{STATUS[s].nome} <b>{contagem[s] || 0}</b></Chip>)}
        <Chip on={vencidos} onClick={() => filtro('', true)} cor="#fde2e1">Prazo vencido</Chip>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 3 }}>
        <div style={{ padding: 10, borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={16} color="var(--muted)" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome, CPF, telefone ou código" style={{ ...inputStyle, border: 'none', padding: '6px 2px' }} />
        </div>
        {!linhas ? <Carregando /> : !linhas.length ? <div style={vazio}>Nenhum cadastro aqui.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabela">
              <thead><tr><th>Código</th><th>Nome</th><th>CPF</th><th>Consultora</th><th>Origem</th><th>Etapa</th><th>Na etapa</th><th>Prazo</th><th>Responsável</th><th>Pend.</th></tr></thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id} className="linha" onClick={() => nav('/cadastros/' + l.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{l.codigo}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#fbe9ee', color: '#8e2a46', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{l.nome.split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                        <div><b>{l.nome}</b><div style={{ fontSize: 12, color: 'var(--muted)' }}>{telFmt(l.telefone)}</div></div>
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{l.cpf ? cpfFmt(l.cpf) : '—'}</td>
                    <td>{l.consultora || '—'}</td>
                    <td>{l.origem || '—'}</td>
                    <td><StatusPill status={l.status} />{l.motivo && <div title={l.motivo} style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 3 }}>{l.motivo}</div>}</td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{desde(l.etapaEntradaEm)}</td>
                    <td><Prazo prazo={FINAIS.includes(l.status) ? null : l.prazoEtapa} /></td>
                    <td>{l.responsavel || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td>{l.pendencias > 0 ? <span style={{ background: '#fde2e1', color: '#b42318', fontWeight: 700, padding: '1px 7px', borderRadius: 9, fontSize: 12 }}>{l.pendencias}</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {novo && <NovoCadastro onClose={() => setNovo(false)} onCriado={carregar} />}
    </div>
  )
}

function Chip({ on, onClick, cor, children }: { on: boolean; onClick: () => void; cor: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '5px 10px', borderRadius: 3, fontSize: 12.5, border: on ? '1px solid #8e2a46' : '1px solid var(--line)', background: on ? cor : '#fff', boxShadow: on ? 'inset 0 0 0 1px #8e2a46' : 'none' }}>
      {!on && <span style={{ width: 9, height: 9, borderRadius: 2, background: cor, border: '1px solid rgba(0,0,0,.12)' }} />}
      {children}
    </button>
  )
}

/** Cadastro aberto aqui mesmo (quando o lead não veio do CRM). Gera o link pra mandar à cliente. */
export function NovoCadastro({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [f, setF] = useState({ nome: '', telefone: '', consultoraNome: '', origem: 'Prospecção ativa', campanha: '' })
  const [link, setLink] = useState('')
  const [salvando, setSalvando] = useState(false)
  const criar = async () => {
    setSalvando(true)
    try {
      const r = await api('POST', '/cadastros', f)
      setLink(r.linkFormulario); onCriado()
    } catch (e) { toast((e as Error).message, 'error') } finally { setSalvando(false) }
  }
  const campo = (k: keyof typeof f, label: string, ph = '') => (
    <div style={{ marginBottom: 12 }}><label style={labelStyle}>{label}</label><input value={f[k]} placeholder={ph} onChange={e => setF({ ...f, [k]: e.target.value })} style={inputStyle} /></div>
  )
  return (
    <Modal title={link ? 'Cadastro aberto' : 'Novo cadastro'} subtitle={link ? 'Mande este link pra cliente preencher o formulário.' : 'Normalmente o cadastro chega sozinho pelo CRM. Use aqui quando precisar abrir na mão.'} onClose={onClose}
      footer={link ? <button style={btn('primary')} onClick={onClose}>Pronto</button> : <><button style={btn('ghost')} onClick={onClose}>Cancelar</button><button style={btn('primary')} disabled={salvando || f.nome.trim().length < 2} onClick={criar}>Gerar link</button></>}>
      {link ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input readOnly value={link} style={inputStyle} onFocus={e => e.target.select()} />
          <button style={btn('soft')} onClick={() => { navigator.clipboard.writeText(link); toast('Link copiado') }}><Copy size={15} /></button>
        </div>
      ) : <>
        {campo('nome', 'Nome da interessada *')}
        {campo('telefone', 'WhatsApp', '(91) 99999-9999')}
        {campo('consultoraNome', 'Consultora responsável')}
        <div style={{ marginBottom: 12 }}><label style={labelStyle}>Origem</label>
          <select value={f.origem} onChange={e => setF({ ...f, origem: e.target.value })} style={inputStyle}>
            {['Tráfego pago', 'Prospecção ativa', 'Indicação', 'Outros'].map(o => <option key={o}>{o}</option>)}
          </select></div>
        {campo('campanha', 'Campanha')}
      </>}
    </Modal>
  )
}
