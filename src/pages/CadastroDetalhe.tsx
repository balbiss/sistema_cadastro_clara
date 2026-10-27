import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, CheckCircle2, Circle, Copy, ExternalLink, FileSignature, FileText, Plus, RefreshCw, XCircle } from 'lucide-react'
import { api, arquivoUrl } from '../lib/api'
import { ETAPA_INIC, FINAIS, STATUS } from '../lib/status'
import { brl, cpfFmt, dataBR, dataHoraBR, telFmt } from '../lib/fmt'
import { Card, Field, Modal, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, Prazo, StatusPill, toast } from '../components/extra'
import { AcaoInic, ordenarAcoes } from './Inicializacao'

type D = any

// Dossiê digital (item 5 do briefing): formulário, consultas, decisão + justificativa, documentos,
// pendências e histórico — tudo do cadastro num lugar só.
export default function CadastroDetalhe() {
  const { id } = useParams()
  const [d, setD] = useState<D | null>(null)
  const [decidir, setDecidir] = useState<string | null>(null)
  const [conferir, setConferir] = useState<D | null>(null)
  const [novaPend, setNovaPend] = useState(false)
  const [desistir, setDesistir] = useState(false)
  const [verDocs, setVerDocs] = useState(false)
  const [refazer, setRefazer] = useState(false)
  const [acaoInic, setAcaoInic] = useState<D | null>(null)
  const carregar = () => api('GET', '/cadastros/' + id).then(setD)
  useEffect(() => { carregar() }, [id])
  // enquanto a análise automática roda, atualiza sozinho
  useEffect(() => { if (d?.cadastro.status === 'formulario_preenchido') { const t = setTimeout(carregar, 1500); return () => clearTimeout(t) } }, [d])
  if (!d) return <Carregando />
  const c = d.cadastro
  const e = c.endereco || {}
  const av = c.avalista
  const encerrado = FINAIS.includes(c.status)
  const nomeResp = (uid: number | null) => d.equipe.find((u: D) => u.id === uid)?.name

  const reanalisar = async () => { try { await api('POST', `/cadastros/${c.id}/reanalisar`); toast('Análise refeita'); carregar() } catch (er) { toast((er as Error).message, 'error') } }
  const trocarResp = async (v: string) => { await api('PATCH', '/cadastros/' + c.id, { responsavelId: v ? Number(v) : null }); toast('Responsável alterado'); carregar() }
  const resolver = async (pid: number) => { await api('POST', `/pendencias/${pid}/resolver`); toast('Pendência resolvida'); carregar() }

  return (
    <div>
      <Link to="/cadastros" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 }}><ArrowLeft size={15} /> Cadastros</Link>

      {/* cabeçalho */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderLeft: `6px solid ${STATUS[c.status]?.cor || '#ccc'}`, borderRadius: 3, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.codigo}{c.crmLeadId ? ` · lead ${c.crmLeadId} no CRM` : ''}</div>
            <h1 style={{ margin: '2px 0 8px', fontSize: 24 }}>{c.nome}</h1>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusPill status={c.status} grande />
              {c.status === 'inicializacao' && <span style={{ fontSize: 13, fontWeight: 700 }}>{c.modalidade === 'online' ? 'Online' : 'Presencial'} · {ETAPA_INIC[c.inicEtapa] || c.inicEtapa}</span>}
              {!encerrado && <span style={{ fontSize: 13 }}>Prazo da etapa: <Prazo prazo={c.prazoEtapa} /></span>}
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>na etapa desde {dataHoraBR(c.etapaEntradaEm)}</span>
            </div>
            {c.motivo && <div style={{ marginTop: 10, fontSize: 14 }}><b>Motivo:</b> {c.motivo} <span style={{ color: 'var(--muted)' }}>— {c.decididoPor || 'automático'}</span></div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {d.podeDecidir && ['analise_humana', 'pendente_avalista', 'reprovado', 'aprovado', 'aprovado_avalista'].includes(c.status) && <button style={btn('primary')} onClick={() => setDecidir('aprovado')}>Decidir</button>}
              {d.podeDecidir && c.formConcluidoEm && ['formulario_preenchido', 'pendente_avalista', 'analise_humana', 'aprovado', 'aprovado_avalista', 'reprovado'].includes(c.status) && <button style={btn('ghost')} onClick={reanalisar}><RefreshCw size={14} /> Reanalisar</button>}
              {!encerrado && <button style={btn('ghost')} onClick={() => setDesistir(true)}>Desistência</button>}
            </div>
            <label style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}>Responsável
              <select value={c.responsavelId || ''} onChange={ev => trocarResp(ev.target.value)} style={{ ...inputStyle, width: 'auto', padding: '4px 8px' }}>
                <option value="">— ninguém —</option>
                {d.equipe.map((u: D) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--muted)', flexWrap: 'wrap' }}>
          Link da cliente:
          <code style={{ background: 'var(--card-2)', padding: '2px 6px', borderRadius: 3, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{c.linkFormulario}</code>
          <button title="Copiar" onClick={() => { navigator.clipboard.writeText(c.linkFormulario); toast('Link copiado') }} style={{ border: 'none', background: 'none', color: 'var(--muted)', display: 'flex' }}><Copy size={14} /></button>
          <a href={c.linkFormulario} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>abrir <ExternalLink size={12} /></a>
        </div>
      </div>

      <div className="grid-dossie">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Análise de crédito">
            {!c.checagens?.length ? <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>{c.formConcluidoEm ? 'Analisando…' : 'Aguardando a cliente preencher o formulário.'}</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {c.checagens.map((k: D, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13.5, alignItems: 'flex-start' }}>
                    {k.ok ? <CheckCircle2 size={16} color="#3c8d0d" style={{ flex: 'none', marginTop: 2 }} /> : <XCircle size={16} color="#d93025" style={{ flex: 'none', marginTop: 2 }} />}
                    <span><b>{k.regra}:</b> {k.detalhe}</span>
                  </div>
                ))}
              </div>
            )}
            {d.consultas.map((q: D) => (
              <div key={q.id} style={{ marginTop: 14, padding: 12, background: 'var(--card-2)', borderRadius: 3, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <b>SPC — {q.pessoa === 'titular' ? 'titular' : 'avalista'} ({cpfFmt(q.cpf)})</b>
                  <span style={{ color: 'var(--muted)' }}>{dataHoraBR(q.createdAt)} · {q.provedor === 'simulado' ? 'consulta de TESTE' : q.provedor}</span>
                </div>
                <div>Nome no SPC: {q.resultado.nomeConsultado}</div>
                {q.resultado.situacao === 'nada_consta' ? <div style={{ color: '#3c8d0d', fontWeight: 700 }}>Nada consta</div> : <>
                  {q.resultado.negativacoes.map((n: D, i: number) => <div key={i}>• {n.credor} — {brl(n.valor)} ({n.natureza}, {dataBR(n.data)})</div>)}
                  {q.resultado.protestos.map((p: D, i: number) => <div key={'p' + i}>• Protesto: {p.cartorio} — {brl(p.valor)} ({dataBR(p.data)})</div>)}
                  <div style={{ marginTop: 4 }}><b>Total negativado: {brl(q.resultado.totalNegativado)}</b></div>
                </>}
              </div>
            ))}
          </Card>

          <Card title="Documentos" right={<span style={{ fontSize: 12.5, color: d.situacaoDocs.situacao === 'completa' ? '#3c8d0d' : 'var(--muted)' }}>
            {d.situacaoDocs.situacao === 'completa' ? 'Tudo conferido' : d.situacaoDocs.situacao === 'em_conferencia' ? 'Aguardando conferência' : `Faltam ${d.situacaoDocs.faltam.length}`}</span>}>
            {!['aprovado', 'aprovado_avalista', 'documentos_ok'].includes(c.status) && !d.documentos.length
              ? <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>A cliente envia os documentos pelo mesmo link depois de aprovada.</p>
              : d.situacaoDocs.itens.map((i: D) => {
                const doc = d.documentos.find((x: D) => x.id === i.docId)
                return (
                  <div key={i.tipo} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px dashed var(--line)' }}>
                    <FileText size={18} color="var(--muted)" style={{ flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                      <div style={{ fontWeight: 700 }}>{i.nome}</div>
                      <div style={{ fontSize: 12, color: i.status === 'recusado' ? '#d93025' : 'var(--muted)' }}>
                        {i.status === 'faltando' ? 'Não enviado' : i.status === 'enviado' ? 'Enviado — conferir' : i.status === 'conferido' ? `Conferido por ${doc?.conferidoPor}${doc?.dataEmissao ? ' · emitido em ' + dataBR(doc.dataEmissao) : ''}` : `Recusado: ${doc?.observacao}`}
                      </div>
                    </div>
                    {doc && <a href={arquivoUrl(doc.id)} target="_blank" rel="noreferrer" style={btn('ghost', { minHeight: 30, padding: '0 10px' })}>Ver</a>}
                    {doc?.status === 'enviado' && <button style={btn('primary', { minHeight: 30, padding: '0 10px' })} onClick={() => setConferir(doc)}>Conferir</button>}
                  </div>
                )
              })}
            {d.documentos.filter((x: D) => !d.situacaoDocs.itens.some((i: D) => i.docId === x.id)).length > 0 &&
              <details style={{ marginTop: 10, fontSize: 12.5 }}><summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Versões anteriores</summary>
                {d.documentos.filter((x: D) => !d.situacaoDocs.itens.some((i: D) => i.docId === x.id)).map((x: D) => (
                  <div key={x.id} style={{ padding: '4px 0' }}><a href={arquivoUrl(x.id)} target="_blank" rel="noreferrer">{x.nome}</a> — {x.status}{x.observacao ? `: ${x.observacao}` : ''} ({dataHoraBR(x.createdAt)})</div>
                ))}
              </details>}
          </Card>

          {(d.formalizacao || ['documentos_ok', 'aguardando_assinatura'].includes(c.status)) && <Formalizacao d={d} onVer={() => setVerDocs(true)} onRefazer={() => setRefazer(true)} />}
          {(c.status === 'inicializacao' || c.status === 'iniciada') && <Inicializacao c={c} d={d} onAcao={setAcaoInic} />}

          <Card title="Pendências" right={<button style={btn('ghost', { minHeight: 28, padding: '0 10px' })} onClick={() => setNovaPend(true)}><Plus size={14} /> Nova</button>}>
            {!d.pendencias.length ? <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>Nenhuma pendência.</p> : d.pendencias.map((p: D) => (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed var(--line)', opacity: p.resolvidaEm ? 0.55 : 1 }}>
                <div style={{ flex: 1, fontSize: 13.5 }}>
                  <div style={{ textDecoration: p.resolvidaEm ? 'line-through' : undefined }}>{p.descricao}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {nomeResp(p.responsavelId) || 'sem responsável'}{p.prazo ? ' · prazo ' + dataBR(p.prazo) : ''}{p.resolvidaEm ? ` · resolvida por ${p.resolvidaPor} em ${dataHoraBR(p.resolvidaEm)}` : ''}
                  </div>
                </div>
                {!p.resolvidaEm && <button style={btn('ghost', { minHeight: 30, padding: '0 10px' })} onClick={() => resolver(p.id)}><Check size={14} /> Resolver</button>}
              </div>
            ))}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {['aprovado', 'aprovado_avalista', 'documentos_ok', 'aguardando_assinatura', 'inicializacao', 'iniciada'].includes(c.status) && <Card title="Liberação para inicialização"
            right={c.liberadoEm && <span style={{ fontSize: 12, color: '#3c8d0d', fontWeight: 700 }}>liberada {dataHoraBR(c.liberadoEm)}</span>}>
            {d.liberacao.map((r: D) => (
              <div key={r.chave} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '6px 0', fontSize: 13.5 }}>
                {r.ok ? <CheckCircle2 size={17} color="#3c8d0d" style={{ flex: 'none', marginTop: 1 }} /> : <Circle size={17} color="#c9cdd1" style={{ flex: 'none', marginTop: 1 }} />}
                <div><div style={{ fontWeight: r.ok ? 400 : 700 }}>{r.nome}</div>{!r.ok && r.detalhe && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.detalhe}</div>}</div>
              </div>
            ))}
            {!c.liberadoEm && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '8px 0 0' }}>Quando tudo estiver ✓ o cadastro é liberado sozinho e entra na fila de inicialização.</p>}
          </Card>}
          <Card title="Dados do formulário" right={c.formConcluidoEm && <span style={{ fontSize: 12, color: 'var(--muted)' }}>enviado {dataHoraBR(c.formConcluidoEm)}</span>}>
            <Field label="CPF" value={cpfFmt(c.cpf)} empty={!c.cpf} />
            <Field label="Nascimento" value={dataBR(c.dataNascimento)} empty={!c.dataNascimento} />
            <Field label="WhatsApp" value={telFmt(c.telefone)} />
            <Field label="E-mail" value={c.email || '—'} empty={!c.email} />
            <Field label="Endereço" value={e.rua ? `${e.rua}, ${e.numero}${e.complemento ? ' ' + e.complemento : ''} — ${e.bairro}, ${e.cidade}/${e.uf} · CEP ${String(e.cep).replace(/(\d{5})(\d{3})/, '$1-$2')}` : '—'} empty={!e.rua} />
            <Field label="Declarou restrição" value={c.declarouRestricao == null ? '—' : c.declarouRestricao ? 'Sim' : 'Não'} />
            <Field label="Início" value={c.modalidade === 'online' ? 'Online (envio)' : c.modalidade === 'presencial' ? 'Presencial (matriz)' : '—'} />
            <Field label="Consultora" value={c.consultoraNome || '—'} empty={!c.consultoraNome} />
            <Field label="Origem" value={[c.origem, c.campanha].filter(Boolean).join(' · ') || '—'} empty={!c.origem} />
          </Card>
          <Card title="Avalista">
            {!av?.nome ? <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>{c.temAvalista === false ? 'Sem avalista.' : 'Não informado.'}</p> : <>
              <Field label="Nome" value={av.nome} />
              <Field label="CPF" value={cpfFmt(av.cpf)} />
              <Field label="Nascimento" value={dataBR(av.dataNascimento)} />
              <Field label="Telefone" value={telFmt(av.telefone)} />
            </>}
          </Card>
          <Card title="Histórico">
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              {d.eventos.map((ev: D) => (
                <div key={ev.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)', fontSize: 13 }}>
                  <div>{ev.descricao}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>{dataHoraBR(ev.createdAt)} · {ev.autor}</span>
                    <span title={ev.crmErro || ''} style={{ color: ev.crmStatus === 'enviado' ? '#3c8d0d' : ev.crmStatus === 'falhou' ? '#d93025' : 'var(--muted)' }}>
                      {ev.crmStatus === 'enviado' ? '✓ avisado ao CRM' : ev.crmStatus === 'falhou' ? '✗ CRM não recebeu' : ev.crmStatus === 'sem_crm' ? 'CRM não configurado' : 'enviando ao CRM…'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {decidir && <Decidir c={c} onClose={() => setDecidir(null)} onOk={carregar} />}
      {conferir && <Conferir doc={conferir} onClose={() => setConferir(null)} onOk={carregar} />}
      {novaPend && <NovaPendencia c={c} equipe={d.equipe} onClose={() => setNovaPend(false)} onOk={carregar} />}
      {desistir && <Desistencia c={c} onClose={() => setDesistir(false)} onOk={carregar} />}
      {verDocs && d.formalizacao && <VerDocumentos f={d.formalizacao} onClose={() => setVerDocs(false)} />}
      {refazer && <Refazer c={c} valor={d.formalizacao?.valor} onClose={() => setRefazer(false)} onOk={carregar} />}
      {acaoInic && <AcaoInic c={c} acao={acaoInic} onClose={() => setAcaoInic(null)} onOk={carregar} />}
    </div>
  )
}

function Decidir({ c, onClose, onOk }: { c: D; onClose: () => void; onOk: () => void }) {
  const [status, setStatus] = useState('aprovado')
  const [motivo, setMotivo] = useState('')
  const opcoes = [['aprovado', 'Aprovar'], ['aprovado_avalista', 'Aprovar com avalista'], ['pendente_avalista', 'Pedir avalista'], ['reprovado', 'Reprovar']]
  const salvar = async () => { try { await api('POST', `/cadastros/${c.id}/decisao`, { status, motivo }); toast('Decisão registrada'); onClose(); onOk() } catch (e) { toast((e as Error).message, 'error') } }
  return (
    <Modal title="Decisão cadastral" subtitle="Toda decisão manual fica registrada com o seu nome e o motivo, e é avisada ao CRM." onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><button style={btn('primary')} disabled={motivo.trim().length < 3} onClick={salvar}>Registrar</button></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {opcoes.map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v)} style={{ padding: '10px', border: status === v ? '2px solid #8e2a46' : '1px solid var(--line)', borderRadius: 3, background: status === v ? STATUS[v].cor : '#fff', fontWeight: 700, fontSize: 13 }}>{l}</button>
        ))}
      </div>
      <label style={labelStyle}>Motivo *</label>
      <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} style={inputStyle} placeholder="Ex.: dívida já quitada, comprovante apresentado" />
    </Modal>
  )
}

