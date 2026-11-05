import { useEffect, useState, type ReactNode } from 'react'
import Swal from 'sweetalert2'
import { api } from '../lib/api'
import { Card, btn, inputStyle } from '../components/ui'
import { Carregando, PageHeader, toast } from '../components/extra'

// Itens 7, 9 e 10 do briefing: setor dono de cada etapa + responsável padrão (a passagem entre
// setores fica registrada), alertas automáticos, IA nos documentos e política de descarte (LGPD).
export default function Operacao() {
  const [d, setD] = useState<any>(null)
  const [salvando, setSalvando] = useState(false)
  const carregar = () => api('GET', '/operacao/config').then(setD)
  useEffect(() => { carregar() }, [])
  if (!d) return <Carregando />

  const setEtapa = (st: string, setor: string) => setD({ ...d, setores: { ...d.setores, etapas: { ...d.setores.etapas, [st]: setor } } })
  const setResp = (setor: string, id: string) => setD({ ...d, setores: { ...d.setores, responsaveis: { ...d.setores.responsaveis, [setor]: id ? Number(id) : null } } })
  const setOp = (k: string, v: boolean) => setD({ ...d, operacao: { ...d.operacao, [k]: v } })
  const setL = (k: string, v: unknown) => setD({ ...d, lgpd: { ...d.lgpd, [k]: v } })
  const salvar = async () => {
    setSalvando(true)
    try { const r = await api('PUT', '/operacao/config', { setores: d.setores, operacao: d.operacao, lgpd: d.lgpd }); setD({ ...d, previa: r.previa }); toast('Configurações salvas') }
    catch (e) { toast((e as Error).message, 'error') } finally { setSalvando(false) }
  }
  const rodarAlertas = async () => { const r = await api('POST', '/operacao/alertas/rodar'); toast(`Alertas: ${r.abertos} aberto(s), ${r.fechados} fechado(s)`, 'info') }
  const descartarAgora = async () => {
    const p = d.previa
    const ok = await Swal.fire({ title: 'Descartar agora?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Descartar', cancelButtonText: 'Cancelar', confirmButtonColor: '#d93025',
      html: `Vai apagar <b>de vez</b> os documentos e o SPC completo de <b>${p.cadastros}</b> cadastro(s) encerrado(s) e os dados de <b>${p.quiz}</b> resposta(s) do quiz. Não dá pra desfazer.` })
    if (!ok.isConfirmed) return
    try { const r = await api('POST', '/operacao/lgpd/descartar'); toast(`Descartados: ${r.cadastros} cadastro(s), ${r.arquivos} arquivo(s), ${r.quiz} do quiz`); carregar() }
    catch (e) { toast((e as Error).message, 'error') }
  }

  const etapas = Object.entries(d.etapas as Record<string, { nome: string }>)
  const setoresUsados = Object.keys(d.nomesSetores)
  const linha = (titulo: ReactNode, controle: ReactNode, ajuda?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px dashed var(--line)', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 220px' }}><div style={{ fontSize: 14 }}>{titulo}</div>{ajuda && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{ajuda}</div>}</div>{controle}
    </div>)

  return (
    <div>
      <PageHeader title="Setores, alertas e LGPD" subtitle="Quem cuida de cada etapa, avisos automáticos e guarda de documentos."
        right={<button style={btn('primary')} disabled={salvando} onClick={salvar}>Salvar</button>} />
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Responsável padrão de cada setor">
            <div style={{ padding: '4px 16px 12px' }}>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '8px 0 4px' }}>Quando o cadastro passa pra uma etapa de outro setor, ele vai pra essa pessoa e o histórico registra quem entregou, quem recebeu e o prazo. Nenhuma etapa fica sem dono.</p>
              {setoresUsados.map(s => linha(d.nomesSetores[s],
                <select value={d.setores.responsaveis[s] || ''} onChange={e => setResp(s, e.target.value)} style={{ ...inputStyle, width: 220 }}>
                  <option value="">— sem responsável fixo —</option>
                  {d.equipe.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>))}
            </div>
          </Card>
          <Card title="Setor dono de cada etapa">
            <div style={{ padding: '4px 16px 12px' }}>
              {etapas.map(([st, e]) => linha(e.nome,
                <select value={d.setores.etapas[st] || ''} onChange={ev => setEtapa(st, ev.target.value)} style={{ ...inputStyle, width: 220 }}>
                  {setoresUsados.map(s => <option key={s} value={s}>{d.nomesSetores[s]}</option>)}
                </select>))}
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Alertas automáticos" right={<button style={btn('ghost', { minHeight: 28 })} onClick={rodarAlertas}>Verificar agora</button>}>
            <div style={{ padding: '4px 16px 12px' }}>
              {linha('Ligados', <input type="checkbox" checked={d.operacao.alertas} onChange={e => setOp('alertas', e.target.checked)} />,
                'A cada 15 min o sistema abre um alerta (pendência que só cobra, não trava) pro responsável e fecha sozinho quando resolve.')}
              <ul style={{ fontSize: 13, color: 'var(--ink)', margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
                <li>Passou no quiz e não recebeu o formulário / formulário não concluído</li>
                <li>Avalista não informado · análise humana atrasada</li>
                <li>Documentos faltando ou esperando conferência</li>
                <li>Assinatura atrasada (cliente ou avalista)</li>
                <li>Cadastro liberado → agendar início / montar carga</li>
                <li>Inicialização parada</li>
              </ul>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '8px 0 0' }}>"Parado" = passou do prazo da etapa (Regras de análise → prazos).</p>
            </div>
          </Card>
          <Card title="Integração com o Jueri" right={d.jueri.configurado && <button style={btn('ghost', { minHeight: 28 })} onClick={async () => {
            try { const r = await api('POST', '/operacao/jueri/sincronizar'); toast(r.erro ? r.erro : `Jueri: ${r.vinculados} ligada(s), ${r.atualizados} atualizada(s)`, r.erro ? 'error' : 'success'); carregar() } catch (e) { toast((e as Error).message, 'error') } }}>Sincronizar agora</button>}>
            <div style={{ padding: '10px 16px 12px', fontSize: 13.5 }}>
              <p style={{ margin: '0 0 8px', color: d.jueri.configurado ? '#3c8d0d' : '#b42318', fontWeight: 700 }}>{d.jueri.configurado ? '✓ Jueri configurado' : '✗ Falta configurar o acesso ao Jueri no servidor'}</p>
              <p style={{ margin: 0, color: 'var(--muted)' }}>Revendedora liberada/iniciada é ligada ao Jueri pelo CPF; a cada 6 horas o sistema lê 1ª carga, pedidos, acertos, peças abertas e inadimplência (só leitura).</p>
              {d.jueri.ultimaSync && <p style={{ margin: '8px 0 0' }}>Última: {new Date(d.jueri.ultimaSync.em).toLocaleString('pt-BR')} — {d.jueri.ultimaSync.erro ? <span style={{ color: '#b42318' }}>{d.jueri.ultimaSync.erro}</span> : `${d.jueri.ultimaSync.vinculados} ligada(s), ${d.jueri.ultimaSync.atualizados} atualizada(s)`}</p>}
            </div>
          </Card>
          <Card title="IA na conferência de documentos">
            <div style={{ padding: '4px 16px 12px' }}>
              {linha('Ligada', <input type="checkbox" checked={d.operacao.ia} onChange={e => setOp('ia', e.target.checked)} />,
                'Lê RG/CNH e comprovante assim que a cliente envia e compara com o formulário. Nunca aprova: divergência vira pendência que trava a liberação até alguém conferir.')}
              <p style={{ fontSize: 13, margin: '10px 0 0', color: d.iaDisponivel ? '#3c8d0d' : '#b42318', fontWeight: 700 }}>
                {d.iaDisponivel ? '✓ Chave da IA configurada no servidor' : '✗ Falta configurar a chave da OpenAI no servidor'}</p>
            </div>
          </Card>
          <Card title="Guarda e descarte de documentos (LGPD)">
            <div style={{ padding: '4px 16px 12px' }}>
              {linha('Descarte automático ligado', <input type="checkbox" checked={d.lgpd.ativo} onChange={e => setL('ativo', e.target.checked)} />,
                'Uma vez por dia. Apaga documentos e o SPC completo; mantém nome, etapa e motivo pros relatórios. Revendedora iniciada nunca é descartada.')}
              {linha('Reprovados: guardar por', <span><input type="number" min={30} value={d.lgpd.diasReprovado} onChange={e => setL('diasReprovado', Number(e.target.value))} style={{ ...inputStyle, width: 80 }} /> dias</span>)}
              {linha('Desistências: guardar por', <span><input type="number" min={30} value={d.lgpd.diasDesistencia} onChange={e => setL('diasDesistencia', Number(e.target.value))} style={{ ...inputStyle, width: 80 }} /> dias</span>)}
              {linha('Quiz não aprovado: guardar por', <span><input type="number" min={30} value={d.lgpd.diasQuizNaoAprovado} onChange={e => setL('diasQuizNaoAprovado', Number(e.target.value))} style={{ ...inputStyle, width: 80 }} /> dias</span>)}
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--card-2)', borderRadius: 4, fontSize: 13 }}>
                Hoje entrariam no descarte: <b>{d.previa.cadastros}</b> cadastro(s) ({d.previa.reprovados} reprovados, {d.previa.desistencias} desistências) e <b>{d.previa.quiz}</b> resposta(s) do quiz.
              </div>
              {d.lgpd.ativo && (d.previa.cadastros > 0 || d.previa.quiz > 0) &&
                <button style={btn('danger', { marginTop: 10 })} onClick={descartarAgora}>Descartar agora</button>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
