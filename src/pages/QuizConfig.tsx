import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Copy, ExternalLink, Plus, Trash2, ArrowLeft, CopyPlus, Pencil, Eye, Image as ImageIcon, Upload, Youtube } from 'lucide-react'
import Swal from 'sweetalert2'
import { api, midiaUrl, usuarioAtual } from '../lib/api'
import { Midia, idYoutube } from '../components/Midia'
import { Card, Modal, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, PageHeader, toast, vazio } from '../components/extra'

// Quiz de perfil (1ª etapa, link aberto). Aba Respostas = relatório; aba Perguntas = editor do quiz
// (perguntas, opções, pontos, eliminatórias, condicionais, nota de corte, textos e WhatsApp).
type Opcao = { id: string; texto: string; emoji?: string; imagem?: string; pontos: number; elimina?: boolean }
type Pergunta = { id: string; texto: string; ajuda?: string; imagem?: string; tipo: 'escolha' | 'texto'; opcoes: Opcao[]; mostrarSe?: { perguntaId: string; opcoes: string[] } | null }
type Aparencia = { corPrincipal: string; corFundo: string; corTitulo: string; corCabecalho: string; logo: 'clara' | 'propria' | 'nenhuma'; logoUrl?: string; capaUrl?: string; layoutOpcoes: 'lista' | 'grade'; imagemAprovado?: string; imagemReprovado?: string }
type Quiz = {
  aparencia: Aparencia
  ativo: boolean; titulo: string; subtitulo: string; vantagens: string[]; botaoComecar: string; perguntas: Pergunta[]; notaCorte: number
  pedirCidade: boolean; textoAnalisando: string; aprovado: { titulo: string; texto: string; botao: string; mensagemWhatsapp: string }
  reprovado: { titulo: string; texto: string }; whatsapp: string; textoLgpd: string
}

const novoId = (p: string) => p + '_' + Math.random().toString(36).slice(2, 7)
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const telFmt = (t: string) => t.replace(/^55/, '').replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')

export default function QuizConfig() {
  const { id } = useParams()
  const [aba, setAba] = useState<'quizzes' | 'respostas'>('quizzes')
  if (id) return <Editor id={Number(id)} />
  return (
    <div>
      <PageHeader title="Quizzes de perfil" subtitle="1ª etapa: links abertos pra anúncio e Instagram. Quem passa vira cadastro e o CRM é avisado." />
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
        {([['quizzes', 'Quizzes'], ['respostas', 'Respostas']] as [typeof aba, string][]).map(([k, n]) => (
          <button key={k} onClick={() => setAba(k)} style={{ background: 'none', border: 'none', padding: '10px 14px', fontSize: 14, fontWeight: 700,
            color: aba === k ? 'var(--vinho)' : 'var(--muted)', borderBottom: `3px solid ${aba === k ? 'var(--terra)' : 'transparent'}`, marginBottom: -1 }}>{n}</button>))}
      </div>
      {aba === 'quizzes' ? <Lista /> : <Respostas />}
    </div>
  )
}

