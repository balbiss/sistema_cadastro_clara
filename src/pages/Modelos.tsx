import { useEffect, useState } from 'react'
import { api, usuarioAtual } from '../lib/api'
import { Card, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, PageHeader, toast } from '../components/extra'

const CAMPOS: [string, string][] = [
  ['{{nome}}', 'nome da cliente'], ['{{cpf}}', 'CPF da cliente'], ['{{endereco}}', 'endereço completo'], ['{{cidade}}', 'cidade'],
  ['{{data}}', 'data de hoje por extenso'], ['{{valor}}', 'valor (R$ 3.000,00)'], ['{{valor_extenso}}', 'valor por extenso'],
  ['{{modalidade}}', 'presencial ou online'], ['{{codigo}}', 'código do cadastro'], ['{{avalista_nome}}', 'nome do avalista'],
  ['{{avalista_cpf}}', 'CPF do avalista'], ['{{texto_avalista}}', '", com aval de Fulano, CPF …" (vazio sem avalista)'],
  ['{{linha_avalista}}', 'linha "Avalista: …" (vazia sem avalista)'],
]

// Item 9 do briefing: modelos do contrato e da nota promissória. Os textos de partida são
// provisórios — a Clara cola aqui os oficiais, e todo contrato novo já sai com eles.
export default function Modelos() {
  const pode = usuarioAtual()?.role === 'diretoria'
  const [m, setM] = useState<any>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { api('GET', '/config/modelos').then(r => setM(r.modelos)) }, [])
  if (!m) return <Carregando />
  const salvar = async () => {
    setSalvando(true)
    try { await api('PUT', '/config/modelos', m); toast('Modelos salvos — valem para os próximos contratos') } catch (e) { toast((e as Error).message, 'error') } finally { setSalvando(false) }
  }
  const area = (k: 'contrato' | 'promissoria') => (
    <textarea disabled={!pode} value={m[k]} onChange={e => setM({ ...m, [k]: e.target.value })} rows={18}
      style={{ ...inputStyle, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14, lineHeight: 1.5, resize: 'vertical' }} />
  )
  return (
    <div>
      <PageHeader title="Contrato e promissória" subtitle={pode ? 'Cole aqui os modelos oficiais. Os campos entre {{ }} são preenchidos sozinhos com os dados da cliente.' : 'Só a diretoria altera os modelos.'}
        right={pode && <button style={btn('primary')} disabled={salvando} onClick={salvar}>Salvar modelos</button>} />
      <div className="grid-dossie" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Contrato de revenda">{area('contrato')}</Card>
          <Card title="Nota promissória">{area('promissoria')}</Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Valor padrão da promissória">
            <label style={labelStyle}>R$</label>
            <input disabled={!pode} type="number" min={1} value={m.valorPadrao} onChange={e => setM({ ...m, valorPadrao: Number(e.target.value) })} style={{ ...inputStyle, width: 160 }} />
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 0 }}>Usado ao gerar o contrato. A análise pode mudar o valor de um cadastro específico no dossiê, antes da assinatura.</p>
          </Card>
          <Card title="Campos automáticos">
            {CAMPOS.map(([c, d]) => (
              <div key={c} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px dashed var(--line)', fontSize: 13 }}>
                <code style={{ flex: 'none', color: '#8e2a46' }}>{c}</code><span style={{ color: 'var(--muted)' }}>{d}</span>
              </div>
            ))}
          </Card>
          <Card title="Assinatura eletrônica">
            <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.5 }}>Por enquanto a assinatura é a <b>de teste</b> do próprio sistema: cada signatário (cliente e avalista) recebe um link, confere o texto, confirma o CPF e assina. Ficam registrados data, hora, IP, aparelho e o código de verificação do texto. Quando a Clara escolher o serviço oficial (Clicksign, ZapSign, D4Sign…), ele entra no lugar desse passo.</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
