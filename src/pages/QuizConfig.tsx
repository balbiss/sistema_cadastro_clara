import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react'
import Swal from 'sweetalert2'
import { api, usuarioAtual } from '../lib/api'
import { Card, Modal, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, PageHeader, toast, vazio } from '../components/extra'

// Quiz de perfil (1ª etapa, link aberto). Aba Respostas = relatório; aba Perguntas = editor do quiz
// (perguntas, opções, pontos, eliminatórias, condicionais, nota de corte, textos e WhatsApp).
type Opcao = { id: string; texto: string; emoji?: string; pontos: number; elimina?: boolean }
type Pergunta = { id: string; texto: string; ajuda?: string; tipo: 'escolha' | 'texto'; opcoes: Opcao[]; mostrarSe?: { perguntaId: string; opcoes: string[] } | null }
type Quiz = {
  ativo: boolean; titulo: string; subtitulo: string; vantagens: string[]; botaoComecar: string; perguntas: Pergunta[]; notaCorte: number
  pedirCidade: boolean; textoAnalisando: string; aprovado: { titulo: string; texto: string; botao: string; mensagemWhatsapp: string }
  reprovado: { titulo: string; texto: string }; whatsapp: string; textoLgpd: string
}

const novoId = (p: string) => p + '_' + Math.random().toString(36).slice(2, 7)
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const telFmt = (t: string) => t.replace(/^55/, '').replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')

export default function QuizConfig() {
  const diretoria = usuarioAtual()?.role === 'diretoria'
  const [aba, setAba] = useState<'respostas' | 'perguntas'>('respostas')
  return (
    <div>
      <PageHeader title="Quiz de perfil" subtitle="1ª etapa: link aberto pra anúncio e Instagram. Quem passa vira cadastro e o CRM é avisado." />
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
        {([['respostas', 'Respostas'], ...(diretoria ? [['perguntas', 'Perguntas e telas']] : [])] as [typeof aba, string][]).map(([k, n]) => (
          <button key={k} onClick={() => setAba(k)} style={{ background: 'none', border: 'none', padding: '10px 14px', fontSize: 14, fontWeight: 700,
            color: aba === k ? 'var(--vinho)' : 'var(--muted)', borderBottom: `3px solid ${aba === k ? 'var(--terra)' : 'transparent'}`, marginBottom: -1 }}>{n}</button>))}
      </div>
      {aba === 'respostas' ? <Respostas /> : <Editor />}
    </div>
  )
}

