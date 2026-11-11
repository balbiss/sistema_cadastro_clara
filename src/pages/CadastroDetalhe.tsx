import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, CheckCircle2, Circle, Copy, ExternalLink, FileSignature, FileText, FolderOpen, Plus, RefreshCw, XCircle } from 'lucide-react'
import { api, arquivoUrl } from '../lib/api'
import { ETAPA_INIC, FINAIS, SETORES, STATUS } from '../lib/status'
import { brl, cpfFmt, dataBR, dataHoraBR, telFmt } from '../lib/fmt'
import { Card, Field, Modal, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, Prazo, StatusPill, TipoPend, toast } from '../components/extra'
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
  const [transferir, setTransferir] = useState(false)
  const [iaRodando, setIaRodando] = useState<number | null>(null) // hooks sempre antes do "if (!d) return" (React #310)
  const [incluirAv, setIncluirAv] = useState(false)
  const [decAv, setDecAv] = useState<{ a: D; status: string } | null>(null)
  const carregar = () => api('GET', '/cadastros/' + id).then(setD)
  useEffect(() => { carregar() }, [id])
  // enquanto a análise automática roda, atualiza sozinho
  useEffect(() => { if (d?.cadastro.status === 'formulario_preenchido') { const t = setTimeout(carregar, 1500); return () => clearTimeout(t) } }, [d])
  if (!d) return <Carregando />
  const c = d.cadastro
  const e = c.endereco || {}
  const encerrado = FINAIS.includes(c.status)
  const nomeResp = (uid: number | null) => d.equipe.find((u: D) => u.id === uid)?.name

  const reanalisar = async () => { try { await api('POST', `/cadastros/${c.id}/reanalisar`); toast('Análise refeita'); carregar() } catch (er) { toast((er as Error).message, 'error') } }
  const trocarResp = async (v: string) => { await api('PATCH', '/cadastros/' + c.id, { responsavelId: v ? Number(v) : null }); toast('Responsável alterado'); carregar() }
  const rodarIa = async (docId: number) => {
    setIaRodando(docId)
    try { await api('POST', `/documentos/${docId}/ia`); toast('IA leu o documento'); carregar() }
    catch (e) { toast((e as Error).message, 'error') } finally { setIaRodando(null) }
  }
  const passar = async (corpo: { userId?: number; pendenciaId?: number }, nome: string, motivo?: string) => {
    if (!corpo.userId && !window.confirm('Passar o cadastro para ' + nome + '? Documentos, SPC e histórico continuam no mesmo cadastro.')) return
    try { await api('POST', `/cadastros/${c.id}/transferir`, { ...corpo, motivo }); toast('Cadastro passado para ' + nome); setTransferir(false); carregar() }
    catch (er) { toast((er as Error).message, 'error') }
  }
  const resolver = async (pid: number) => { await api('POST', `/pendencias/${pid}/resolver`); toast('Pendência resolvida'); carregar() }

  return (
    <div>
      <Link to="/cadastros" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 }}><ArrowLeft size={15} /> Cadastros</Link>

      {/* cabeçalho */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderLeft: `6px solid ${STATUS[c.status]?.cor || '#ccc'}`, borderRadius: 3, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.codigo}{c.crmLeadId ? ` · lead ${c.crmLeadId} no CRM` : ''} · pasta: <b>{d.pasta}</b></div>
            <h1 style={{ margin: '2px 0 8px', fontSize: 24 }}>{c.nome}</h1>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusPill status={c.status} inicEtapa={c.inicEtapa} grande />
              {c.setor && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Setor: <b style={{ color: 'var(--ink)' }}>{SETORES[c.setor] || c.setor}</b></span>}
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

          <Card title="Documentos da candidata" right={<span style={{ fontSize: 12.5, color: d.situacaoDocs.situacao === 'completa' ? '#3c8d0d' : 'var(--muted)' }}>
            {d.situacaoDocs.situacao === 'completa' ? 'Tudo conferido' : d.situacaoDocs.situacao === 'em_conferencia' ? 'Aguardando conferência' : `Faltam ${d.situacaoDocs.faltam.length}`}</span>}>
            {!['aprovado', 'aprovado_avalista', 'documentos_ok'].includes(c.status) && !d.documentos.length
              ? <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>A cliente envia os documentos pelo mesmo link depois de aprovada.</p>
              : d.situacaoDocs.itens.filter((i: D) => !i.tipo.startsWith('avalista_')).map((i: D) =>
                <DocLinha key={i.tipo} nome={i.nome} status={i.status} doc={d.documentos.find((x: D) => x.id === i.docId)} d={d} iaRodando={iaRodando} onIa={rodarIa} onConferir={setConferir} />)}
            {d.situacaoDocs.itens.some((i: D) => i.tipo.startsWith('avalista_')) && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '8px 0 0' }}>Os documentos do avalista ficam na pasta dele (cartão Avalistas).</p>}
            {d.documentos.filter((x: D) => !x.tipo.startsWith('avalista_') && !d.situacaoDocs.itens.some((i: D) => i.docId === x.id)).length > 0 &&
              <details style={{ marginTop: 10, fontSize: 12.5 }}><summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Versões anteriores</summary>
                {d.documentos.filter((x: D) => !x.tipo.startsWith('avalista_') && !d.situacaoDocs.itens.some((i: D) => i.docId === x.id)).map((x: D) => (
                  <div key={x.id} style={{ padding: '4px 0' }}>{d.limitado ? x.nome : <a href={arquivoUrl(x.id)} target="_blank" rel="noreferrer">{x.nome}</a>} — {x.status}{x.observacao ? `: ${x.observacao}` : ''} ({dataHoraBR(x.createdAt)})</div>
                ))}
              </details>}
          </Card>

          {(d.formalizacao || ['documentos_ok', 'aguardando_assinatura'].includes(c.status)) && <Formalizacao d={d} onVer={() => setVerDocs(true)} onRefazer={() => setRefazer(true)} />}
          {(c.status === 'inicializacao' || c.status === 'iniciada') && <Inicializacao c={c} d={d} onAcao={setAcaoInic} />}
          {(c.status === 'inicializacao' || c.status === 'iniciada') && <JueriCard c={c} onAtualizado={carregar} />}

          <Card title="Pendências" right={<button style={btn('ghost', { minHeight: 28, padding: '0 10px' })} onClick={() => setNovaPend(true)}><Plus size={14} /> Nova</button>}>
            {!d.pendencias.length ? <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>Nenhuma pendência.</p> : d.pendencias.map((p: D) => (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed var(--line)', opacity: p.resolvidaEm ? 0.55 : 1 }}>
                <div style={{ flex: 1, fontSize: 13.5 }}>
                  <div style={{ textDecoration: p.resolvidaEm ? 'line-through' : undefined }}>{!p.resolvidaEm && <TipoPend p={p} />}{p.descricao}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {nomeResp(p.responsavelId) || 'sem responsável'}{p.prazo ? ' · prazo ' + dataBR(p.prazo) : ''}{p.resolvidaEm ? ` · resolvida por ${p.resolvidaPor} em ${dataHoraBR(p.resolvidaEm)}` : ''}
                  </div>
                </div>
                {!p.resolvidaEm && d.podeTransferir && d.abordagens.find((a: D) => a.pendenciaId === p.id) && (
                  <button style={btn('soft', { minHeight: 30, padding: '0 10px' })} title="Passa o cadastro pra ela; documentos e SPC continuam no mesmo cadastro"
                    onClick={() => passar({ pendenciaId: p.id }, d.abordagens.find((a: D) => a.pendenciaId === p.id).consultoraNome)}>Passar p/ {d.abordagens.find((a: D) => a.pendenciaId === p.id).consultoraNome}</button>)}
                {!p.resolvidaEm && <button style={btn('ghost', { minHeight: 30, padding: '0 10px' })} onClick={() => resolver(p.id)}><Check size={14} /> {p.alerta?.startsWith('abordagem:') ? 'Manter com ' + (c.consultoraNome || 'a atual') : 'Resolver'}</button>}
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
            <Field label="Atendente" value={<span>{c.consultoraNome || '—'}{d.podeTransferir && <button onClick={() => setTransferir(true)} style={{ marginLeft: 8, border: 'none', background: 'none', padding: 0, color: 'var(--terra)', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>transferir</button>}</span>} empty={!c.consultoraNome} />
            <Field label="Origem" value={[c.origem, c.campanha].filter(Boolean).join(' · ') || '—'} empty={!c.origem} />
            {c.cidade && <Field label="Cidade (quiz)" value={c.cidade} />}
          </Card>
          {c.quiz && <Card title="Quiz de perfil" right={<span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--vinho)' }}>{c.quiz.pontos} pontos</span>}>
            {c.quiz.itens.map((i: any, k: number) => (
              <div key={k} style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}>
                <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{i.pergunta}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{i.resposta}</span><span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{i.pontos} pt</span></div>
              </div>))}
          </Card>}
          <Avalistas d={d} iaRodando={iaRodando} onIa={rodarIa} onConferir={setConferir} onIncluir={() => setIncluirAv(true)} onDecidir={(a, status) => setDecAv({ a, status })} />
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
      {transferir && <Transferir equipe={d.equipe} atual={c.consultoraNome} onClose={() => setTransferir(false)} onOk={(id, nome, motivo) => passar({ userId: id }, nome, motivo)} />}
      {verDocs && d.formalizacao && <VerDocumentos f={d.formalizacao} onClose={() => setVerDocs(false)} />}
      {refazer && <Refazer c={c} valor={d.formalizacao?.valor} onClose={() => setRefazer(false)} onOk={carregar} />}
      {acaoInic && <AcaoInic c={c} acao={acaoInic} onClose={() => setAcaoInic(null)} onOk={carregar} />}
      {incluirAv && <IncluirAvalista c={c} onClose={() => setIncluirAv(false)} onOk={carregar} />}
      {decAv && <DecidirAvalista a={decAv.a} status={decAv.status} onClose={() => setDecAv(null)} onOk={carregar} />}
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

/** O que a IA achou do documento (item 5). Nunca aprova — só ajuda quem confere. */
function IaResumo({ ia }: { ia: D }) {
  if (ia.erro) return <div style={{ fontSize: 12, color: '#8a5a00', marginTop: 3 }}>IA não conseguiu ler — conferir manualmente</div>
  return (
    <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
      {ia.divergencias?.map((t: string, k: number) => <div key={k} style={{ color: '#c0392b' }}>⚠ IA: {t}</div>)}
      {ia.ok?.length > 0 && <div style={{ color: '#3c8d0d' }}>✓ IA: {ia.ok.join(' · ')}</div>}
      {!ia.divergencias?.length && !ia.ok?.length && <div style={{ color: 'var(--muted)' }}>IA leu o documento, sem dados pra comparar</div>}
    </div>
  )
}


/** Itens 2/12 do briefing: desempenho da revendedora no Jueri (só leitura). */
function JueriCard({ c, onAtualizado }: { c: D; onAtualizado: () => void }) {
  const [rodando, setRodando] = useState(false)
  const j = c.jueri
  const atualizar = async () => {
    setRodando(true)
    try { const r = await api('POST', `/operacao/jueri/cadastro/${c.id}`); toast(r.jueriId ? 'Dados do Jueri atualizados' : 'Revendedora não encontrada no Jueri pelo CPF', r.jueriId ? 'success' : 'info'); onAtualizado() }
    catch (e) { toast((e as Error).message, 'error') } finally { setRodando(false) }
  }
  const linha = (rot: string, val: React.ReactNode, cor?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--muted)' }}>{rot}</span><b style={{ color: cor, textAlign: 'right' }}>{val}</b></div>)
  return (
    <Card title="Desempenho no Jueri" right={<button style={btn('ghost', { minHeight: 28, padding: '0 10px' })} disabled={rodando} onClick={atualizar}><RefreshCw size={13} /> {rodando ? 'Buscando…' : 'Atualizar'}</button>}>
      {!c.jueriId ? <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: 0 }}>Ainda não ligada ao Jueri. A ligação é feita sozinha pelo CPF quando a revendedora é iniciada (e a cada 6 horas).</p>
        : !j ? <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: 0 }}>Ligada (id {c.jueriId}). Clique em Atualizar pra buscar os pedidos.</p> : <>
        {j.inadimplente && <div style={{ background: '#fdecea', color: '#b3261e', fontWeight: 700, fontSize: 13, padding: '8px 10px', borderRadius: 4, marginBottom: 8 }}>
          ⚠ Inadimplência: {j.perdidos.n ? `${j.perdidos.n} pedido(s) perdido(s) (${brl(j.perdidos.valor)})` : ''}{j.perdidos.n && j.acertoAtrasadoDias ? ' · ' : ''}{j.acertoAtrasadoDias ? `acerto atrasado há ${j.acertoAtrasadoDias} dias` : ''}</div>}
        {linha('Revendedora no Jueri', `${j.nome || ''} (id ${c.jueriId})`)}
        {linha('1ª carga', j.primeiraCarga ? `${dataBR(j.primeiraCarga.data)} · ${j.primeiraCarga.pecas} peças${j.primeiraCarga.valor != null ? ' · ' + brl(j.primeiraCarga.valor) : ''}` : '—')}
        {linha('Pedidos / acertos', `${j.pedidos} pedido(s) · ${j.acertos} acerto(s)`)}
        {linha('Último pedido', j.ultimoPedido ? dataBR(j.ultimoPedido) : '—')}
        {linha('Situação hoje', j.ativa ? `Ativa (${j.pecasAbertas} peças abertas)` : `Sem maleta ativa (${j.pecasAbertas} peças abertas)`, j.ativa ? '#3c8d0d' : '#8a5a00')}
        {linha('Faturamento (vendido nos acertos)', brl(j.faturamento || 0), '#3c8d0d')}
        {j.comissao != null && linha('Comissão dela', brl(j.comissao))}
        {linha('Valor das maletas levadas (consignado)', brl(j.valorConsignado))}
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '8px 0 0' }}>Atualizado {dataHoraBR(j.atualizadoEm)}. Faturamento = o que ela vendeu de fato (valor depois da baixa em cada acerto). O valor das maletas não é venda.</p>
      </>}
    </Card>)
}

