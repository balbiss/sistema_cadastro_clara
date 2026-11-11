import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock, Flag, LayoutGrid, List, Medal, Sparkles, Star, Target, Trophy, UserPlus, Wallet } from 'lucide-react'
import { api, usuarioAtual } from '../lib/api'
import { brl, dataBR } from '../lib/fmt'
import { Modal, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, toast } from '../components/extra'

// Relatório de ajustes 2 (Bel, 06/11), itens 4 e 6: painel individual da colaboradora. Leve, bonito e
// motivador: corrida até a meta, estrelas, conquistas, ranking — e a carteira em kanban ou lista.
type D = any
const VINHO = '#5a2433', ROSA = '#c8506a', OURO = '#d9a520'
const box: CSSProperties = { background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '16px 18px', minWidth: 0 }
const COR_GRUPO: Record<string, string> = {
  qualificada: '#99ccff', em_analise: '#ffcc66', precisa_avalista: '#ffc8c8', avalista_em_analise: '#ffd9a8', credito_aprovado: '#ccff66',
  documentacao: '#e7d6ff', cadastro_aprovado: '#ffd6a5', aguardando_agendamento: '#fff1b8', agendada: '#bfe7ff', iniciada: '#a8e6a3', reprovado: '#ff8f92', desistencia: '#d5d8db',
}
const nomeMes = (m: string) => { const t = new Date(m + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1) }
const mesMais = (m: string, k: number) => { const d = new Date(m + '-15T12:00:00'); d.setMonth(d.getMonth() + k); return d.toISOString().slice(0, 7) }
const ler = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sem armazenamento: só não lembra */ } }

