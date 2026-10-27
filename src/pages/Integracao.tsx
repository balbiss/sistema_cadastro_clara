import { useEffect, useState } from 'react'
import { Copy, KeyRound, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { dataHoraBR } from '../lib/fmt'
import { Card, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, PageHeader, toast } from '../components/extra'

// Ponte com o CRM: o CRM chama a API daqui (chave) e recebe cada acontecimento pelo webhook.
export default function Integracao() {
  const [d, setD] = useState<any>(null)
  const [url, setUrl] = useState('')
  const carregar = () => api('GET', '/config/integracao').then(r => { setD(r); setUrl(r.webhookUrl || '') })
  useEffect(() => { carregar() }, [])
  if (!d) return <Carregando />
  const copiar = (t: string) => { navigator.clipboard.writeText(t); toast('Copiado') }
  const gerar = async () => { await api('POST', '/config/integracao/gerar-chave'); toast('Chave gerada — atualize no CRM'); carregar() }
  const salvar = async () => { await api('PUT', '/config/integracao', { webhookUrl: url }); toast('Endereço do CRM salvo'); carregar() }
  const reenviar = async () => { await api('POST', '/config/integracao/reenviar'); toast('Reenviando avisos'); setTimeout(carregar, 1200) }
  const crmTeste = `${location.protocol}//${location.hostname}:3013/api/crm-teste/webhook`
  const cor: Record<string, string> = { enviado: '#3c8d0d', falhou: '#d93025', sem_crm: 'var(--muted)', pendente: '#c98a00' }
  const nome: Record<string, string> = { enviado: 'entregue', falhou: 'falhou', sem_crm: 'sem CRM', pendente: 'na fila' }

  return (
    <div>
      <PageHeader title="Integração com o CRM" subtitle="O Clara Cadastros é separado do CRM, mas os dois conversam sozinhos." />
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="1. CRM → Cadastros (abrir cadastro)">
            <p style={{ fontSize: 13.5, marginTop: 0 }}>Quando a consultora clica <b>“Enviar formulário”</b> no card do lead, o CRM chama este endereço com a chave e recebe o link pra mandar no WhatsApp.</p>
            <label style={labelStyle}>Endereço da API</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}><input readOnly value={d.apiUrl + '/cadastros'} style={inputStyle} /><button style={btn('soft')} onClick={() => copiar(d.apiUrl + '/cadastros')}><Copy size={14} /></button></div>
            <label style={labelStyle}>Chave de API (header X-Api-Key)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input readOnly value={d.apiKey || 'nenhuma — gere uma'} style={inputStyle} />
              {d.apiKey && <button style={btn('soft')} onClick={() => copiar(d.apiKey)}><Copy size={14} /></button>}
              <button style={btn('ghost')} onClick={gerar}><KeyRound size={14} /> {d.apiKey ? 'Trocar' : 'Gerar'}</button>
            </div>
          </Card>
          <Card title="2. Cadastros → CRM (avisos)">
            <p style={{ fontSize: 13.5, marginTop: 0 }}>Cada acontecimento (formulário preenchido, SPC, decisão, documento, pendência…) é avisado ao CRM <b>na ordem em que aconteceu</b>, com status, motivo e link do dossiê. É assim que o CRM move o card e monta os relatórios.</p>
            <label style={labelStyle}>Endereço do CRM que recebe os avisos (webhook)</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…/webhooks/cadastros" style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={btn('primary')} onClick={salvar}>Salvar</button>
              <button style={btn('ghost')} onClick={() => setUrl(crmTeste)}>Usar CRM de teste</button>
            </div>
            {d.webhookSecret && <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 0 }}>Assinatura: header <code>X-Cadastros-Assinatura</code> = sha256 HMAC com o segredo <code style={{ overflowWrap: 'anywhere' }}>{d.webhookSecret}</code></p>}
          </Card>
        </div>
        <Card title="Últimos avisos ao CRM" right={<button style={btn('ghost', { minHeight: 28, padding: '0 10px' })} onClick={reenviar}><RefreshCw size={13} /> Reenviar falhas</button>}>
          {!d.log.length ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>Nenhum aviso ainda.</p> : d.log.map((l: any) => (
            <div key={l.id} style={{ padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span><b>{l.nome}</b> <span style={{ color: 'var(--muted)' }}>{l.codigo}</span></span>
                <span title={l.crmErro || ''} style={{ color: cor[l.crmStatus], fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>{nome[l.crmStatus]}</span>
              </div>
              <div>{l.descricao}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{dataHoraBR(l.createdAt)} · {l.tipo}{l.crmErro ? ' · ' + l.crmErro : ''}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
