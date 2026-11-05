// Teste de ponta a ponta do Clara Cadastros. Sobe um servidor próprio (porta 3099) num banco
// temporário — não mexe nos dados do teste manual (porta 3013).
// Uso: node tests/e2e-cadastros.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// E2E_API=https://… roda contra um servidor já no ar (ex.: cópia de teste com Postgres), sem subir um local.
const PORTA = 3099;
const API = process.env.E2E_API || `http://localhost:${PORTA}`;
if (!process.env.E2E_API) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clara-cad-e2e-'));
  const servidor = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    env: { ...process.env, PORT: String(PORTA), PGLITE_DIR: path.join(tmp, 'pg'), ARQUIVOS_DIR: path.join(tmp, 'arquivos'), API_URL: API, DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  process.on('exit', () => { servidor.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });
  await new Promise((ok, erro) => {
    servidor.stdout.on('data', b => { if (String(b).includes('Clara Cadastros (API)')) ok(); });
    servidor.on('exit', c => erro(new Error('servidor de teste saiu com código ' + c)));
  });
}
let ok = 0, falhas = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : falhas++; console.log(`${cond ? '✔' : '✘'} ${nome}${cond ? '' : ' — ' + extra}`); };
const espera = ms => new Promise(r => setTimeout(r, ms));
const sufixo = Date.now().toString().slice(-6);

async function req(method, path, { token, body, apiKey, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (apiKey) headers['X-Api-Key'] = apiKey;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const txt = await r.text();
  let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: r.status, json };
}

const login = async email => (await req('POST', '/api/auth/login', { body: { email, password: '123456' } })).json.token;
const dir = await login('diretoria@teste.local');
const adm = await login('administrativo@teste.local');
t('login diretoria', !!dir);
t('login administrativo', !!adm);

// integração: chave + webhook no "CRM de teste"
const integ = (await req('POST', '/api/config/integracao/gerar-chave', { token: dir })).json;
t('gera chave de API', integ.apiKey?.startsWith('cad_'));
await req('PUT', '/api/config/integracao', { token: dir, body: { webhookUrl: API + '/api/crm-teste/webhook' } });
t('administrativo não vê integração', (await req('GET', '/api/config/integracao', { token: adm })).status === 403);
t('sem chave a API recusa', (await req('POST', '/api/integracao/cadastros', { body: { crm_lead_id: 1, nome: 'X' } })).status === 401);

const enderecoOk = { cep: '66000-000', rua: 'Rua das Flores', numero: '10', bairro: 'Centro', cidade: 'Belém', uf: 'pa' };
async function novo(lead, nome, cpf) {
  const r = await req('POST', '/api/integracao/cadastros', { apiKey: integ.apiKey, body: { crm_lead_id: lead, nome, telefone: '91999990000', consultora: 'Ana', origem: 'Tráfego pago', campanha: 'Out/26' } });
  return { ...r.json, http: r.status, token: r.json.link_formulario?.split('/f/')[1], cpf };
}
async function preencher(c, extra = {}) {
  await req('POST', `/api/publico/${c.token}/iniciar`);
  return req('POST', `/api/publico/${c.token}/formulario`, { body: {
    nome: extra.nome || c.nome, cpf: c.cpf, dataNascimento: extra.dataNascimento || '1990-05-10', telefone: '91999990000',
    endereco: extra.endereco || enderecoOk, declarouRestricao: !!extra.declarouRestricao, temAvalista: !!extra.avalista, avalista: extra.avalista,
    modalidade: 'presencial', aceiteLgpd: true } });
}
const dossie = async id => (await req('GET', '/api/cadastros/' + id, { token: dir })).json;
async function statusApos(c) {
  for (let i = 0; i < 30; i++) { const d = await dossie(c.id); if (d.cadastro.status !== 'formulario_preenchido') return d; await espera(150); }
  return dossie(c.id);
}

