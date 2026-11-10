import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../lib/api'
import { brl, cpfFmt, dataHoraBR } from '../lib/fmt'
import { Modal, btn, inputStyle } from '../components/ui'
import { Carregando, PageHeader, StatusPill, vazio } from '../components/extra'

// Relatório de ajustes (06/11) item 2.4: toda consulta ao SPC, ligada ao CPF. "Reaproveitada" =
// o CPF já tinha sido consultado dentro do prazo das Regras e não houve custo novo.
type Linha = {
  id: number; cpf: string; pessoa: string; pessoaNome: string; autor: string | null; em: string; reaproveitadaDe: number | null
  score: number | null; negativacoes: number; total: number; protestos: number; situacao: string; descartada: boolean
  cadastroId: number; codigo: string; status: string; statusNome: string; motivo: string | null; consultora: string | null; vezesCpf: number
}

export default function ConsultasSpc() {
  const [f, setF] = useState({ q: '', de: '', ate: '', tipo: '', medios: false, valorMax: '' })
  const [d, setD] = useState<{ validadeMeses: number; resumo: any; linhas: Linha[] } | null>(null)
  const [lupa, setLupa] = useState<number | null>(null)
  const carregar = () => {
    const p = new URLSearchParams()
    if (f.q) p.set('q', f.q)
    if (f.de) p.set('de', f.de)
    if (f.ate) p.set('ate', f.ate)
    if (f.tipo) p.set('tipo', f.tipo)
    if (f.medios) { p.set('medios', '1'); if (f.valorMax) p.set('valorMax', f.valorMax) }
    setD(null)
    api('GET', '/consultas-spc?' + p).then(setD)
  }
  useEffect(() => { carregar() }, [f.tipo, f.medios])

  const quadro = (titulo: string, valor: number | string, ajuda: string) => (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 3, padding: '14px 16px', flex: '1 1 180px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{titulo}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--terra)', margin: '4px 0' }}>{valor}</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{ajuda}</div>
    </div>
  )

  return (
    <div>
      <PageHeader title="Consultas ao SPC" subtitle={d ? `Cada CPF é consultado no máximo 1 vez a cada ${d.validadeMeses} ${d.validadeMeses === 1 ? 'mês' : 'meses'} (muda em Regras de análise).` : 'Histórico e custo das consultas de crédito'} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'end' }}>
        <form onSubmit={e => { e.preventDefault(); carregar() }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <input placeholder="Nome ou CPF" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} style={{ ...inputStyle, width: 220 }} />
          <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>De<input type="date" value={f.de} onChange={e => setF({ ...f, de: e.target.value })} style={{ ...inputStyle, width: 150, display: 'block' }} /></label>
          <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>Até<input type="date" value={f.ate} onChange={e => setF({ ...f, ate: e.target.value })} style={{ ...inputStyle, width: 150, display: 'block' }} /></label>
          {f.medios && <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>Negativado até (R$)<input type="number" value={f.valorMax} onChange={e => setF({ ...f, valorMax: e.target.value })} style={{ ...inputStyle, width: 130, display: 'block' }} /></label>}
          <button style={btn('primary')}><Search size={15} /> Buscar</button>
        </form>
        <div style={{ flex: 1 }} />
        {[['', 'Todas'], ['pagas', 'Pagas'], ['reaproveitadas', 'Reaproveitadas']].map(([k, n]) => (
          <button key={k} style={btn(f.tipo === k && !f.medios ? 'soft' : 'ghost')} onClick={() => setF({ ...f, tipo: k, medios: false })}>{n}</button>
        ))}
        <button style={btn(f.medios ? 'soft' : 'ghost')} title="Não aprovados por negativação — talvez dê pra aprovar com risco" onClick={() => setF({ ...f, medios: !f.medios, tipo: '' })}>Cadastros médios</button>
      </div>

      {!d ? <Carregando /> : <>
        {!f.medios && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          {quadro('Consultas pagas', d.resumo.pagas, 'Foram de fato ao SPC')}
          {quadro('Reaproveitadas', d.resumo.reaproveitadas, 'Mesmo CPF dentro do prazo — sem custo')}
          {quadro('CPFs diferentes', d.resumo.cpfs, 'Pessoas consultadas')}
          {quadro('CPF pago 2× ou mais', d.resumo.cpfsPagosMaisDeUmaVez, 'Consultado de novo depois do prazo')}
        </div>}
        {f.medios && <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 0 }}>
          Cadastros <b>não aprovados</b> (reprovado, aguardando avalista, análise humana ou desistência) que tinham <b>negativação</b>, do menor valor pro maior. Use o filtro de valor e a lupa pra ver a origem da dívida.
        </p>}
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 3 }}>
          {!d.linhas.length ? <div style={vazio}>Nenhuma consulta encontrada.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tabela">
                <thead><tr><th>Pessoa / CPF</th><th>Data</th><th>Score</th><th>Negativações</th><th>Cadastro</th><th>Consulta</th><th /></tr></thead>
                <tbody>
                  {d.linhas.map(l => (
                    <tr key={l.id} className="linha">
                      <td>
                        <b>{l.pessoaNome}</b>{l.pessoa === 'avalista' && <span style={{ fontSize: 11, marginLeft: 6, color: 'var(--muted)' }}>(avalista)</span>}
                        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                          <button onClick={() => setF({ ...f, q: l.cpf, medios: false, tipo: '' })} style={{ border: 'none', background: 'none', padding: 0, color: 'inherit', textDecoration: 'underline dotted', cursor: 'pointer' }} title="Ver todas as consultas deste CPF">{cpfFmt(l.cpf)}</button>
                          {l.vezesCpf > 1 && <> · {l.vezesCpf} consultas</>}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{dataHoraBR(l.em)}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.autor || ''}</div></td>
                      <td>{l.descartada ? '—' : l.score ?? '—'}</td>
                      <td>{l.descartada ? <span style={{ color: 'var(--muted)' }}>descartada (LGPD)</span> : l.negativacoes ? <><b>{l.negativacoes}</b> · {brl(l.total)}</> : 'Nada consta'}{!l.descartada && l.protestos > 0 && <div style={{ fontSize: 12, color: '#c0392b' }}>{l.protestos} protesto(s)</div>}</td>
                      <td><Link to={'/cadastros/' + l.cadastroId}>{l.codigo}</Link><div style={{ marginTop: 3 }}><StatusPill status={l.status} /></div>{l.consultora && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.consultora}</div>}</td>
                      <td>{l.reaproveitadaDe ? <span style={{ fontSize: 12, padding: '2px 7px', borderRadius: 2, background: '#e7f7ec', color: '#1e7a3c', fontWeight: 700 }}>REAPROVEITADA</span> : <span style={{ fontSize: 12, padding: '2px 7px', borderRadius: 2, background: '#fdeef1', color: 'var(--terra)', fontWeight: 700 }}>PAGA</span>}</td>
                      <td><button style={btn('ghost', { minHeight: 30, padding: '0 10px' })} title="Ver a consulta completa" onClick={() => setLupa(l.id)}><Search size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>}
      {lupa && <Lupa id={lupa} onClose={() => setLupa(null)} />}
    </div>
  )
}

