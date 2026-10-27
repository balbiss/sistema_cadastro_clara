import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, CheckCircle2, MapPin, Package, PenLine, Store, Truck } from 'lucide-react'
import { api } from '../lib/api'
import { brl, dataBR, dataHoraBR } from '../lib/fmt'
import { Modal, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, PageHeader, Prazo, toast } from '../components/extra'

type D = any
const iniciais = (n: string) => n.split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase()
const CORES = ['#ffd6a5', '#ffe9a8', '#cfe8ff', '#d9f2c7']
// o passo que anda pra frente vem primeiro; refazer um passo já dado vira "Reagendar"/"Corrigir carga/frete"
const refaz = (a: D, etapa: string) => a.para === etapa || (a.chave === 'agendar' && etapa !== 'aguardando_agendamento')
export const ordenarAcoes = (acoes: D[], etapa: string) => acoes
  .map(a => !refaz(a, etapa) ? a : { ...a, refaz: true, nome: a.chave === 'agendar' ? 'Reagendar' : a.chave === 'informar_frete' ? 'Corrigir carga/frete' : a.nome })
  .sort((x, y) => Number(!!x.refaz) - Number(!!y.refaz))

// Item 6 do briefing: fila de inicialização. Presencial (retirada na matriz) e online (Correios),
// cada uma com suas etapas; cada cartão mostra o próximo passo.
export default function Inicializacao() {
  const nav = useNavigate()
  const [d, setD] = useState<D | null>(null)
  const [aba, setAba] = useState<'presencial' | 'online'>(() => (localStorage.getItem('cad_inic_aba') === 'online' ? 'online' : 'presencial'))
  const [acao, setAcao] = useState<{ c: D; acao: D } | null>(null)
  const carregar = () => api('GET', '/inicializacao').then(setD)
  useEffect(() => { carregar() }, [])
  const trocarAba = (a: 'presencial' | 'online') => { setAba(a); try { localStorage.setItem('cad_inic_aba', a) } catch { /* sem storage */ } }
  if (!d) return <Carregando />

  const daAba = d.cadastros.filter((c: D) => c.modalidade === aba)
  const emCurso = (m: string) => d.cadastros.filter((c: D) => c.modalidade === m && c.status === 'inicializacao').length
  const etapas = d.etapas[aba] as { chave: string; nome: string }[]
  const acoesDe = (etapa: string) => ordenarAcoes(Object.entries(d.acoes).filter(([, a]: D) => a.modalidade === aba && a.de.includes(etapa)).map(([k, a]: D) => ({ chave: k, ...a })), etapa)
  const iniciadas = daAba.filter((c: D) => c.status === 'iniciada')

  return (
    <div>
      <PageHeader title="Inicialização" subtitle="Revendedoras liberadas: da primeira carga até a entrega"
        right={d.aguardandoAssinatura > 0 && <button style={btn('ghost')} onClick={() => nav('/cadastros?status=aguardando_assinatura')}><PenLine size={15} /> {d.aguardandoAssinatura} aguardando assinatura</button>} />

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
        {([['presencial', 'Presencial — matriz', Store], ['online', 'Online — Correios', Truck]] as const).map(([k, l, Icone]) => (
          <button key={k} onClick={() => trocarAba(k)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', border: 'none', background: 'none', fontSize: 14.5, fontWeight: aba === k ? 700 : 400, color: aba === k ? '#8e2a46' : 'var(--muted)', borderBottom: aba === k ? '3px solid #8e2a46' : '3px solid transparent', marginBottom: -1 }}>
            <Icone size={17} /> {l}
            <span style={{ fontSize: 12, fontWeight: 700, padding: '1px 8px', borderRadius: 10, background: aba === k ? '#fbe9ee' : 'var(--card-2)', color: aba === k ? '#8e2a46' : 'var(--muted)' }}>{emCurso(k)}</span>
          </button>
        ))}
      </div>

      <div className="kanban" style={{ display: 'grid', gridTemplateColumns: `repeat(${etapas.length + 1}, minmax(200px, 1fr))`, gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {etapas.map((e, i) => {
          const cards = daAba.filter((c: D) => c.status === 'inicializacao' && c.etapa === e.chave)
          return (
            <Coluna key={e.chave} titulo={e.nome} n={cards.length} cor={CORES[i % CORES.length]}>
              {!cards.length ? <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '18px 0' }}>Ninguém nesta etapa</div>
                : cards.map((c: D) => <Cartao key={c.id} c={c} acoes={acoesDe(e.chave)} onAbrir={() => nav('/cadastros/' + c.id)} onAcao={a => setAcao({ c, acao: a })} />)}
            </Coluna>
          )
        })}
        <Coluna titulo="Iniciadas (30 dias)" n={iniciadas.length} cor="#a8e6a3">
          {!iniciadas.length ? <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '18px 0' }}>Nenhuma ainda</div>
            : iniciadas.map((c: D) => (
              <button key={c.id} onClick={() => nav('/cadastros/' + c.id)} style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: 10, marginBottom: 8 }}>
                <CheckCircle2 size={18} color="#3c8d0d" style={{ flex: 'none' }} />
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{c.nome}</b>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>iniciada em {dataBR(c.iniciadaEm)}{c.inicializacao.carga ? ' · carga ' + c.inicializacao.carga : ''}</div>
                </div>
              </button>
            ))}
        </Coluna>
      </div>
      {acao && <AcaoInic c={acao.c} acao={acao.acao} onClose={() => setAcao(null)} onOk={carregar} />}
    </div>
  )
}

