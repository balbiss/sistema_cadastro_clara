// Cargos Logística/Consultora (o que cada um vê e pode fazer) + integração com o Jueri (ligação pelo CPF,
// 1ª carga, pedidos, inadimplência, faturamento real e relatório da carteira).
// Uso: E2E_API=https://servidor-de-teste node tests/e2e-cargos-jueri.mjs
//      (servidor com usuários de teste e JUERI_MOCK=1, JUERI_API_URL=<ele mesmo>/api/jueri-mock)
const API = process.env.E2E_API;
if (!API) { console.error('Defina E2E_API'); process.exit(2); }
let ok = 0, falhas = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : falhas++; console.log(`${cond ? '✔' : '✘'} ${nome}${cond ? '' : ' — ' + JSON.stringify(extra).slice(0, 400)}`); };
const espera = ms => new Promise(r => setTimeout(r, ms));
async function req(method, path, { token, body, form } = {}) {
  const headers = {}; if (token) headers.Authorization = 'Bearer ' + token; if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const txt = await r.text(); let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: r.status, json };
}
function cpfNovo() { const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)); for (const k of [9, 10]) { const s = n.reduce((a, d, i) => a + d * (k + 1 - i), 0); n.push((s * 10) % 11 % 10); } return n.join(''); }
const sufixo = Date.now().toString().slice(-5);
const login = async (email, password = '123456') => (await req('POST', '/api/auth/login', { body: { email, password } })).json.token;
const dir = await login('diretoria@teste.local'), adm = await login('administrativo@teste.local');

// ---- usuários dos cargos novos ----
const nomeCons = 'Ana Consultora ' + sufixo;
const uC = await req('POST', '/api/usuarios', { token: dir, body: { name: nomeCons, email: `consultora${sufixo}@teste.local`, password: '123456', role: 'consultora' } });
const uL = await req('POST', '/api/usuarios', { token: dir, body: { name: 'Luiz Logística ' + sufixo, email: `logistica${sufixo}@teste.local`, password: '123456', role: 'logistica' } });
t('cria usuária consultora e logística', uC.status < 300 && uL.status < 300, [uC.json, uL.json]);
t('cargo inválido é recusado', (await req('POST', '/api/usuarios', { token: dir, body: { name: 'X', email: `x${sufixo}@t.local`, password: '123456', role: 'chefe' } })).status === 400);
const cons = await login(`consultora${sufixo}@teste.local`), log = await login(`logistica${sufixo}@teste.local`);

// ---- cadastros: um da consultora, um de outra ----
const cpfA = cpfNovo();
const A = (await req('POST', '/api/cadastros', { token: dir, body: { nome: 'Rita da Ana', telefone: '91955554444', consultoraNome: nomeCons, origem: 'Indicação' } })).json;
const B = (await req('POST', '/api/cadastros', { token: dir, body: { nome: 'Outra Pessoa', consultoraNome: 'Bia Outra' } })).json;

// consultora
let lista = (await req('GET', '/api/cadastros', { token: cons })).json;
t('consultora vê só os cadastros dela', lista.some(c => c.id === A.id) && !lista.some(c => c.id === B.id), lista.map(c => c.nome));
t('consultora não abre cadastro de outra (404)', (await req('GET', '/api/cadastros/' + B.id, { token: cons })).status === 404);
const dA = (await req('GET', '/api/cadastros/' + A.id, { token: cons })).json;
t('consultora vê o dela, marcado como limitado', dA.cadastro?.id === A.id && dA.limitado === true && dA.podeConferir === false);
t('consultora não decide crédito', (await req('POST', `/api/cadastros/${A.id}/decisao`, { token: cons, body: { status: 'aprovado', motivo: 'quero' } })).status === 403);
t('consultora não corrige dados da cliente', (await req('PATCH', '/api/cadastros/' + A.id, { token: cons, body: { nome: 'Outro Nome' } })).status === 403);
t('consultora não vê relatórios', (await req('GET', '/api/relatorios', { token: cons })).status === 403);
t('consultora não vê respostas do quiz', (await req('GET', '/api/quiz/respostas', { token: cons })).status === 403);
t('consultora não vê configurações', (await req('GET', '/api/operacao/config', { token: cons })).status === 403);
const novoC = (await req('POST', '/api/cadastros', { token: cons, body: { nome: 'Cliente da Ana', consultoraNome: 'Tentou Outra' } })).json;
const dNovo = (await req('GET', '/api/cadastros/' + novoC.id, { token: cons })).json;
t('cadastro aberto pela consultora fica no nome dela', dNovo.cadastro?.consultoraNome === nomeCons, dNovo.cadastro?.consultoraNome);
const painelC = (await req('GET', '/api/cadastros/painel', { token: cons })).json;
t('painel da consultora conta só os dela', painelC.total === 2, painelC.total);
const pendB = (await req('POST', `/api/cadastros/${B.id}/pendencias`, { token: dir, body: { descricao: 'Pendência da Bia' } })).json;
t('consultora não vê pendência de cadastro alheio', !(await req('GET', '/api/pendencias', { token: cons })).json.some(p => p.id === pendB.id));
t('consultora não resolve pendência alheia', (await req('POST', `/api/pendencias/${pendB.id}/resolver`, { token: cons })).status === 404);

