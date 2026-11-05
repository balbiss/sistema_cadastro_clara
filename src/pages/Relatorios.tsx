import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { api } from '../lib/api'
import { Card, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, PageHeader, vazio } from '../components/extra'

// Item 8 do briefing — a parte do cadastro: conversão por etapa, tempos, origem, consultora,
// presencial × online, safra (mês de entrada), motivos e onde os cadastros estão parados agora.
const VINHO = '#5a2433', ROSA = '#c8506a'
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '—')
const tempo = (h: number | null) => (h == null ? '—' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1).replace('.', ',')} dias`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const mesBR = (ym: string) => { const [a, m] = ym.split('-'); return new Date(+a, +m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) }
const th: CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--line)', textAlign: 'left', fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', fontSize: 13.5 }

export default function Relatorios() {
  const [f, setF] = useState({ de: iso(new Date(Date.now() - 90 * 86400_000)), ate: iso(new Date()), modalidade: '', origem: '', consultora: '' })
  const [d, setD] = useState<any>(null)
  useEffect(() => {
    setD(null)
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][])
    api('GET', '/relatorios?' + q).then(setD)
  }, [f])

  const baixar = () => {
    const cols = ['codigo', 'nome', 'origem', 'campanha', 'consultora', 'modalidade', 'status', 'motivo', 'entrada', 'formConcluido', 'decidido', 'liberado', 'iniciada']
    const cab = ['Código', 'Nome', 'Origem', 'Campanha', 'Consultora', 'Modalidade', 'Situação', 'Motivo', 'Entrada', 'Formulário concluído', 'Decisão', 'Liberada', 'Iniciada']
    const cel = (v: any) => { if (v == null) return ''; const s = /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? new Date(v).toLocaleString('pt-BR') : String(v); return '"' + s.replace(/"/g, '""') + '"' }
    const csv = '﻿' + [cab.join(';'), ...d.linhas.map((l: any) => cols.map(c => cel(l[c])).join(';'))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `cadastros_${f.de}_a_${f.ate}.csv`; a.click()
  }

  return (
    <div>
      <PageHeader title="Relatórios" subtitle="Conversão, tempos e gargalos do setor de cadastro."
        right={d && <button style={btn('ghost')} onClick={baixar}><Download size={15} /> Baixar planilha</button>} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
        <Filtro rotulo="Entrada de"><input type="date" value={f.de} onChange={e => setF({ ...f, de: e.target.value })} style={inputStyle} /></Filtro>
        <Filtro rotulo="até"><input type="date" value={f.ate} onChange={e => setF({ ...f, ate: e.target.value })} style={inputStyle} /></Filtro>
        <Filtro rotulo="Modalidade"><select value={f.modalidade} onChange={e => setF({ ...f, modalidade: e.target.value })} style={inputStyle}>
          <option value="">Todas</option><option value="presencial">Presencial</option><option value="online">Online</option><option value="indefinida">Ainda não definida</option></select></Filtro>
        <Filtro rotulo="Origem"><select value={f.origem} onChange={e => setF({ ...f, origem: e.target.value })} style={inputStyle}>
          <option value="">Todas</option>{d?.filtros.origens.map((o: string) => <option key={o}>{o}</option>)}</select></Filtro>
        <Filtro rotulo="Consultora"><select value={f.consultora} onChange={e => setF({ ...f, consultora: e.target.value })} style={inputStyle}>
          <option value="">Todas</option>{d?.filtros.consultoras.map((o: string) => <option key={o}>{o}</option>)}</select></Filtro>
      </div>

      {!d ? <Carregando /> : <>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <Numero t="Cadastros no período" v={d.funil[0].n} sub={d.quiz.total ? `${d.quiz.total} fizeram o quiz · ${d.quiz.aprovadas} passaram` : undefined} destaque />
          <Numero t="Aprovados" v={d.decisoes.aprovados} sub={`${d.decisoes.comAvalista} com avalista`} />
          <Numero t="Reprovados" v={d.decisoes.reprovados} sub={`${pct(d.decisoes.reprovados, d.decisoes.aprovados + d.decisoes.reprovados)} das decisões`} />
          <Numero t="Iniciadas" v={d.funil[d.funil.length - 1].n} sub={`${pct(d.funil[d.funil.length - 1].n, d.funil[0].n)} de conversão total`} />
          <Numero t="Desistências" v={d.decisoes.desistencias} />
        </div>

        <div className="grid2" style={{ alignItems: 'start' }}>
          <Card title="Funil de conversão">
            <div style={{ padding: '8px 16px 14px' }}>
              {d.funil[0].n === 0 ? <div style={vazio}>Nenhum cadastro no período.</div> : d.funil.map((e: any, i: number) => {
                const ant = i ? d.funil[i - 1].n : e.n
                return (
                  <div key={e.chave} style={{ marginBottom: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 3 }}>
                      <span>{e.nome}</span>
                      <span><b>{e.n}</b> <span style={{ color: 'var(--muted)', fontSize: 12 }}>{i ? `· ${pct(e.n, ant)} da etapa anterior` : ''}</span></span>
                    </div>
                    <div style={{ height: 10, background: 'var(--card-2)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(e.n / d.funil[0].n) * 100}%`, background: i === d.funil.length - 1 ? '#4f8a3a' : ROSA, borderRadius: 5 }} />
                    </div>
                  </div>)
              })}
            </div>
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title="Tempo médio entre etapas">
              <div style={{ padding: '4px 16px 10px' }}>
                {d.tempos.map((t: any) => (
                  <div key={t.nome} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}>
                    <span>{t.nome}</span><b style={{ color: VINHO }}>{tempo(t.horas)}</b></div>))}
              </div>
            </Card>
            <Card title="Agora: onde os cadastros estão parados">
              <div style={{ padding: '4px 16px 10px' }}>
                {!d.agora.parados.length ? <div style={vazio}>Nenhum cadastro em andamento.</div> : d.agora.parados.map((p: any) => (
                  <div key={p.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}>
                    <span>{p.nome}</span><span><b>{p.n}</b>{p.vencidos ? <span style={{ color: '#c0392b', fontWeight: 700 }}> · {p.vencidos} com prazo vencido</span> : ''}</span></div>))}
              </div>
            </Card>
          </div>
        </div>

        <Carteira d={d} />
        <Tabela titulo="Por origem" linhas={d.porOrigem} />
        <Tabela titulo="Por consultora" linhas={d.porConsultora} />
        <Tabela titulo="Presencial × online" linhas={d.porModalidade} />
        <Tabela titulo="Por safra (mês de entrada)" linhas={d.porSafra.map((s: any) => ({ ...s, nome: mesBR(s.nome) }))}
          ajuda="Cada linha é a turma que entrou naquele mês e o que aconteceu com ela até hoje." />

        <TabelaCarteira titulo="Resultado depois de iniciada — por safra" linhas={d.porSafra.map((s: any) => ({ ...s, nome: mesBR(s.nome) }))} />
        <TabelaCarteira titulo="Resultado depois de iniciada — por origem" linhas={d.porOrigem} />
        <TabelaCarteira titulo="Resultado depois de iniciada — por consultora" linhas={d.porConsultora} />

        <div className="grid2" style={{ alignItems: 'start', marginTop: 16 }}>
          <Motivos titulo="Motivos de reprovação" itens={d.motivosReprovacao} />
          <Motivos titulo="Motivos de desistência" itens={d.motivosDesistencia} />
        </div>

        <div className="grid2" style={{ alignItems: 'start', marginTop: 16 }}>
          <Card title="Agora: com quem está cada coisa">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Responsável</th><th style={th}>Cadastros</th><th style={th}>Pendências</th><th style={th}>Vencidas</th></tr></thead>
              <tbody>{d.agora.porResponsavel.map((r: any) => (
                <tr key={r.nome}><td style={{ ...td, color: r.nome === 'Sem responsável' ? '#b42318' : undefined, fontWeight: 700 }}>{r.nome}</td>
                  <td style={td}>{r.cadastros}</td><td style={td}>{r.pendencias}</td><td style={{ ...td, color: r.vencidas ? '#c0392b' : undefined, fontWeight: r.vencidas ? 700 : 400 }}>{r.vencidas}</td></tr>))}</tbody>
            </table>
          </Card>
          <Card title="Agora: cadastros por setor">
            <div style={{ padding: '4px 16px 10px' }}>
              {!d.agora.porSetor.length ? <div style={vazio}>—</div> : d.agora.porSetor.map((s: any) => (
                <div key={s.setor} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}><span>{s.nome}</span><b>{s.n}</b></div>))}
            </div>
          </Card>
        </div>
      </>}
    </div>
  )
}