function Coluna({ titulo, n, cor, children }: { titulo: string; n: number; cor: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#f6f7f9', border: '1px solid var(--line)', borderRadius: 6, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 5, background: cor, borderRadius: '6px 6px 0 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <h2 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', flex: 1 }}>{titulo}</h2>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{n}</span>
      </div>
      <div style={{ padding: '0 10px 10px' }}>{children}</div>
    </section>
  )
}

function Cartao({ c, acoes, onAbrir, onAcao }: { c: D; acoes: D[]; onAbrir: () => void; onAcao: (a: D) => void }) {
  const i = c.inicializacao
  const info = [
    i.agendadoPara && { icone: <CalendarClock size={13} />, texto: dataHoraBR(i.agendadoPara) },
    i.carga && { icone: <Package size={13} />, texto: `Carga ${i.carga}${i.valorCarga ? ' · ' + brl(i.valorCarga) : ''}` },
    i.valorFrete != null && { icone: <Truck size={13} />, texto: `Frete ${brl(i.valorFrete)}${i.pagoEm ? ' · pago' : ''}` },
    i.rastreio && { icone: <Truck size={13} />, texto: i.rastreio },
    c.cidade && { icone: <MapPin size={13} />, texto: c.cidade },
  ].filter(Boolean) as { icone: React.ReactNode; texto: string }[]
  const [principal, ...outras] = acoes
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: 12, marginBottom: 8, boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <button onClick={onAbrir} style={{ display: 'flex', gap: 10, alignItems: 'center', border: 'none', background: 'none', padding: 0, textAlign: 'left', width: '100%' }}>
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#fbe9ee', color: '#8e2a46', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{iniciais(c.nome)}</span>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 14, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</b>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.codigo}{c.consultora ? ' · ' + c.consultora : ''}</span>
        </div>
      </button>
      {info.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 9, fontSize: 12.5, color: 'var(--ink)' }}>
        {info.map((x, k) => <span key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ color: 'var(--muted)', display: 'flex' }}>{x.icone}</span>{x.texto}</span>)}
      </div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 9, fontSize: 12 }}>
        <Prazo prazo={c.prazoEtapa} />
        {c.pendencias > 0 && <span style={{ background: '#fde2e1', color: '#b42318', fontWeight: 700, padding: '1px 7px', borderRadius: 9 }}>{c.pendencias} pendência(s)</span>}
      </div>
      {principal && <button style={btn('primary', { width: '100%', marginTop: 10, minHeight: 34 })} onClick={() => onAcao(principal)}>{principal.nome}</button>}
      {outras.map(a => <button key={a.chave} style={btn('ghost', { width: '100%', marginTop: 6, minHeight: 30 })} onClick={() => onAcao(a)}>{a.nome}</button>)}
    </div>
  )
}

