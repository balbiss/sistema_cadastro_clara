import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, MessageCircle, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { ClaraLogo } from '../components/extra'

// Quiz de perfil — 1ª etapa, link aberto (anúncio / bio do Instagram). Uma pergunta por tela,
// cartões grandes, barra de progresso; no fim pede nome, cidade e WhatsApp, "analisa" e mostra
// o resultado. A pontuação fica só no servidor.
type Opcao = { id: string; texto: string; emoji?: string }
type Pergunta = { id: string; texto: string; ajuda?: string; tipo: 'escolha' | 'texto'; opcoes: Opcao[]; mostrarSe: { perguntaId: string; opcoes: string[] } | null }
type QuizPub = { ativo: boolean; titulo: string; subtitulo: string; vantagens: string[]; botaoComecar: string; pedirCidade: boolean; textoAnalisando: string; textoLgpd: string; perguntas: Pergunta[] }
type Resultado = { aprovado: boolean; titulo: string; texto: string; botao?: string; whatsapp?: string | null }

const VINHO = '#5a2433', BTN = '#8e2a46', FUNDO = '#fbf4f6'
const cartao: CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', padding: '16px 18px', marginBottom: 10,
  background: '#fff', border: '2px solid #ead3da', borderRadius: 14, fontSize: 17, color: '#3b1d26', boxShadow: '0 2px 8px rgba(90,36,51,.05)', transition: 'all .15s' }
const botao: CSSProperties = { width: '100%', height: 54, border: 'none', borderRadius: 14, background: BTN, color: '#fff', fontSize: 18, fontWeight: 700, marginTop: 18 }
const input: CSSProperties = { width: '100%', height: 52, padding: '0 14px', border: '2px solid #ead3da', borderRadius: 12, fontSize: 17, background: '#fff' }
const mascTel = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
const visivel = (p: Pergunta, r: Record<string, string>) => !p.mostrarSe || p.mostrarSe.opcoes.includes(r[p.mostrarSe.perguntaId])