function Filtro({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div style={{ flex: '1 1 150px', minWidth: 140 }}><label style={labelStyle}>{rotulo}</label>{children}</div>
}
function Numero({ t, v, sub, destaque }: { t: string; v: ReactNode; sub?: string; destaque?: boolean }) {
  return (
    <div style={{ background: destaque ? ROSA : '#fff', color: destaque ? '#fff' : undefined, border: '1px solid ' + (destaque ? ROSA : 'var(--line)'), borderRadius: 6, padding: '14px 16px', flex: '1 1 160px' }}>
      <div style={{ fontSize: 12.5, opacity: destaque ? 0.9 : 1, color: destaque ? '#fff' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{t}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: destaque ? '#fff' : VINHO }}>{v}</div>
      {sub && <div style={{ fontSize: 12.5, color: destaque ? '#fff' : 'var(--muted)', opacity: destaque ? 0.9 : 1 }}>{sub}</div>}
    </div>)
}
function Tabela({ titulo, linhas, ajuda }: { titulo: string; linhas: any[]; ajuda?: string }) {
  return (
    <Card title={titulo} style={{ marginTop: 16 }}>
      {ajuda && <p style={{ margin: '8px 16px 0', fontSize: 12.5, color: 'var(--muted)' }}>{ajuda}</p>}
      {!linhas.length ? <div style={vazio}>Sem dados no período.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['', 'Cadastros', 'Form. concluído', 'Aprovados', 'Reprovados', 'Iniciadas', 'Conversão', 'Dias até iniciar'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{linhas.map(l => (
              <tr key={l.nome}>
                <td style={{ ...td, fontWeight: 700 }}>{l.nome}</td><td style={td}>{l.total}</td><td style={td}>{l.concluidos}</td>
                <td style={td}>{l.aprovados}</td><td style={td}>{l.reprovados}</td><td style={td}>{l.iniciadas}</td>
                <td style={{ ...td, fontWeight: 700, color: VINHO }}>{Math.round(l.conversao * 100)}%</td>
                <td style={td}>{l.diasAteIniciar == null ? '—' : l.diasAteIniciar.toFixed(1).replace('.', ',')}</td>
              </tr>))}</tbody>
          </table>
        </div>)}
    </Card>)
}
function Motivos({ titulo, itens }: { titulo: string; itens: { motivo: string; n: number }[] }) {
  return (
    <Card title={titulo}>
      <div style={{ padding: '4px 16px 10px' }}>
        {!itens.length ? <div style={vazio}>Nenhum no período.</div> : itens.map(m => (
          <div key={m.motivo} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}>
            <span>{m.motivo}</span><b>{m.n}</b></div>))}
      </div>
    </Card>)
}

