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
console.log('Pronto. Abra http://localhost:5185');