// logística
t('logística não vê cadastro fora da inicialização', (await req('GET', '/api/cadastros/' + A.id, { token: log })).status === 404);
t('logística não abre cadastro', (await req('POST', '/api/cadastros', { token: log, body: { nome: 'X Y' } })).status === 403);
t('logística não vê relatórios', (await req('GET', '/api/relatorios', { token: log })).status === 403);

// ---- leva o cadastro A até iniciada ----
const tk = A.linkFormulario.split('/f/')[1];
await req('POST', `/api/publico/${tk}/formulario`, { body: { nome: 'Rita da Ana', cpf: cpfA, dataNascimento: '1988-03-03', telefone: '91955554444',
  endereco: { cep: '66000-000', rua: 'Rua C', numero: '3', bairro: 'Centro', cidade: 'Belém', uf: 'PA' }, declarouRestricao: false, temAvalista: false, modalidade: 'presencial', aceiteLgpd: true } });
await espera(2500);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
for (const tipo of ['rg_frente', 'rg_verso', 'comprovante_residencia']) {
  const f = new FormData(); f.append('tipo', tipo); f.append('arquivo', new Blob([png], { type: 'image/png' }), tipo + '.png');
  await req('POST', `/api/publico/${tk}/documentos`, { form: f });
}
let d = (await req('GET', '/api/cadastros/' + A.id, { token: adm })).json;
t('A aprovado com 3 documentos', d.cadastro.status === 'aprovado' && d.documentos.length === 3, d.cadastro.status);
const docId = d.documentos[0].id;
t('consultora não abre arquivo de documento', (await req('GET', `/api/documentos/${docId}/arquivo`, { token: cons })).status === 403);
t('consultora não confere documento', (await req('POST', `/api/documentos/${docId}/conferir`, { token: cons, body: { status: 'conferido' } })).status === 403);
const dCons = (await req('GET', '/api/cadastros/' + A.id, { token: cons })).json;
t('consultora não recebe SPC nem caminho do arquivo', dCons.consultas.length === 0 && dCons.documentos.every(x => !x.arquivo) && !dCons.cadastro.checagens);
const hoje = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10);
for (const x of d.documentos) await req('POST', `/api/documentos/${x.id}/conferir`, { token: adm, body: { status: 'conferido', dataEmissao: x.tipo.endsWith('comprovante_residencia') ? hoje : undefined } });
d = (await req('GET', '/api/cadastros/' + A.id, { token: adm })).json;
await req('POST', `/api/assinatura/${d.formalizacao.assinaturas[0].token}`, { body: { cpf: cpfA, aceite: true } });
d = (await req('GET', '/api/cadastros/' + A.id, { token: adm })).json;
t('A liberado pra inicialização', d.cadastro.status === 'inicializacao', d.cadastro.status);

// logística agora enxerga e trabalha
const filaL = (await req('GET', '/api/inicializacao', { token: log })).json;
t('logística vê A na fila de inicialização', filaL.cadastros.some(c => c.id === A.id));
t('logística abre o A (limitado)', (await req('GET', '/api/cadastros/' + A.id, { token: log })).json.limitado === true);
t('logística não abre documento', (await req('GET', `/api/documentos/${docId}/arquivo`, { token: log })).status === 403);
const dia = new Date(Date.now() + 86400_000); dia.setHours(10, 0, 0, 0);
const ini = (tok, acao, body = {}) => req('POST', `/api/cadastros/${A.id}/inicializacao`, { token: tok, body: { acao, ...body } });
t('logística agenda', (await ini(log, 'agendar', { data: dia.toISOString() })).json.etapa === 'agendado');
t('logística confere a carga', (await ini(log, 'carga_conferida', { carga: 'CG-' + sufixo, valorCarga: 2000 })).json.etapa === 'carga_pronta');

