import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, MessageCircle, Sparkles } from 'lucide-react'
import { api, midiaUrl } from '../lib/api'
import { ClaraLogo } from '../components/extra'
import { Midia } from '../components/Midia'

// Quiz de perfil — 1ª etapa, link aberto (anúncio / bio do Instagram). Uma pergunta por tela,
// cartões grandes, barra de progresso; no fim pede nome, cidade e WhatsApp, "analisa" e mostra
// o resultado. A pontuação fica só no servidor. Cores, logo, imagens e vídeos vêm da "Aparência"
// de cada quiz (editada pela diretoria). ?previa=1 mostra mesmo desligado (pra revisar).
type Opcao = { id: string; texto: string; emoji?: string; imagem?: string }
type Pergunta = { id: string; texto: string; ajuda?: string; imagem?: string; tipo: 'escolha' | 'texto'; opcoes: Opcao[]; mostrarSe: { perguntaId: string; opcoes: string[] } | null }
type Aparencia = { corPrincipal: string; corFundo: string; corTitulo: string; corCabecalho: string; logo: 'clara' | 'propria' | 'nenhuma'; logoUrl?: string; capaUrl?: string; layoutOpcoes: 'lista' | 'grade'; imagemAprovado?: string; imagemReprovado?: string }
type QuizPub = { ativo: boolean; aparencia: Aparencia; titulo: string; subtitulo: string; vantagens: string[]; botaoComecar: string; pedirCidade: boolean; textoAnalisando: string; textoLgpd: string; perguntas: Pergunta[] }
type Resultado = { aprovado: boolean; titulo: string; texto: string; botao?: string; whatsapp?: string | null; imagem?: string | null }