// ---------------- Respostas (relatório do quiz) ----------------
function Respostas() {
  const nav = useNavigate()
  const [filtro, setFiltro] = useState('todas')
  const [d, setD] = useState<any>(null)
  const [ver, setVer] = useState<any>(null)
  useEffect(() => { setD(null); api('GET', '/quiz/respostas?filtro=' + filtro).then(setD) }, [filtro])
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
      <Card title="Quem respondeu" right={
        <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="todas">Todas</option><option value="aprovadas">Só aprovadas</option><option value="reprovadas">Só não aprovadas</option>
        </select>}>
        {!d.lista.length ? <div style={vazio}>Ninguém respondeu ainda. Divulgue o link do quiz (aba "Perguntas e telas").</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12, textTransform: 'uppercase' }}>
                {['Quando', 'Nome', 'WhatsApp', 'Cidade', 'Pontos', 'Resultado', 'Origem', ''].map(h => <th key={h} style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>{h}</th>)}
              </tr></thead>
              <tbody>{d.lista.map((x: any) => (
                <tr key={x.id} className="linha" style={{ cursor: 'pointer' }} onClick={() => setVer(x)}>
                  <td style={td}>{dataHora(x.createdAt)}</td><td style={td}><b>{x.nome}</b></td><td style={td}>{telFmt(x.telefone)}</td>
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
function Editor() {
  const [q, setQ] = useState<Quiz | null>(null)
  const [link, setLink] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  useEffect(() => { api('GET', '/quiz/config').then(r => { setQ(r.quiz); setLink(r.link) }) }, [])
  if (!q) return <Carregando />

  const set = (patch: Partial<Quiz>) => setQ({ ...q, ...patch })
  const setP = (id: string, patch: Partial<Pergunta>) => set({ perguntas: q.perguntas.map(p => p.id === id ? { ...p, ...patch } : p) })
  const mover = (i: number, d: number) => { const ps = [...q.perguntas]; const [x] = ps.splice(i, 1); ps.splice(i + d, 0, x); set({ perguntas: ps }) }
  const maxPontos = q.perguntas.reduce((a, p) => a + (p.tipo === 'escolha' && !p.mostrarSe ? Math.max(0, ...p.opcoes.map(o => o.pontos)) : 0), 0)
  const salvar = async () => {
    setSalvando(true)
    try { const r = await api('PUT', '/quiz/config', q); setQ(r.quiz); toast('Quiz salvo — já vale pra quem abrir o link') }
    catch (e) { toast((e as Error).message, 'error') } finally { setSalvando(false) }
  }
  const restaurar = async () => {
    const ok = await Swal.fire({ title: 'Voltar ao quiz padrão?', text: 'Perguntas e textos voltam ao modelo inicial. As respostas já recebidas continuam guardadas.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Voltar ao padrão', cancelButtonText: 'Cancelar', confirmButtonColor: '#c8506a' })
    if (!ok.isConfirmed) return
    const r = await api('POST', '/quiz/config/padrao'); setQ(r.quiz); toast('Quiz padrão restaurado')
  }
  const campo = (titulo: string, el: ReactNode, ajuda?: string) => (
    <div style={{ marginBottom: 12 }}><label style={labelStyle}>{titulo}</label>{el}{ajuda && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{ajuda}</div>}</div>)
  const txt = (v: string, on: (s: string) => void, area = false) => area
    ? <textarea value={v} rows={3} onChange={e => on(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
    : <input value={v} onChange={e => on(e.target.value)} style={inputStyle} />

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: '12px 14px' }}>
        <span style={{ fontSize: 14 }}>Link do quiz:</span>
        <code style={{ background: 'var(--card-2)', padding: '4px 8px', borderRadius: 3, fontSize: 13.5, wordBreak: 'break-all' }}>{link}</code>
        <button style={btn('ghost', { minHeight: 30 })} onClick={() => { navigator.clipboard.writeText(link); toast('Link copiado') }}><Copy size={14} /> Copiar</button>
        <a href={link} target="_blank" rel="noreferrer" style={btn('ghost', { minHeight: 30 })}><ExternalLink size={14} /> Abrir</a>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', flexBasis: '100%' }}>Pra saber de onde veio: acrescente <b>?origem=instagram</b> (ou facebook, tiktok, indicacao…) no fim do link de cada lugar.</span>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                      {campo('Tipo', <select value={p.tipo} onChange={e => setP(p.id, { tipo: e.target.value as Pergunta['tipo'] })} style={{ ...inputStyle, width: 'auto' }}>
                        <option value="escolha">Escolher uma opção (com pontos)</option><option value="texto">Resposta escrita</option></select>)}
                      {p.tipo === 'escolha' && <>
                        <label style={labelStyle}>Opções — emoji (opcional), texto, pontos, elimina</label>
                        {p.opcoes.map((o, k) => {
                          const setO = (patch: Partial<Opcao>) => setP(p.id, { opcoes: p.opcoes.map(x => x.id === o.id ? { ...x, ...patch } : x) })
                          return (
                            <div key={o.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
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
        <button style={btn('ghost')} onClick={restaurar}>Voltar ao padrão</button>
        <button style={btn('primary')} disabled={salvando} onClick={salvar}>Salvar quiz</button>
      </div>
    </div>
  )
}
const iconBtn: CSSProperties = { width: 28, height: 28, border: '1px solid var(--line)', borderRadius: 4, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)', flex: 'none' }
