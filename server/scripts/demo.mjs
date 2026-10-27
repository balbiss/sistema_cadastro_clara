// Cria cadastros de exemplo no servidor local (porta 3013) pra ver as telas com dados.
// Uso: node scripts/demo.mjs   (com a API rodando)
const API = process.env.API || 'http://localhost:3013';
const j = async (method, path, { token, body, apiKey, form } = {}) => {
  const h = {};
  if (token) h.Authorization = 'Bearer ' + token;
  if (apiKey) h['X-Api-Key'] = apiKey;
  if (body) h['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { method, headers: h, body: form || (body ? JSON.stringify(body) : undefined) });
  return r.json().catch(() => ({}));
};
const espera = ms => new Promise(r => setTimeout(r, ms));

const { token } = await j('POST', '/api/auth/login', { body: { email: 'diretoria@teste.local', password: '123456' } });
let integ = await j('GET', '/api/config/integracao', { token });
if (!integ.apiKey) integ = await j('POST', '/api/config/integracao/gerar-chave', { token });
if (!integ.webhookUrl) await j('PUT', '/api/config/integracao', { token, body: { webhookUrl: API + '/api/crm-teste/webhook' } });

const end = { cep: '66055-000', rua: 'Travessa Quintino Bocaiúva', numero: '1200', bairro: 'Nazaré', cidade: 'Belém', uf: 'PA' };
const pessoas = [
  { nome: 'Fernanda Lima Souza', cpf: '52998224725', consultora: 'Ana Paula', origem: 'Tráfego pago', campanha: 'Revenda Outubro', docs: true },
  { nome: 'Juliana Martins', cpf: '11144477735', consultora: 'Ana Paula', origem: 'Tráfego pago', campanha: 'Revenda Outubro' },
  { nome: 'Camila Rodrigues', cpf: '39053344705', consultora: 'Bruna', origem: 'Indicação' },
  { nome: 'Patrícia Gomes', cpf: '15350946056', consultora: 'Bruna', origem: 'Prospecção ativa' },
  { nome: 'Luciana Ferreira', cpf: '28625587887', consultora: 'Ana Paula', origem: 'Tráfego pago', campanha: 'Revenda Outubro' },
  { nome: 'Renata Alves', cpf: '74682489070', consultora: 'Carla', origem: 'Tráfego pago', campanha: 'Stories Semijoias' },
  { nome: 'Débora Nunes', cpf: '12345678909', consultora: 'Carla', origem: 'Indicação', restricao: true },
  { nome: 'Aline Costa', consultora: 'Bruna', origem: 'Tráfego pago', campanha: 'Stories Semijoias', soEnviado: true },
];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const sufixo = Date.now().toString().slice(-5);

for (const [i, p] of pessoas.entries()) {
  const c = await j('POST', '/api/integracao/cadastros', { apiKey: integ.apiKey, body: { crm_lead_id: `demo-${sufixo}-${i}`, nome: p.nome, telefone: '9198' + String(1000000 + i * 7919).slice(0, 7), consultora: p.consultora, origem: p.origem, campanha: p.campanha } });
  if (p.soEnviado) continue;
  const tk = c.link_formulario.split('/f/')[1];
  await j('POST', `/api/publico/${tk}/iniciar`);
  await j('POST', `/api/publico/${tk}/formulario`, { body: { nome: p.nome, cpf: p.cpf, dataNascimento: '1988-03-1' + (i % 9), telefone: c.telefone, endereco: end, declarouRestricao: !!p.restricao, temAvalista: false, modalidade: i % 2 ? 'online' : 'presencial', aceiteLgpd: true } });
  await espera(400);
  if (p.docs) for (const tipo of ['rg_frente', 'rg_verso', 'comprovante_residencia']) {
    const f = new FormData(); f.append('tipo', tipo); f.append('arquivo', new Blob([png], { type: 'image/png' }), tipo + '.png');
    await j('POST', `/api/publico/${tk}/documentos`, { form: f });
  }
  console.log('✔', p.nome);
}

// ---- quem já passou da documentação: contrato, assinatura e inicialização ----
// CPFs válidos fora da lista do SPC de teste = "nada consta" (aprovadas direto)
const adiante = [
  { nome: 'Vanessa Pinheiro', cpf: '93541134780', consultora: 'Ana Paula', origem: 'Tráfego pago', campanha: 'Revenda Outubro', modalidade: 'presencial', ate: 'assinatura' },
  { nome: 'Gabriela Moraes', cpf: '71428793860', consultora: 'Bruna', origem: 'Indicação', modalidade: 'presencial', ate: 'liberada' },
  { nome: 'Sabrina Teixeira', cpf: '86288366757', consultora: 'Carla', origem: 'Tráfego pago', campanha: 'Stories Semijoias', modalidade: 'presencial', ate: 'agendado' },
  { nome: 'Priscila Barros', cpf: '21184473021', consultora: 'Ana Paula', origem: 'Prospecção ativa', modalidade: 'online', ate: 'frete' },
  { nome: 'Tatiane Rocha', cpf: '43638378020', consultora: 'Bruna', origem: 'Tráfego pago', campanha: 'Revenda Outubro', modalidade: 'online', ate: 'enviado' },
  { nome: 'Mônica Duarte', cpf: '58377196018', consultora: 'Carla', origem: 'Indicação', modalidade: 'presencial', ate: 'iniciada' },
];
const hojeMenos = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
for (const [i, p] of adiante.entries()) {
  const c = await j('POST', '/api/integracao/cadastros', { apiKey: integ.apiKey, body: { crm_lead_id: `demo-${sufixo}-b${i}`, nome: p.nome, telefone: '9198' + String(2000000 + i * 7919).slice(0, 7), consultora: p.consultora, origem: p.origem, campanha: p.campanha } });
  const tk = c.link_formulario.split('/f/')[1];
  await j('POST', `/api/publico/${tk}/iniciar`);
  await j('POST', `/api/publico/${tk}/formulario`, { body: { nome: p.nome, cpf: p.cpf, dataNascimento: '1991-07-2' + i, telefone: c.telefone, endereco: end, declarouRestricao: false, temAvalista: false, modalidade: p.modalidade, aceiteLgpd: true } });
  await espera(400);
  for (const tipo of ['rg_frente', 'rg_verso', 'comprovante_residencia']) {
    const f = new FormData(); f.append('tipo', tipo); f.append('arquivo', new Blob([png], { type: 'image/png' }), tipo + '.png');
    await j('POST', `/api/publico/${tk}/documentos`, { form: f });
  }
  let d = await j('GET', '/api/cadastros/' + c.id, { token });
  for (const x of d.documentos) await j('POST', `/api/documentos/${x.id}/conferir`, { token, body: { status: 'conferido', dataEmissao: x.tipo === 'comprovante_residencia' ? hojeMenos(12) : undefined } });
  if (p.ate !== 'assinatura') {
    d = await j('GET', '/api/cadastros/' + c.id, { token });
    await j('POST', '/api/assinatura/' + d.formalizacao.assinaturas[0].token, { body: { cpf: p.cpf, aceite: true } });
  }
  const ini = (acao, body = {}) => j('POST', `/api/cadastros/${c.id}/inicializacao`, { token, body: { acao, ...body } });
  const dia = new Date(Date.now() + (i + 1) * 86400_000); dia.setHours(14, 0, 0, 0);
  if (['agendado', 'iniciada'].includes(p.ate)) await ini('agendar', { data: dia.toISOString() });
  if (p.ate === 'iniciada') { await ini('carga_conferida', { carga: 'CG-10' + i, valorCarga: 2800 }); await ini('entregar'); }
  if (['frete', 'enviado'].includes(p.ate)) await ini('informar_frete', { carga: 'CG-20' + i, valorCarga: 2600, valorFrete: 34.9 });
  if (p.ate === 'enviado') { await ini('confirmar_pagamento'); await ini('enviar', { rastreio: 'QB' + (100000000 + i * 3571) + 'BR' }); }
  console.log('✔', p.nome, '→', p.ate);
}
console.log('Pronto. Abra http://localhost:5185');