export default function Quiz() {
  const [q, setQ] = useState<QuizPub | null>(null)
  const [erro, setErro] = useState('')
  const [tela, setTela] = useState<'intro' | 'pergunta' | 'contato' | 'analisando' | 'resultado'>('intro')
  const [resp, setResp] = useState<Record<string, string>>({})
  const [hist, setHist] = useState<string[]>([]) // perguntas respondidas, na ordem (pro "voltar")
  const [atual, setAtual] = useState<string | null>(null)
  const [contato, setContato] = useState({ nome: '', telefone: '', cidade: '', aceite: false })
  const [res, setRes] = useState<Resultado | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro2, setErro2] = useState('')
  const params = useMemo(() => new URLSearchParams(window.location.search), [])

  const { slug } = useParams()
  const caminho = '/quiz-publico' + (slug ? '/' + encodeURIComponent(slug) : '')
  useEffect(() => { api<QuizPub>('GET', caminho).then(setQ).catch(e => setErro(e.message)) }, [caminho])
  useEffect(() => { window.scrollTo(0, 0) }, [tela, atual])

  if (erro) return <Moldura><Caixa><h2 style={{ color: VINHO }}>Ops!</h2><p>{erro}</p></Caixa></Moldura>
  if (!q) return <Moldura><div style={{ height: 200 }} /></Moldura>
  if (!q.ativo) return <Moldura><Caixa><h2 style={{ color: VINHO }}>Teste fechado</h2><p>No momento não estamos recebendo novas inscrições. Volte em breve!</p></Caixa></Moldura>

  const proxima = (r: Record<string, string>, depoisDe: string | null) => {
    const i = depoisDe ? q.perguntas.findIndex(p => p.id === depoisDe) : -1
    return q.perguntas.slice(i + 1).find(p => visivel(p, r)) || null
  }
  const visiveis = q.perguntas.filter(p => visivel(p, resp))
  const pos = atual ? visiveis.findIndex(p => p.id === atual) : visiveis.length
  const progresso = tela === 'intro' ? 0 : tela === 'pergunta' ? (pos + 1) / (visiveis.length + 1) : 1
  const pergunta = q.perguntas.find(p => p.id === atual)

  const responder = (valor: string) => {
    if (!pergunta) return
    const r = { ...resp, [pergunta.id]: valor }
    // limpa respostas de perguntas que deixaram de aparecer
    for (const p of q.perguntas) if (!visivel(p, r)) delete r[p.id]
    setResp(r); setHist(h => [...h, pergunta.id])
    const prox = proxima(r, pergunta.id)
    if (prox) setAtual(prox.id); else { setAtual(null); setTela('contato') }
  }
  const voltar = () => {
    if (tela === 'contato' || tela === 'pergunta') {
      const h = [...hist]; const anterior = h.pop()
      setHist(h)
      if (anterior) { setAtual(anterior); setTela('pergunta') } else setTela('intro')
    }
  }
  const enviar = async () => {
    if (contato.nome.trim().length < 3) return setErro2('Digite o seu nome completo.')
    if (contato.telefone.replace(/\D/g, '').length < 10) return setErro2('Confira o seu WhatsApp com DDD.')
    if (q.pedirCidade && !contato.cidade.trim()) return setErro2('Digite a sua cidade.')
    if (!contato.aceite) return setErro2('Marque a autorização para continuar.')
    setErro2(''); setEnviando(true); setTela('analisando')
    const inicio = Date.now()
    try {
      const r = await api<Resultado>('POST', caminho, {
        nome: contato.nome, telefone: contato.telefone, cidade: contato.cidade || undefined, respostas: resp, aceite: true,
        origem: params.get('origem') || params.get('utm_source') || undefined, campanha: params.get('utm_campaign') || params.get('campanha') || undefined,
      })
      await new Promise(ok => setTimeout(ok, Math.max(0, 2800 - (Date.now() - inicio))))
      setRes(r); setTela('resultado')
    } catch (e: any) { setErro2(e.message); setTela('contato') } finally { setEnviando(false) }
  }

  return (
    <Moldura progresso={progresso} voltar={(tela === 'pergunta' || tela === 'contato') ? voltar : undefined}>
      {tela === 'intro' && (
        <div style={{ textAlign: 'center', animation: 'fadeUp .3s' }}>
          <Sparkles size={34} color={BTN} />
          <h1 style={{ color: VINHO, fontSize: 26, lineHeight: 1.25, margin: '10px 0 10px' }}>{q.titulo}</h1>
          <p style={{ color: '#6b3a48', fontSize: 17, margin: '0 0 20px' }}>{q.subtitulo}</p>
          <div style={{ display: 'grid', gap: 10, textAlign: 'left', marginBottom: 6 }}>
            {q.vantagens.filter(Boolean).map(v => (
              <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 12, padding: '12px 14px', fontSize: 16, color: '#3b1d26', boxShadow: '0 2px 8px rgba(90,36,51,.05)' }}>
                <CheckCircle2 size={22} color="#4f8a3a" style={{ flex: 'none' }} />{v}
              </div>))}
          </div>
          <button style={botao} onClick={() => { const p = proxima(resp, null); if (p) { setAtual(p.id); setTela('pergunta') } else setTela('contato') }}>{q.botaoComecar}</button>
        </div>
      )}

      {tela === 'pergunta' && pergunta && (
        <div key={pergunta.id} style={{ animation: 'fadeUp .25s' }}>
          <h2 style={{ color: VINHO, fontSize: 23, lineHeight: 1.3, margin: '6px 0 6px', textAlign: 'center' }}>{pergunta.texto}</h2>
          {pergunta.ajuda && <p style={{ textAlign: 'center', color: '#85525f', fontSize: 15, margin: '0 0 14px' }}>{pergunta.ajuda}</p>}
          <div style={{ marginTop: 16 }}>
            {pergunta.tipo === 'escolha'
              ? pergunta.opcoes.map(o => {
                  const marcada = resp[pergunta.id] === o.id
                  return (
                    <button key={o.id} onClick={() => responder(o.id)}
                      style={{ ...cartao, borderColor: marcada ? BTN : '#ead3da', background: marcada ? '#fbe9ee' : '#fff' }}>
                      {o.emoji && <span style={{ fontSize: 26, lineHeight: 1 }}>{o.emoji}</span>}
                      <span style={{ flex: 1 }}>{o.texto}</span>
                    </button>)
                })
              : <TextoLivre valor={resp[pergunta.id] || ''} onOk={responder} />}
          </div>
        </div>
      )}

      {tela === 'contato' && (
        <div style={{ animation: 'fadeUp .25s' }}>
          <h2 style={{ color: VINHO, fontSize: 23, margin: '6px 0 4px', textAlign: 'center' }}>Falta pouco! 💖</h2>
          <p style={{ textAlign: 'center', color: '#6b3a48', fontSize: 16, margin: '0 0 16px' }}>Pra ver o seu resultado, informe os seus dados:</p>
          <label style={lbl}>Seu nome completo</label>
          <input style={input} value={contato.nome} autoComplete="name" onChange={e => setContato({ ...contato, nome: e.target.value })} />
          <label style={lbl}>Seu WhatsApp (com DDD)</label>
          <input style={input} inputMode="tel" autoComplete="tel" placeholder="(14) 99999-9999" value={contato.telefone} onChange={e => setContato({ ...contato, telefone: mascTel(e.target.value) })} />
          <p style={{ fontSize: 13, color: '#a0465d', margin: '6px 2px 0' }}>Confira o número — é por ele que vamos falar com você.</p>
          {q.pedirCidade && <>
            <label style={lbl}>Sua cidade e estado</label>
            <input style={input} placeholder="Ex.: Bauru/SP" value={contato.cidade} onChange={e => setContato({ ...contato, cidade: e.target.value })} />
          </>}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 14, color: '#4a2430', lineHeight: 1.4 }}>
            <input type="checkbox" checked={contato.aceite} onChange={e => setContato({ ...contato, aceite: e.target.checked })} style={{ width: 22, height: 22, flex: 'none', accentColor: BTN }} />
            {q.textoLgpd}
          </label>
          {erro2 && <p style={{ color: '#c0392b', fontWeight: 700, margin: '12px 0 0' }}>{erro2}</p>}
          <button style={botao} disabled={enviando} onClick={enviar}>Ver meu resultado</button>
        </div>
      )}

      {tela === 'analisando' && (
        <div style={{ textAlign: 'center', padding: '40px 0', animation: 'fadeUp .25s' }}>
          <div style={{ width: 54, height: 54, margin: '0 auto 20px', border: '5px solid #ead3da', borderTopColor: BTN, borderRadius: '50%', animation: 'spin .9s linear infinite' }} />
          <h2 style={{ color: VINHO, fontSize: 22 }}>{q.textoAnalisando}</h2>
          <p style={{ color: '#6b3a48' }}>Só um instante.</p>
        </div>
      )}

      {tela === 'resultado' && res && (
        <div style={{ textAlign: 'center', animation: 'fadeUp .3s' }}>
          <div style={{ fontSize: 54 }}>{res.aprovado ? '🎉' : '💛'}</div>
          <h2 style={{ color: res.aprovado ? VINHO : '#6b3a48', fontSize: 24, lineHeight: 1.3, margin: '8px 0 10px' }}>{res.titulo}</h2>
          <p style={{ color: '#4a2430', fontSize: 17, lineHeight: 1.5 }}>{res.texto}</p>
          {res.aprovado && res.whatsapp && <>
            <div style={{ background: '#fff4d6', color: '#7a5200', borderRadius: 12, padding: '10px 14px', fontSize: 14, fontWeight: 700, marginTop: 14 }}>
              ⚠️ Ao tocar no botão, o WhatsApp abre com a mensagem pronta. É só enviar pra garantir a sua vaga!
            </div>
            <a href={res.whatsapp} style={{ ...botao, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#1f9d55', textDecoration: 'none' }}>
              <MessageCircle size={22} /> {res.botao || 'Enviar no WhatsApp'}
            </a>
          </>}
          {res.aprovado && !res.whatsapp && <p style={{ color: '#6b3a48', fontWeight: 700 }}>Uma consultora vai te chamar no WhatsApp em breve. 💖</p>}
        </div>
      )}
    </Moldura>
  )
}

