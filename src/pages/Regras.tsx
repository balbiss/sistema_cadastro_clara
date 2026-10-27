import { useEffect, useState } from 'react'
import { api, usuarioAtual } from '../lib/api'
import { ACAO_NOME, STATUS } from '../lib/status'
import { cpfFmt } from '../lib/fmt'
import { Card, btn, inputStyle, labelStyle } from '../components/ui'
import { Carregando, PageHeader, toast } from '../components/extra'

const CENARIO_NOME: Record<string, string> = {
  nada_consta: 'Nada consta', negativacao_pequena: 'Negativação pequena (R$ 180)', negativacao_media: 'Negativação média (R$ 850)',
  negativacao_grande: 'Negativação grande (R$ 4.320)', credor_semijoias: 'Dívida com revenda de semijoias (R$ 450)', protesto: 'Protesto (R$ 900)', nome_divergente: 'Nome diferente do formulário',
}

// Item 4 do briefing: "políticas configuradas pela empresa". As regras de verdade a Bel ainda vai
// definir — aqui ficam os valores de partida, que a diretoria muda sem precisar de programador.
export default function Regras() {
  const pode = usuarioAtual()?.role === 'diretoria'
  const [d, setD] = useState<any>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { api('GET', '/config/regras').then(setD) }, [])
  if (!d) return <Carregando />
  const r = d.regras
  const setR = (k: string, v: unknown) => setD({ ...d, regras: { ...r, [k]: v } })
  const salvar = async () => {
    setSalvando(true)
    try { await api('PUT', '/config/regras', { regras: r, prazos: d.prazos, cenarios: d.cenarios }); toast('Regras salvas — valem para as próximas análises') }
    catch (e) { toast((e as Error).message, 'error') } finally { setSalvando(false) }
  }
  const acao = (k: string) => (
    <select disabled={!pode} value={r[k]} onChange={e => setR(k, e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 230 }}>
      {d.acoes.map((a: string) => <option key={a} value={a}>{ACAO_NOME[a]}</option>)}
    </select>
  )
  const linha = (titulo: string, controle: React.ReactNode, ajuda?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '11px 0', borderBottom: '1px dashed var(--line)', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 260px' }}><div style={{ fontSize: 14 }}>{titulo}</div>{ajuda && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{ajuda}</div>}</div>
      {controle}
    </div>
  )
  const num = (k: string, w = 120) => <input disabled={!pode} type="number" value={r[k]} onChange={e => setR(k, Number(e.target.value))} style={{ ...inputStyle, width: w }} />

  return (
    <div>
      <PageHeader title="Regras de análise" subtitle={pode ? 'Valores de partida — ajuste conforme a política da empresa.' : 'Só a diretoria altera. Você está vendo as regras em uso.'}
        right={pode && <button style={btn('primary')} disabled={salvando} onClick={salvar}>Salvar regras</button>} />
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Pré-qualificação (antes de consultar o SPC)">
            {linha('Idade mínima', num('idadeMinima', 80))}
            {linha('Abaixo da idade mínima', acao('acaoMenorIdade'), 'Exceção legal é tratada na análise humana')}
            {linha('CPF já tem outro cadastro', acao('acaoCpfDuplicado'))}
            {linha('Endereço incompleto', acao('acaoEnderecoIncompleto'))}
            {linha('Declarou restrição e não tem avalista → não consultar o SPC',
              <input disabled={!pode} type="checkbox" checked={r.naoConsultarRestricaoSemAvalista} onChange={e => setR('naoConsultarRestricaoSemAvalista', e.target.checked)} style={{ width: 20, height: 20, accentColor: '#8e2a46' }} />,
              'Vai direto pra "Pendente de avalista" e não gasta consulta')}
          </Card>
          <Card title="Resultado do SPC">
            {linha('Aprova direto com restrições até (R$)', num('limiteSemAvalista'), 'Total negativado até esse valor: aprovado')}
            {linha('Com avalista até (R$)', num('limiteComAvalista'), 'Entre os dois valores: precisa de avalista')}
            {linha('Acima do limite com avalista', acao('acaoAcimaLimite'))}
            {linha('Protesto em cartório', acao('acaoProtesto'))}
            {linha('Nome no SPC diferente do formulário', acao('acaoNomeDivergente'))}
            {linha('Dívida com revenda de semijoias', acao('acaoCredorSemijoias'))}
            <div style={{ paddingTop: 10 }}>
              <label style={labelStyle}>Palavras que identificam credor de semijoias (separe por vírgula)</label>
              <input disabled={!pode} value={r.palavrasCredorSemijoias.join(', ')} onChange={e => setR('palavrasCredorSemijoias', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} style={inputStyle} />
            </div>
            {linha('Avalista com restrição', acao('acaoAvalistaComRestricao'))}
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Prazo de cada etapa (horas)">
            {Object.keys(d.prazos).map(k => <div key={k}>{linha(STATUS[k]?.nome || k,
              <input disabled={!pode} type="number" value={d.prazos[k]} onChange={e => setD({ ...d, prazos: { ...d.prazos, [k]: Number(e.target.value) } })} style={{ ...inputStyle, width: 90 }} />)}</div>)}
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 0 }}>Passou do prazo, o cadastro aparece como vencido no Painel e na lista.</p>
          </Card>
          <Card title="SPC de teste">
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>Ainda não há consulta real ao SPC (falta a Clara escolher o serviço). Até lá, a consulta é <b>simulada</b>: estes CPFs devolvem o resultado ao lado; qualquer outro CPF dá “nada consta”.</p>
            {Object.entries(d.cenarios).map(([cpf, cen]) => (
              <div key={cpf} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}>
                <code>{cpfFmt(cpf)}</code>
                <select disabled={!pode} value={cen as string} onChange={e => setD({ ...d, cenarios: { ...d.cenarios, [cpf]: e.target.value } })} style={{ ...inputStyle, width: 'auto' }}>
                  {Object.entries(CENARIO_NOME).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                </select>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
