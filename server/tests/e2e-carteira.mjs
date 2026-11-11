// Painel individual da colaboradora (relatório 2, itens 4 e 6): carteira, situações, números do mês, metas, ranking.
// Uso: node tests/e2e-carteira.mjs   (sobe servidor próprio na porta 3096, banco temporário)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORTA = 3096;
const API = process.env.E2E_API || `http://localhost:${PORTA}`;
if (!process.env.E2E_API) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clara-cad-cart-'));
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
async function req(method, p, { token, body, apiKey } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (apiKey) headers['X-Api-Key'] = apiKey;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: r.status, json };
}
const login = async (email, password = '123456') => (await req('POST', '/api/auth/login', { body: { email, password } })).json.token;
const dir = await login('diretoria@teste.local');
const integ = (await req('POST', '/api/config/integracao/gerar-chave', { token: dir })).json;
const suf = Date.now().toString().slice(-6);
const emailNat = `natalia${suf}@teste.local`;
const nat = (await req('POST', '/api/usuarios', { token: dir, body: { name: 'Natália Teste ' + suf, email: emailNat, password: '123456', role: 'consultora' } })).json;
const tokNat = await login(emailNat);

const base = Number(Date.now().toString().slice(-7)); let seq = 0;
const cpf = () => { const n = String(base * 10 + seq++).padStart(9, '0').slice(-9).split('').map(Number); const dv = a => { const s = a.reduce((x, d, i) => x + d * (a.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; n.push(dv(n)); n.push(dv(n)); return n.join(''); };
const endereco = { cep: '66000-000', rua: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Belém', uf: 'PA' };
async function cadastroDaNatalia(lead, nome, preencher = true) {
  const r = (await req('POST', '/api/integracao/cadastros', { apiKey: integ.apiKey, body: { crm_lead_id: lead, nome, consultora: nat.name, consultora_email: emailNat } })).json;
  const token = r.link_formulario.split('/f/')[1];
  if (preencher) {
    await req('POST', `/api/publico/${token}/formulario`, { body: { nome, cpf: cpf(), dataNascimento: '1990-01-01', telefone: '91999990000', endereco, declarouRestricao: false, temAvalista: false, modalidade: 'presencial', aceiteLgpd: true } });
    for (let i = 0; i < 30; i++) { const d = (await req('GET', '/api/cadastros/' + r.id, { token: dir })).json; if (d.cadastro.status !== 'formulario_preenchido') break; await espera(150); }
  }
  return r;
}
await cadastroDaNatalia('cart-1-' + suf, 'Clara Aprovada');
await cadastroDaNatalia('cart-2-' + suf, 'Sofia Aprovada');
await cadastroDaNatalia('cart-3-' + suf, 'Lia Enviado', false);

let c = await req('GET', '/api/carteira', { token: tokNat });
t('consultora abre a própria carteira', c.status === 200 && c.json.pessoa.eu, JSON.stringify(c.json).slice(0, 200));
t('3 candidatas na carteira', c.json.itens.length === 3, c.json.itens.length);
t('situação "crédito aprovado" (sem documento enviado)', c.json.itens.filter(i => i.grupo === 'credito_aprovado').length === 2);
t('situação "qualificação aprovada" pra formulário enviado', c.json.itens.some(i => i.grupo === 'qualificada'));
t('número do mês: 2 aprovações de crédito', c.json.numeros.aprovacoes === 2, JSON.stringify(c.json.numeros));
t('novas no mês: 3', c.json.numeros.novos === 3);
t('aprovação tem data', c.json.itens.filter(i => i.aprovadoEm).length === 2);
t('6 meses no histórico', c.json.meses.length === 6);
t('sem meta definida = null', c.json.meta === null);
t('consultora não vê equipe nem define metas', !c.json.equipe.length && !c.json.podeMetas);
t('consultora não abre carteira de outra pessoa', (await req('GET', '/api/carteira?userId=1', { token: tokNat })).status === 403);
t('consultora não define metas', (await req('PUT', '/api/config/metas', { token: tokNat, body: { padrao: 3, porUsuario: {} } })).status === 403);
t('diretoria define meta da equipe 5 e da Natália 8', (await req('PUT', '/api/config/metas', { token: dir, body: { padrao: 5, porUsuario: { [nat.id]: 8 } } })).status === 200);
c = await req('GET', '/api/carteira?userId=' + nat.id, { token: dir });
t('diretoria abre a carteira da Natália (com a meta dela)', c.status === 200 && c.json.pessoa.nome === nat.name && c.json.meta === 8 && !c.json.pessoa.eu);
t('diretoria vê a equipe pra escolher', c.json.equipe.length >= 2 && c.json.podeMetas);
c = await req('GET', '/api/carteira', { token: dir });
t('diretoria (sem carteira) usa a meta padrão 5', c.json.meta === 5 && c.json.itens.length === 0);
c = await req('GET', '/api/carteira?mes=2020-01', { token: tokNat });
t('mês passado: zero aprovações, carteira continua listada', c.json.mes === '2020-01' && c.json.numeros.aprovacoes === 0 && c.json.itens.length === 3);
t('mês inválido cai no mês atual', (await req('GET', '/api/carteira?mes=xx', { token: tokNat })).json.mes.length === 7);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