// Item 4.2 do relatório de ajustes: a gerência passa o cadastro pra outra atendente (mesmo cadastro, mesmos documentos e SPC)
function Transferir({ equipe, atual, onClose, onOk }: { equipe: D[]; atual?: string | null; onClose: () => void; onOk: (id: number, nome: string, motivo: string) => void }) {
  const [id, setId] = useState('')
  const [motivo, setMotivo] = useState('')
  const pessoas = equipe.filter(p => p.role !== 'logistica' && p.name !== atual)
  const escolhida = pessoas.find(p => String(p.id) === id)
  return (
    <Modal title="Transferir atendente" subtitle={`Hoje com ${atual || 'ninguém'}. Documentos, consulta ao SPC e histórico continuam no mesmo cadastro.`} onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><button style={btn('primary')} disabled={!escolhida} onClick={() => escolhida && onOk(escolhida.id, escolhida.name, motivo)}>Transferir</button></>}>
      <label style={labelStyle}>Passar para</label>
      <select value={id} onChange={e => setId(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }}>
        <option value="">Escolha…</option>
        {pessoas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <label style={labelStyle}>Motivo (opcional)</label>
      <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: a Bia não deu sequência; a Natália retomou o contato" style={inputStyle} />
    </Modal>
  )
}

// ---------- Relatório 2, item 3: pasta de cada avalista dentro do cadastro ----------
const COR_AV: Record<string, { bg: string; fg: string }> = {
  aprovado: { bg: '#e3f6dc', fg: '#2f6f0b' }, reprovado: { bg: '#fdecea', fg: '#b3261e' },
  em_analise: { bg: '#fff4d6', fg: '#8a5a00' }, substituido: { bg: '#eef0f2', fg: '#5b636b' },
}
const PODE_DECIDIR_AV = ['formulario_preenchido', 'pendente_avalista', 'analise_humana', 'aprovado_avalista', 'reprovado']

