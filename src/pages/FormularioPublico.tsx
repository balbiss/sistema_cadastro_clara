import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarClock, CheckCircle2, FileSignature, Truck, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { ClaraLogo } from '../components/extra'

// O que a cliente abre pelo link do WhatsApp (sem login, pensado pro celular). O mesmo link
// muda conforme a etapa: formulário → avalista → documentos → assinatura → primeira carga → concluído.
const input: CSSProperties = { width: '100%', height: 44, padding: '0 12px', border: '1px solid #C3C7CC', borderRadius: 4, fontSize: 16, background: '#fff' }
const label: CSSProperties = { display: 'block', fontSize: 14, fontWeight: 700, margin: '14px 0 6px', color: '#4a2430' }
const botao: CSSProperties = { width: '100%', height: 48, border: 'none', borderRadius: 4, background: '#8e2a46', color: '#fff', fontSize: 16, fontWeight: 700, marginTop: 22 }
const mascCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
const mascTel = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
const mascCep = (v: string) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')

export default function FormularioPublico() {
  const { token } = useParams()
  const [info, setInfo] = useState<any>(null)
  const [erro, setErro] = useState('')
  const carregar = () => api('GET', '/publico/' + token).then(setInfo).catch(e => setErro(e.message))
  useEffect(() => { carregar(); api('POST', `/publico/${token}/iniciar`).catch(() => {}) }, [token])

  return (
    <div style={{ minHeight: '100vh', background: '#fbf4f6' }}>
      <header style={{ background: '#f0d0d7', padding: '18px 16px', display: 'flex', justifyContent: 'center' }}>
        <ClaraLogo width={170} color="#5a2433" center />
      </header>
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 60px' }}>
        {erro ? <Aviso titulo="Link inválido">{erro}. Fale com a sua consultora.</Aviso>
          : !info ? null
          : info.etapa === 'formulario' ? <Formulario token={token!} info={info} onOk={carregar} />
          : info.etapa === 'avalista' ? <AvalistaForm token={token!} onOk={carregar} />
          : info.etapa === 'documentos' ? <Documentos token={token!} info={info} onOk={carregar} />
          : info.etapa === 'assinatura' ? <Assinatura info={info} />
          : info.etapa === 'inicializacao' ? <PrimeiraCarga info={info} />
          : info.etapa === 'concluido' ? <Aviso titulo="Bem-vinda à Clara Ferreira! 🎉" ok>Sua primeira carga foi entregue. Agora é com você — sua consultora vai te acompanhar nas vendas.</Aviso>
          : info.etapa === 'encerrado' ? <Aviso titulo="Cadastro encerrado">No momento não foi possível seguir com o seu cadastro. Sua consultora vai entrar em contato.</Aviso>
          : <Aviso titulo="Recebemos seus dados!" ok>Estamos analisando o seu cadastro. Você vai receber a resposta pelo WhatsApp.</Aviso>}
      </main>
    </div>
  )
}

function Aviso({ titulo, children, ok }: { titulo: string; children: ReactNode; ok?: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: 6, padding: '28px 20px', textAlign: 'center', boxShadow: '0 2px 10px rgba(90,36,51,.08)' }}>
      {ok && <CheckCircle2 size={44} color="#8e2a46" />}
      <h2 style={{ color: '#5a2433', margin: '10px 0 8px' }}>{titulo}</h2>
      <p style={{ color: '#4a2430', fontSize: 16, lineHeight: 1.5, margin: 0 }}>{children}</p>
    </div>
  )
}

const Caixa = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <section style={{ background: '#fff', borderRadius: 6, padding: '6px 16px 18px', marginBottom: 14, boxShadow: '0 2px 10px rgba(90,36,51,.06)' }}>
    <h3 style={{ color: '#5a2433', fontSize: 17, margin: '14px 0 0' }}>{titulo}</h3>{children}
  </section>
)

function SimNao({ valor, onChange }: { valor: boolean | null; onChange: (v: boolean) => void }) {
  const b = (v: boolean): CSSProperties => ({ flex: 1, height: 44, borderRadius: 4, fontSize: 15, fontWeight: 700, border: valor === v ? '2px solid #8e2a46' : '1px solid #C3C7CC', background: valor === v ? '#fbe9ee' : '#fff', color: '#4a2430' })
  return <div style={{ display: 'flex', gap: 10 }}><button type="button" style={b(true)} onClick={() => onChange(true)}>Sim</button><button type="button" style={b(false)} onClick={() => onChange(false)}>Não</button></div>
}