// 1) nada consta → aprovado
const a = await novo('L1-' + sufixo, 'Maria Aprovada', '52998224725');
t('CRM cria cadastro (201) com link', a.http === 201 && !!a.token && a.status === 'formulario_enviado');
const a2 = await novo('L1-' + sufixo, 'Maria Aprovada', '52998224725');
t('mesmo lead não duplica', a2.http === 200 && a2.id === a.id && a2.ja_existia);
t('formulário inválido é recusado', (await req('POST', `/api/publico/${a.token}/formulario`, { body: { nome: 'x' } })).status === 400);
await preencher(a);
let d = await statusApos(a);
t('nada consta → Aprovado', d.cadastro.status === 'aprovado', d.cadastro.status + ' ' + d.cadastro.motivo);
t('checagens registradas', d.cadastro.checagens?.length >= 5);
t('consulta SPC guardada no dossiê', d.consultas.length === 1);
t('prazo da etapa preenchido', !!d.cadastro.prazoEtapa);
t('link não aceita formulário de novo', (await preencher(a)).status === 409);

// 2) negativação pequena → aprovado
const b = await novo('L2-' + sufixo, 'Joana Pequena', '11144477735'); await preencher(b);
d = await statusApos(b); t('restrição R$180 (limite 300) → Aprovado', d.cadastro.status === 'aprovado', d.cadastro.status);

// 3) negativação média sem avalista → pendente; depois avalista limpo → aprovado com avalista
const m = await novo('L3-' + sufixo, 'Carla Media', '39053344705'); await preencher(m);
d = await statusApos(m); t('restrição R$850 sem avalista → Pendente de avalista', d.cadastro.status === 'pendente_avalista', d.cadastro.status);
t('pendência "conseguir avalista" aberta', d.pendencias.some(p => !p.resolvidaEm && p.descricao.includes('avalista')));
t('cliente vê etapa avalista', (await req('GET', `/api/publico/${m.token}`)).json.etapa === 'avalista');
await req('POST', `/api/publico/${m.token}/avalista`, { body: { nome: 'Pedro Avalista', cpf: '529.982.247-25', dataNascimento: '1970-01-01' } });
d = await statusApos(m); t('avalista nada consta → Aprovado com avalista', d.cadastro.status === 'aprovado_avalista', d.cadastro.status + ' ' + d.cadastro.motivo);
t('2 consultas (titular + avalista)', d.consultas.length === 2);

// 4) negativação grande → reprovado
const g = await novo('L4-' + sufixo, 'Rita Grande', '15350946056'); await preencher(g);
d = await statusApos(g); t('restrição R$4.320 → Reprovado', d.cadastro.status === 'reprovado', d.cadastro.status);
t('cliente não vê o motivo', !JSON.stringify((await req('GET', `/api/publico/${g.token}`)).json).includes('4.320'));

// 5) credor semijoias → análise humana; decisão manual
const s = await novo('L5-' + sufixo, 'Lia Semijoias', '28625587887'); await preencher(s);
d = await statusApos(s); t('credor de semijoias → Análise humana', d.cadastro.status === 'analise_humana', d.cadastro.status);
t('administrativo não decide crédito', (await req('POST', `/api/cadastros/${s.id}/decisao`, { token: adm, body: { status: 'aprovado', motivo: 'teste' } })).status === 403);
t('decisão exige motivo', (await req('POST', `/api/cadastros/${s.id}/decisao`, { token: dir, body: { status: 'reprovado' } })).status === 400);
await req('POST', `/api/cadastros/${s.id}/decisao`, { token: dir, body: { status: 'reprovado', motivo: 'Dívida com outra revenda de semijoias' } });
d = await dossie(s.id); t('decisão manual registrada', d.cadastro.status === 'reprovado' && d.cadastro.decididoPor === 'Diretoria Teste');
t('pendência "analisar" fechada na decisão', !d.pendencias.some(p => !p.resolvidaEm));