// ---- Jueri (mock): revendedora com o mesmo CPF, pedidos e vendas ----
const jid = '9' + sufixo;
const d10 = n => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10) + ' 10:00:00';
await req('POST', '/api/jueri-mock/seed', { body: {
  revendedores: [{ id: Number(jid), nome: 'RITA DA ANA', cpf: cpfA.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') }, { id: 1, nome: 'Outra', cpf: '111.444.777-35' }],
  pedidos: [
    { id: 1001, fk_revendedor_id: Number(jid), data_criacao: d10(60), status: 'Baixado', quantidade: 10, quantidade_antes_baixa: 80, valor_total_antes_baixa: '3200.00', valor_total: '1250.50', valor_comissao: '625.25' },
    { id: 1002, fk_revendedor_id: Number(jid), data_criacao: d10(30), status: 'Baixado', quantidade: 5, quantidade_antes_baixa: 90, valor_total_antes_baixa: '3600.00', valor_total: '980.00', valor_comissao: '294.00' },
    { id: 1003, fk_revendedor_id: Number(jid), data_criacao: d10(5), status: 'Aberto', quantidade: 70, valor_total: '2800.00', data_acerto: d10(-25) },
    { id: 1004, fk_revendedor_id: Number(jid), data_criacao: d10(2), status: 'Cancelado', quantidade: 50, valor_total: '2000.00' },
    { id: 2001, fk_revendedor_id: 1, data_criacao: d10(10), status: 'Aberto', quantidade: 40, valor_total: '1500.00' },
  ],
  vendas: [{ id: 1, fk_revendedor_id: Number(jid), valor_total: '1250.50' }, { id: 2, fk_revendedor_id: Number(jid), valor_total: '980.00' }, { id: 3, fk_revendedor_id: 1, valor_total: '999.00' }],
} });
t('entrega → iniciada', (await ini(log, 'entregar')).json.status === 'iniciada');
await espera(4000);
d = (await req('GET', '/api/cadastros/' + A.id, { token: dir })).json;
t('iniciada é ligada ao Jueri pelo CPF na hora', d.cadastro.jueriId === jid, d.cadastro.jueriId);
const j = d.cadastro.jueri;
t('1ª carga = pedido mais antigo (80 peças, R$ 3.200)', j?.primeiraCarga?.pecas === 80 && j.primeiraCarga.valor === 3200, j?.primeiraCarga);
t('pedidos e acertos (cancelado não conta)', j?.pedidos === 3 && j.acertos === 2, j);
t('ativa hoje (70 peças abertas > 25)', j?.ativa === true && j.pecasAbertas === 70, j);
t('faturamento = valor VENDIDO nos acertos (não a maleta)', j?.faturamento === 2230.5 && j.valorConsignado === 9600 && j.comissao === 919.25, j);
t('sem perdido nem atraso → adimplente', j?.inadimplente === false);
t('histórico registra a ligação', d.eventos.some(e => e.tipo === 'jueri_vinculado'));

// inadimplência: pedido perdido + acerto vencido
await req('POST', '/api/jueri-mock/seed', { body: {
  revendedores: [{ id: Number(jid), nome: 'RITA DA ANA', cpf: cpfA }],
  pedidos: [
    { id: 1001, fk_revendedor_id: Number(jid), data_criacao: d10(60), status: 'Baixado', quantidade: 12, quantidade_antes_baixa: 80, valor_total_antes_baixa: '3200.00', valor_total: '500.00' },
    { id: 1003, fk_revendedor_id: Number(jid), data_criacao: d10(45), status: 'Aberto', quantidade: 20, valor_total: '800.00', data_acerto: d10(20) },
    { id: 1005, fk_revendedor_id: Number(jid), data_criacao: d10(40), status: 'Perdido', quantidade: 30, valor_total: '1200.00' },
  ], vendas: [] } });
const r1 = (await req('POST', `/api/operacao/jueri/cadastro/${A.id}`, { token: cons })).json;
t('consultora atualiza o Jueri da revendedora dela', r1.jueriId === jid, r1);
d = (await req('GET', '/api/cadastros/' + A.id, { token: dir })).json;
const j2 = d.cadastro.jueri;
t('inadimplente: 1 perdido + acerto 20 dias atrasado', j2.inadimplente === true && j2.perdidos.n === 1 && j2.acertoAtrasadoDias === 20, j2);
t('sem maleta ativa (20 peças ≤ 25)', j2.ativa === false);
t('faturamento só do acerto feito (aberto/perdido não contam como venda)', j2.faturamento === 500, j2.faturamento);
t('histórico avisa a inadimplência', d.eventos.some(e => e.tipo === 'jueri_inadimplente'));
t('consultora não atualiza Jueri de cadastro alheio', (await req('POST', `/api/operacao/jueri/cadastro/${B.id}`, { token: cons })).status === 404);

// ---- relatório da carteira ----
const rel = (await req('GET', '/api/relatorios', { token: dir })).json;
t('relatório traz resultado da carteira', rel.carteira.iniciadas >= 1 && rel.carteira.ligadasJueri >= 1 && rel.carteira.inadimplentes >= 1, rel.carteira);
const linhaCons = rel.porConsultora.find(x => x.nome === nomeCons);
t('carteira por consultora', linhaCons?.carteira?.iniciadas === 1 && linhaCons.carteira.ligadasJueri === 1, linhaCons);
t('carteira por origem e safra', rel.porOrigem.find(x => x.nome === 'Indicação')?.carteira?.iniciadas >= 1 && rel.porSafra.some(s => s.carteira.iniciadas >= 1));
const sync = (await req('POST', '/api/operacao/jueri/sincronizar', { token: dir })).json;
t('sincronização geral roda', !sync.erro && sync.atualizados >= 1, sync);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
