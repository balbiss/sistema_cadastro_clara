import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, Clock, FileSearch, ListChecks, PackageCheck, Plus, TrendingUp, UserCheck } from 'lucide-react'
import { api, usuarioAtual } from '../lib/api'
import { STATUS } from '../lib/status'
import { btn } from '../components/ui'
import { Carregando, StatusPill } from '../components/extra'
import { NovoCadastro } from './Cadastros'

// Painel no padrão do Início do CRM v2: saudação em vinho, quadros de números (o 1º em rosa),
// blocos com ícone. Mostra onde os cadastros estão e o que precisa de alguém agora.
const ROSA = '#c8506a'
const VINHO = '#5a2433'
const box: CSSProperties = { background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: '16px 18px', minWidth: 0 }
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' }
const ha = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60000))
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60); if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24); return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}
const duracao = (h: number) => (!h ? '—' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} dias`)
const iniciais = (n: string) => n.split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase()

// caminho do cadastro (onde cada um está agora)
const ETAPAS: { chave: string; nome: string; status: string[] }[] = [
  { chave: 'quiz', nome: 'Perfil aprovado (quiz)', status: ['quiz_aprovado'] },
  { chave: 'enviado', nome: 'Formulário enviado', status: ['formulario_enviado'] },
  { chave: 'analise', nome: 'Em análise', status: ['formulario_preenchido', 'analise_humana'] },
  { chave: 'avalista', nome: 'Aguardando avalista', status: ['pendente_avalista'] },
  { chave: 'aprovado', nome: 'Aprovados — documentos', status: ['aprovado', 'aprovado_avalista'] },
  { chave: 'assinatura', nome: 'Contrato p/ assinar', status: ['documentos_ok', 'aguardando_assinatura'] },
  { chave: 'inicializacao', nome: 'Em inicialização', status: ['inicializacao'] },
  { chave: 'iniciada', nome: 'Iniciadas', status: ['iniciada'] },
]
const COR_ETAPA: Record<string, string> = { quiz: STATUS.quiz_aprovado.cor, enviado: STATUS.formulario_enviado.cor, analise: STATUS.analise_humana.cor, avalista: STATUS.pendente_avalista.cor, aprovado: STATUS.aprovado.cor, assinatura: STATUS.aguardando_assinatura.cor, inicializacao: STATUS.inicializacao.cor, iniciada: STATUS.iniciada.cor }
const RAZAO: Record<string, { cor: string; fundo: string }> = {
  'Aguardando decisão': { cor: '#4b4fb8', fundo: '#eceefe' },
  'Documentos para conferir': { cor: '#1f6fb2', fundo: '#e6f1fb' },
  'Prazo vencido': { cor: '#c0392b', fundo: '#fdecea' },
  'Agendar início': { cor: '#8a5a00', fundo: '#fff1d6' },
  'Assinatura atrasada': { cor: '#6b3fb5', fundo: '#f1e9ff' },
  'Inicialização parada': { cor: '#c0392b', fundo: '#fdecea' },
}

export default function Painel() {
  const nav = useNavigate()
  const eu = usuarioAtual()
  const [d, setD] = useState<any>(null)
  const [novo, setNovo] = useState(false)
  const carregar = () => api('GET', '/cadastros/painel').then(setD)
  useEffect(() => { carregar(); const t = setInterval(carregar, 30_000); return () => clearInterval(t) }, [])
  if (!d) return <Carregando />
  const dataLonga = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const soma = (s: string[]) => s.reduce((a, k) => a + (d.porStatus[k] || 0), 0)

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ flex: '1 1 260px' }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: VINHO }}>{saudacao()}, {eu?.name.split(' ')[0]}!</h1>
          <div style={{ color: 'var(--muted)', fontSize: 14.5, marginTop: 2 }}>{dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1)} · novos cadastros de revendedoras</div>
        </div>
        <button style={btn('ghost')} onClick={() => nav('/cadastros')}>Ver cadastros</button>
        <button style={btn('primary')} onClick={() => setNovo(true)}><Plus size={16} /> Novo cadastro</button>
      </header>

      <section className="numeros" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Numero destaque titulo="Em andamento" valor={d.emAndamento} icone={<Activity size={17} />} rodape={`${d.novos30} novos nos últimos 30 dias`} onClick={() => nav('/cadastros')} />
        <Numero titulo="Aprovados" valor={d.aprovados} icone={<UserCheck size={17} />} rodape={d.taxaAprovacao == null ? 'nenhum decidido ainda' : `${Math.round(d.taxaAprovacao * 100)}% de aprovação`} />
        <Numero titulo="Revendedoras iniciadas" valor={d.iniciadas} icone={<PackageCheck size={17} />} onClick={() => nav('/inicializacao')}
          rodape={`${d.iniciadas30} nos últimos 30 dias · ${d.emInicializacao} em inicialização`} />
        <Numero titulo="Tempo até a decisão" valor={duracao(d.horasMediasDecisao)} icone={<Clock size={17} />} rodape="média do formulário à decisão" />
        <Numero titulo="Documentos a conferir" valor={d.docsAConferir} icone={<FileSearch size={17} />} rodape="cadastros com arquivo novo" alerta={d.docsAConferir > 0} />
        <Numero titulo="Pendências abertas" valor={d.pendenciasAbertas} icone={<ListChecks size={17} />} onClick={() => nav('/pendencias')}
          rodape={d.vencidos ? <span style={{ color: '#c0392b', fontWeight: 700 }}>{d.vencidos} com prazo vencido</span> : 'nenhum prazo vencido'} alerta={d.vencidos > 0} />
      </section>

      <Bloco titulo="Caminho do cadastro" icone={<TrendingUp size={18} />}
        extra={<span style={{ fontSize: 13, color: 'var(--muted)' }}>{d.total} no total · {d.reprovados} reprovado(s) · {d.porStatus.desistencia || 0} desistência(s)</span>}>
        <div className="caminho" style={{ display: 'grid', gridTemplateColumns: `repeat(${ETAPAS.length}, minmax(0, 1fr))`, gap: 0, marginTop: 4 }}>
          {ETAPAS.map((e, i) => {
            const n = soma(e.status)
            return (
              <button key={e.chave} onClick={() => nav(e.chave === 'inicializacao' || e.chave === 'iniciada' ? '/inicializacao' : '/cadastros' + (e.status.length === 1 ? '?status=' + e.status[0] : e.chave === 'assinatura' ? '?status=aguardando_assinatura' : ''))} className="etapa"
                style={{ position: 'relative', border: 'none', background: 'none', textAlign: 'left', padding: '0 18px 0 0', cursor: 'pointer' }}>
                <div style={{ height: 6, borderRadius: 3, background: COR_ETAPA[e.chave], border: '1px solid rgba(0,0,0,.06)' }} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, color: n ? VINHO : '#c9cdd1', lineHeight: 1 }}>{n}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{d.total ? Math.round((n / d.total) * 100) : 0}%</span>
                </div>
                <div style={{ fontSize: 13.5, marginTop: 4, color: 'var(--ink)' }}>{e.nome}</div>
                {i < ETAPAS.length - 1 && <ChevronRight size={16} color="#c9cdd1" style={{ position: 'absolute', right: 2, top: 26 }} />}
              </button>
            )
          })}
        </div>
      </Bloco>

      <div className="grid-dossie" style={{ marginTop: 16 }}>
        <Bloco titulo="Precisa da sua atenção" icone={<AlertTriangle size={18} />} extra={<span style={{ fontSize: 13, color: 'var(--muted)' }}>{d.atencao.length} cadastro(s)</span>}>
          {!d.atencao.length ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 14, padding: '14px 0' }}><CheckCircle2 size={20} color="#3c8d0d" /> Tudo em dia — nenhum cadastro esperando por alguém.</div>
          ) : d.atencao.map((c: any) => (
            <button key={c.id} onClick={() => nav('/cadastros/' + c.id)} className="linha-atencao"
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 4px', border: 'none', borderTop: '1px solid var(--line)', background: 'none', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#fbe9ee', color: '#8e2a46', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{iniciais(c.nome)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14.5 }}>{c.nome}</b>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.codigo}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.motivo || STATUS[c.status]?.nome}</div>
              </div>
              <span style={{ flex: 'none', fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 12, color: RAZAO[c.razao].cor, background: RAZAO[c.razao].fundo, whiteSpace: 'nowrap' }}>{c.razao}</span>
              <ChevronRight size={16} color="var(--muted)" style={{ flex: 'none' }} />
            </button>
          ))}
        </Bloco>

        <Bloco titulo="Últimas movimentações" icone={<Activity size={18} />}>
          {!d.recentes.length ? <div style={{ color: 'var(--muted)', fontSize: 14 }}>Nada ainda.</div> : (
            <div style={{ position: 'relative' }}>
              {d.recentes.map((ev: any, i: number) => (
                <div key={ev.id} style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
                  <div style={{ flex: 'none', width: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: i === 0 ? ROSA : '#e3c3cb', marginTop: 5 }} />
                    {i < d.recentes.length - 1 && <span style={{ flex: 1, width: 1, background: 'var(--line)', marginTop: 3 }} />}
                  </div>
                  <div style={{ minWidth: 0, fontSize: 13.5 }}>
                    <button onClick={() => nav('/cadastros/' + ev.cadastroId)} style={{ border: 'none', background: 'none', padding: 0, fontWeight: 700, color: '#8e2a46', fontSize: 13.5 }}>{ev.nome}</button>
                    <div style={{ color: 'var(--ink)' }}>{ev.descricao}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ha(ev.createdAt)} · {ev.autor}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Bloco>
      </div>
      {novo && <NovoCadastro onClose={() => setNovo(false)} onCriado={carregar} />}
    </div>
  )
}

function Bloco({ titulo, icone, extra, children }: { titulo: string; icone: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={titulo} style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ color: ROSA, display: 'flex' }}>{icone}</span>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', flex: 1 }}>{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  )
}

function Numero({ titulo, valor, icone, rodape, destaque, alerta, onClick }: { titulo: string; valor: ReactNode; icone: ReactNode; rodape?: ReactNode; destaque?: boolean; alerta?: boolean; onClick?: () => void }) {
  const cor = destaque ? '#fff' : VINHO
  return (
    <div onClick={onClick} className={onClick && !destaque ? 'hoverable' : undefined}
      style={{ ...box, padding: '14px 16px', cursor: onClick ? 'pointer' : undefined, background: destaque ? `linear-gradient(135deg, ${ROSA} 0%, #a93d58 100%)` : '#fff', borderColor: destaque ? ROSA : alerta ? '#f3c3c9' : 'var(--line)', boxShadow: destaque ? '0 6px 18px rgba(169,61,88,.25)' : '0 1px 2px rgba(16,24,40,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: destaque ? 'rgba(255,255,255,.9)' : 'var(--muted)' }}>{titulo}</span>
        <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: destaque ? 'rgba(255,255,255,.2)' : alerta ? '#fdecea' : '#fbe9ee', color: destaque ? '#fff' : alerta ? '#c0392b' : ROSA }}>{icone}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: cor, marginTop: 6, lineHeight: 1.1 }}>{valor}</div>
      {rodape && <div style={{ fontSize: 12.5, marginTop: 4, color: destaque ? 'rgba(255,255,255,.88)' : 'var(--muted)' }}>{rodape}</div>}
    </div>
  )
}