// ---------------- Lista de quizzes (criar, editar, duplicar, ligar/desligar, excluir) ----------------
function Lista() {
  const nav = useNavigate()
  const diretoria = usuarioAtual()?.role === 'diretoria'
  const [lista, setLista] = useState<any[] | null>(null)
  const [novo, setNovo] = useState<{ nome: string; base: string } | null>(null)
  const carregar = () => api('GET', '/quizzes').then(setLista)
  useEffect(() => { carregar() }, [])
  if (!lista) return <Carregando />
  const criar = async () => {
    if (!novo || novo.nome.trim().length < 2) return toast('Dê um nome ao quiz', 'error')
    try { const r = await api('POST', '/quizzes', { nome: novo.nome, base: novo.base }); setNovo(null); toast('Quiz criado (desligado) — revise e ligue'); nav('/quiz-perfil/' + r.id) }
    catch (e) { toast((e as Error).message, 'error') }
  }
  const duplicar = async (q: any) => {
    const r = await api('POST', '/quizzes', { nome: q.nome + ' (cópia)', copiarDe: q.id }); toast('Cópia criada (desligada)'); nav('/quiz-perfil/' + r.id)
  }
  const ligar = async (q: any) => { await api('POST', `/quizzes/${q.id}/ativo`, { ativo: !q.ativo }); toast(q.ativo ? 'Quiz desligado — o link mostra "teste fechado"' : 'Quiz ligado — já recebe respostas'); carregar() }
  const principal = async (q: any) => { await api('POST', `/quizzes/${q.id}/padrao`); toast('Agora é o quiz do link curto /quiz'); carregar() }
  const excluir = async (q: any) => {
    const ok = await Swal.fire({ title: `Excluir "${q.nome}"?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', confirmButtonColor: '#d93025',
      html: `O link deixa de funcionar. As <b>${q.respostas}</b> resposta(s) e os cadastros que vieram dele continuam guardados.` })
    if (!ok.isConfirmed) return
    try { await api('DELETE', '/quizzes/' + q.id); toast('Quiz excluído'); carregar() } catch (e) { toast((e as Error).message, 'error') }
  }
  return (
    <div>
      {diretoria && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={btn('primary')} onClick={() => setNovo({ nome: '', base: 'modelo' })}><Plus size={15} /> Novo quiz</button></div>}
      {!lista.length ? <div style={vazio}>Nenhum quiz ainda.</div> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {lista.map(q => (
            <div key={q.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 16, color: 'var(--vinho)' }}>{q.nome}</b>
                  <span style={{ ...pill, background: q.ativo ? '#ccff66' : '#d5d8db' }}>{q.ativo ? 'Ligado' : 'Desligado'}</span>
                  {q.padrao && <span style={{ ...pill, background: '#fbe9ee', color: 'var(--vinho)' }}>Link principal</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, wordBreak: 'break-all' }}>{q.link}</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>{q.perguntas} perguntas · corte {q.notaCorte} pts · <b>{q.respostas}</b> respostas · <b>{q.aprovadas}</b> aprovadas{q.ultimaResposta ? ' · última ' + dataHora(q.ultimaResposta) : ''}{!q.whatsapp && <span style={{ color: '#8a5a00' }}> · sem WhatsApp</span>}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={btn('ghost', { minHeight: 30 })} onClick={() => { navigator.clipboard.writeText(q.link); toast('Link copiado') }}><Copy size={14} /> Link</button>
                <a href={q.link} target="_blank" rel="noreferrer" style={btn('ghost', { minHeight: 30 })}><ExternalLink size={14} /> Abrir</a>
                {diretoria && <>
                  <button style={btn('primary', { minHeight: 30 })} onClick={() => nav('/quiz-perfil/' + q.id)}><Pencil size={14} /> Editar</button>
                  <button style={btn('ghost', { minHeight: 30 })} onClick={() => ligar(q)}>{q.ativo ? 'Desligar' : 'Ligar'}</button>
                  <button style={btn('ghost', { minHeight: 30 })} onClick={() => duplicar(q)}><CopyPlus size={14} /> Duplicar</button>
                  {!q.padrao && <button style={btn('ghost', { minHeight: 30 })} title="Passa a abrir no link curto /quiz" onClick={() => principal(q)}>Tornar principal</button>}
                  <button style={btn('ghost', { minHeight: 30, color: '#c0392b' })} onClick={() => excluir(q)}><Trash2 size={14} /></button>
                </>}
              </div>
            </div>))}
        </div>)}
      {novo && (
        <Modal title="Novo quiz" subtitle="Ele nasce desligado: você revisa as perguntas e liga quando estiver pronto." onClose={() => setNovo(null)}
          footer={<><button style={btn('ghost')} onClick={() => setNovo(null)}>Cancelar</button><button style={btn('primary')} onClick={criar}>Criar</button></>}>
          <label style={labelStyle}>Nome (vira o link)</label>
          <input autoFocus value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Quiz Instagram, Campanha Black Friday" style={inputStyle} />
          <label style={{ ...labelStyle, marginTop: 12 }}>Começar com</label>
          {[['modelo', 'As perguntas do modelo da Clara (15 perguntas, depois você ajusta)'], ['branco', 'Em branco (1 pergunta de exemplo)']].map(([k, n]) => (
            <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, padding: '4px 0' }}>
              <input type="radio" checked={novo.base === k} onChange={() => setNovo({ ...novo, base: k })} /> {n}</label>))}
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '10px 0 0' }}>Pra copiar um quiz que já existe, use "Duplicar" na lista.</p>
        </Modal>)}
    </div>
  )
}

// ---------------- Respostas (relatório do quiz) ----------------
function Respostas() {
  const nav = useNavigate()
  const [filtro, setFiltro] = useState('todas')
  const [quizSel, setQuizSel] = useState('')
  const [quizzes, setQuizzes] = useState<any[]>([])
  const [d, setD] = useState<any>(null)
  const [ver, setVer] = useState<any>(null)
  useEffect(() => { api('GET', '/quizzes').then(setQuizzes) }, [])
  useEffect(() => { setD(null); api('GET', '/quiz/respostas?filtro=' + filtro + (quizSel ? '&quiz=' + quizSel : '')).then(setD) }, [filtro, quizSel])
  if (!d) return <Carregando />
  const r = d.resumo
  const quadro = (titulo: string, valor: ReactNode, sub?: string) => (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: '14px 16px', flex: '1 1 150px' }}>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--vinho)' }}>{valor}</div>
      {sub && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sub}</div>}
    </div>)
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {quadro('Responderam', r.total, `${r.ultimos30} nos últimos 30 dias`)}
        {quadro('Perfil aprovado', r.aprovadas, r.total ? `${Math.round((r.aprovadas / r.total) * 100)}% de quem respondeu` : undefined)}
        {quadro('Não passaram', r.total - r.aprovadas)}
        {quadro('Pontuação média', Math.round(r.media * 10) / 10)}
      </div>
      {d.porOrigem.length > 0 && (
        <Card title="Por origem (últimos 30 dias)" style={{ marginBottom: 16 }}>
          <div style={{ padding: '6px 16px 12px', display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14 }}>
            {d.porOrigem.map((o: any) => <span key={o.origem || '-'}><b>{o.origem || 'Sem origem'}</b>: {o.total} responderam · {o.aprovadas} aprovadas</span>)}
          </div>
        </Card>)}
      <Card title="Quem respondeu" right={<div style={{ display: 'flex', gap: 6 }}>
        <select value={quizSel} onChange={e => setQuizSel(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="">Todos os quizzes</option>{quizzes.map(q => <option key={q.id} value={q.id}>{q.nome}</option>)}</select>
        <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="todas">Todas</option><option value="aprovadas">Só aprovadas</option><option value="reprovadas">Só não aprovadas</option>
        </select></div>}>
        {!d.lista.length ? <div style={vazio}>Ninguém respondeu ainda. Divulgue o link do quiz (aba "Perguntas e telas").</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12, textTransform: 'uppercase' }}>
                {['Quando', 'Quiz', 'Nome', 'WhatsApp', 'Cidade', 'Pontos', 'Resultado', 'Origem', ''].map(h => <th key={h} style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>{h}</th>)}
              </tr></thead>
              <tbody>{d.lista.map((x: any) => (
                <tr key={x.id} className="linha" style={{ cursor: 'pointer' }} onClick={() => setVer(x)}>
                  <td style={td}>{dataHora(x.createdAt)}</td><td style={td}>{x.quizNome || '—'}</td><td style={td}><b>{x.nome}</b></td><td style={td}>{telFmt(x.telefone)}</td>
                  <td style={td}>{x.cidade || '—'}</td><td style={td}>{x.pontos}</td>
                  <td style={td}><span style={{ ...pill, background: x.aprovado ? '#ccff66' : '#ffc8c8' }}>{x.aprovado ? 'Aprovada' : 'Não passou'}</span></td>
                  <td style={td}>{x.origem || '—'}</td>
                  <td style={td}>{x.cadastroId && <button style={btn('soft', { minHeight: 28 })} onClick={e => { e.stopPropagation(); nav('/cadastros/' + x.cadastroId) }}>Cadastro</button>}</td>
                </tr>))}</tbody>
            </table>
          </div>)}
      </Card>
      {ver && (
        <Modal title={ver.nome} subtitle={`${telFmt(ver.telefone)} · ${ver.cidade || 'sem cidade'} · ${dataHora(ver.createdAt)}`} onClose={() => setVer(null)} width={560}>
          <p style={{ margin: '0 0 10px' }}><b>{ver.pontos} pontos</b> — {ver.aprovado ? 'perfil aprovado' : 'não passou'}{ver.campanha ? ` · campanha ${ver.campanha}` : ''}</p>
          {ver.eliminatorias?.length > 0 && <p style={{ color: '#c0392b', margin: '0 0 10px' }}>Resposta eliminatória: {ver.eliminatorias.join('; ')}</p>}
          {ver.itens.map((i: any, k: number) => (
            <div key={k} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{i.pergunta}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{i.resposta}</span><span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{i.pontos} pt</span></div>
            </div>))}
        </Modal>)}
    </div>
  )
}
const td: CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }
const pill: CSSProperties = { padding: '2px 8px', borderRadius: 2, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: '#313942' }

// ---------------- Editor ----------------
function Editor({ id }: { id: number }) {
  const nav = useNavigate()
  const [q, setQ] = useState<Quiz | null>(null)
  const [meta, setMeta] = useState({ nome: '', slug: '', link: '', padrao: false })
  const [salvando, setSalvando] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  useEffect(() => { api('GET', '/quizzes/' + id).then(r => { setQ(r.quiz); setMeta({ nome: r.nome, slug: r.slug, link: r.link, padrao: r.padrao }) }).catch(e => { toast(e.message, 'error'); nav('/quiz-perfil') }) }, [id])
  if (!q) return <Carregando />
  const link = meta.link

  const set = (patch: Partial<Quiz>) => setQ({ ...q, ...patch })
  const setAp = (patch: Partial<Aparencia>) => setQ({ ...q, aparencia: { ...q.aparencia, ...patch } })
  const setP = (id: string, patch: Partial<Pergunta>) => set({ perguntas: q.perguntas.map(p => p.id === id ? { ...p, ...patch } : p) })
  const mover = (i: number, d: number) => { const ps = [...q.perguntas]; const [x] = ps.splice(i, 1); ps.splice(i + d, 0, x); set({ perguntas: ps }) }
  const maxPontos = q.perguntas.reduce((a, p) => a + (p.tipo === 'escolha' && !p.mostrarSe ? Math.max(0, ...p.opcoes.map(o => o.pontos)) : 0), 0)
  const salvar = async () => {
    setSalvando(true)
    try { const r = await api('PUT', '/quizzes/' + id, { nome: meta.nome, slug: meta.slug, quiz: q }); setQ(r.quiz); setMeta({ nome: r.nome, slug: r.slug, link: r.link, padrao: r.padrao }); toast('Quiz salvo — já vale pra quem abrir o link') }
    catch (e) { toast((e as Error).message, 'error') } finally { setSalvando(false) }
  }
  const campo = (titulo: string, el: ReactNode, ajuda?: string) => (
    <div style={{ marginBottom: 12 }}><label style={labelStyle}>{titulo}</label>{el}{ajuda && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{ajuda}</div>}</div>)
  const txt = (v: string, on: (s: string) => void, area = false) => area
    ? <textarea value={v} rows={3} onChange={e => on(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
    : <input value={v} onChange={e => on(e.target.value)} style={inputStyle} />

  return (
    <div>
      <button onClick={() => nav('/quiz-perfil')} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13.5, padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={15} /> Voltar aos quizzes</button>
      <PageHeader title={meta.nome || 'Quiz'} subtitle="Perguntas, pontos, condições e textos deste quiz." />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 240px' }}><label style={labelStyle}>Nome do quiz</label><input value={meta.nome} onChange={e => setMeta({ ...meta, nome: e.target.value })} style={inputStyle} /></div>
        <div style={{ flex: '1 1 240px' }}><label style={labelStyle}>Link (endereço){meta.padrao ? ' — é o principal, também abre em /quiz' : ''}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>/quiz/</span>
            <input value={meta.slug} onChange={e => setMeta({ ...meta, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} style={inputStyle} /></div></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: '12px 14px' }}>
        <span style={{ fontSize: 14 }}>Link do quiz:</span>
        <code style={{ background: 'var(--card-2)', padding: '4px 8px', borderRadius: 3, fontSize: 13.5, wordBreak: 'break-all' }}>{link}</code>
        <button style={btn('ghost', { minHeight: 30 })} onClick={() => { navigator.clipboard.writeText(link); toast('Link copiado') }}><Copy size={14} /> Copiar</button>
        <a href={link} target="_blank" rel="noreferrer" style={btn('ghost', { minHeight: 30 })}><ExternalLink size={14} /> Abrir</a>
        <a href={link + '?previa=1'} target="_blank" rel="noreferrer" title="Abre mesmo desligado — salve antes pra ver as mudanças" style={btn('soft', { minHeight: 30 })}><Eye size={14} /> Ver como fica</a>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', flexBasis: '100%' }}>Pra saber de onde veio: acrescente <b>?origem=instagram</b> (ou facebook, tiktok, indicacao…) no fim do link de cada lugar.</span>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Aparência">
            <div style={{ padding: '10px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
                {([['corPrincipal', 'Botões e barra'], ['corTitulo', 'Títulos'], ['corFundo', 'Fundo da página'], ['corCabecalho', 'Faixa do topo']] as [keyof Aparencia, string][]).map(([k, n]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                    <input type="color" value={String(q.aparencia[k] || '#000000')} onChange={e => setAp({ [k]: e.target.value } as Partial<Aparencia>)} style={{ width: 40, height: 32, border: '1px solid var(--line)', borderRadius: 4, padding: 2, background: '#fff', cursor: 'pointer' }} />
                    {n}</label>))}
              </div>
              <button style={btn('ghost', { minHeight: 28, marginBottom: 12 })} onClick={() => setAp({ corPrincipal: '#8e2a46', corTitulo: '#5a2433', corFundo: '#fbf4f6', corCabecalho: '#f0d0d7' })}>Cores da Clara</button>
              {campo('Logo no topo', <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 14 }}>
                {([['clara', 'Logo da Clara'], ['propria', 'Outra imagem'], ['nenhuma', 'Sem logo']] as [Aparencia['logo'], string][]).map(([k, n]) => (
                  <label key={k} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="radio" checked={q.aparencia.logo === k} onChange={() => setAp({ logo: k })} /> {n}</label>))}
              </div>)}
              {q.aparencia.logo === 'propria' && campo('Imagem do logo', <EnviarMidia quizId={id} valor={q.aparencia.logoUrl} onChange={v => setAp({ logoUrl: v })} />, 'PNG com fundo transparente fica melhor.')}
              {campo('Capa da abertura (foto ou vídeo)', <EnviarMidia quizId={id} valor={q.aparencia.capaUrl} onChange={v => setAp({ capaUrl: v })} video />, 'Aparece em cima do título na primeira tela. Vídeo: MP4 até 60 MB ou link do YouTube.')}
              {campo('Jeito de mostrar as opções', <select value={q.aparencia.layoutOpcoes} onChange={e => setAp({ layoutOpcoes: e.target.value as Aparencia['layoutOpcoes'] })} style={{ ...inputStyle, width: 'auto' }}>
                <option value="lista">Lista (um embaixo do outro)</option><option value="grade">Cartões com foto (2 por linha)</option></select>,
                'Em "cartões com foto", cada opção mostra a foto dela (ou o emoji, se não tiver foto).')}
              {campo('Imagem/vídeo da tela de APROVADA', <EnviarMidia quizId={id} valor={q.aparencia.imagemAprovado} onChange={v => setAp({ imagemAprovado: v })} video />)}
              {campo('Imagem/vídeo da tela de NÃO aprovada', <EnviarMidia quizId={id} valor={q.aparencia.imagemReprovado} onChange={v => setAp({ imagemReprovado: v })} video />)}
            </div>
          </Card>
          <Card title="Funcionamento">
            <div style={{ padding: '10px 16px' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 14 }}>
                <input type="checkbox" checked={q.ativo} onChange={e => set({ ativo: e.target.checked })} /> Quiz aberto (recebendo respostas)</label>
              {campo('Nota de corte (pontos pra ser aprovada)', <input type="number" value={q.notaCorte} onChange={e => set({ notaCorte: Number(e.target.value) })} style={{ ...inputStyle, width: 110 }} />,
                `Máximo possível nas perguntas que sempre aparecem: ${maxPontos} pontos. Opção marcada como "elimina" reprova direto.`)}
              {campo('WhatsApp que recebe a aprovada', <input value={q.whatsapp} placeholder="5514999999999" onChange={e => set({ whatsapp: e.target.value })} style={{ ...inputStyle, width: 220 }} />,
                'Com DDI e DDD. Vazio = a aprovada vê "uma consultora vai te chamar" (sem botão).')}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                <input type="checkbox" checked={q.pedirCidade} onChange={e => set({ pedirCidade: e.target.checked })} /> Pedir cidade no final</label>
            </div>
          </Card>
          <Card title="Tela de abertura">
            <div style={{ padding: '10px 16px' }}>
              {campo('Título', txt(q.titulo, v => set({ titulo: v }), true))}
              {campo('Subtítulo', txt(q.subtitulo, v => set({ subtitulo: v })))}
              {campo('Vantagens (uma por linha)', <textarea rows={3} value={q.vantagens.join('\n')} onChange={e => set({ vantagens: e.target.value.split('\n') })} style={{ ...inputStyle, resize: 'vertical' }} />)}
              {campo('Botão', txt(q.botaoComecar, v => set({ botaoComecar: v })))}
            </div>
          </Card>
          <Card title="Telas finais">
            <div style={{ padding: '10px 16px' }}>
              {campo('Enquanto analisa', txt(q.textoAnalisando, v => set({ textoAnalisando: v })))}
              {campo('Autorização (LGPD)', txt(q.textoLgpd, v => set({ textoLgpd: v }), true))}
              <h4 style={{ margin: '14px 0 8px', color: '#4f8a3a' }}>Aprovada</h4>
              {campo('Título', txt(q.aprovado.titulo, v => set({ aprovado: { ...q.aprovado, titulo: v } }), true))}
              {campo('Texto', txt(q.aprovado.texto, v => set({ aprovado: { ...q.aprovado, texto: v } }), true))}
              {campo('Botão do WhatsApp', txt(q.aprovado.botao, v => set({ aprovado: { ...q.aprovado, botao: v } })))}
              {campo('Mensagem que já vai escrita no WhatsApp', txt(q.aprovado.mensagemWhatsapp, v => set({ aprovado: { ...q.aprovado, mensagemWhatsapp: v } }), true))}
              <h4 style={{ margin: '14px 0 8px', color: '#c0392b' }}>Não passou</h4>
              {campo('Título', txt(q.reprovado.titulo, v => set({ reprovado: { ...q.reprovado, titulo: v } }), true))}
              {campo('Texto', txt(q.reprovado.texto, v => set({ reprovado: { ...q.reprovado, texto: v } }), true))}
            </div>
          </Card>
        </div>

        <Card title={`Perguntas (${q.perguntas.length})`} right={
          <button style={btn('soft', { minHeight: 30 })} onClick={() => { const id = novoId('p'); set({ perguntas: [...q.perguntas, { id, texto: 'Nova pergunta', tipo: 'escolha', opcoes: [{ id: novoId('o'), texto: 'Opção 1', pontos: 0 }, { id: novoId('o'), texto: 'Opção 2', pontos: 0 }] }] }); setAberta(id) }}><Plus size={14} /> Pergunta</button>}>
          <div style={{ padding: '6px 12px 12px' }}>
            {q.perguntas.map((p, i) => {
              const anteriores = q.perguntas.slice(0, i).filter(x => x.tipo === 'escolha')
              const cond = p.mostrarSe ? q.perguntas.find(x => x.id === p.mostrarSe!.perguntaId) : null
              return (
                <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 6, marginTop: 8, background: aberta === p.id ? '#fffafb' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', cursor: 'pointer' }} onClick={() => setAberta(aberta === p.id ? null : p.id)}>
                    <span style={{ color: 'var(--muted)', fontSize: 12, width: 20 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{p.texto}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {p.tipo === 'texto' ? 'Resposta escrita (sem pontos)' : p.opcoes.map(o => `${o.texto} (${o.elimina ? 'elimina' : o.pontos})`).join(' · ')}
                        {cond && <> — <b>só se</b> "{cond.texto}" = {p.mostrarSe!.opcoes.map(id => cond.opcoes.find(o => o.id === id)?.texto).filter(Boolean).join(' ou ')}</>}
                      </div>
                    </div>
                    <button title="Subir" disabled={i === 0} onClick={e => { e.stopPropagation(); mover(i, -1) }} style={iconBtn}><ArrowUp size={15} /></button>
                    <button title="Descer" disabled={i === q.perguntas.length - 1} onClick={e => { e.stopPropagation(); mover(i, 1) }} style={iconBtn}><ArrowDown size={15} /></button>
                    <button title="Apagar" onClick={e => { e.stopPropagation(); set({ perguntas: q.perguntas.filter(x => x.id !== p.id) }) }} style={{ ...iconBtn, color: '#c0392b' }}><Trash2 size={15} /></button>
                  </div>
                  {aberta === p.id && (
                    <div style={{ padding: '4px 12px 12px', borderTop: '1px dashed var(--line)' }}>
                      {campo('Pergunta', txt(p.texto, v => setP(p.id, { texto: v }), true))}
                      {campo('Texto de ajuda (opcional)', txt(p.ajuda || '', v => setP(p.id, { ajuda: v || undefined })))}
                      {campo('Foto ou vídeo da pergunta (opcional)', <EnviarMidia quizId={id} valor={p.imagem} onChange={v => setP(p.id, { imagem: v })} video />)}
                      {campo('Tipo', <select value={p.tipo} onChange={e => setP(p.id, { tipo: e.target.value as Pergunta['tipo'] })} style={{ ...inputStyle, width: 'auto' }}>
                        <option value="escolha">Escolher uma opção (com pontos)</option><option value="texto">Resposta escrita</option></select>)}
                      {p.tipo === 'escolha' && <>
                        <label style={labelStyle}>Opções — foto (opcional), emoji (opcional), texto, pontos, elimina</label>
                        {p.opcoes.map((o, k) => {
                          const setO = (patch: Partial<Opcao>) => setP(p.id, { opcoes: p.opcoes.map(x => x.id === o.id ? { ...x, ...patch } : x) })
                          return (
                            <div key={o.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                              <EnviarMidia quizId={id} valor={o.imagem} onChange={v => setO({ imagem: v })} compacto />
                              <input value={o.emoji || ''} placeholder="🙂" onChange={e => setO({ emoji: e.target.value || undefined })} style={{ ...inputStyle, width: 46, textAlign: 'center' }} />
                              <input value={o.texto} onChange={e => setO({ texto: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                              <input type="number" title="Pontos" value={o.pontos} onChange={e => setO({ pontos: Number(e.target.value) })} style={{ ...inputStyle, width: 64 }} />
                              <label title="Marcou esta = não passa" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                                <input type="checkbox" checked={!!o.elimina} onChange={e => setO({ elimina: e.target.checked || undefined })} /> elimina</label>
                              <button title="Tirar opção" disabled={p.opcoes.length <= 2} onClick={() => setP(p.id, { opcoes: p.opcoes.filter((_, j) => j !== k) })} style={{ ...iconBtn, color: '#c0392b' }}><Trash2 size={14} /></button>
                            </div>)
                        })}
                        <button style={btn('ghost', { minHeight: 28, marginBottom: 10 })} onClick={() => setP(p.id, { opcoes: [...p.opcoes, { id: novoId('o'), texto: 'Nova opção', pontos: 0 }] })}><Plus size={13} /> Opção</button>
                      </>}
                      {campo('Mostrar só quando…', <>
                        <select value={p.mostrarSe?.perguntaId || ''} onChange={e => setP(p.id, { mostrarSe: e.target.value ? { perguntaId: e.target.value, opcoes: [] } : null })} style={inputStyle}>
                          <option value="">Sempre mostrar</option>
                          {anteriores.map(a => <option key={a.id} value={a.id}>a resposta de "{a.texto}" for…</option>)}
                        </select>
                        {cond && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                          {cond.opcoes.map(o => (
                            <label key={o.id} style={{ fontSize: 13, display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input type="checkbox" checked={p.mostrarSe!.opcoes.includes(o.id)} onChange={e => setP(p.id, { mostrarSe: { ...p.mostrarSe!, opcoes: e.target.checked ? [...p.mostrarSe!.opcoes, o.id] : p.mostrarSe!.opcoes.filter(x => x !== o.id) } })} />
                              {o.texto}</label>))}
                        </div>}
                      </>, 'Ex.: "Idade do filho mais novo" só aparece pra quem disse que tem filhos.')}
                    </div>)}
                </div>)
            })}
          </div>
        </Card>
      </div>

      <div style={{ position: 'sticky', bottom: 0, display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 0', background: 'var(--bg)', marginTop: 12 }}>
        <button style={btn('ghost')} onClick={() => nav('/quiz-perfil')}>Voltar</button>
        <button style={btn('primary')} disabled={salvando} onClick={salvar}>Salvar quiz</button>
      </div>
    </div>
  )
}
/** Envia foto/vídeo pro servidor (ou aceita link do YouTube) e mostra a prévia. */
function EnviarMidia({ quizId, valor, onChange, video, compacto }: { quizId: number; valor?: string; onChange: (v: string | undefined) => void; video?: boolean; compacto?: boolean }) {
  const [enviando, setEnviando] = useState(false)
  const [yt, setYt] = useState(false)
  const [link, setLink] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const enviar = async (arq?: File) => {
    if (!arq) return
    if (!video && arq.type.startsWith('video/')) return toast('Aqui só vai foto', 'error')
    if (arq.size > (arq.type.startsWith('video/') ? 60 : 5) * 1024 * 1024) return toast(arq.type.startsWith('video/') ? 'Vídeo com mais de 60 MB' : 'Imagem com mais de 5 MB', 'error')
    setEnviando(true)
    try { const f = new FormData(); f.append('arquivo', arq); const r = await api('POST', `/quizzes/${quizId}/imagem`, f); onChange(r.url); toast('Enviado — clique em Salvar quiz') }
    catch (e) { toast((e as Error).message, 'error') } finally { setEnviando(false); if (ref.current) ref.current.value = '' }
  }
  const aceita = video ? 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/gif'
  const arquivo = <input ref={ref} type="file" accept={aceita} style={{ display: 'none' }} onChange={e => enviar(e.target.files?.[0])} />
  if (compacto) return (
    <span style={{ position: 'relative', flex: 'none' }}>
      {arquivo}
      <button title={valor ? 'Trocar foto (clique) — a foto aparece no cartão da opção' : 'Pôr foto na opção'} onClick={() => ref.current?.click()} disabled={enviando}
        style={{ ...iconBtn, width: 38, height: 34, padding: 0, overflow: 'hidden' }}>
        {enviando ? '…' : valor ? <img src={midiaUrl(valor)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageIcon size={15} />}
      </button>
      {valor && <button title="Tirar foto" onClick={() => onChange(undefined)} style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: 8, border: 'none', background: '#c0392b', color: '#fff', fontSize: 10, lineHeight: '16px', padding: 0 }}>×</button>}
    </span>)
  return (
    <div>
      {arquivo}
      {valor && <div style={{ maxWidth: 260, marginBottom: 8 }}><Midia src={valor} style={{ borderRadius: 6 }} /></div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={btn('ghost', { minHeight: 30 })} disabled={enviando} onClick={() => ref.current?.click()}><Upload size={14} /> {enviando ? 'Enviando…' : valor ? 'Trocar' : video ? 'Enviar foto ou vídeo' : 'Enviar imagem'}</button>
        {video && <button style={btn('ghost', { minHeight: 30 })} onClick={() => setYt(!yt)}><Youtube size={14} /> Link do YouTube</button>}
        {valor && <button style={btn('ghost', { minHeight: 30, color: '#c0392b' })} onClick={() => onChange(undefined)}>Tirar</button>}
      </div>
      {yt && <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.youtube.com/watch?v=… ou youtu.be/…" style={inputStyle} />
        <button style={btn('primary', { minHeight: 34 })} onClick={() => { if (!idYoutube(link)) return toast('Link do YouTube inválido', 'error'); onChange(link.trim()); setYt(false); setLink('') }}>Usar</button>
      </div>}
    </div>)
}

const iconBtn: CSSProperties = { width: 28, height: 28, border: '1px solid var(--line)', borderRadius: 4, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)', flex: 'none' }