// 6) declarou restrição sem avalista → pendente, SEM consulta
const r = await novo('L6-' + sufixo, 'Bia Declarou', '12345678909'); await preencher(r, { declarouRestricao: true });
d = await statusApos(r); t('declarou restrição sem avalista → Pendente de avalista', d.cadastro.status === 'pendente_avalista', d.cadastro.status);
t('...e o SPC NÃO foi consultado', d.consultas.length === 0);

// 7) CPF duplicado (mesmo de "Maria Aprovada") → análise humana, sem consulta
const dup = await novo('L7-' + sufixo, 'Maria Aprovada', '52998224725'); await preencher(dup);
d = await statusApos(dup); t('CPF duplicado → Análise humana', d.cadastro.status === 'analise_humana' && d.cadastro.motivo.includes('CAD-'), d.cadastro.motivo);
t('...sem gastar consulta', d.consultas.length === 0);

// 8) menor de idade
const men = await novo('L8-' + sufixo, 'Teen Teste', '74682489070'); await preencher(men, { dataNascimento: '2012-01-01' });
d = await statusApos(men); t('menor de 18 → Análise humana', d.cadastro.status === 'analise_humana' && d.cadastro.motivo.includes('anos'), d.cadastro.motivo);

// 9) nome diferente do SPC
const nd = await novo('L9-' + sufixo, 'Fulana Nome', '06817283009'); await preencher(nd);
d = await statusApos(nd); t('nome diferente do SPC → Análise humana', d.cadastro.status === 'analise_humana', d.cadastro.status);

// ---- documentos (cadastro aprovado "a") ----
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function enviaDoc(token, tipo) {
  const f = new FormData(); f.append('tipo', tipo); f.append('arquivo', new Blob([png], { type: 'image/png' }), tipo + '.png');
  return req('POST', `/api/publico/${token}/documentos`, { form: f });
}
t('cliente vê etapa documentos', (await req('GET', `/api/publico/${a.token}`)).json.etapa === 'documentos');
t('reprovada não envia documento', (await enviaDoc(g.token, 'rg_frente')).status === 409);
for (const tipo of ['rg_frente', 'rg_verso', 'comprovante_residencia']) await enviaDoc(a.token, tipo);
d = await dossie(a.id);
t('3 documentos no dossiê', d.documentos.length === 3);
t('documentação em conferência', d.situacaoDocs.situacao === 'em_conferencia');
const doc = tipo => d.documentos.find(x => x.tipo === tipo);
t('arquivo abre com login', (await fetch(`${API}/api/documentos/${doc('rg_frente').id}/arquivo?token=${dir}`)).status === 200);
t('arquivo não abre sem login', (await fetch(`${API}/api/documentos/${doc('rg_frente').id}/arquivo`)).status === 401);
await req('POST', `/api/documentos/${doc('rg_frente').id}/conferir`, { token: adm, body: { status: 'conferido' } });
await req('POST', `/api/documentos/${doc('rg_verso').id}/conferir`, { token: adm, body: { status: 'conferido' } });
t('comprovante exige data', (await req('POST', `/api/documentos/${doc('comprovante_residencia').id}/conferir`, { token: adm, body: { status: 'conferido' } })).status === 400);
const velho = (await req('POST', `/api/documentos/${doc('comprovante_residencia').id}/conferir`, { token: adm, body: { status: 'conferido', dataEmissao: '2025-01-10' } })).json;
t('comprovante com +3 meses é recusado sozinho', velho.status === 'recusado');
d = await dossie(a.id);
t('...e vira pendência', d.pendencias.some(p => !p.resolvidaEm && p.descricao.startsWith('Reenviar')));
t('cliente vê o recusado', (await req('GET', `/api/publico/${a.token}`)).json.documentos.some(x => x.recusado));
await enviaDoc(a.token, 'comprovante_residencia');
d = await dossie(a.id);
t('cliente reenviou → pendência "Reenviar" fecha sozinha', d.pendencias.filter(p => p.descricao.startsWith('Reenviar')).every(p => p.resolvidaEm), d.pendencias);
// pendência manual (trava) segura a liberação mesmo com tudo conferido
await req('POST', `/api/cadastros/${a.id}/pendencias`, { token: adm, body: { descricao: 'Confirmar endereço por telefone' } });
const novoComp = d.documentos.find(x => x.tipo === 'comprovante_residencia' && x.status === 'enviado');
const hoje = new Date(); hoje.setDate(hoje.getDate() - 10);
await req('POST', `/api/documentos/${novoComp.id}/conferir`, { token: adm, body: { status: 'conferido', dataEmissao: hoje.toISOString().slice(0, 10) } });
d = await dossie(a.id);
t('com pendência aberta NÃO libera', d.cadastro.status === 'aprovado', d.cadastro.status);
const pend = d.pendencias.find(p => !p.resolvidaEm);
await req('POST', `/api/pendencias/${pend.id}/resolver`, { token: adm });
d = await dossie(a.id);
t('tudo conferido + sem pendência → contrato gerado, Aguardando assinatura', d.cadastro.status === 'aguardando_assinatura', d.cadastro.status);
t('passou por Documentação conferida', d.eventos.some(e => e.tipo === 'status_alterado' && e.dados?.para === 'documentos_ok'));