function Conferir({ doc, onClose, onOk }: { doc: D; onClose: () => void; onOk: () => void }) {
  const comprovante = doc.tipo.endsWith('comprovante_residencia')
  const [data, setData] = useState('')
  const [obs, setObs] = useState('')
  const enviar = async (status: 'conferido' | 'recusado') => {
    try {
      const r = await api('POST', `/documentos/${doc.id}/conferir`, { status, observacao: obs || undefined, dataEmissao: data || undefined })
      toast(r.status === 'recusado' && status === 'conferido' ? 'Comprovante com mais de 3 meses — recusado' : r.status === 'conferido' ? 'Documento conferido' : 'Documento recusado', r.status === 'recusado' ? 'info' : 'success')
      onClose(); onOk()
    } catch (e) { toast((e as Error).message, 'error') }
  }
  const img = (doc.mime || '').startsWith('image/')
  return (
    <Modal title={'Conferir — ' + doc.nome} width={640} onClose={onClose}
      subtitle="Confira se o nome, o CPF e o endereço batem com o formulário. Na dúvida, recuse e explique — a cliente vê o motivo e manda de novo."
      footer={<><button style={btn('danger')} disabled={!obs.trim()} onClick={() => enviar('recusado')}>Recusar</button><button style={btn('primary')} disabled={comprovante && !data} onClick={() => enviar('conferido')}>Conferido</button></>}>
      <div style={{ background: 'var(--card-2)', borderRadius: 3, marginBottom: 12, textAlign: 'center' }}>
        {img ? <img src={arquivoUrl(doc.id)} alt={doc.nome} style={{ maxWidth: '100%', maxHeight: 360, display: 'block', margin: '0 auto' }} />
          : <a href={arquivoUrl(doc.id)} target="_blank" rel="noreferrer" style={{ display: 'block', padding: 30 }}>Abrir PDF</a>}
      </div>
      {comprovante && <div style={{ marginBottom: 12 }}><label style={labelStyle}>Data do comprovante * (vale até 3 meses)</label><input type="date" value={data} onChange={e => setData(e.target.value)} style={inputStyle} /></div>}
      <label style={labelStyle}>Motivo da recusa (a cliente vê)</label>
      <input value={obs} onChange={e => setObs(e.target.value)} style={inputStyle} placeholder="Ex.: foto ilegível, documento cortado" />
    </Modal>
  )
}