function Formulario({ token, info, onOk }: { token: string; info: any; onOk: () => void }) {
  const [f, setF] = useState({ nome: info.nome || '', cpf: mascCpf(info.cpf || ''), dataNascimento: '', telefone: mascTel(info.telefone || ''), email: info.email || '',
    cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' })
  const [restricao, setRestricao] = useState<boolean | null>(null)
  const [temAvalista, setTemAvalista] = useState<boolean | null>(null)
  const [av, setAv] = useState({ nome: '', cpf: '', dataNascimento: '', telefone: '' })
  const [modalidade, setModalidade] = useState<'presencial' | 'online' | ''>('')
  const [lgpd, setLgpd] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  // CEP → endereço (ViaCEP)
  useEffect(() => {
    const cep = f.cep.replace(/\D/g, '')
    if (cep.length !== 8) return
    fetch(`https://viacep.com.br/ws/${cep}/json/`).then(r => r.json()).then(j => {
      if (!j.erro) setF(x => ({ ...x, rua: x.rua || j.logradouro, bairro: x.bairro || j.bairro, cidade: j.localidade, uf: j.uf }))
    }).catch(() => {})
  }, [f.cep])

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (restricao === null || temAvalista === null || !modalidade) return setMsg('Responda todas as perguntas.')
    if (!lgpd) return setMsg('Marque a autorização para continuar.')
    setEnviando(true); setMsg('')
    try {
      await api('POST', `/publico/${token}/formulario`, {
        nome: f.nome, cpf: f.cpf, dataNascimento: f.dataNascimento, telefone: f.telefone, email: f.email || undefined,
        endereco: { cep: f.cep, rua: f.rua, numero: f.numero, complemento: f.complemento || undefined, bairro: f.bairro, cidade: f.cidade, uf: f.uf },
        declarouRestricao: restricao, temAvalista, avalista: temAvalista ? av : undefined, modalidade, aceiteLgpd: true,
      })
      onOk()
    } catch (er) { setMsg((er as Error).message) } finally { setEnviando(false) }
  }

  return (
    <form onSubmit={enviar}>
      <p style={{ color: '#4a2430', fontSize: 16, lineHeight: 1.5, margin: '0 0 14px' }}>Olá{info.nome ? ', ' + info.nome.split(' ')[0] : ''}! Preencha seus dados para começar a revender <b>Clara Ferreira</b>. Leva uns 3 minutos.</p>
      <Caixa titulo="Seus dados">
        <label style={label}>Nome completo</label><input required value={f.nome} onChange={set('nome')} style={input} />
        <label style={label}>CPF</label><input required inputMode="numeric" value={f.cpf} onChange={e => setF({ ...f, cpf: mascCpf(e.target.value) })} style={input} placeholder="000.000.000-00" />
        <label style={label}>Data de nascimento</label><input required type="date" value={f.dataNascimento} onChange={set('dataNascimento')} style={input} />
        <label style={label}>WhatsApp</label><input required inputMode="tel" value={f.telefone} onChange={e => setF({ ...f, telefone: mascTel(e.target.value) })} style={input} />
        <label style={label}>E-mail (opcional)</label><input type="email" value={f.email} onChange={set('email')} style={input} />
      </Caixa>
      <Caixa titulo="Endereço">
        <label style={label}>CEP</label><input required inputMode="numeric" value={f.cep} onChange={e => setF({ ...f, cep: mascCep(e.target.value) })} style={input} placeholder="00000-000" />
        <label style={label}>Rua</label><input required value={f.rua} onChange={set('rua')} style={input} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={label}>Número</label><input required value={f.numero} onChange={set('numero')} style={input} /></div>
          <div style={{ flex: 2 }}><label style={label}>Complemento</label><input value={f.complemento} onChange={set('complemento')} style={input} /></div>
        </div>
        <label style={label}>Bairro</label><input required value={f.bairro} onChange={set('bairro')} style={input} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 3 }}><label style={label}>Cidade</label><input required value={f.cidade} onChange={set('cidade')} style={input} /></div>
          <div style={{ flex: 1 }}><label style={label}>UF</label><input required maxLength={2} value={f.uf} onChange={e => setF({ ...f, uf: e.target.value.toUpperCase() })} style={input} /></div>
        </div>
      </Caixa>
      <Caixa titulo="Situação financeira">
        <label style={label}>Você tem alguma restrição no nome (SPC/Serasa)?</label>
        <SimNao valor={restricao} onChange={setRestricao} />
        <label style={label}>Você tem alguém que pode ser seu avalista?</label>
        <SimNao valor={temAvalista} onChange={setTemAvalista} />
        {temAvalista && <>
          <label style={label}>Nome do avalista</label><input required value={av.nome} onChange={e => setAv({ ...av, nome: e.target.value })} style={input} />
          <label style={label}>CPF do avalista</label><input required inputMode="numeric" value={av.cpf} onChange={e => setAv({ ...av, cpf: mascCpf(e.target.value) })} style={input} />
          <label style={label}>Nascimento do avalista</label><input required type="date" value={av.dataNascimento} onChange={e => setAv({ ...av, dataNascimento: e.target.value })} style={input} />
          <label style={label}>WhatsApp do avalista</label><input inputMode="tel" value={av.telefone} onChange={e => setAv({ ...av, telefone: mascTel(e.target.value) })} style={input} />
        </>}
      </Caixa>
      <Caixa titulo="Como você prefere começar?">
        {([['presencial', 'Retirar na matriz (presencial)'], ['online', 'Receber pelos Correios (online)']] as const).map(([v, l]) => (
          <label key={v} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15, marginTop: 12, color: '#4a2430' }}>
            <input type="radio" name="modalidade" checked={modalidade === v} onChange={() => setModalidade(v)} style={{ width: 20, height: 20, accentColor: '#8e2a46' }} />{l}
          </label>
        ))}
      </Caixa>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: '#4a2430', lineHeight: 1.45 }}>
        <input type="checkbox" checked={lgpd} onChange={e => setLgpd(e.target.checked)} style={{ width: 22, height: 22, flex: 'none', accentColor: '#8e2a46' }} />
        Autorizo a Clara Ferreira Acessórios a usar meus dados para analisar meu cadastro, inclusive consulta de crédito, conforme a Lei Geral de Proteção de Dados (LGPD).
      </label>
      {msg && <p style={{ color: '#b3261e', fontWeight: 700, marginBottom: 0 }}>{msg}</p>}
      <button disabled={enviando} style={botao}>{enviando ? 'Enviando…' : 'Enviar cadastro'}</button>
    </form>
  )
}

