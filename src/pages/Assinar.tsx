import { useEffect, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Printer, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { dataHoraBR } from '../lib/fmt'
import { ClaraLogo } from '../components/extra'

// Assinatura do contrato + nota promissória (item 9). Link próprio de cada signatário (cliente e
// avalista), sem login, pensado pro celular. Por enquanto é a assinatura SIMULADA do sistema:
// confere o CPF e registra data, IP e aparelho. Quando a Clara escolher o serviço, este passo vira o dele.
const caixa: CSSProperties = { background: '#fff', borderRadius: 6, padding: '18px 16px', marginBottom: 14, boxShadow: '0 2px 10px rgba(90,36,51,.06)' }
const texto: CSSProperties = { whiteSpace: 'pre-wrap', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14.5, lineHeight: 1.55, color: '#2b2b2b', margin: 0, maxHeight: 420, overflowY: 'auto' }
const mascCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')

export default function Assinar() {
  const { token } = useParams()
  const [d, setD] = useState<any>(null)
  const [erro, setErro] = useState('')
  const [cpf, setCpf] = useState('')
  const [aceite, setAceite] = useState(false)
  const [msg, setMsg] = useState('')
  const [enviando, setEnviando] = useState(false)
  const carregar = () => api('GET', '/assinatura/' + token).then(setD).catch(e => setErro(e.message))
  useEffect(() => { carregar() }, [token])

  const assinar = async () => {
    setEnviando(true); setMsg('')
    try { await api('POST', '/assinatura/' + token, { cpf, aceite: true }); carregar() } catch (e) { setMsg((e as Error).message) } finally { setEnviando(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fbf4f6' }}>
      <header className="nao-imprimir" style={{ background: '#f0d0d7', padding: '18px 16px', display: 'flex', justifyContent: 'center' }}>
        <ClaraLogo width={170} color="#5a2433" center />
      </header>
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 60px' }}>
        {erro ? <div style={caixa}><h2 style={{ color: '#5a2433', marginTop: 0 }}>Link inválido</h2><p>{erro}. Fale com a sua consultora.</p></div>
          : !d ? null : <>
            <div className="nao-imprimir" style={{ marginBottom: 14, color: '#4a2430', fontSize: 16, lineHeight: 1.5 }}>
              {d.cancelada ? <div style={{ ...caixa, border: '2px solid #f37575' }}><b>Este contrato foi substituído por uma versão nova.</b> Peça o link atualizado à sua consultora.</div>
                : d.assinadoEm ? <div style={{ ...caixa, textAlign: 'center' }}>
                  <CheckCircle2 size={44} color="#8e2a46" />
                  <h2 style={{ color: '#5a2433', margin: '8px 0' }}>Assinado! 🎉</h2>
                  <p style={{ margin: 0 }}>Você assinou em {dataHoraBR(d.assinadoEm)}. {d.papel === 'titular' ? 'Sua consultora vai combinar a entrega da sua primeira carga.' : 'Obrigada por ser avalista.'}</p>
                </div>
                : <>Olá, <b>{d.nome.split(' ')[0]}</b>! {d.papel === 'titular' ? 'Leia o seu contrato de revenda e a nota promissória e assine no final.' : <>Você foi indicado(a) como <b>avalista</b> de {d.cadastroNome}. Leia os documentos e assine no final.</>}</>}
            </div>

            <section style={caixa}>
              <h3 style={{ color: '#5a2433', margin: '0 0 10px', fontSize: 17 }}>Contrato</h3>
              <p style={texto}>{d.contrato}</p>
            </section>
            <section style={caixa}>
              <h3 style={{ color: '#5a2433', margin: '0 0 10px', fontSize: 17 }}>Nota promissória</h3>
              <p style={texto}>{d.promissoria}</p>
            </section>

            {!d.assinadoEm && !d.cancelada && (
              <section className="nao-imprimir" style={caixa}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 6, color: '#4a2430' }}>Confirme o seu CPF para assinar</label>
                <input inputMode="numeric" value={cpf} onChange={e => setCpf(mascCpf(e.target.value))} placeholder="000.000.000-00"
                  style={{ width: '100%', height: 44, padding: '0 12px', border: '1px solid #C3C7CC', borderRadius: 4, fontSize: 16 }} />
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, color: '#4a2430', lineHeight: 1.45, marginTop: 14 }}>
                  <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} style={{ width: 22, height: 22, flex: 'none', accentColor: '#8e2a46' }} />
                  Li o contrato e a nota promissória e concordo em assiná-los eletronicamente{d.papel === 'avalista' ? ' como avalista' : ''}.
                </label>
                {msg && <p style={{ color: '#b3261e', fontWeight: 700, marginBottom: 0 }}>{msg}</p>}
                <button disabled={!aceite || cpf.replace(/\D/g, '').length !== 11 || enviando} onClick={assinar}
                  style={{ width: '100%', height: 48, border: 'none', borderRadius: 4, background: '#8e2a46', color: '#fff', fontSize: 16, fontWeight: 700, marginTop: 18, opacity: !aceite || cpf.replace(/\D/g, '').length !== 11 ? 0.55 : 1 }}>
                  {enviando ? 'Assinando…' : 'Assinar'}
                </button>
              </section>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#85525f', lineHeight: 1.5 }}>
              <ShieldCheck size={16} style={{ flex: 'none', marginTop: 1 }} />
              <span>Documento {d.codigo} · versão {d.versao} · código de verificação <code style={{ overflowWrap: 'anywhere' }}>{d.hash.slice(0, 16)}</code>. Ao assinar, registramos data, hora e o aparelho usado.
                {d.provedor === 'simulado' && <b> Assinatura de TESTE (o serviço oficial de assinatura ainda vai ser escolhido).</b>}</span>
            </div>
            <button className="nao-imprimir" onClick={() => window.print()} style={{ marginTop: 14, display: 'inline-flex', gap: 6, alignItems: 'center', border: '1px solid #8e2a46', color: '#8e2a46', background: '#fff', borderRadius: 4, padding: '8px 14px', fontWeight: 700 }}>
              <Printer size={16} /> Imprimir / salvar PDF
            </button>
          </>}
      </main>
    </div>
  )
}
