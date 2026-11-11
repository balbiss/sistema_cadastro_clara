import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { api, usuarioAtual } from '../lib/api'
import { ACAO_NOME } from '../lib/status'
import { Card, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, PageHeader, toast } from '../components/extra'

// Relatório 2 (Bel, 06/11), itens 3.1–3.3 e 7: requisitos do avalista, vínculos aceitos, quiz próprio do
// avalista e documentos obrigatórios — tudo configurável pela diretoria, sem programador.
type Opcao = { id: string; texto: string; pontos: number; elimina?: boolean }
type Pergunta = { id: string; texto: string; ajuda?: string; tipo: 'escolha' | 'texto'; opcoes: Opcao[]; mostrarSe?: { perguntaId: string; opcoes: string[] } | null }
type Regras = {
  maxAvalistas: number; idadeMinima: number; idadeMaxima: number; parentescos: { id: string; nome: string; aceito: boolean }[]
  restricaoMaxima: number; aceitarProtesto: boolean; scoreMinimo: number; perguntas: Pergunta[]; notaCorte: number; acaoEsgotou: string; intro: string
}
const novoId = (p: string) => p + '_' + Math.random().toString(36).slice(2, 7)
const iconBtn: CSSProperties = { width: 28, height: 28, border: '1px solid var(--line)', borderRadius: 4, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)', flex: 'none' }