function NovaPendencia({ c, equipe, onClose, onOk }: { c: D; equipe: D[]; onClose: () => void; onOk: () => void }) {
  const [f, setF] = useState({ descricao: '', responsavelId: '', prazo: '' })
  const salvar = async () => {
    await api('POST', `/cadastros/${c.id}/pendencias`, { descricao: f.descricao, responsavelId: f.responsavelId ? Number(f.responsavelId) : null, prazo: f.prazo || null })
    toast('Pendência criada'); onClose(); onOk()
  }
  return (
    <Modal title="Nova pendência" onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><button style={btn('primary')} disabled={f.descricao.trim().length < 3} onClick={salvar}>Criar</button></>}>
      <label style={labelStyle}>O que precisa ser feito *</label>
      <input value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} style={{ ...inputStyle, marginBottom: 12 }} />
      <div className="grid2">
        <div><label style={labelStyle}>Responsável</label>
          <select value={f.responsavelId} onChange={e => setF({ ...f, responsavelId: e.target.value })} style={inputStyle}>
            <option value="">— escolher —</option>{equipe.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select></div>
        <div><label style={labelStyle}>Prazo</label><input type="date" value={f.prazo} onChange={e => setF({ ...f, prazo: e.target.value })} style={inputStyle} /></div>
      </div>
    </Modal>
  )
}