// ---- formalização (item 9) ----
t('contrato e promissória gerados', !!d.formalizacao?.contrato && d.formalizacao.promissoria.includes('três mil reais'), d.formalizacao?.promissoria?.slice(0, 200));
t('contrato traz nome e CPF da cliente', d.formalizacao.contrato.includes('Maria Aprovada') && d.formalizacao.contrato.includes('529.982.247-25'));
t('só a titular assina (sem avalista)', d.formalizacao.assinaturas.length === 1 && d.formalizacao.assinaturas[0].papel === 'titular');
t('liberação bloqueada até assinar', d.liberacao.find(r => r.chave === 'assinaturas').ok === false);
const pub = (await req('GET', `/api/publico/${a.token}`)).json;
t('cliente vê etapa assinatura com o link', pub.etapa === 'assinatura' && !!pub.assinatura?.token);
t('administrativo não refaz contrato', (await req('POST', `/api/cadastros/${a.id}/formalizacao`, { token: adm, body: { valor: 2500 } })).status === 403);
const tokAntigo = pub.assinatura.token;
await req('POST', `/api/cadastros/${a.id}/formalizacao`, { token: dir, body: { valor: 2500 } });
d = await dossie(a.id);
t('refazer muda valor e cria versão 2', d.formalizacao.versao === 2 && d.formalizacao.valor === 2500 && d.formalizacao.promissoria.includes('dois mil e quinhentos reais'), d.formalizacao.promissoria.slice(0, 300));
t('link antigo não assina mais', (await req('POST', `/api/assinatura/${tokAntigo}`, { body: { cpf: '52998224725', aceite: true } })).status === 409);
const tok = d.formalizacao.assinaturas[0].token;
const assin = (await req('GET', `/api/assinatura/${tok}`)).json;
t('página de assinatura mostra os textos', assin.contrato.includes('CONTRATO') && assin.papel === 'titular' && !assin.assinadoEm);
t('CPF errado não assina', (await req('POST', `/api/assinatura/${tok}`, { body: { cpf: '11144477735', aceite: true } })).status === 400);
t('sem aceite não assina', (await req('POST', `/api/assinatura/${tok}`, { body: { cpf: '52998224725' } })).status === 400);
t('assina com o CPF certo', (await req('POST', `/api/assinatura/${tok}`, { body: { cpf: '529.982.247-25', aceite: true } })).status === 200);
d = await dossie(a.id);
t('tudo assinado → liberada (inicialização presencial)', d.cadastro.status === 'inicializacao' && d.cadastro.inicEtapa === 'aguardando_agendamento', d.cadastro.status + ' ' + d.cadastro.inicEtapa);
t('requisitos de liberação todos ok', d.liberacao.every(r => r.ok));
t('assinatura registrada com data e hash', !!d.formalizacao.assinaturas[0].assinadoEm && d.eventos.some(e => e.tipo === 'assinatura' && e.dados.hash === d.formalizacao.hash));

