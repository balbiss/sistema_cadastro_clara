import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { api, usuarioAtual } from '../lib/api'
import { dataBR, desde } from '../lib/fmt'
import { btn } from '../components/ui'
import { Carregando, PageHeader, StatusPill, toast, vazio, TipoPend } from '../components/extra'

type P = { id: number; bloqueia?: boolean; alerta?: string | null; descricao: string; prazo: string | null; responsavelId: number | null; createdAt: string; cadastroId: number; codigo: string; nome: string; status: string }

// Item 3/7/10 do briefing: nenhuma atividade sem responsável, pendências com prazo e vencidas à vista.
export default function Pendencias() {
  const eu = usuarioAtual()
  const [minhas, setMinhas] = useState(false)
  const [lista, setLista] = useState<P[] | null>(null)
  const [equipe, setEquipe] = useState<{ id: number; name: string }[]>([])
  const carregar = () => api('GET', '/pendencias' + (minhas ? '?minhas=1' : '')).then(setLista)
  useEffect(() => { carregar() }, [minhas])
  useEffect(() => { api('GET', '/usuarios').then(setEquipe) }, [])
  const resolver = async (id: number) => { await api('POST', `/pendencias/${id}/resolver`); toast('Pendência resolvida'); carregar() }
  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <PageHeader title="Pendências" subtitle="O que está travando algum cadastro"
        right={<>
          <button style={btn(minhas ? 'ghost' : 'soft')} onClick={() => setMinhas(false)}>Todas</button>
          <button style={btn(minhas ? 'soft' : 'ghost')} onClick={() => setMinhas(true)}>Minhas ({eu?.name.split(' ')[0]})</button>
        </>} />
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 3 }}>
        {!lista ? <Carregando /> : !lista.length ? <div style={vazio}>Nenhuma pendência aberta. 🎉</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabela">
              <thead><tr><th>Pendência</th><th>Cadastro</th><th>Etapa</th><th>Responsável</th><th>Prazo</th><th>Aberta</th><th /></tr></thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id} className="linha">
                    <td style={{ maxWidth: 380 }}><TipoPend p={p} />{p.descricao}</td>
                    <td><Link to={'/cadastros/' + p.cadastroId}><b>{p.nome}</b></Link><div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.codigo}</div></td>
                    <td><StatusPill status={p.status} /></td>
                    <td>{equipe.find(u => u.id === p.responsavelId)?.name || <span style={{ color: '#b42318' }}>Sem responsável</span>}</td>
                    <td style={{ color: p.prazo && p.prazo < hoje ? '#d93025' : undefined, fontWeight: p.prazo && p.prazo < hoje ? 700 : 400 }}>{p.prazo ? dataBR(p.prazo) : '—'}</td>
                    <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{desde(p.createdAt)}</td>
                    <td><button style={btn('ghost', { minHeight: 30, padding: '0 10px' })} onClick={() => resolver(p.id)}><Check size={14} /> Resolver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