function Desistencia({ c, onClose, onOk }: { c: D; onClose: () => void; onOk: () => void }) {
  const [motivo, setMotivo] = useState('')
  const salvar = async () => { await api('POST', `/cadastros/${c.id}/desistencia`, { motivo }); toast('Desistência registrada'); onClose(); onOk() }
  return (
    <Modal title="Registrar desistência" subtitle="O motivo vai pro relatório de perdas no CRM." onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><button style={btn('danger')} disabled={motivo.trim().length < 3} onClick={salvar}>Registrar</button></>}>
      <label style={labelStyle}>Motivo *</label>
      <input value={motivo} onChange={e => setMotivo(e.target.value)} style={inputStyle} placeholder="Ex.: desistiu de revender, não respondeu" />
    </Modal>
  )
}

// Item 9: contrato + promissória e quem já assinou (cada um com o próprio link)
function Formalizacao({ d, onVer, onRefazer }: { d: D; onVer: () => void; onRefazer: () => void }) {
  const f = d.formalizacao
  const c = d.cadastro
  if (!f) return <Card title="Contrato e promissória"><p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>Gerando…</p></Card>
  return (
    <Card title="Contrato e promissória" right={<span style={{ fontSize: 12.5, color: f.assinada ? '#3c8d0d' : 'var(--muted)', fontWeight: f.assinada ? 700 : 400 }}>{f.assinada ? 'Tudo assinado' : 'Aguardando assinatura'}</span>}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <FileSignature size={20} color="#8e2a46" />
        <div style={{ flex: 1, minWidth: 180, fontSize: 13.5 }}>
          <b>Promissória de {brl(f.valor)}</b>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>versão {f.versao} · gerada {dataHoraBR(f.createdAt)} por {f.criadoPor}{f.provedor === 'simulado' ? ' · assinatura de TESTE' : ''}</div>
        </div>
        <button style={btn('ghost', { minHeight: 30, padding: '0 10px' })} onClick={onVer}>Ver documentos</button>
        {d.podeDecidir && c.status === 'aguardando_assinatura' && <button style={btn('ghost', { minHeight: 30, padding: '0 10px' })} onClick={onRefazer}>Mudar valor</button>}
      </div>
      {f.assinaturas.map((a: D) => (
        <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px dashed var(--line)', flexWrap: 'wrap' }}>
          {a.assinadoEm ? <CheckCircle2 size={17} color="#3c8d0d" style={{ flex: 'none' }} /> : <Circle size={17} color="#c9cdd1" style={{ flex: 'none' }} />}
          <div style={{ flex: 1, minWidth: 160, fontSize: 13.5 }}>
            <b>{a.nome}</b> <span style={{ color: 'var(--muted)' }}>({a.papel === 'titular' ? 'cliente' : 'avalista'})</span>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.assinadoEm ? `assinou ${dataHoraBR(a.assinadoEm)}${a.ip ? ' · IP ' + a.ip : ''}` : 'ainda não assinou'}</div>
          </div>
          {!a.assinadoEm && <button style={btn('soft', { minHeight: 30, padding: '0 10px' })} onClick={() => { navigator.clipboard.writeText(a.link); toast('Link de assinatura copiado') }}><Copy size={13} /> Copiar link</button>}
          <a href={a.link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12.5 }}>abrir <ExternalLink size={12} /></a>
        </div>
      ))}
    </Card>
  )
}