function AvalistaForm({ token, onOk }: { token: string; onOk: () => void }) {
  const [av, setAv] = useState({ nome: '', cpf: '', dataNascimento: '', telefone: '' })
  const [msg, setMsg] = useState('')
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await api('POST', `/publico/${token}/avalista`, av); onOk() } catch (er) { setMsg((er as Error).message) }
  }
  return (
    <form onSubmit={enviar}>
      <p style={{ color: '#4a2430', fontSize: 16, lineHeight: 1.5 }}>Para seguir com o seu cadastro, precisamos dos dados de um <b>avalista</b> (alguém que garanta o seu cadastro).</p>
      <Caixa titulo="Dados do avalista">
        <label style={label}>Nome completo</label><input required value={av.nome} onChange={e => setAv({ ...av, nome: e.target.value })} style={input} />
        <label style={label}>CPF</label><input required inputMode="numeric" value={av.cpf} onChange={e => setAv({ ...av, cpf: mascCpf(e.target.value) })} style={input} />
        <label style={label}>Data de nascimento</label><input required type="date" value={av.dataNascimento} onChange={e => setAv({ ...av, dataNascimento: e.target.value })} style={input} />
        <label style={label}>WhatsApp</label><input inputMode="tel" value={av.telefone} onChange={e => setAv({ ...av, telefone: mascTel(e.target.value) })} style={input} />
      </Caixa>
      {msg && <p style={{ color: '#b3261e', fontWeight: 700 }}>{msg}</p>}
      <button style={botao}>Enviar avalista</button>
    </form>
  )
}

