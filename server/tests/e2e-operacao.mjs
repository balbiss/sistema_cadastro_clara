// Teste das funções de operação: passagem entre setores, alertas automáticos, relatórios, LGPD.
// Uso: E2E_API=https://servidor-de-teste node tests/e2e-operacao.mjs  (servidor com usuários de teste)
const API = process.env.E2E_API;
if (!API) { console.error('Defina E2E_API'); process.exit(2); }
let ok = 0, falhas = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : falhas++; console.log(`${cond ? '✔' : '✘'} ${nome}${cond ? '' : ' — ' + JSON.stringify(extra).slice(0, 400)}`); };
// CPF válido novo a cada rodada (o simulador do SPC dá "nada consta" pra CPF desconhecido)
function cpfNovo() { const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)); for (const k of [9, 10]) { const s = n.reduce((a, d, i) => a + d * (k + 1 - i), 0); n.push((s * 10) % 11 % 10); } return n.join(''); }
const espera = ms => new Promise(r => setTimeout(r, ms));
async function req(method, path, { token, body } = {}) {
  const headers = {}; if (token) headers.Authorization = 'Bearer ' + token; if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: r.status, json };
}
const login = async email => (await req('POST', '/api/auth/login', { body: { email, password: '123456' } })).json.token;
const dir = await login('diretoria@teste.local'), adm = await login('administrativo@teste.local');
const equipe = (await req('GET', '/api/usuarios', { token: dir })).json;
const id = email => equipe.find(u => u.email === email)?.id;

// ---- configuração: responsável padrão por setor ----
{ const c0 = (await req('GET', '/api/operacao/config', { token: dir })).json; await req('PUT', '/api/operacao/config', { token: dir, body: { setores: c0.setores, operacao: c0.operacao, lgpd: { ...c0.lgpd, ativo: false } } }); }
const cfg = (await req('GET', '/api/operacao/config', { token: dir })).json;
t('config de operação carrega', cfg.setores?.etapas?.aprovado === 'administrativo' && cfg.lgpd?.ativo === false, cfg);
t('IA aparece como não configurada (sem chave)', cfg.iaDisponivel === false);
t('administrativo não altera configuração', (await req('PUT', '/api/operacao/config', { token: adm, body: cfg })).status === 403);
cfg.setores.responsaveis = { prospeccao: id('diretoria@teste.local'), analise: id('analise@teste.local'), administrativo: id('administrativo@teste.local') };
const salvo = await req('PUT', '/api/operacao/config', { token: dir, body: { setores: cfg.setores, operacao: cfg.operacao, lgpd: cfg.lgpd } });
t('salva responsáveis por setor', salvo.status === 200, salvo.json);

// prazo minúsculo pra etapa "formulário enviado" → alerta dispara logo
const regras = (await req('GET', '/api/config/regras', { token: dir })).json;
await req('PUT', '/api/config/regras', { token: dir, body: { regras: regras.regras, prazos: { ...regras.prazos, formulario_enviado: 0.0003 }, cenarios: regras.cenarios } });

// ---- cadastro novo nasce no setor Prospecção com o responsável dele ----
const n = (await req('POST', '/api/cadastros', { token: dir, body: { nome: 'Teste Operação', telefone: '91988887777', origem: 'Instagram', consultoraNome: 'Ana' } })).json;
let d = (await req('GET', '/api/cadastros/' + n.id, { token: dir })).json;
t('nasce no setor prospecção com responsável padrão', d.cadastro.setor === 'prospeccao' && d.cadastro.responsavelId === id('diretoria@teste.local'), d.cadastro);