const AP_PADRAO: Aparencia = { corPrincipal: '#8e2a46', corFundo: '#fbf4f6', corTitulo: '#5a2433', corCabecalho: '#f0d0d7', logo: 'clara', layoutOpcoes: 'lista' }
// as cores do quiz viram variáveis CSS na moldura; tudo abaixo usa elas
const P = 'var(--q-p)', T = 'var(--q-t)'
const claro = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`
const cartao: CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', padding: '16px 18px', marginBottom: 10,
  background: '#fff', border: `2px solid ${claro(P, 22)}`, borderRadius: 14, fontSize: 17, color: '#2f2328', boxShadow: '0 2px 8px rgba(0,0,0,.05)', transition: 'all .15s' }
const botao: CSSProperties = { width: '100%', height: 54, border: 'none', borderRadius: 14, background: P, color: '#fff', fontSize: 18, fontWeight: 700, marginTop: 18 }
const input: CSSProperties = { width: '100%', height: 52, padding: '0 14px', border: `2px solid ${claro(P, 22)}`, borderRadius: 12, fontSize: 17, background: '#fff' }
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
  const previa = params.get('previa') === '1'

  const { slug } = useParams()
  const caminho = '/quiz-publico' + (slug ? '/' + encodeURIComponent(slug) : '')
  useEffect(() => { api<QuizPub>('GET', caminho).then(setQ).catch(e => setErro(e.message)) }, [caminho])
  // conta a visita (1 por sessão do navegador) — relatório "cliques x Meta"; prévia da equipe não conta
  useEffect(() => {
    if (previa) return
    let sessao = ''
    try { sessao = sessionStorage.getItem('quiz_sessao') || ''; if (!sessao) { sessao = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('quiz_sessao', sessao) } } catch { /* navegador sem storage */ }
    api('POST', '/quiz-clique' + (slug ? '/' + encodeURIComponent(slug) : ''), {
      sessao: sessao || undefined, colaboradora: params.get('c') || undefined,
      origem: params.get('origem') || params.get('utm_source') || undefined, campanha: params.get('utm_campaign') || params.get('campanha') || undefined,
    }).catch(() => {})
  }, [caminho]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo(0, 0) }, [tela, atual])

  const ap = { ...AP_PADRAO, ...(q?.aparencia || {}) }
  if (erro) return <Moldura ap={ap}><Caixa><h2 style={{ color: T }}>Ops!</h2><p>{erro}</p></Caixa></Moldura>
  if (!q) return <Moldura ap={ap}><div style={{ height: 200 }} /></Moldura>
  if (!q.ativo && !previa) return <Moldura ap={ap}><Caixa><h2 style={{ color: T }}>Teste fechado</h2><p>No momento não estamos recebendo novas inscrições. Volte em breve!</p></Caixa></Moldura>

  const proxima = (r: Record<string, string>, depoisDe: string | null) => {
    const i = depoisDe ? q.perguntas.findIndex(p => p.id === depoisDe) : -1
    return q.perguntas.slice(i + 1).find(p => visivel(p, r)) || null
  }
  const visiveis = q.perguntas.filter(p => visivel(p, resp))
  const pos = atual ? visiveis.findIndex(p => p.id === atual) : visiveis.length
  const progresso = tela === 'intro' ? 0 : tela === 'pergunta' ? (pos + 1) / (visiveis.length + 1) : 1
  const pergunta = q.perguntas.find(p => p.id === atual)
  const grade = ap.layoutOpcoes === 'grade'

  const responder = (valor: string) => {
    if (!pergunta) return
    const r = { ...resp, [pergunta.id]: valor }
    for (const p of q.perguntas) if (!visivel(p, r)) delete r[p.id] // limpa respostas de perguntas que deixaram de aparecer
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
    if (previa && !q.ativo) return setErro2('Pré-visualização: o quiz está desligado, então a resposta não é enviada. Ligue o quiz pra receber respostas.')
    setErro2(''); setEnviando(true); setTela('analisando')
    const inicio = Date.now()
    try {
      const r = await api<Resultado>('POST', caminho, {
        nome: contato.nome, telefone: contato.telefone, cidade: contato.cidade || undefined, respostas: resp, aceite: true,
        origem: params.get('origem') || params.get('utm_source') || undefined, campanha: params.get('utm_campaign') || params.get('campanha') || undefined,
        colaboradora: params.get('c') || undefined,
      })
      await new Promise(ok => setTimeout(ok, Math.max(0, 2800 - (Date.now() - inicio))))
      setRes(r); setTela('resultado')
    } catch (e: any) { setErro2(e.message); setTela('contato') } finally { setEnviando(false) }
  }

  return (
    <Moldura ap={ap} progresso={progresso} voltar={(tela === 'pergunta' || tela === 'contato') ? voltar : undefined}
      aviso={previa && !q.ativo ? 'Pré-visualização — este quiz está desligado e não recebe respostas.' : undefined}>
      {tela === 'intro' && (
        <div style={{ textAlign: 'center', animation: 'fadeUp .3s' }}>
          {ap.capaUrl ? <Midia src={ap.capaUrl} capa style={{ marginBottom: 16 }} /> : <Sparkles size={34} color={ap.corPrincipal} />}
          <h1 style={{ color: T, fontSize: 26, lineHeight: 1.25, margin: '10px 0 10px' }}>{q.titulo}</h1>
          <p style={{ color: '#5b4a50', fontSize: 17, margin: '0 0 20px' }}>{q.subtitulo}</p>
          <div style={{ display: 'grid', gap: 10, textAlign: 'left', marginBottom: 6 }}>
            {q.vantagens.filter(Boolean).map(v => (
              <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 12, padding: '12px 14px', fontSize: 16, color: '#2f2328', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
                <CheckCircle2 size={22} color="#4f8a3a" style={{ flex: 'none' }} />{v}
              </div>))}
          </div>
          <button style={botao} onClick={() => { const p = proxima(resp, null); if (p) { setAtual(p.id); setTela('pergunta') } else setTela('contato') }}>{q.botaoComecar}</button>
        </div>
      )}

      {tela === 'pergunta' && pergunta && (
        <div key={pergunta.id} style={{ animation: 'fadeUp .25s' }}>
          {pergunta.imagem && <Midia src={pergunta.imagem} style={{ marginBottom: 14 }} />}
          <h2 style={{ color: T, fontSize: 23, lineHeight: 1.3, margin: '6px 0 6px', textAlign: 'center' }}>{pergunta.texto}</h2>
          {pergunta.ajuda && <p style={{ textAlign: 'center', color: '#6d5b61', fontSize: 15, margin: '0 0 14px' }}>{pergunta.ajuda}</p>}
          <div style={{ marginTop: 16, ...(grade && pergunta.tipo === 'escolha' ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 } : {}) }}>
            {pergunta.tipo === 'escolha'
              ? pergunta.opcoes.map(o => {
                  const marcada = resp[pergunta.id] === o.id
                  const borda = { borderColor: marcada ? ap.corPrincipal : undefined, background: marcada ? claro(P, 10) : '#fff' }
                  if (grade) return (
                    <button key={o.id} onClick={() => responder(o.id)}
                      style={{ ...cartao, ...borda, flexDirection: 'column', alignItems: 'stretch', padding: 0, marginBottom: 0, overflow: 'hidden', textAlign: 'center', gap: 0 }}>
                      {o.imagem
                        ? <img src={midiaUrl(o.imagem)} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, background: claro(P, 8) }}>{o.emoji || '✨'}</div>}
                      <span style={{ padding: '10px 8px', fontSize: 15.5, fontWeight: 700 }}>{o.texto}</span>
                    </button>)
                  return (
                    <button key={o.id} onClick={() => responder(o.id)} style={{ ...cartao, ...borda }}>
                      {o.imagem ? <img src={midiaUrl(o.imagem)} alt="" loading="lazy" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flex: 'none' }} />
                        : o.emoji && <span style={{ fontSize: 26, lineHeight: 1 }}>{o.emoji}</span>}
                      <span style={{ flex: 1 }}>{o.texto}</span>
                    </button>)
                })
              : <TextoLivre valor={resp[pergunta.id] || ''} onOk={responder} />}
          </div>
        </div>
      )}

      {tela === 'contato' && (
        <div style={{ animation: 'fadeUp .25s' }}>
          <h2 style={{ color: T, fontSize: 23, margin: '6px 0 4px', textAlign: 'center' }}>Falta pouco! 💖</h2>
          <p style={{ textAlign: 'center', color: '#5b4a50', fontSize: 16, margin: '0 0 16px' }}>Pra ver o seu resultado, informe os seus dados:</p>
          <label style={lbl}>Seu nome completo</label>
          <input style={input} value={contato.nome} autoComplete="name" onChange={e => setContato({ ...contato, nome: e.target.value })} />
          <label style={lbl}>Seu WhatsApp (com DDD)</label>
          <input style={input} inputMode="tel" autoComplete="tel" placeholder="(14) 99999-9999" value={contato.telefone} onChange={e => setContato({ ...contato, telefone: mascTel(e.target.value) })} />
          <p style={{ fontSize: 13, color: '#8a5262', margin: '6px 2px 0' }}>Confira o número — é por ele que vamos falar com você.</p>
          {q.pedirCidade && <>
            <label style={lbl}>Sua cidade e estado</label>
            <input style={input} placeholder="Ex.: Bauru/SP" value={contato.cidade} onChange={e => setContato({ ...contato, cidade: e.target.value })} />
          </>}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 14, color: '#3b2a30', lineHeight: 1.4 }}>
            <input type="checkbox" checked={contato.aceite} onChange={e => setContato({ ...contato, aceite: e.target.checked })} style={{ width: 22, height: 22, flex: 'none', accentColor: ap.corPrincipal }} />
            {q.textoLgpd}
          </label>
          {erro2 && <p style={{ color: '#c0392b', fontWeight: 700, margin: '12px 0 0' }}>{erro2}</p>}
          <button style={botao} disabled={enviando} onClick={enviar}>Ver meu resultado</button>
        </div>
      )}

      {tela === 'analisando' && (
        <div style={{ textAlign: 'center', padding: '40px 0', animation: 'fadeUp .25s' }}>
          <div style={{ width: 54, height: 54, margin: '0 auto 20px', border: `5px solid ${claro(P, 22)}`, borderTopColor: ap.corPrincipal, borderRadius: '50%', animation: 'spin .9s linear infinite' }} />
          <h2 style={{ color: T, fontSize: 22 }}>{q.textoAnalisando}</h2>
          <p style={{ color: '#5b4a50' }}>Só um instante.</p>
        </div>
      )}

      {tela === 'resultado' && res && (
        <div style={{ textAlign: 'center', animation: 'fadeUp .3s' }}>
          {res.imagem ? <Midia src={res.imagem} style={{ marginBottom: 14 }} /> : <div style={{ fontSize: 54 }}>{res.aprovado ? '🎉' : '💛'}</div>}
          <h2 style={{ color: res.aprovado ? T : '#5b4a50', fontSize: 24, lineHeight: 1.3, margin: '8px 0 10px' }}>{res.titulo}</h2>
          <p style={{ color: '#3b2a30', fontSize: 17, lineHeight: 1.5 }}>{res.texto}</p>
          {res.aprovado && res.whatsapp && <>
            <div style={{ background: '#fff4d6', color: '#7a5200', borderRadius: 12, padding: '10px 14px', fontSize: 14, fontWeight: 700, marginTop: 14 }}>
              ⚠️ Ao tocar no botão, o WhatsApp abre com a mensagem pronta. É só enviar pra garantir a sua vaga!
            </div>
            <a href={res.whatsapp} style={{ ...botao, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#1f9d55', textDecoration: 'none' }}>
              <MessageCircle size={22} /> {res.botao || 'Enviar no WhatsApp'}
            </a>
          </>}
          {res.aprovado && !res.whatsapp && <p style={{ color: '#5b4a50', fontWeight: 700 }}>Uma consultora vai te chamar no WhatsApp em breve. 💖</p>}
        </div>
      )}
    </Moldura>
  )
}

const lbl: CSSProperties = { display: 'block', fontSize: 15, fontWeight: 700, margin: '14px 0 6px', color: '#3b2a30' }

function TextoLivre({ valor, onOk }: { valor: string; onOk: (v: string) => void }) {
  const [v, setV] = useState(valor)
  return <>
    <textarea value={v} onChange={e => setV(e.target.value)} rows={4} maxLength={500}
      style={{ ...input, height: 'auto', padding: 14, resize: 'vertical' }} placeholder="Escreva aqui…" />
    <button style={botao} disabled={v.trim().length < 2} onClick={() => onOk(v.trim())}>Continuar</button>
  </>
}

function Caixa({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', borderRadius: 14, padding: '26px 20px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.08)' }}>{children}</div>
}

/** Moldura com as cores do quiz (variáveis CSS), logo escolhido, barra de progresso e aviso de prévia. */
export function Moldura({ ap, children, progresso, voltar, aviso }: { ap: Aparencia; children: React.ReactNode; progresso?: number; voltar?: () => void; aviso?: string }) {
  const vars = { '--q-p': ap.corPrincipal, '--q-t': ap.corTitulo } as CSSProperties
  return (
    <div style={{ minHeight: '100vh', background: ap.corFundo, ...vars }}>
      {aviso && <div style={{ background: '#2f2328', color: '#fff', fontSize: 13, textAlign: 'center', padding: '6px 12px' }}>{aviso}</div>}
      {(ap.logo !== 'nenhuma' || voltar) && (
        <header style={{ background: ap.corCabecalho, padding: '14px 16px', minHeight: 56, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {voltar && <button onClick={voltar} aria-label="Voltar" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 8, color: ap.corTitulo }}><ArrowLeft size={24} /></button>}
          {ap.logo === 'clara' && <ClaraLogo width={140} color={ap.corTitulo} center />}
          {ap.logo === 'propria' && ap.logoUrl && <img src={midiaUrl(ap.logoUrl)} alt="Logo" style={{ maxHeight: 48, maxWidth: 200, objectFit: 'contain' }} />}
        </header>)}
      {progresso !== undefined && (
        <div style={{ height: 6, background: `color-mix(in srgb, ${ap.corPrincipal} 22%, white)` }}>
          <div style={{ height: '100%', width: `${Math.round(progresso * 100)}%`, background: ap.corPrincipal, transition: 'width .3s' }} />
        </div>)}
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '22px 16px 60px' }}>{children}</main>
    </div>
  )
}