function DocLinha({ nome, status, doc, d, iaRodando, onIa, onConferir }: { nome: string; status: string; doc?: D; d: D; iaRodando: number | null; onIa: (id: number) => void; onConferir: (doc: D) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px dashed var(--line)' }}>
      <FileText size={18} color="var(--muted)" style={{ flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
        <div style={{ fontWeight: 700 }}>{nome}</div>
        <div style={{ fontSize: 12, color: status === 'recusado' ? '#d93025' : 'var(--muted)' }}>
          {status === 'faltando' ? 'Não enviado' : status === 'enviado' ? 'Enviado — conferir' : status === 'conferido' ? `Conferido por ${doc?.conferidoPor}${doc?.dataEmissao ? ' · emitido em ' + dataBR(doc.dataEmissao) : ''}` : `Recusado: ${doc?.observacao}`}
        </div>
        {doc?.ia && <IaResumo ia={doc.ia} />}
      </div>
      {doc && d.podeConferir && <button title="Pedir pra IA ler este documento de novo" disabled={iaRodando === doc.id} style={btn('ghost', { minHeight: 30, padding: '0 10px' })} onClick={() => onIa(doc.id)}>{iaRodando === doc.id ? 'Lendo…' : 'IA'}</button>}
      {doc && !d.limitado && <a href={arquivoUrl(doc.id)} target="_blank" rel="noreferrer" style={btn('ghost', { minHeight: 30, padding: '0 10px' })}>Ver</a>}
      {doc?.status === 'enviado' && d.podeConferir && <button style={btn('primary', { minHeight: 30, padding: '0 10px' })} onClick={() => onConferir(doc)}>Conferir</button>}
    </div>
  )
}

function Avalistas({ d, iaRodando, onIa, onConferir, onIncluir, onDecidir }: { d: D; iaRodando: number | null; onIa: (id: number) => void; onConferir: (doc: D) => void; onIncluir: () => void; onDecidir: (a: D, status: string) => void }) {
  const c = d.cadastro
  const lista: D[] = d.avalistas || []
  const podeIncluir = !d.limitado || d.cadastro.status === 'pendente_avalista'
  const aguardando = ['pendente_avalista', 'analise_humana'].includes(c.status)
  return (
    <Card title={`Avalistas${lista.length ? ` (${lista.length} de ${d.avalistaTentativas.max})` : ''}`}
      right={aguardando && podeIncluir && lista.length < d.avalistaTentativas.max && <button style={btn('ghost', { minHeight: 28, padding: '0 10px' })} onClick={onIncluir}><Plus size={14} /> Incluir</button>}>
      {!lista.length ? <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
        {c.status === 'pendente_avalista' ? 'Aguardando a candidata informar o avalista pelo link (ou inclua aqui).' : c.temAvalista === false ? 'Sem avalista.' : 'Nenhum avalista apresentado.'}</p>
        : lista.map(a => {
          const cor = COR_AV[a.status] || COR_AV.substituido
          const e = a.endereco || {}
          // documentos do avalista que vale: usa a lista de exigidos (mostra também o que falta)
          const itens = a.vigente ? d.situacaoDocs.itens.filter((i: D) => i.tipo.startsWith('avalista_')) : []
          const soltos = a.documentos.filter((x: D) => !itens.some((i: D) => i.docId === x.id))
          return (
            <details key={a.id} open={a.vigente || a.status === 'em_analise'} style={{ border: `1px solid ${a.vigente ? '#9fd38a' : 'var(--line)'}`, borderRadius: 6, marginBottom: 10, background: a.vigente ? '#fbfff9' : '#fff' }}>
              <summary style={{ cursor: 'pointer', padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', listStyle: 'none' }}>
                <FolderOpen size={17} color={cor.fg} style={{ flex: 'none' }} />
                <b style={{ fontSize: 14 }}>Avalista {a.ordem} — {a.nome}</b>
                {a.parentescoNome && <span style={{ fontSize: 13, color: 'var(--muted)' }}>({a.parentescoNome})</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 3, background: cor.bg, color: cor.fg }}>
                  {a.vigente ? '✓ Aprovado — vale para o cadastro' : a.statusNome}</span>
              </summary>
              <div style={{ padding: '0 12px 12px' }}>
                {a.motivo && <div style={{ fontSize: 13, marginBottom: 6 }}><b>{a.status === 'aprovado' ? 'Resultado' : 'Motivo'}:</b> {a.motivo} <span style={{ color: 'var(--muted)' }}>— {a.decididoPor || 'automático'}{a.decididoEm ? ', ' + dataHoraBR(a.decididoEm) : ''}</span></div>}
                <Field label="CPF" value={cpfFmt(a.cpf)} />
                <Field label="Nascimento" value={dataBR(a.dataNascimento)} empty={!a.dataNascimento} />
                <Field label="WhatsApp" value={telFmt(a.telefone)} empty={!a.telefone} />
                {e.rua && <Field label="Endereço" value={`${e.rua}, ${e.numero}${e.complemento ? ' ' + e.complemento : ''} — ${e.bairro}, ${e.cidade}/${e.uf}`} />}
                <Field label="Informado" value={`${dataHoraBR(a.createdAt)} · ${a.informadoPor || '—'}`} />
                {a.checagens?.length > 0 && <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {a.checagens.map((k: D, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                      {k.ok ? <CheckCircle2 size={15} color="#3c8d0d" style={{ flex: 'none', marginTop: 2 }} /> : <XCircle size={15} color="#d93025" style={{ flex: 'none', marginTop: 2 }} />}
                      <span><b>{String(k.regra).replace(/^Avalista \d+ — /, '')}:</b> {k.detalhe}</span>
                    </div>))}
                </div>}
                {a.quiz?.itens?.length > 0 && <details style={{ marginTop: 8, fontSize: 13 }}><summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Quiz do avalista · {a.quiz.pontos} pontos</summary>
                  {a.quiz.itens.map((i: D, k: number) => <div key={k} style={{ padding: '4px 0', borderBottom: '1px dashed var(--line)' }}><span style={{ color: 'var(--muted)' }}>{i.pergunta}</span> — {i.resposta} <span style={{ color: 'var(--muted)' }}>({i.pontos} pt)</span></div>)}
                </details>}
                {a.consultas.map((q: D) => (
                  <div key={q.id} style={{ marginTop: 8, padding: 10, background: 'var(--card-2)', borderRadius: 3, fontSize: 12.5 }}>
                    <b>SPC</b> · {dataHoraBR(q.createdAt)}{q.reaproveitadaDe ? ' · reaproveitada (sem custo)' : ''} — {q.resultado.situacao === 'nada_consta' ? <b style={{ color: '#3c8d0d' }}>nada consta</b>
                      : <>restrições de <b>{brl(q.resultado.totalNegativado)}</b>{q.resultado.protestos?.length ? ' + protesto' : ''}</>}
                    {q.resultado.score != null && <> · score {q.resultado.score}</>}
                  </div>))}
                {(itens.length > 0 || soltos.length > 0) && <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Documentos do avalista</div>
                  {itens.map((i: D) => <DocLinha key={i.tipo} nome={i.nome.replace(/^Avalista — /, '')} status={i.status} doc={d.documentos.find((x: D) => x.id === i.docId)} d={d} iaRodando={iaRodando} onIa={onIa} onConferir={onConferir} />)}
                  {soltos.map((x: D) => <DocLinha key={x.id} nome={x.nome.replace(/^Avalista — /, '') + ' (' + dataBR(x.createdAt) + ')'} status={x.status} doc={x} d={d} iaRodando={iaRodando} onIa={onIa} onConferir={onConferir} />)}
                </div>}
                {a.vigente && d.formalizacao && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>Contrato e promissória: assinatura do avalista {d.formalizacao.assinaturas.find((s: D) => s.papel === 'avalista')?.assinadoEm ? 'feita ✓' : 'pendente'} (veja o cartão "Contrato e promissória").</div>}
                {d.podeDecidir && a.status !== 'substituido' && PODE_DECIDIR_AV.includes(c.status) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {a.status !== 'aprovado' && <button style={btn('soft', { minHeight: 30, padding: '0 10px' })} onClick={() => onDecidir(a, 'aprovado')}>Aprovar avalista</button>}
                    {a.status !== 'reprovado' && <button style={btn('ghost', { minHeight: 30, padding: '0 10px' })} onClick={() => onDecidir(a, 'reprovado')}>Não aprovar</button>}
                  </div>)}
              </div>
            </details>)
        })}
    </Card>
  )
}

function DecidirAvalista({ a, status, onClose, onOk }: { a: D; status: string; onClose: () => void; onOk: () => void }) {
  const [motivo, setMotivo] = useState('')
  const salvar = async () => {
    try { await api('POST', `/avalistas/${a.id}/decisao`, { status, motivo }); toast(status === 'aprovado' ? 'Avalista aprovado' : 'Avalista não aprovado'); onClose(); onOk() }
    catch (e) { toast((e as Error).message, 'error') }
  }
  return (
    <Modal title={`${status === 'aprovado' ? 'Aprovar' : 'Não aprovar'} o avalista ${a.ordem} — ${a.nome}`}
      subtitle={status === 'aprovado' ? 'Ele passa a valer para o cadastro: os documentos dele são pedidos e ele assina o contrato junto.' : 'O histórico dele fica guardado. Se ainda houver tentativa, a candidata pode apresentar outro avalista.'}
      onClose={onClose} footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><button style={btn(status === 'aprovado' ? 'primary' : 'danger')} disabled={motivo.trim().length < 3} onClick={salvar}>Registrar</button></>}>
      <label style={labelStyle}>Motivo *</label>
      <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} style={inputStyle} placeholder="Ex.: dívida do avalista já quitada, comprovante apresentado" />
    </Modal>
  )
}