// ---- alerta: formulário parado ----
await espera(2500);
let r = (await req('POST', '/api/operacao/alertas/rodar', { token: dir })).json;
d = (await req('GET', '/api/cadastros/' + n.id, { token: dir })).json;
const alerta = d.pendencias.find(p => p.alerta === 'a:formulario_parado' && !p.resolvidaEm);
t('abre alerta "formulário não concluído"', !!alerta && r.abertos >= 1, { r, p: d.pendencias });
t('alerta não trava a liberação', alerta?.bloqueia === false);
r = (await req('POST', '/api/operacao/alertas/rodar', { token: dir })).json;
d = (await req('GET', '/api/cadastros/' + n.id, { token: dir })).json;
t('rodar de novo não duplica alerta', d.pendencias.filter(p => p.alerta === 'a:formulario_parado').length === 1);
const lp = (await req('GET', '/api/pendencias', { token: dir })).json;
t('lista de pendências traz tipo (alerta)', lp.some(p => p.alerta === 'a:formulario_parado' && p.bloqueia === false));

// ---- cliente preenche (CPF de teste "nada consta" → aprovado) → alerta fecha + passagem de setor ----
const token = n.linkFormulario.split('/f/')[1];
await req('POST', `/api/publico/${token}/iniciar`);
const f = await req('POST', `/api/publico/${token}/formulario`, { body: { nome: 'Teste Operação', cpf: cpfNovo(), dataNascimento: '1990-05-10', telefone: '91988887777',
  endereco: { cep: '66000-000', rua: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Belém', uf: 'PA' }, declarouRestricao: false, temAvalista: false, modalidade: 'online', aceiteLgpd: true } });
t('formulário enviado', f.status === 200, f.json);
await espera(3000);
d = (await req('GET', '/api/cadastros/' + n.id, { token: dir })).json;
t('cadastro aprovado e foi pro setor administrativo', d.cadastro.status === 'aprovado' && d.cadastro.setor === 'administrativo', d.cadastro);
t('responsável virou o do administrativo', d.cadastro.responsavelId === id('administrativo@teste.local'), d.cadastro.responsavelId);
const passagens = d.eventos.filter(e => e.tipo === 'passagem');
t('histórico registra as passagens (entregue/recebido/prazo)', passagens.length >= 2 && passagens.some(e => /Prospecção → Análise cadastral: entregue por/.test(e.descricao)) && passagens.some(e => /recebido por Administrativo Teste/.test(e.descricao)), passagens.map(e => e.descricao));
await req('POST', '/api/operacao/alertas/rodar', { token: dir });
d = (await req('GET', '/api/cadastros/' + n.id, { token: dir })).json;
t('alerta do formulário fechou sozinho', d.pendencias.find(p => p.alerta === 'a:formulario_parado')?.resolvidaPor?.startsWith('sistema'), d.pendencias);

// ---- resolver alerta na mão: não reabre logo ----
await req('PUT', '/api/config/regras', { token: dir, body: { regras: regras.regras, prazos: { ...regras.prazos, aprovado: 0.0003 }, cenarios: regras.cenarios } });
const n2 = (await req('POST', '/api/cadastros', { token: dir, body: { nome: 'Teste Silencio' } })).json;
const tk2 = n2.linkFormulario.split('/f/')[1];
await req('POST', `/api/publico/${tk2}/formulario`, { body: { nome: 'Teste Silencio', cpf: cpfNovo(), dataNascimento: '1991-01-01', telefone: '91977776666',
  endereco: { cep: '66000-000', rua: 'Rua B', numero: '2', bairro: 'Centro', cidade: 'Belém', uf: 'PA' }, declarouRestricao: false, temAvalista: false, modalidade: 'presencial', aceiteLgpd: true } });
await espera(3500);
// (o CPF de teste já tem cadastro → regra de duplicidade pode mandar pra análise humana; aprova manualmente se for o caso)
let d2 = (await req('GET', '/api/cadastros/' + n2.id, { token: dir })).json;
if (d2.cadastro.status === 'analise_humana') { await req('POST', `/api/cadastros/${n2.id}/decisao`, { token: dir, body: { status: 'aprovado', motivo: 'teste de operação' } }); await espera(1500); }
d2 = (await req('GET', '/api/cadastros/' + n2.id, { token: dir })).json;
await espera(1500);
await req('POST', '/api/operacao/alertas/rodar', { token: dir });
d2 = (await req('GET', '/api/cadastros/' + n2.id, { token: dir })).json;
const docAlert = d2.pendencias.find(p => p.alerta === 'a:documentos_faltando' && !p.resolvidaEm);
t('alerta de documentos faltando', !!docAlert && /Documentos faltando/.test(docAlert.descricao), { st: d2.cadastro.status, p: d2.pendencias });
if (docAlert) {
  await req('POST', `/api/pendencias/${docAlert.id}/resolver`, { token: adm });
  await req('POST', '/api/operacao/alertas/rodar', { token: dir });
  d2 = (await req('GET', '/api/cadastros/' + n2.id, { token: dir })).json;
  t('alerta resolvido na mão não reabre em seguida', !d2.pendencias.some(p => p.alerta === 'a:documentos_faltando' && !p.resolvidaEm), d2.pendencias);
}
const lib = d2.liberacao.find(x => x.chave === 'pendencias');
t('alerta não aparece como bloqueio na liberação', lib?.ok === true, d2.liberacao);

// ---- IA sem chave: pedir conferência dá aviso claro ----
const semIa = await req('POST', '/api/documentos/999999/ia', { token: dir });
t('IA sem chave avisa', semIa.status === 400 && /chave/i.test(semIa.json.error), semIa.json);

// ---- relatórios ----
const rel = (await req('GET', '/api/relatorios', { token: dir })).json;
t('relatório responde com funil', Array.isArray(rel.funil) && rel.funil[0].n >= 2, rel);
t('funil conta formulário concluído e aprovados', rel.funil.find(x => x.chave === 'concluido').n >= 2 && rel.decisoes.aprovados >= 2, { funil: rel.funil, dec: rel.decisoes });
t('relatório por origem/consultora/modalidade/safra', rel.porOrigem.some(x => x.nome === 'Instagram') && rel.porConsultora.some(x => x.nome === 'Ana') && rel.porModalidade.some(x => /Online/.test(x.nome)) && rel.porSafra.length >= 1, { o: rel.porOrigem, m: rel.porModalidade });
t('retrato de agora: parados e por responsável', rel.agora.parados.length >= 1 && rel.agora.porResponsavel.some(x => x.nome === 'Administrativo Teste'), rel.agora);
t('planilha traz as linhas', rel.linhas.some(l => l.nome === 'Teste Operação'));
const relOnline = (await req('GET', '/api/relatorios?modalidade=online', { token: dir })).json;
t('filtro de modalidade', relOnline.linhas.every(l => l.modalidade === 'online') && relOnline.linhas.length >= 1);

// ---- LGPD ----
const desc = await req('POST', '/api/operacao/lgpd/descartar', { token: dir });
t('descarte recusa com política desligada', desc.status === 400, desc.json);
const lg = await req('PUT', '/api/operacao/config', { token: dir, body: { setores: cfg.setores, operacao: cfg.operacao, lgpd: { ...cfg.lgpd, ativo: true, diasReprovado: 10 } } });
t('prazo de guarda menor que 30 dias é recusado', lg.status === 400);
const lg2 = await req('PUT', '/api/operacao/config', { token: dir, body: { setores: cfg.setores, operacao: cfg.operacao, lgpd: { ...cfg.lgpd, ativo: true } } });
t('liga política e mostra prévia (nada antigo pra descartar)', lg2.status === 200 && lg2.json.previa.cadastros === 0, lg2.json);
const desc2 = await req('POST', '/api/operacao/lgpd/descartar', { token: dir });
t('descarte roda sem apagar cadastro recente', desc2.status === 200 && desc2.json.cadastros === 0, desc2.json);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