// Item 6/11: onde a inicialização está e o próximo passo
function Inicializacao({ c, d, onAcao }: { c: D; d: D; onAcao: (a: D) => void }) {
  const etapas = d.inicializacao.etapas as D[]
  const atual = etapas.findIndex(e => e.chave === c.inicEtapa)
  const acoes = ordenarAcoes(d.inicializacao.acoes.filter((a: D) => a.de.includes(c.inicEtapa)), c.inicEtapa)
  const i = c.inicializacao || {}
  const passos = [...etapas, { chave: 'iniciada', nome: 'Iniciada' }]
  return (
    <Card title={`Inicialização ${c.modalidade === 'online' ? 'online' : 'presencial'}`} right={c.status === 'iniciada' && <span style={{ fontSize: 12.5, color: '#3c8d0d', fontWeight: 700 }}>iniciada {dataHoraBR(c.iniciadaEm)}</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 10 }}>
        {passos.map((e: D, k: number) => {
          const feito = c.status === 'iniciada' || k < atual
          const agora = c.status !== 'iniciada' && k === atual
          return (
            <div key={e.chave} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0', fontSize: 13.5, color: feito || agora ? 'var(--ink)' : 'var(--muted)', fontWeight: agora ? 700 : 400 }}>
              {feito ? <CheckCircle2 size={16} color="#3c8d0d" /> : agora ? <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#c8506a', boxShadow: '0 0 0 4px #fbe9ee', flex: 'none' }} /> : <Circle size={16} color="#c9cdd1" />}
              {e.nome}{agora && <span style={{ fontWeight: 400, fontSize: 12 }}> · <Prazo prazo={c.prazoEtapa} /></span>}
            </div>
          )
        })}
      </div>
      {(i.agendadoPara || i.carga || i.valorFrete != null || i.rastreio) && (
        <div style={{ background: 'var(--card-2)', borderRadius: 3, padding: '8px 12px', marginBottom: 10 }}>
          {i.agendadoPara && <Field label="Retirada" value={dataHoraBR(i.agendadoPara)} />}
          {i.carga && <Field label="Carga" value={i.carga + (i.valorCarga ? ' · ' + brl(i.valorCarga) : '')} />}
          {i.valorFrete != null && <Field label="Frete" value={brl(i.valorFrete) + (i.pagoEm ? ' · pago ' + dataHoraBR(i.pagoEm) : ' · aguardando pagamento')} />}
          {i.rastreio && <Field label="Rastreio" value={i.rastreio} />}
          {i.entregueEm && <Field label="Entregue" value={dataHoraBR(i.entregueEm) + (i.entreguePor ? ' · ' + i.entreguePor : '')} />}
        </div>
      )}
      {acoes.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {acoes.map((a: D, k: number) => <button key={a.chave} style={btn(k === 0 ? 'primary' : 'ghost')} onClick={() => onAcao(a)}>{a.nome}</button>)}
      </div>}
    </Card>
  )
}