const brlR = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))
/** Resultado da carteira (Jueri): o que as revendedoras iniciadas no período fizeram depois. */
function Carteira({ d }: { d: any }) {
  const k = d.carteira
  return (
    <Card title="Resultado da carteira (Jueri)" style={{ marginTop: 16 }} right={<span style={{ fontSize: 12, color: 'var(--muted)' }}>
      {!d.jueri.configurado ? 'Jueri não configurado' : d.jueri.ultimaSync ? 'Atualizado ' + new Date(d.jueri.ultimaSync.em).toLocaleString('pt-BR') : 'Aguardando 1ª sincronização'}</span>}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '12px 16px' }}>
        <Numero t="Iniciadas" v={k.iniciadas} sub={`${k.ligadasJueri} ligadas ao Jueri`} />
        <Numero t="Ativas hoje" v={k.ativasHoje} sub={k.ligadasJueri ? pct(k.ativasHoje, k.ligadasJueri) + ' das ligadas' : undefined} />
        <Numero t="Inadimplentes" v={k.inadimplentes} sub={k.ligadasJueri ? pct(k.inadimplentes, k.ligadasJueri) + ' das ligadas' : undefined} />
        <Numero t="Pedidos por revendedora" v={k.pedidosMedio == null ? '—' : k.pedidosMedio.toFixed(1).replace('.', ',')} />
        <Numero t="Faturamento" v={brlR(k.faturamento)} sub="vendido nos acertos" />
        <Numero t="LTV médio" v={brlR(k.ltv)} sub="venda real por revendedora" />
      </div>
    </Card>)
}
function TabelaCarteira({ titulo, linhas }: { titulo: string; linhas: any[] }) {
  const com = linhas.filter(l => l.carteira?.iniciadas)
  return (
    <Card title={titulo} style={{ marginTop: 16 }}>
      {!com.length ? <div style={vazio}>Nenhuma revendedora iniciada nesse recorte.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['', 'Iniciadas', 'No Jueri', 'Ativas hoje', 'Inadimplentes', 'Pedidos/rev.', '1ª carga média', 'Faturamento', 'LTV'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{com.map(l => { const k = l.carteira; return (
              <tr key={l.nome}>
                <td style={{ ...td, fontWeight: 700 }}>{l.nome}</td><td style={td}>{k.iniciadas}</td><td style={td}>{k.ligadasJueri}</td>
                <td style={td}>{k.ativasHoje}</td><td style={{ ...td, color: k.inadimplentes ? '#c0392b' : undefined, fontWeight: k.inadimplentes ? 700 : 400 }}>{k.inadimplentes}</td>
                <td style={td}>{k.pedidosMedio == null ? '—' : k.pedidosMedio.toFixed(1).replace('.', ',')}</td>
                <td style={td}>{brlR(k.primeiraCargaMedia)}</td><td style={td}>{brlR(k.faturamento)}</td><td style={{ ...td, fontWeight: 700, color: VINHO }}>{brlR(k.ltv)}</td>
              </tr>) })}</tbody>
          </table>
        </div>)}
    </Card>)
}