// ---- inicialização presencial (item 6) ----
const ini = (id, acao, body = {}) => req('POST', `/api/cadastros/${id}/inicializacao`, { token: adm, body: { acao, ...body } });
t('ação de outra modalidade é recusada', (await ini(a.id, 'informar_frete', { carga: 'C1', valorFrete: 20 })).status === 409);
t('não entrega antes de agendar', (await ini(a.id, 'entregar')).status === 409);
t('agendar exige data', (await ini(a.id, 'agendar')).status === 409);
const dia = new Date(Date.now() + 2 * 86400_000); dia.setHours(10, 0, 0, 0);
t('agenda a retirada', (await ini(a.id, 'agendar', { data: dia.toISOString() })).json.etapa === 'agendado');
d = await dossie(a.id);
t('prazo vira o dia agendado', new Date(d.cadastro.prazoEtapa).getTime() === dia.getTime());
t('cliente vê o dia agendado', (await req('GET', `/api/publico/${a.token}`)).json.inicializacao?.agendadoPara === dia.toISOString());
const bloq = (await req('POST', `/api/cadastros/${a.id}/pendencias`, { token: adm, body: { descricao: 'Confirmar referência comercial' } })).json;
t('pendência aberta bloqueia a inicialização', (await ini(a.id, 'carga_conferida', { carga: 'CG-101' })).status === 409);
await req('POST', `/api/pendencias/${bloq.id}/resolver`, { token: adm });
t('carga conferida', (await ini(a.id, 'carga_conferida', { carga: 'CG-101', valorCarga: 2400 })).json.etapa === 'carga_pronta');
t('entrega na matriz → Revendedora iniciada', (await ini(a.id, 'entregar')).json.status === 'iniciada');
d = await dossie(a.id);
t('iniciada com data e carga registradas', !!d.cadastro.iniciadaEm && d.cadastro.inicializacao.carga === 'CG-101' && !d.cadastro.prazoEtapa);
t('cliente vê concluído', (await req('GET', `/api/publico/${a.token}`)).json.etapa === 'concluido');
t('iniciada não aceita desistência', (await req('POST', `/api/cadastros/${a.id}/desistencia`, { token: dir, body: { motivo: 'teste' } })).status === 409);