function VerDocumentos({ f, onClose }: { f: D; onClose: () => void }) {
  const texto = { whiteSpace: 'pre-wrap' as const, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14, lineHeight: 1.5, background: 'var(--card-2)', padding: 14, borderRadius: 3, margin: '0 0 14px' }
  return (
    <Modal title="Contrato e nota promissória" subtitle={`Versão ${f.versao} · código de verificação ${f.hash.slice(0, 16)}`} width={720} onClose={onClose}
      footer={<button style={btn('primary')} onClick={onClose}>Fechar</button>}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>Contrato</h3><p style={texto}>{f.contrato}</p>
      <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>Nota promissória</h3><p style={texto}>{f.promissoria}</p>
    </Modal>
  )
}

function Refazer({ c, valor, onClose, onOk }: { c: D; valor?: number; onClose: () => void; onOk: () => void }) {
  const [v, setV] = useState(String(valor || ''))
  const salvar = async () => {
    try { await api('POST', `/cadastros/${c.id}/formalizacao`, { valor: Number(v) }); toast('Contrato refeito — mande os links novos'); onClose(); onOk() }
    catch (e) { toast((e as Error).message, 'error') }
  }
  return (
    <Modal title="Mudar valor da promissória" subtitle="Gera uma versão nova do contrato e da promissória. Os links antigos deixam de valer e quem já assinou precisa assinar de novo." onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><button style={btn('primary')} disabled={!(Number(v) > 0)} onClick={salvar}>Refazer</button></>}>
      <label style={labelStyle}>Valor (R$)</label>
      <input type="number" min={1} value={v} onChange={e => setV(e.target.value)} style={inputStyle} />
    </Modal>
  )
}