/** Modal de uma ação da inicialização — usado aqui e no dossiê. */
export function AcaoInic({ c, acao, onClose, onOk }: { c: D; acao: D; onClose: () => void; onOk: () => void }) {
  const i = c.inicializacao || {}
  const [f, setF] = useState({ data: '', carga: i.carga || '', valorCarga: i.valorCarga ? String(i.valorCarga) : '', valorFrete: i.valorFrete != null ? String(i.valorFrete) : '', rastreio: '', observacao: '' })
  const [salvando, setSalvando] = useState(false)
  const k = acao.chave
  const num = (v: string) => (v.trim() ? Number(v.replace(/\./g, '').replace(',', '.')) : undefined)
  const salvar = async () => {
    setSalvando(true)
    try {
      const r = await api('POST', `/cadastros/${c.id}/inicializacao`, {
        acao: k, data: f.data ? new Date(f.data).toISOString() : undefined, carga: f.carga || undefined,
        valorCarga: num(f.valorCarga), valorFrete: num(f.valorFrete), rastreio: f.rastreio || undefined, observacao: f.observacao || undefined,
      })
      toast(r.status === 'iniciada' ? 'Revendedora iniciada! 🎉' : 'Etapa registrada')
      onClose(); onOk()
    } catch (e) { toast((e as Error).message, 'error') } finally { setSalvando(false) }
  }
  const campo = (chave: keyof typeof f, rotulo: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div style={{ marginBottom: 12 }}><label style={labelStyle}>{rotulo}</label><input value={f[chave]} onChange={e => setF({ ...f, [chave]: e.target.value })} style={inputStyle} {...props} /></div>
  )
  const ajuda: Record<string, string> = {
    agendar: 'Combine com a cliente o dia de vir à matriz. A cliente vê a data no link dela.',
    carga_conferida: 'Separe e confira a primeira carga antes do dia marcado.',
    entregar: 'Confirme que a cliente retirou a carga e recebeu as orientações. Ela passa a contar como revendedora iniciada.',
    informar_frete: 'Carga separada e conferida. O valor do frete aparece no link da cliente para ela pagar.',
    confirmar_pagamento: 'O pagamento do frete caiu? A carga fica liberada para expedição.',
    enviar: 'Registre o código de rastreamento dos Correios. A cliente vê no link dela.',
    confirmar_recebimento: 'A cliente confirmou que recebeu a carga. Ela passa a contar como revendedora iniciada.',
  }
  const pronto = k === 'agendar' ? !!f.data : k === 'carga_conferida' ? !!f.carga.trim() : k === 'informar_frete' ? !!f.carga.trim() && !!f.valorFrete.trim() : k === 'enviar' ? !!f.rastreio.trim() : true
  return (
    <Modal title={acao.nome} subtitle={`${c.nome} — ${ajuda[k] || ''}`} onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><button style={btn('primary')} disabled={!pronto || salvando} onClick={salvar}>Confirmar</button></>}>
      {k === 'agendar' && campo('data', 'Dia e hora da retirada *', { type: 'datetime-local' })}
      {(k === 'carga_conferida' || k === 'informar_frete') && <div className="grid2">
        {campo('carga', 'Nº / código da carga *', { placeholder: 'Ex.: CG-1043' })}
        {campo('valorCarga', 'Valor da carga (R$)', { inputMode: 'decimal', placeholder: 'Ex.: 2400' })}
      </div>}
      {k === 'informar_frete' && campo('valorFrete', 'Valor do frete (R$) *', { inputMode: 'decimal', placeholder: 'Ex.: 32,50' })}
      {k === 'enviar' && campo('rastreio', 'Código de rastreamento *', { placeholder: 'Ex.: QB123456789BR' })}
      {campo('observacao', 'Observação (opcional)')}
    </Modal>
  )
}