export default function RegrasAvalista() {
  const pode = usuarioAtual()?.role === 'diretoria'
  const [r, setR] = useState<Regras | null>(null)
  const [acoes, setAcoes] = useState<string[]>([])
  const [docs, setDocs] = useState<any>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [novoVinculo, setNovoVinculo] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    api('GET', '/config/avalista').then(d => { setR(d.regras); setAcoes(d.acoes) })
    api('GET', '/config/documentos').then(setDocs)
  }, [])
  if (!r || !docs) return <Carregando />
  const set = (patch: Partial<Regras>) => setR({ ...r, ...patch })
  const setP = (id: string, patch: Partial<Pergunta>) => set({ perguntas: r.perguntas.map(p => p.id === id ? { ...p, ...patch } : p) })
  const mover = (i: number, d: number) => { const ps = [...r.perguntas]; const [x] = ps.splice(i, 1); ps.splice(i + d, 0, x); set({ perguntas: ps }) }
  const salvar = async () => {
    setSalvando(true)
    try {
      await api('PUT', '/config/avalista', r)
      await api('PUT', '/config/documentos', docs.exigidos)
      toast('Regras do avalista e documentos salvos — valem para as próximas análises')
    } catch (e) { toast((e as Error).message, 'error') } finally { setSalvando(false) }
  }
  const linha = (titulo: string, controle: ReactNode, ajuda?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '11px 0', borderBottom: '1px dashed var(--line)', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 240px' }}><div style={{ fontSize: 14 }}>{titulo}</div>{ajuda && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{ajuda}</div>}</div>
      {controle}
    </div>
  )
  const num = (k: keyof Regras, w = 100, min = 0) => <input disabled={!pode} type="number" min={min} value={r[k] as number} onChange={e => set({ [k]: Number(e.target.value) } as Partial<Regras>)} style={{ ...inputStyle, width: w }} />
  const marcaDoc = (quem: 'titular' | 'avalista', tipo: string, on: boolean) =>
    setDocs({ ...docs, exigidos: { ...docs.exigidos, [quem]: on ? [...docs.exigidos[quem], tipo] : docs.exigidos[quem].filter((t: string) => t !== tipo) } })

  return (
    <div>
      <PageHeader title="Avalista e documentos" subtitle={pode ? 'Requisitos do avalista, quiz dele e documentos obrigatórios. Ajuste conforme a política da empresa.' : 'Só a diretoria altera. Você está vendo as regras em uso.'}
        right={pode && <button style={btn('primary')} disabled={salvando} onClick={salvar}>Salvar</button>} />
      <div style={{ background: '#fff7e0', border: '1px solid #f3dc9b', borderRadius: 6, padding: '10px 14px', fontSize: 13.5, marginBottom: 16, lineHeight: 1.5 }}>
        Valores de partida: <b>todos os vínculos aceitos</b>, idade a partir de 18 anos, avalista só com <b>nome limpo</b> e perguntas <b>sem pontos</b> — a direção ainda vai definir as regras de verdade.
        A ordem da análise é: requisitos (idade, vínculo, quiz) → só se passar, consulta o SPC do avalista (assim não gasta consulta à toa).
      </div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Requisitos do avalista">
            {linha('Avalistas por candidata', num('maxAvalistas', 80, 1), 'Se o 1º não for aprovado, ela pode apresentar outro até esse limite. Todos ficam guardados no cadastro.')}
            {linha('Idade mínima', num('idadeMinima', 80, 18))}
            {linha('Idade máxima', num('idadeMaxima', 80), '0 = sem limite')}
            {linha('Restrição aceita no SPC até (R$)', num('restricaoMaxima', 110), '0 = só aceita avalista com "nada consta"')}
            {linha('Aceitar avalista com protesto', <input disabled={!pode} type="checkbox" checked={r.aceitarProtesto} onChange={e => set({ aceitarProtesto: e.target.checked })} style={{ width: 20, height: 20, accentColor: '#8e2a46' }} />)}
            {linha('Score mínimo', num('scoreMinimo', 90), '0 = não olha o score')}
            {linha('Nenhum avalista aprovado (acabaram as tentativas)',
              <select disabled={!pode} value={r.acaoEsgotou} onChange={e => set({ acaoEsgotou: e.target.value })} style={{ ...inputStyle, width: 'auto', minWidth: 210 }}>
                {acoes.filter(a => a !== 'pendente_avalista').map(a => <option key={a} value={a}>{ACAO_NOME[a]}</option>)}
              </select>)}
          </Card>

          <Card title="Vínculo com a candidata (grau de parentesco)">
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 6px' }}>Desmarque o que a empresa <b>não</b> aceita. Vínculo não aceito = avalista não aprovado (a candidata pode apresentar outro).</p>
            {r.parentescos.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
                <input disabled={!pode} type="checkbox" checked={p.aceito} onChange={e => set({ parentescos: r.parentescos.map(x => x.id === p.id ? { ...x, aceito: e.target.checked } : x) })} style={{ width: 18, height: 18, accentColor: '#8e2a46' }} />
                <span style={{ flex: 1, fontSize: 14, color: p.aceito ? 'var(--ink)' : 'var(--muted)', textDecoration: p.aceito ? undefined : 'line-through' }}>{p.nome}</span>
                {pode && <button title="Tirar da lista" onClick={() => set({ parentescos: r.parentescos.filter(x => x.id !== p.id) })} style={{ ...iconBtn, color: '#c0392b' }}><Trash2 size={14} /></button>}
              </div>))}
            {pode && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input value={novoVinculo} placeholder="Ex.: Padrinho / madrinha" onChange={e => setNovoVinculo(e.target.value)} style={inputStyle} />
              <button style={btn('soft')} disabled={novoVinculo.trim().length < 2} onClick={() => { set({ parentescos: [...r.parentescos, { id: novoId('v'), nome: novoVinculo.trim(), aceito: true }] }); setNovoVinculo('') }}><Plus size={14} /> Incluir</button>
            </div>}
          </Card>

          <Card title="Documentos obrigatórios">
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 8px' }}>Sem todos conferidos, o cadastro não é aprovado. Os do avalista só são pedidos quando há avalista aprovado.</p>
            {(['titular', 'avalista'] as const).map(quem => (
              <div key={quem} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, margin: '6px 0' }}>{quem === 'titular' ? 'Da candidata' : 'Do avalista aprovado'}</div>
                {docs.possiveis[quem].map((d: any) => (
                  <label key={d.tipo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '4px 0' }}>
                    <input disabled={!pode} type="checkbox" checked={docs.exigidos[quem].includes(d.tipo)} onChange={e => marcaDoc(quem, d.tipo, e.target.checked)} style={{ width: 18, height: 18, accentColor: '#8e2a46' }} />
                    {d.nome.replace(/^Avalista — /, '')}</label>))}
              </div>))}
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Contrato e nota promissória são gerados e assinados pelo sistema — não entram aqui.</p>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Quiz do avalista" right={pode && <button style={btn('soft', { minHeight: 30 })} onClick={() => { const id = novoId('p'); set({ perguntas: [...r.perguntas, { id, texto: 'Nova pergunta', tipo: 'escolha', opcoes: [{ id: novoId('o'), texto: 'Sim', pontos: 0 }, { id: novoId('o'), texto: 'Não', pontos: 0 }] }] }); setAberta(id) }}><Plus size={14} /> Pergunta</button>}>
            <label style={labelStyle}>Texto que a candidata lê antes de preencher</label>
            <textarea disabled={!pode} rows={3} value={r.intro} onChange={e => set({ intro: e.target.value })} style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }} />
            {linha('Nota de corte (pontos)', num('notaCorte', 90), 'Opção marcada "elimina" reprova o avalista direto. Nome, CPF, nascimento, WhatsApp, endereço e vínculo são pedidos sempre.')}
            {r.perguntas.map((p, i) => {
              const anteriores = r.perguntas.slice(0, i).filter(x => x.tipo === 'escolha')
              const cond = p.mostrarSe ? r.perguntas.find(x => x.id === p.mostrarSe!.perguntaId) : null
              return (
                <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 6, marginTop: 8, background: aberta === p.id ? '#fffafb' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', cursor: 'pointer' }} onClick={() => setAberta(aberta === p.id ? null : p.id)}>
                    <span style={{ color: 'var(--muted)', fontSize: 12, width: 20 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{p.texto}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.tipo === 'texto' ? 'Resposta escrita (sem pontos)' : p.opcoes.map(o => `${o.texto} (${o.elimina ? 'elimina' : o.pontos})`).join(' · ')}</div>
                    </div>
                    {pode && <>
                      <button title="Subir" disabled={i === 0} onClick={e => { e.stopPropagation(); mover(i, -1) }} style={iconBtn}><ArrowUp size={15} /></button>
                      <button title="Descer" disabled={i === r.perguntas.length - 1} onClick={e => { e.stopPropagation(); mover(i, 1) }} style={iconBtn}><ArrowDown size={15} /></button>
                      <button title="Apagar" onClick={e => { e.stopPropagation(); set({ perguntas: r.perguntas.filter(x => x.id !== p.id) }) }} style={{ ...iconBtn, color: '#c0392b' }}><Trash2 size={15} /></button>
                    </>}
                  </div>
                  {aberta === p.id && pode && (
                    <div style={{ padding: '4px 12px 12px', borderTop: '1px dashed var(--line)' }}>
                      <label style={labelStyle}>Pergunta</label>
                      <input value={p.texto} onChange={e => setP(p.id, { texto: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }} />
                      <label style={labelStyle}>Ajuda (opcional)</label>
                      <input value={p.ajuda || ''} onChange={e => setP(p.id, { ajuda: e.target.value || undefined })} style={{ ...inputStyle, marginBottom: 8 }} />
                      <select value={p.tipo} onChange={e => setP(p.id, { tipo: e.target.value as Pergunta['tipo'] })} style={{ ...inputStyle, width: 'auto', marginBottom: 8 }}>
                        <option value="escolha">Escolher uma opção (com pontos)</option><option value="texto">Resposta escrita</option></select>
                      {p.tipo === 'escolha' && <>
                        {p.opcoes.map((o, k) => {
                          const setO = (patch: Partial<Opcao>) => setP(p.id, { opcoes: p.opcoes.map(x => x.id === o.id ? { ...x, ...patch } : x) })
                          return (
                            <div key={o.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                              <input value={o.texto} onChange={e => setO({ texto: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                              <input type="number" title="Pontos" value={o.pontos} onChange={e => setO({ pontos: Number(e.target.value) })} style={{ ...inputStyle, width: 64 }} />
                              <label title="Marcou esta = avalista não aprovado" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                                <input type="checkbox" checked={!!o.elimina} onChange={e => setO({ elimina: e.target.checked || undefined })} /> elimina</label>
                              <button title="Tirar opção" disabled={p.opcoes.length <= 2} onClick={() => setP(p.id, { opcoes: p.opcoes.filter((_, j) => j !== k) })} style={{ ...iconBtn, color: '#c0392b' }}><Trash2 size={14} /></button>
                            </div>)
                        })}
                        <button style={btn('ghost', { minHeight: 28, marginBottom: 10 })} onClick={() => setP(p.id, { opcoes: [...p.opcoes, { id: novoId('o'), texto: 'Nova opção', pontos: 0 }] })}><Plus size={13} /> Opção</button>
                      </>}
                      <label style={labelStyle}>Mostrar só quando…</label>
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
                    </div>)}
                </div>)
            })}
          </Card>
        </div>
      </div>
    </div>
  )
}
