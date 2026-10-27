import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ListChecks } from 'lucide-react'
import { api } from '../lib/api'
import { ORDEM, STATUS } from '../lib/status'
import { Card } from '../components/ui'
import { Carregando, PageHeader } from '../components/extra'

type Resumo = { porStatus: Record<string, number>; vencidos: number; pendenciasAbertas: number }

// Visão do setor (item 8 "Controle operacional"): quantos cadastros em cada etapa, prazos vencidos
// e pendências abertas. Os indicadores completos ficam no CRM, que recebe todos os avisos.
export default function Painel() {
  const nav = useNavigate()
  const [r, setR] = useState<Resumo | null>(null)
  useEffect(() => { api('GET', '/cadastros/resumo').then(setR) }, [])
  if (!r) return <Carregando />
  const total = Object.values(r.porStatus).reduce((a, b) => a + b, 0)
  const conv = (s: string[]) => s.reduce((a, k) => a + (r.porStatus[k] || 0), 0)
  const aprovados = conv(['aprovado', 'aprovado_avalista', 'documentos_ok'])
  const decididos = aprovados + conv(['reprovado'])

  return (
    <div>
      <PageHeader title="Painel" subtitle="Situação dos cadastros de novas revendedoras" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Indicador titulo="Cadastros" valor={total} />
        <Indicador titulo="Aprovados" valor={aprovados} detalhe={decididos ? `${Math.round((aprovados / decididos) * 100)}% dos decididos` : undefined} />
        <Indicador titulo="Prazos vencidos" valor={r.vencidos} alerta={r.vencidos > 0} onClick={() => nav('/cadastros?vencidos=1')} icone={<AlertTriangle size={16} />} />
        <Indicador titulo="Pendências abertas" valor={r.pendenciasAbertas} alerta={r.pendenciasAbertas > 0} onClick={() => nav('/pendencias')} icone={<ListChecks size={16} />} />
      </div>
      <Card title="Cadastros por etapa">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ORDEM.map(s => {
            const n = r.porStatus[s] || 0
            return (
              <button key={s} onClick={() => nav('/cadastros?status=' + s)} className="hoverable"
                style={{ display: 'grid', gridTemplateColumns: '210px 1fr 50px', alignItems: 'center', gap: 12, padding: '6px 8px', border: '1px solid transparent', borderRadius: 3, background: 'none', textAlign: 'left' }}>
                <span style={{ fontSize: 13.5 }}>{STATUS[s].nome}</span>
                <span style={{ height: 14, background: 'var(--card-2)', borderRadius: 2, overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: total ? `${(n / total) * 100}%` : 0, minWidth: n ? 6 : 0, background: STATUS[s].cor, borderRight: n ? '1px solid rgba(0,0,0,.12)' : 'none' }} />
                </span>
                <b style={{ textAlign: 'right' }}>{n}</b>
              </button>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function Indicador({ titulo, valor, detalhe, alerta, onClick, icone }: { titulo: string; valor: number; detalhe?: string; alerta?: boolean; onClick?: () => void; icone?: React.ReactNode }) {
  return (
    <div onClick={onClick} className={onClick ? 'hoverable' : undefined}
      style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 3, padding: '14px 16px', cursor: onClick ? 'pointer' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: alerta ? '#d93025' : 'var(--muted)' }}>{icone}{titulo}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 4, color: alerta ? '#d93025' : 'var(--ink)' }}>{valor}</div>
      {detalhe && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{detalhe}</div>}
    </div>
  )
}