const lbl: CSSProperties = { display: 'block', fontSize: 15, fontWeight: 700, margin: '14px 0 6px', color: '#4a2430' }

function TextoLivre({ valor, onOk }: { valor: string; onOk: (v: string) => void }) {
  const [v, setV] = useState(valor)
  return <>
    <textarea value={v} onChange={e => setV(e.target.value)} rows={4} maxLength={500}
      style={{ ...input, height: 'auto', padding: 14, resize: 'vertical' }} placeholder="Escreva aqui…" />
    <button style={botao} disabled={v.trim().length < 2} onClick={() => onOk(v.trim())}>Continuar</button>
  </>
}

function Caixa({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', borderRadius: 14, padding: '26px 20px', textAlign: 'center', boxShadow: '0 2px 10px rgba(90,36,51,.08)' }}>{children}</div>
}

function Moldura({ children, progresso, voltar }: { children: React.ReactNode; progresso?: number; voltar?: () => void }) {
  return (
    <div style={{ minHeight: '100vh', background: FUNDO }}>
      <header style={{ background: '#f0d0d7', padding: '14px 16px', position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {voltar && <button onClick={voltar} aria-label="Voltar" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 8, color: VINHO }}><ArrowLeft size={24} /></button>}
        <ClaraLogo width={140} color={VINHO} center />
      </header>
      {progresso !== undefined && (
        <div style={{ height: 6, background: '#ead3da' }}>
          <div style={{ height: '100%', width: `${Math.round(progresso * 100)}%`, background: BTN, transition: 'width .3s' }} />
        </div>)}
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '22px 16px 60px' }}>{children}</main>
    </div>
  )
}