function Documentos({ token, info, onOk }: { token: string; info: any; onOk: () => void }) {
  const [enviando, setEnviando] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const enviar = async (tipo: string, file?: File) => {
    if (!file) return
    const fd = new FormData(); fd.append('tipo', tipo); fd.append('arquivo', file)
    setEnviando(tipo); setMsg('')
    try { await api('POST', `/publico/${token}/documentos`, fd); onOk() } catch (e) { setMsg((e as Error).message) } finally { setEnviando(null) }
  }
  const faltam = info.documentos.filter((d: any) => !d.enviado).length
  return (
    <div>
      <Aviso titulo="Cadastro aprovado! 🎉" ok>Agora envie os documentos abaixo. Pode ser foto pelo celular, bem legível.</Aviso>
      <div style={{ marginTop: 14 }}>
        {info.documentos.map((d: any) => (
          <div key={d.tipo} style={{ background: '#fff', borderRadius: 6, padding: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12, border: d.recusado ? '2px solid #f37575' : '1px solid #eadde1' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#4a2430' }}>{d.nome}</div>
              <div style={{ fontSize: 13, color: d.recusado ? '#b3261e' : d.enviado ? '#3c8d0d' : '#85525f' }}>{d.recusado ? 'Precisa enviar de novo: ' + d.observacao : d.enviado ? 'Recebido ✓' : 'Falta enviar'}</div>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 4, background: d.enviado && !d.recusado ? '#fff' : '#8e2a46', color: d.enviado && !d.recusado ? '#8e2a46' : '#fff', border: '1px solid #8e2a46', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              <Upload size={16} />{enviando === d.tipo ? 'Enviando…' : d.enviado && !d.recusado ? 'Trocar' : 'Enviar'}
              <input type="file" accept="image/*,application/pdf" hidden onChange={e => enviar(d.tipo, e.target.files?.[0])} />
            </label>
          </div>
        ))}
      </div>
      {msg && <p style={{ color: '#b3261e', fontWeight: 700 }}>{msg}</p>}
      {!faltam && <p style={{ textAlign: 'center', color: '#4a2430' }}>Recebemos tudo! Estamos conferindo os seus documentos.</p>}
    </div>
  )
}

function Assinatura({ info }: { info: any }) {
  const a = info.assinatura
  if (!a) return <Aviso titulo="Preparando seu contrato" ok>Seus documentos foram conferidos. Em instantes o contrato fica pronto aqui.</Aviso>
  if (a.assinou) return <Aviso titulo="Contrato assinado ✓" ok>{a.avalistaPendente ? 'Falta só o seu avalista assinar. Ele recebe o link dele pela sua consultora.' : 'Tudo certo! Já já combinamos a sua primeira carga.'}</Aviso>
  return (
    <div style={{ background: '#fff', borderRadius: 6, padding: '28px 20px', textAlign: 'center', boxShadow: '0 2px 10px rgba(90,36,51,.08)' }}>
      <FileSignature size={44} color="#8e2a46" />
      <h2 style={{ color: '#5a2433', margin: '10px 0 8px' }}>Falta assinar o contrato</h2>
      <p style={{ color: '#4a2430', fontSize: 16, lineHeight: 1.5, margin: 0 }}>Seus documentos foram aprovados! Agora leia e assine o contrato de revenda e a nota promissória.</p>
      <a href={'/assinar/' + a.token} style={{ ...botao, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Ler e assinar</a>
    </div>
  )
}

function PrimeiraCarga({ info }: { info: any }) {
  const i = info.inicializacao || {}
  const quando = i.agendadoPara && new Date(i.agendadoPara).toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const presencial = info.modalidade !== 'online'
  let titulo = 'Estamos preparando a sua primeira carga', texto = 'Sua consultora vai combinar os detalhes com você pelo WhatsApp.', Icone = presencial ? CalendarClock : Truck
  if (presencial && i.agendadoPara) { titulo = 'Sua retirada está marcada'; texto = `Te esperamos na matriz ${quando}.` }
  if (presencial && !i.agendadoPara) { titulo = 'Vamos agendar a sua retirada'; texto = 'Sua consultora vai combinar com você o melhor dia para buscar a sua primeira carga na matriz.' }
  if (!presencial && i.etapa === 'aguardando_pagamento') { titulo = 'Sua carga está pronta!'; texto = `O frete para te enviar fica em ${brl(i.valorFrete || 0)}. Sua consultora manda os dados do pagamento pelo WhatsApp.` }
  if (!presencial && i.etapa === 'expedicao') { titulo = 'Pagamento recebido ✓'; texto = 'Sua carga vai ser enviada pelos Correios nos próximos dias.' }
  if (!presencial && i.rastreio) { titulo = 'Sua carga está a caminho!'; texto = `Código de rastreamento: ${i.rastreio}` }
  return (
    <div style={{ background: '#fff', borderRadius: 6, padding: '28px 20px', textAlign: 'center', boxShadow: '0 2px 10px rgba(90,36,51,.08)' }}>
      <Icone size={44} color="#8e2a46" />
      <h2 style={{ color: '#5a2433', margin: '10px 0 8px' }}>{titulo}</h2>
      <p style={{ color: '#4a2430', fontSize: 16, lineHeight: 1.5, margin: 0 }}>{texto}</p>
      {i.rastreio && <a href={'https://rastreamento.correios.com.br/app/index.php?objetos=' + i.rastreio} target="_blank" rel="noreferrer" style={{ ...botao, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Acompanhar nos Correios</a>}
    </div>
  )
}