function IncluirAvalista({ c, onClose, onOk }: { c: D; onClose: () => void; onOk: () => void }) {
  const [cfg, setCfg] = useState<D>(null)
  const [f, setF] = useState({ nome: '', cpf: '', dataNascimento: '', telefone: '', parentesco: '' })
  const [resp, setResp] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { api('GET', '/config/avalista').then(r => setCfg(r.regras)) }, [])
  const salvar = async () => {
    setSalvando(true)
    try {
      const r = await api('POST', `/cadastros/${c.id}/avalistas`, { ...f, dataNascimento: f.dataNascimento || undefined, telefone: f.telefone || undefined, parentesco: f.parentesco || undefined, respostas: resp })
      toast('Avalista incluído — resultado: ' + (STATUS[r.status]?.nome || r.status)); onClose(); onOk()
    } catch (e) { toast((e as Error).message, 'error') } finally { setSalvando(false) }
  }
  const visiveis = (cfg?.perguntas || []).filter((p: D) => !p.mostrarSe || p.mostrarSe.opcoes.includes(resp[p.mostrarSe.perguntaId]))
  return (
    <Modal title="Incluir avalista" subtitle="Use quando a candidata passou os dados do avalista pelo WhatsApp. A análise roda na hora (requisitos e, se passar, o SPC)." width={600} onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><button style={btn('primary')} disabled={salvando || f.nome.trim().length < 3 || f.cpf.replace(/\D/g, '').length !== 11} onClick={salvar}>{salvando ? 'Analisando…' : 'Incluir e analisar'}</button></>}>
      <div className="grid2">
        <div><label style={labelStyle}>Nome completo *</label><input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>CPF *</label><input value={f.cpf} onChange={e => setF({ ...f, cpf: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>Nascimento</label><input type="date" value={f.dataNascimento} onChange={e => setF({ ...f, dataNascimento: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>WhatsApp</label><input value={f.telefone} onChange={e => setF({ ...f, telefone: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>Vínculo com a candidata</label>
          <select value={f.parentesco} onChange={e => setF({ ...f, parentesco: e.target.value })} style={inputStyle}>
            <option value="">—</option>{cfg?.parentescos.map((p: D) => <option key={p.id} value={p.id}>{p.nome}{p.aceito ? '' : ' (não aceito)'}</option>)}
          </select></div>
      </div>
      {visiveis.map((p: D) => (
        <div key={p.id} style={{ marginTop: 10 }}>
          <label style={labelStyle}>{p.texto}</label>
          {p.tipo === 'texto' ? <input value={resp[p.id] || ''} onChange={e => setResp({ ...resp, [p.id]: e.target.value })} style={inputStyle} />
            : <select value={resp[p.id] || ''} onChange={e => setResp({ ...resp, [p.id]: e.target.value })} style={inputStyle}>
              <option value="">—</option>{p.opcoes.map((o: D) => <option key={o.id} value={o.id}>{o.texto}</option>)}</select>}
        </div>))}
    </Modal>
  )
}