export default function Carteira() {
  const nav = useNavigate()
  const eu = usuarioAtual()
  const [mes, setMes] = useState<string | null>(null)
  const [userId, setUserId] = useState<number | null>(null)
  const [d, setD] = useState<D>(null)
  const [vista, setVista] = useState<'kanban' | 'lista'>(ler('cad_carteira_vista') === 'lista' ? 'lista' : 'kanban')
  const [filtro, setFiltro] = useState<string | null>(null)
  const [festa, setFesta] = useState<string | null>(null)
  const [metas, setMetas] = useState(false)
  const carregar = () => {
    const q = new URLSearchParams(); if (mes) q.set('mes', mes); if (userId) q.set('userId', String(userId))
    api('GET', '/carteira?' + q).then(r => { setD(r); if (!mes) setMes(r.mes) }).catch(e => toast(e.message, 'error'))
  }
  useEffect(() => { carregar() }, [mes, userId])
  // parabéns a cada conquista nova (iniciação ou aprovação desde a última visita)
  useEffect(() => {
    if (!d?.pessoa.eu) return
    const chave = `cad_carteira_${d.pessoa.id}_${d.mes}`
    const antes = JSON.parse(ler(chave) || 'null')
    const agora = { i: d.numeros.iniciacoes, a: d.numeros.aprovacoes }
    if (antes && agora.i > antes.i) setFesta(agora.i - antes.i === 1 ? 'Mais uma revendedora iniciada! 🎉' : `+${agora.i - antes.i} revendedoras iniciadas! 🎉`)
    else if (antes && agora.a > antes.a) setFesta(agora.a - antes.a === 1 ? 'Crédito aprovado na sua carteira! ✨' : `+${agora.a - antes.a} aprovações! ✨`)
    gravar(chave, JSON.stringify(agora))
  }, [d])
  useEffect(() => { if (festa) { const t = setTimeout(() => setFesta(null), 4200); return () => clearTimeout(t) } }, [festa])
  const itens = useMemo(() => (d?.itens || []).filter((i: D) => !filtro || i.grupo === filtro), [d, filtro])
  if (!d || !mes) return <Carregando />
  const n = d.numeros
  const primeiro = d.pessoa.nome.split(' ')[0]
  const porGrupo = (g: string) => d.itens.filter((i: D) => i.grupo === g).length
  const trocaVista = (v: 'kanban' | 'lista') => { setVista(v); gravar('cad_carteira_vista', v) }

  return (
    <div>
      {festa && <Festa texto={festa} />}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: '1 1 260px' }}>
          <h1 style={{ margin: 0, fontSize: 26, color: VINHO }}>{d.pessoa.eu ? `Oi, ${primeiro}! ✨` : `Carteira de ${d.pessoa.nome}`}</h1>
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>{d.pessoa.eu ? 'Sua carteira de novas revendedoras e a sua corrida do mês.' : 'Carteira, resultados e corrida do mês.'}</div>
        </div>
        {d.equipe.length > 0 && <select value={userId || d.pessoa.id} onChange={e => setUserId(Number(e.target.value) === eu?.id ? null : Number(e.target.value))} style={{ ...inputStyle, width: 'auto' }}>
          {d.equipe.filter((u: D) => u.role !== 'logistica').map((u: D) => <option key={u.id} value={u.id}>{u.id === eu?.id ? 'Minha carteira' : u.name}</option>)}
        </select>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: 3 }}>
          <button onClick={() => setMes(mesMais(mes, -1))} style={setaBtn} title="Mês anterior"><ChevronLeft size={16} /></button>
          <span style={{ fontSize: 14, fontWeight: 700, minWidth: 128, textAlign: 'center' }}>{nomeMes(mes)}</span>
          <button onClick={() => setMes(mesMais(mes, 1))} style={setaBtn} title="Próximo mês"><ChevronRight size={16} /></button>
        </div>
        {d.podeMetas && <button style={btn('ghost')} onClick={() => setMetas(true)}><Target size={15} /> Metas</button>}
      </header>

      <div className="grid-carteira">
        <Corrida d={d} />
        <Ranking d={d} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '14px 0' }}>
        <Num icone={<Clock size={17} />} t="Em análise" v={n.emAnalise} sub="agora" />
        <Num icone={<CheckCircle2 size={17} />} t="Aprovações de crédito" v={n.aprovacoes} sub="no mês" />
        <Num icone={<Flag size={17} />} t="Pendentes" v={n.pendentes} sub="precisam de você" alerta={n.pendentes > 0} />
        <Num icone={<CalendarCheck size={17} />} t="Agendamentos" v={n.agendamentos} sub={`no mês · ${n.agendadasAgora} agendada(s) agora`} />
        <Num icone={<Trophy size={17} />} t="Iniciadas" v={n.iniciacoes} sub="no mês" destaque />
        <Num icone={<UserPlus size={17} />} t="Novas na carteira" v={n.novos} sub={`no mês · ${n.iniciaramDoMes} já iniciaram`} />
      </div>

      <div className="grid-carteira">
        <Conquistas d={d} />
        <div style={box}>
          <Titulo icone={<Wallet size={16} />}>Ganhos</Titulo>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
            As regras de remuneração variável e premiação ainda vão ser definidas pela direção. Assim que forem, aparece aqui quanto você está ganhando com os seus resultados.</p>
        </div>
      </div>

      {/* carteira: situações (item 4.2) + kanban ou lista (4.1) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '22px 0 10px' }}>
        <h2 style={{ margin: 0, fontSize: 18, color: VINHO, flex: 1 }}>Candidatas na carteira <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}>({d.itens.length})</span></h2>
        <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          <button onClick={() => trocaVista('kanban')} style={vistaBtn(vista === 'kanban')}><LayoutGrid size={14} /> Kanban</button>
          <button onClick={() => trocaVista('lista')} style={vistaBtn(vista === 'lista')}><List size={14} /> Lista</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <Chip on={!filtro} onClick={() => setFiltro(null)}>Todas · {d.itens.length}</Chip>
        {d.grupos.filter((g: D) => porGrupo(g.chave)).map((g: D) => (
          <Chip key={g.chave} on={filtro === g.chave} cor={COR_GRUPO[g.chave]} onClick={() => setFiltro(filtro === g.chave ? null : g.chave)}>{g.nome} · {porGrupo(g.chave)}</Chip>))}
        {d.naoQualificou.length > 0 && <Chip on={filtro === '_quiz'} cor="#eceff1" onClick={() => setFiltro(filtro === '_quiz' ? null : '_quiz')}>Não passaram no quiz (mês) · {d.naoQualificou.length}</Chip>}
      </div>

      {filtro === '_quiz' ? <div style={box}>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>Pessoas que fizeram o quiz pelo seu link pessoal neste mês e não atingiram os requisitos de qualificação.</p>
        {d.naoQualificou.map((q: D) => <div key={q.id} style={{ padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 14 }}>{q.nome} <span style={{ color: 'var(--muted)' }}>· {q.pontos} pontos · {dataBR(q.createdAt)}</span></div>)}
      </div>
        : !d.itens.length ? <div style={{ ...box, textAlign: 'center', color: 'var(--muted)', padding: 36 }}>Nenhuma candidata na carteira ainda. Divulgue o seu link pessoal (tela Links e rodízio) 💪</div>
        : vista === 'kanban' ? <Kanban d={d} itens={itens} onAbrir={(id: number) => nav('/cadastros/' + id)} />
        : <Lista itens={itens} grupos={d.grupos} onAbrir={(id: number) => nav('/cadastros/' + id)} />}

      {metas && <Metas onClose={() => setMetas(false)} onOk={carregar} />}
    </div>
  )
}

const setaBtn: CSSProperties = { border: 'none', background: 'none', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, color: 'var(--ink)' }
const vistaBtn = (on: boolean): CSSProperties => ({ border: 'none', padding: '7px 12px', fontSize: 13, display: 'flex', gap: 5, alignItems: 'center', background: on ? 'var(--vinhoBtn)' : '#fff', color: on ? '#fff' : 'var(--ink)', fontWeight: on ? 700 : 400 })
const Titulo = ({ icone, children, right }: { icone: ReactNode; children: ReactNode; right?: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: VINHO, fontWeight: 700, fontSize: 15 }}>{icone}<span style={{ flex: 1 }}>{children}</span>{right}</div>)
function Chip({ on, cor, onClick, children }: { on: boolean; cor?: string; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} style={{ border: on ? '2px solid var(--vinhoBtn)' : '1px solid var(--line)', background: on ? '#fff' : cor ? cor + '55' : '#fff', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: on ? 700 : 400, color: 'var(--ink)' }}>{children}</button>
}
function Num({ icone, t, v, sub, destaque, alerta }: { icone: ReactNode; t: string; v: number; sub: string; destaque?: boolean; alerta?: boolean }) {
  return (
    <div style={{ ...box, padding: '13px 15px', background: destaque ? 'linear-gradient(135deg,#fff 0%,#fdf2f5 100%)' : '#fff', borderColor: destaque ? '#f0c3cf' : 'var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: alerta ? '#c0392b' : destaque ? ROSA : 'var(--muted)', fontSize: 12.5 }}>{icone}{t}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: alerta ? '#c0392b' : VINHO, lineHeight: 1.15, marginTop: 4 }}>{v}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>
    </div>)
}

// item 6.3: "corrida em direção à meta" — pista com a corredora, estrelas e níveis
function Corrida({ d }: { d: D }) {
  const feitas = d.numeros.iniciacoes
  const meta = d.meta as number | null
  const pct = meta ? Math.min(1, feitas / meta) : 0
  const falta = meta ? Math.max(0, meta - feitas) : 0
  const niveis = meta ? [{ nome: 'Bronze', alvo: Math.ceil(meta * 0.5), cor: '#c07a43' }, { nome: 'Prata', alvo: meta, cor: '#8e9aa6' }, { nome: 'Ouro', alvo: Math.ceil(meta * 1.5), cor: OURO }] : []
  const estrelas = meta ? Math.max(meta, feitas) : Math.max(5, feitas)
  const max6 = Math.max(1, ...d.meses.map((m: D) => m.iniciacoes))
  return (
    <div style={{ ...box, background: 'linear-gradient(135deg,#fff 0%,#fff6f8 60%,#fdeef2 100%)', borderColor: '#f3d3db' }}>
      <Titulo icone={<Target size={16} />} right={meta ? <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>meta do mês: <b style={{ color: VINHO }}>{meta}</b> iniciações</span> : null}>Corrida do mês</Titulo>
      <div style={{ fontSize: 15, margin: '10px 0 14px', color: 'var(--ink)' }}>
        {!meta ? <>Você já iniciou <b>{feitas}</b> revendedora{feitas === 1 ? '' : 's'} este mês. <span style={{ color: 'var(--muted)' }}>(A meta ainda não foi definida pela direção.)</span></>
          : falta === 0 ? <><b style={{ color: '#2f7d16' }}>Meta batida! 🏆</b> {feitas > meta ? `+${feitas - meta} além da meta — que fase!` : 'Agora é rumo ao Ouro.'}</>
          : <>Faltam <b style={{ color: ROSA, fontSize: 18 }}>{falta}</b> {falta === 1 ? 'iniciação' : 'iniciações'} pra bater a meta. {pct >= 0.5 ? 'Já passou da metade! 🔥' : 'Bora! 💪'}</>}
      </div>
      {meta ? <div style={{ position: 'relative', height: 44, margin: '6px 8px 10px' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 18, height: 8, borderRadius: 99, background: 'repeating-linear-gradient(90deg,#f0dfe4 0 12px,#f7ecef 12px 24px)' }} />
        <div style={{ position: 'absolute', left: 0, top: 18, height: 8, borderRadius: 99, width: `${pct * 100}%`, background: `linear-gradient(90deg,${ROSA},#8e2a46)`, transition: 'width .8s ease' }} />
        <div style={{ position: 'absolute', top: 2, left: `calc(${pct * 100}% - 18px)`, transition: 'left .8s ease', fontSize: 26, transform: 'scaleX(-1)' }} title={`${feitas} de ${meta}`}>🏃‍♀️</div>
        <div style={{ position: 'absolute', right: -6, top: 0, fontSize: 24 }}>🏁</div>
      </div> : null}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', margin: '4px 0 12px' }}>
        {Array.from({ length: Math.min(estrelas, 30) }).map((_, k) => (
          <Star key={k} size={20} fill={k < feitas ? OURO : 'none'} color={k < feitas ? OURO : '#e2c9cf'} style={{ transition: 'all .3s', transform: k < feitas ? 'scale(1)' : 'scale(.9)' }} />))}
      </div>
      {niveis.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {niveis.map(nv => {
          const ok = feitas >= nv.alvo
          return <div key={nv.nome} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, fontSize: 12.5, background: ok ? nv.cor + '22' : '#f4f4f5', color: ok ? nv.cor : '#a3a8ad', border: `1px solid ${ok ? nv.cor : '#e6e7e9'}`, fontWeight: 700 }}>
            <Medal size={14} /> {nv.nome} · {nv.alvo}{ok ? ' ✓' : ''}</div>
        })}
      </div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 62, borderTop: '1px dashed #efd8de', paddingTop: 8 }}>
        {d.meses.map((m: D) => (
          <div key={m.mes} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>
            <div style={{ height: 34, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <div title={`${m.iniciacoes} iniciação(ões)`} style={{ width: '60%', maxWidth: 26, height: `${(m.iniciacoes / max6) * 100}%`, minHeight: m.iniciacoes ? 4 : 2, borderRadius: 4, background: m.mes === d.mes ? ROSA : '#ecc6d0' }} />
            </div>
            <b style={{ color: m.mes === d.mes ? VINHO : 'var(--muted)' }}>{m.iniciacoes}</b> {new Date(m.mes + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
          </div>))}
      </div>
    </div>
  )
}

function Ranking({ d }: { d: D }) {
  const medalha = ['🥇', '🥈', '🥉']
  return (
    <div style={box}>
      <Titulo icone={<Trophy size={16} />}>Ranking da equipe</Titulo>
      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 8px' }}>Iniciações no mês (desempate: cadastros aprovados)</div>
      {!d.ranking.length ? <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>Ninguém pontuou ainda neste mês — a largada é sua! 🏁</p>
        : d.ranking.map((r: D) => (
          <div key={r.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, marginBottom: 4, background: r.eu ? '#fdf0f3' : 'transparent', border: r.eu ? '1px solid #f3cbd5' : '1px solid transparent' }}>
            <span style={{ width: 26, textAlign: 'center', fontSize: r.posicao <= 3 ? 20 : 13, fontWeight: 700, color: 'var(--muted)' }}>{medalha[r.posicao - 1] || r.posicao + 'º'}</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: r.eu ? 700 : 400 }}>{r.nome}{r.eu ? ' (você)' : ''}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{r.aprovados} aprov.</span>
            <b style={{ fontSize: 16, color: VINHO, minWidth: 22, textAlign: 'right' }}>{r.iniciacoes}</b>
          </div>))}
    </div>
  )
}

function Conquistas({ d }: { d: D }) {
  const n = d.numeros
  const meta = d.meta as number | null
  const lista = [
    { nome: 'Primeira do mês', desc: '1ª revendedora iniciada no mês', ok: n.iniciacoes >= 1, emoji: '🌱' },
    { nome: 'Crédito na mão', desc: '3 aprovações de crédito no mês', ok: n.aprovacoes >= 3, emoji: '✅' },
    { nome: 'Agenda cheia', desc: '3 iniciações agendadas no mês', ok: n.agendamentos >= 3, emoji: '📅' },
    { nome: 'Trinca', desc: '3 revendedoras iniciadas no mês', ok: n.iniciacoes >= 3, emoji: '🔥' },
    { nome: 'Carteira em dia', desc: 'Nenhuma candidata parada', ok: d.itens.length > 0 && !d.itens.some((i: D) => i.vencido), emoji: '🧹' },
    ...(meta ? [{ nome: 'Meta batida', desc: `${meta} iniciações no mês`, ok: n.iniciacoes >= meta, emoji: '🏆' }] : []),
  ]
  const feitas = lista.filter(c => c.ok).length
  return (
    <div style={box}>
      <Titulo icone={<Award size={16} />} right={<span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>{feitas} de {lista.length}</span>}>Conquistas do mês</Titulo>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 10 }}>
        {lista.map(c => (
          <div key={c.nome} title={c.desc} style={{ borderRadius: 10, padding: '10px 10px', textAlign: 'center', border: `1px solid ${c.ok ? '#f0c3cf' : '#eceef0'}`, background: c.ok ? 'linear-gradient(180deg,#fff,#fdf0f3)' : '#fafafa', filter: c.ok ? 'none' : 'grayscale(1)', opacity: c.ok ? 1 : 0.6 }}>
            <div style={{ fontSize: 24 }}>{c.emoji}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: c.ok ? VINHO : 'var(--muted)' }}>{c.nome}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.desc}</div>
          </div>))}
      </div>
    </div>
  )
}

function Cartao({ i, onAbrir }: { i: D; onAbrir: (id: number) => void }) {
  return (
    <button onClick={() => onAbrir(i.id)} style={{ textAlign: 'left', width: '100%', background: '#fff', border: '1px solid var(--line)', borderLeft: `4px solid ${COR_GRUPO[i.grupo] || '#ccc'}`, borderRadius: 8, padding: '9px 10px', marginBottom: 8, cursor: 'pointer', display: 'block' }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{i.nome}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{[i.cidade, i.origem].filter(Boolean).join(' · ') || i.codigo}</div>
      {i.detalhe && <div style={{ fontSize: 12, marginTop: 3 }}>{i.detalhe}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
        {i.aprovadoEm && <span>✓ aprovada {dataBR(i.aprovadoEm)}</span>}
        {i.valorCredito && <span>limite {brl(i.valorCredito)}</span>}
        {i.agendadoPara && i.grupo === 'agendada' && <span>📅 {new Date(i.agendadoPara).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
        {i.iniciadaEm && <span>🎉 iniciou {dataBR(i.iniciadaEm)}</span>}
        {i.pendencias > 0 && <span style={{ color: '#c0392b' }}>{i.pendencias} pendência(s)</span>}
        {i.vencido && <span style={{ color: '#c0392b' }}>parada</span>}
      </div>
    </button>
  )
}

function Kanban({ d, itens, onAbrir }: { d: D; itens: D[]; onAbrir: (id: number) => void }) {
  const cols = d.grupos.filter((g: D) => itens.some(i => i.grupo === g.chave))
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
      {cols.map((g: D) => {
        const doGrupo = itens.filter(i => i.grupo === g.chave)
        return (
          <div key={g.chave} style={{ flex: '0 0 250px', background: '#f7f4f5', borderRadius: 10, padding: 8, maxHeight: 620, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px 8px', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', color: '#4a2430' }}>
              <span style={{ width: 10, height: 10, borderRadius: 99, background: COR_GRUPO[g.chave] }} />{g.nome}<span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{doGrupo.length}</span></div>
            {doGrupo.map(i => <Cartao key={i.id} i={i} onAbrir={onAbrir} />)}
          </div>)
      })}
    </div>
  )
}

function Lista({ itens, grupos, onAbrir }: { itens: D[]; grupos: D[]; onAbrir: (id: number) => void }) {
  const nomeG = (k: string) => grupos.find((g: D) => g.chave === k)?.nome || k
  const td: CSSProperties = { padding: '9px 10px', borderBottom: '1px solid var(--line)', fontSize: 13.5, verticalAlign: 'top' }
  return (
    <div style={{ ...box, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead><tr style={{ background: 'var(--card-2)', textAlign: 'left', fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' }}>
          {['Candidata', 'Situação', 'Aprovação', 'Limite', 'Agendamento', 'Iniciação'].map(h => <th key={h} style={{ ...td, fontWeight: 700 }}>{h}</th>)}</tr></thead>
        <tbody>{itens.map(i => (
          <tr key={i.id} onClick={() => onAbrir(i.id)} style={{ cursor: 'pointer' }}>
            <td style={td}><b>{i.nome}</b><div style={{ fontSize: 12, color: 'var(--muted)' }}>{[i.cidade, i.origem].filter(Boolean).join(' · ')}</div></td>
            <td style={td}><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, background: (COR_GRUPO[i.grupo] || '#ddd') + '88' }}>{nomeG(i.grupo)}</span>
              {i.detalhe && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{i.detalhe}</div>}
              {i.pendencias > 0 && <div style={{ fontSize: 12, color: '#c0392b' }}>{i.pendencias} pendência(s)</div>}</td>
            <td style={td}>{i.aprovadoEm ? dataBR(i.aprovadoEm) : '—'}</td>
            <td style={td}>{i.valorCredito ? brl(i.valorCredito) : '—'}</td>
            <td style={td}>{i.agendadoPara ? new Date(i.agendadoPara).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : i.grupo === 'aguardando_agendamento' ? 'Aguardando' : '—'}</td>
            <td style={td}>{i.iniciadaEm ? <span style={{ color: '#2f7d16', fontWeight: 700 }}>✓ {dataBR(i.iniciadaEm)}</span> : '—'}</td>
          </tr>))}</tbody>
      </table>
    </div>
  )
}

function Festa({ texto }: { texto: string }) {
  const pedacos = Array.from({ length: 70 }, (_, k) => ({ x: Math.random() * 100, d: Math.random() * 0.8, c: ['#c8506a', '#d9a520', '#8e2a46', '#f0d0d7', '#7DBB2D'][k % 5], r: Math.random() * 360 }))
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 3000, overflow: 'hidden' }}>
      <style>{'@keyframes cad-cai{from{transform:translateY(-20px) rotate(0)}to{transform:translateY(105vh) rotate(720deg)}}@keyframes cad-pop{0%{transform:translate(-50%,-50%) scale(.6);opacity:0}15%{transform:translate(-50%,-50%) scale(1.05);opacity:1}85%{opacity:1}100%{opacity:0}}@media (prefers-reduced-motion: reduce){.cad-conf{display:none}}'}</style>
      {pedacos.map((p, k) => <span key={k} className="cad-conf" style={{ position: 'absolute', top: 0, left: p.x + '%', width: 8, height: 12, background: p.c, borderRadius: 2, transform: `rotate(${p.r}deg)`, animation: `cad-cai 2.8s ${p.d}s ease-in forwards` }} />)}
      <div style={{ position: 'absolute', top: '42%', left: '50%', background: '#fff', borderRadius: 14, padding: '18px 26px', boxShadow: '0 12px 40px rgba(90,36,51,.25)', fontSize: 19, fontWeight: 700, color: VINHO, textAlign: 'center', animation: 'cad-pop 4.2s ease forwards', display: 'flex', gap: 10, alignItems: 'center' }}>
        <Sparkles color={OURO} /> {texto}
      </div>
    </div>
  )
}

function Metas({ onClose, onOk }: { onClose: () => void; onOk: () => void }) {
  const [m, setM] = useState<D>(null)
  useEffect(() => { api('GET', '/config/metas').then(setM) }, [])
  const salvar = async () => {
    try { await api('PUT', '/config/metas', m.metas); toast('Metas salvas'); onClose(); onOk() } catch (e) { toast((e as Error).message, 'error') }
  }
  const num = (v: string) => (v === '' ? null : Math.max(0, Math.round(Number(v))))
  return (
    <Modal title="Metas de iniciação do mês" subtitle="Quantas revendedoras cada colaboradora deve iniciar por mês. Em branco = usa a meta da equipe." width={520} onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><button style={btn('primary')} disabled={!m} onClick={salvar}>Salvar</button></>}>
      {!m ? <Carregando /> : <>
        <label style={labelStyle}>Meta da equipe (padrão)</label>
        <input type="number" min={0} value={m.metas.padrao ?? ''} placeholder="sem meta" onChange={e => setM({ ...m, metas: { ...m.metas, padrao: num(e.target.value) } })} style={{ ...inputStyle, width: 140, marginBottom: 14 }} />
        {m.equipe.filter((u: D) => u.role !== 'logistica').map((u: D) => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
            <span style={{ flex: 1, fontSize: 14 }}>{u.name}</span>
            <input type="number" min={0} value={m.metas.porUsuario[u.id] ?? ''} placeholder={m.metas.padrao != null ? String(m.metas.padrao) : '—'}
              onChange={e => setM({ ...m, metas: { ...m.metas, porUsuario: { ...m.metas.porUsuario, [u.id]: num(e.target.value) } } })} style={{ ...inputStyle, width: 100 }} />
          </div>))}
      </>}
    </Modal>
  )
}