function Lupa({ id, onClose }: { id: number; onClose: () => void }) {
  const [d, setD] = useState<any>(null)
  useEffect(() => { api('GET', '/consultas-spc/' + id).then(setD) }, [id])
  const r = d?.consulta.resultado
  const sec = { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: 'var(--muted)', margin: '16px 0 6px' }
  return (
    <Modal title="Consulta completa" subtitle={d ? `${d.consulta.nome || ''} · CPF ${cpfFmt(d.consulta.cpf)} · ${dataHoraBR(d.consulta.createdAt)} · ${d.consulta.provedor === 'simulado' ? 'SPC de teste (simulado)' : d.consulta.provedor}` : ''} onClose={onClose} width={640}>
      {!d ? <Carregando /> : r?.descartado ? <p>O resultado desta consulta foi descartado pela regra de LGPD.</p> : <>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14 }}>
          <div><div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Situação</div><b>{r.situacao === 'nada_consta' ? 'Nada consta' : 'Com restrições'}</b></div>
          <div><div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Score</div><b>{r.score ?? '—'}</b></div>
          <div><div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Total negativado</div><b>{brl(r.totalNegativado)}</b></div>
          <div><div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Nome no SPC</div><b>{r.nomeConsultado}</b></div>
        </div>
        <div style={sec}>Negativações ({r.negativacoes.length})</div>
        {!r.negativacoes.length ? <div style={{ fontSize: 13.5 }}>Nenhuma</div> : r.negativacoes.map((n: any, i: number) => (
          <div key={i} style={{ fontSize: 13.5, padding: '6px 0', borderBottom: '1px dashed var(--line)' }}><b>{n.credor}</b> — {brl(n.valor)}<div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{n.natureza} · {new Date(n.data + 'T12:00:00').toLocaleDateString('pt-BR')}</div></div>
        ))}
        <div style={sec}>Protestos ({r.protestos.length})</div>
        {!r.protestos.length ? <div style={{ fontSize: 13.5 }}>Nenhum</div> : r.protestos.map((p: any, i: number) => (
          <div key={i} style={{ fontSize: 13.5, padding: '6px 0', borderBottom: '1px dashed var(--line)' }}><b>{p.cartorio}</b> — {brl(p.valor)} · {new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
        ))}
      </>}
      {d && <>
        <div style={sec}>Todas as consultas deste CPF ({d.historico.length})</div>
        {d.historico.map((h: any) => (
          <div key={h.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px dashed var(--line)', flexWrap: 'wrap' }}>
            <span style={{ width: 128 }}>{dataHoraBR(h.em)}</span>
            <span style={{ fontWeight: 700, color: h.reaproveitadaDe ? '#1e7a3c' : 'var(--terra)', width: 110 }}>{h.reaproveitadaDe ? 'Reaproveitada' : 'Paga'}</span>
            <Link to={'/cadastros/' + h.cadastroId} onClick={onClose}>{h.codigo}</Link>
            <span style={{ color: 'var(--muted)' }}>{h.statusNome}{h.consultora ? ' · ' + h.consultora : ''}{h.autor ? ' · por ' + h.autor : ''}</span>
          </div>
        ))}
      </>}
    </Modal>
  )
}