// ---- inicialização online, com avalista (cadastro "m") ----
for (const tipo of ['rg_frente', 'rg_verso', 'comprovante_residencia', 'avalista_rg_frente', 'avalista_rg_verso', 'avalista_comprovante_residencia']) await enviaDoc(m.token, tipo);
await req('PATCH', `/api/cadastros/${m.id}`, { token: dir, body: { modalidade: 'online' } });
d = await dossie(m.id);
for (const x of d.documentos) await req('POST', `/api/documentos/${x.id}/conferir`, { token: adm, body: { status: 'conferido', dataEmissao: x.tipo.endsWith('comprovante_residencia') ? hoje.toISOString().slice(0, 10) : undefined } });
d = await dossie(m.id);
t('com avalista: 2 assinaturas (cliente + avalista)', d.cadastro.status === 'aguardando_assinatura' && d.formalizacao?.assinaturas.length === 2, d.cadastro.status);
t('promissória cita o avalista', d.formalizacao.promissoria.includes('Pedro Avalista'));
const [sTit, sAv] = ['titular', 'avalista'].map(p => d.formalizacao.assinaturas.find(x => x.papel === p).token);
await req('POST', `/api/assinatura/${sTit}`, { body: { cpf: '39053344705', aceite: true } });
d = await dossie(m.id);
t('só a cliente assinou → ainda aguardando o avalista', d.cadastro.status === 'aguardando_assinatura' && /avalista/.test(d.liberacao.find(r => r.chave === 'assinaturas').detalhe));
await req('POST', `/api/assinatura/${sAv}`, { body: { cpf: '52998224725', aceite: true } });
d = await dossie(m.id);
t('avalista assinou → inicialização online (montagem)', d.cadastro.status === 'inicializacao' && d.cadastro.inicEtapa === 'montagem', d.cadastro.inicEtapa);
t('frete exige valor', (await ini(m.id, 'informar_frete', { carga: 'CG-202' })).status === 409);
t('carga montada + frete', (await ini(m.id, 'informar_frete', { carga: 'CG-202', valorFrete: 32.5 })).json.etapa === 'aguardando_pagamento');
t('cliente vê o frete', (await req('GET', `/api/publico/${m.token}`)).json.inicializacao?.valorFrete === 32.5);
t('não envia sem pagamento', (await ini(m.id, 'enviar', { rastreio: 'AA123' })).status === 409);
t('pagamento confirmado → expedir', (await ini(m.id, 'confirmar_pagamento')).json.etapa === 'expedicao');
t('envio exige rastreio', (await ini(m.id, 'enviar')).status === 409);
t('enviado com rastreio', (await ini(m.id, 'enviar', { rastreio: 'qb123456789br' })).json.etapa === 'em_transporte');
t('cliente vê o rastreio', (await req('GET', `/api/publico/${m.token}`)).json.inicializacao?.rastreio === 'QB123456789BR');
t('recebimento confirmado → iniciada', (await ini(m.id, 'confirmar_recebimento')).json.status === 'iniciada');
const fila = (await req('GET', '/api/inicializacao', { token: adm })).json;
t('fila de inicialização lista as iniciadas', fila.cadastros.filter(x => x.status === 'iniciada').length === 2);

// correção de dados + responsável
await req('PATCH', `/api/cadastros/${b.id}`, { token: dir, body: { telefone: '(91) 98888-7777', responsavelId: 2 } });
d = await dossie(b.id);
t('correção guarda antes/depois', d.eventos.some(e => e.tipo === 'dados_alterados' && e.dados.telefone?.antes === '91999990000'));
t('transferência de responsável registrada', d.eventos.some(e => e.tipo === 'responsavel_alterado'));

// ---- avisos ao CRM ----
await espera(1500);
const rec = (await req('GET', '/api/crm-teste/recebidos', { token: dir })).json.filter(x => x.corpo.cadastro.crm_lead_id === 'L1-' + sufixo).reverse();
const tipos = rec.map(x => x.corpo.evento);
t('CRM recebeu os avisos do cadastro', rec.length >= 10, rec.length);
t('em ordem (enviado → … → iniciada)', tipos[0] === 'formulario_enviado' && rec.at(-1).corpo.cadastro.status === 'iniciada', tipos.join(','));
t('CRM recebeu os links de assinatura', rec.some(x => x.corpo.evento === 'formalizacao_gerada' && x.corpo.dados.links?.[0]?.link.includes('/assinar/')));
t('CRM recebeu a data de início', rec.some(x => x.corpo.cadastro.iniciada_em));
t('aviso traz status, motivo e link do dossiê', rec.some(x => x.corpo.cadastro.status === 'aprovado' && x.corpo.cadastro.link_dossie.includes('/cadastros/')));
t('aviso não traz resultado do SPC', !JSON.stringify(rec).includes('negativacoes'));
const resumo = (await req('GET', '/api/cadastros/resumo', { token: dir })).json;
t('resumo por etapa', resumo.porStatus.aprovado >= 1 && resumo.porStatus.reprovado >= 2);
t('consulta pelo lead (CRM)', (await req('GET', '/api/integracao/cadastros/L3-' + sufixo, { apiKey: integ.apiKey })).json.status === 'iniciada');

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
