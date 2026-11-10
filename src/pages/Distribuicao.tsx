import { useEffect, useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { Card, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, PageHeader, toast, vazio } from '../components/extra'
import { CARGO } from '../lib/status'

// Relatório de ajustes (06/11) itens 3 e 5.2:
//  - link pessoal de cada colaboradora (prospecção ativa → o cadastro é dela, fora do rodízio)
//  - rodízio do tráfego (geral e, se quiser, por campanha)
//  - resultado por campanha: cliques no link → responderam → aprovadas → cadastros → iniciadas
type Pessoa = { id: number; name: string; email: string; role: string; codigo: string }
type Quiz = { id: number; nome: string; slug: string; padrao: boolean; ativo: boolean; link: string }
type Rodizio = { ativo: boolean; participantes: number[]; campanhas: { campanha: string; participantes: number[] }[]; vez: Record<string, number> }
type Linha = { cliques: number; respostas: number; aprovadas: number; cadastros: number; iniciadas: number }

const copiar = (t: string) => { navigator.clipboard.writeText(t); toast('Link copiado') }
const linkCom = (q: Quiz, codigo: string) => q.link + '?c=' + encodeURIComponent(codigo)

export default function Distribuicao() {
  const [d, setD] = useState<{ quizzes: Quiz[]; links: Pessoa[]; rodizio: Rodizio | null; podeConfigurar: boolean } | null>(null)
  const [rod, setRod] = useState<Rodizio | null>(null)
  const carregar = () => api('GET', '/distribuicao').then(r => { setD(r); setRod(r.rodizio) })
  useEffect(() => { carregar() }, [])
  if (!d) return <Carregando />
  const ativos = d.quizzes.filter(q => q.ativo)
  const quizzes = ativos.length ? ativos : d.quizzes

  return (
    <div>
      <PageHeader title="Links e rodízio" subtitle="De onde veio cada candidata e com quem ela fica." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title={d.podeConfigurar ? 'Link pessoal de cada colaboradora (prospecção ativa)' : 'Seu link pessoal'}>
          <p style={{ fontSize: 13.5, marginTop: 0, color: 'var(--muted)' }}>
            Quem responde o quiz por este link fica <b>com a colaboradora dona do link</b> e não entra no rodízio. Pra campanha de tráfego, use o link normal do quiz (sem o <code>?c=</code>).
          </p>
          {!quizzes.length ? <div style={vazio}>Nenhum quiz criado ainda.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tabela">
                <thead><tr><th>Pessoa</th>{quizzes.map(q => <th key={q.id}>{q.nome}{!q.ativo && ' (desligado)'}</th>)}</tr></thead>
                <tbody>
                  {d.links.filter(p => p.role !== 'logistica').map(p => (
                    <tr key={p.id} className="linha">
                      <td><b>{p.name}</b><div style={{ fontSize: 12, color: 'var(--muted)' }}>{CARGO[p.role] || p.role}</div></td>
                      {quizzes.map(q => (
                        <td key={q.id}>
                          <button style={btn('ghost', { minHeight: 30, padding: '0 10px', textTransform: 'none', fontWeight: 400 })} title={linkCom(q, p.codigo)} onClick={() => copiar(linkCom(q, p.codigo))}>
                            <Copy size={13} /> …{(q.padrao ? '/quiz' : '/quiz/' + q.slug)}?c={p.codigo}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.podeConfigurar && <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 0 }}>Pra colaboradora ter link, ela precisa de um usuário aqui (Usuários). Use o <b>mesmo e-mail do CRM</b> — assim ela também vê os cadastros dela pelo e-mail.</p>}
        </Card>

        {d.podeConfigurar && rod && <RodizioCard rod={rod} setRod={setRod} pessoas={d.links.filter(p => p.role !== 'logistica')} onSalvo={carregar} />}
        {d.podeConfigurar !== undefined && <Trafego />}
      </div>
    </div>
  )
}

function Escolher({ pessoas, ids, onChange }: { pessoas: Pessoa[]; ids: number[]; onChange: (ids: number[]) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {pessoas.map(p => {
        const on = ids.includes(p.id)
        return (
          <button key={p.id} onClick={() => onChange(on ? ids.filter(i => i !== p.id) : [...ids, p.id])}
            style={{ padding: '6px 12px', borderRadius: 16, border: on ? '2px solid var(--terra)' : '1px solid var(--line)', background: on ? 'var(--terraSoft)' : '#fff', color: on ? 'var(--terra)' : 'var(--ink)', fontWeight: on ? 700 : 400, fontSize: 13.5 }}>
            {on ? '✓ ' : ''}{p.name}
          </button>
        )
      })}
    </div>
  )
}

function RodizioCard({ rod, setRod, pessoas, onSalvo }: { rod: Rodizio; setRod: (r: Rodizio) => void; pessoas: Pessoa[]; onSalvo: () => void }) {
  const [salvando, setSalvando] = useState(false)
  const nome = (id?: number) => pessoas.find(p => p.id === id)?.name
  const salvar = async () => {
    setSalvando(true)
    try { await api('PUT', '/distribuicao/rodizio', { ativo: rod.ativo, participantes: rod.participantes, campanhas: rod.campanhas.filter(c => c.campanha.trim()) }); toast('Rodízio salvo'); onSalvo() }
    catch (e) { toast((e as Error).message, 'error') } finally { setSalvando(false) }
  }
  return (
    <Card title="Rodízio do tráfego pago" right={<button style={btn('primary')} disabled={salvando} onClick={salvar}>Salvar rodízio</button>}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
        <input type="checkbox" checked={rod.ativo} onChange={e => setRod({ ...rod, ativo: e.target.checked })} style={{ width: 20, height: 20, accentColor: '#8e2a46' }} />
        Distribuir automaticamente quem passa no quiz pelo link do tráfego
      </label>
      <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 0 }}>Uma de cada vez, na ordem em que você marcar. Quem veio pelo link pessoal de alguém não entra no rodízio. Desligado: o cadastro fica sem atendente até alguém mandar o formulário pelo CRM.</p>
      <label style={labelStyle}>Rodízio geral {rod.vez['*'] && nome(rod.vez['*']) ? `· última a receber: ${nome(rod.vez['*'])}` : ''}</label>
      <Escolher pessoas={pessoas} ids={rod.participantes} onChange={ids => setRod({ ...rod, participantes: ids })} />
      <div style={{ marginTop: 18, fontSize: 14, fontWeight: 700 }}>Lista própria por campanha (opcional)</div>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 10px' }}>O nome da campanha é o que vai no link: <code>?utm_campaign=NOME</code> (o Facebook preenche sozinho) ou <code>?campanha=NOME</code>. Campanha sem lista própria usa o rodízio geral.</p>
      {rod.campanhas.map((c, i) => (
        <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 3, padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={c.campanha} placeholder="Nome da campanha" onChange={e => setRod({ ...rod, campanhas: rod.campanhas.map((x, j) => j === i ? { ...x, campanha: e.target.value } : x) })} style={inputStyle} />
            <button style={btn('ghost')} title="Tirar esta campanha" onClick={() => setRod({ ...rod, campanhas: rod.campanhas.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
          </div>
          <Escolher pessoas={pessoas} ids={c.participantes} onChange={ids => setRod({ ...rod, campanhas: rod.campanhas.map((x, j) => j === i ? { ...x, participantes: ids } : x) })} />
        </div>
      ))}
      <button style={btn('ghost')} onClick={() => setRod({ ...rod, campanhas: [...rod.campanhas, { campanha: '', participantes: [] }] })}><Plus size={14} /> Campanha com lista própria</button>
    </Card>
  )
}

function Trafego() {
  const hoje = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ de: new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10), ate: hoje })
  const [d, setD] = useState<{ campanhas: (Linha & { campanha: string | null })[]; colaboradoras: (Linha & { id: number; nome: string })[] } | null | 'sem'>(null)
  const carregar = () => api('GET', `/distribuicao/trafego?de=${f.de}&ate=${f.ate}`).then(setD).catch(() => setD('sem'))
  useEffect(() => { carregar() }, [])
  if (d === 'sem') return null
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '—')
  const tabela = (titulo: string, rotulo: string, linhas: (Linha & { nome: string })[]) => (
    <Card title={titulo}>
      {!linhas.length ? <div style={vazio}>Nada no período.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabela">
            <thead><tr><th>{rotulo}</th><th>Cliques no link</th><th>Responderam</th><th>Aprovadas no quiz</th><th>Cadastros</th><th>Iniciadas</th></tr></thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.nome} className="linha">
                  <td><b>{l.nome}</b></td>
                  <td>{l.cliques}</td>
                  <td>{l.respostas} <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pct(l.respostas, l.cliques)}</span></td>
                  <td>{l.aprovadas} <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pct(l.aprovadas, l.respostas)}</span></td>
                  <td>{l.cadastros}</td>
                  <td>{l.iniciadas} <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pct(l.iniciadas, l.cadastros)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>De<input type="date" value={f.de} onChange={e => setF({ ...f, de: e.target.value })} style={{ ...inputStyle, width: 150, display: 'block' }} /></label>
        <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>Até<input type="date" value={f.ate} onChange={e => setF({ ...f, ate: e.target.value })} style={{ ...inputStyle, width: 150, display: 'block' }} /></label>
        <button style={btn('primary')} onClick={carregar}>Ver período</button>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', flex: '1 1 300px' }}>"Cliques no link" = visitas ao quiz (1 por aparelho). Compare com os "cliques no link" do Gerenciador de Anúncios da Meta no mesmo período.</span>
      </div>
      {!d ? <Carregando /> : <>
        {tabela('Resultado por campanha', 'Campanha', d.campanhas.map(l => ({ ...l, nome: l.campanha || '(sem campanha no link)' })))}
        {tabela('Resultado por link pessoal (prospecção ativa)', 'Colaboradora', d.colaboradoras.map(l => ({ ...l, nome: l.nome })))}
      </>}
    </>
  )
}
