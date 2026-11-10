// Relatório de ajustes da Bel (06/11): SPC reaproveitado por CPF (prazo configurável), relatório de
// consultas (lupa, médios), nomes novos das etapas e a ponte com o CRM v2 (quem é a atendente,
// aviso quando outra atendente já tem o cadastro). Sobe servidor próprio (porta 3098) num banco temporário.
// Uso: node tests/e2e-ajustes.mjs   (ou E2E_API=https://… pra rodar contra um servidor no ar, banco zerado)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORTA = 3098;
const API = process.env.E2E_API || `http://localhost:${PORTA}`;
if (!process.env.E2E_API) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clara-cad-ajustes-'));
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

async function req(method, p, { token, body, apiKey } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (apiKey) headers['X-Api-Key'] = apiKey;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: r.status, json };
}
const login = async (email, password = '123456') => (await req('POST', '/api/auth/login', { body: { email, password } })).json.token;
const dir = await login('diretoria@teste.local');
const integ = (await req('POST', '/api/config/integracao/gerar-chave', { token: dir })).json;

// CPFs de teste: titulares com negativação média e um avalista limpo usado por várias candidatas
const MEDIA2 = '23456789173', MEDIA3 = '34567891228', MEDIA4 = '45678912364', AVAL = '56789123482';
const cfg = (await req('GET', '/api/config/regras', { token: dir })).json;
t('regra nova: reaproveitar consulta por 3 meses (padrão)', cfg.regras.validadeConsultaMeses === 3);
const salvarRegras = regras => req('PUT', '/api/config/regras', { token: dir, body: {
  regras: { ...cfg.regras, ...regras }, prazos: cfg.prazos,
  cenarios: { ...cfg.cenarios, [MEDIA2]: 'negativacao_media', [MEDIA3]: 'negativacao_media', [MEDIA4]: 'negativacao_media' } } });
t('salva cenários + prazo', (await salvarRegras({})).status === 200);
t('prazo inválido é recusado', (await req('PUT', '/api/config/regras', { token: dir, body: { regras: { ...cfg.regras, validadeConsultaMeses: 99 }, prazos: cfg.prazos, cenarios: cfg.cenarios } })).status === 400);

const enderecoOk = { cep: '66000-000', rua: 'Rua das Flores', numero: '10', bairro: 'Centro', cidade: 'Belém', uf: 'pa' };
const novo = async (lead, nome, cpf, quem = {}) => {
  const r = await req('POST', '/api/integracao/cadastros', { apiKey: integ.apiKey, body: { crm_lead_id: lead, nome, telefone: '91999990000', ...quem } });
  return { ...r.json, http: r.status, token: r.json.link_formulario?.split('/f/')[1], cpf, nome };
};
const preencher = async (c, avalista) => {
  await req('POST', `/api/publico/${c.token}/iniciar`);
  return req('POST', `/api/publico/${c.token}/formulario`, { body: {
    nome: c.nome, cpf: c.cpf, dataNascimento: '1990-05-10', telefone: '91999990000', endereco: enderecoOk,
    declarouRestricao: false, temAvalista: !!avalista, avalista, modalidade: 'presencial', aceiteLgpd: true } });
};
const dossie = async id => (await req('GET', '/api/cadastros/' + id, { token: dir })).json;
const statusApos = async c => { for (let i = 0; i < 30; i++) { const d = await dossie(c.id); if (d.cadastro.status !== 'formulario_preenchido') return d; await espera(150); } return dossie(c.id); };
const pedro = { nome: 'Pedro Avalista Teste', cpf: AVAL, dataNascimento: '1970-01-01' };

// ---------- 1) SPC reaproveitado pelo CPF (o mesmo avalista em duas candidatas) ----------
const c1 = await novo('A1-' + sufixo, 'Carla Um', MEDIA2); await preencher(c1, pedro);
let d = await statusApos(c1);
t('candidata 1 aprovada com avalista', d.cadastro.status === 'aprovado_avalista', d.cadastro.status + ' ' + d.cadastro.motivo);
t('candidata 1: 2 consultas pagas (titular + avalista)', d.consultas.length === 2 && d.consultas.every(x => !x.reaproveitadaDe));
const c2 = await novo('A2-' + sufixo, 'Carla Dois', MEDIA3); await preencher(c2, pedro);
d = await statusApos(c2);
t('candidata 2 aprovada com o mesmo avalista', d.cadastro.status === 'aprovado_avalista', d.cadastro.status + ' ' + d.cadastro.motivo);
const avC2 = d.consultas.find(x => x.pessoa === 'avalista');
t('avalista NÃO foi consultado de novo (reaproveitada)', !!avC2?.reaproveitadaDe);
t('evento "SPC não consultado de novo" no histórico', d.eventos.some(e => e.tipo === 'spc_reaproveitado'));
t('reanálise não duplica a consulta reaproveitada', (await req('POST', `/api/cadastros/${c2.id}/reanalisar`, { token: dir })).status !== 500 && (await dossie(c2.id)).consultas.filter(x => x.pessoa === 'avalista').length === 1);

// prazo 0 = não reaproveita → paga de novo
await salvarRegras({ validadeConsultaMeses: 0 });
const c3 = await novo('A3-' + sufixo, 'Carla Tres', MEDIA4); await preencher(c3, pedro);
d = await statusApos(c3);
t('com "não reaproveitar", o avalista é consultado (pago) de novo', d.consultas.filter(x => x.pessoa === 'avalista').every(x => !x.reaproveitadaDe) && d.consultas.some(x => x.pessoa === 'avalista'));
await salvarRegras({ validadeConsultaMeses: 3 });

// ---------- 2) Relatório de consultas ----------
let rel = (await req('GET', '/api/consultas-spc', { token: dir })).json;
t('relatório: pagas e reaproveitadas contadas', rel.resumo.pagas === 5 && rel.resumo.reaproveitadas === 1, JSON.stringify(rel.resumo));
t('relatório: CPF pago 2× aparece', rel.resumo.cpfsPagosMaisDeUmaVez === 1, JSON.stringify(rel.resumo));
const linhaAv = rel.linhas.find(l => l.cpf === AVAL);
t('linha traz score, negativações e quantas vezes o CPF apareceu', linhaAv && typeof linhaAv.score === 'number' && linhaAv.negativacoes === 0 && linhaAv.vezesCpf === 3);
t('linha da titular com negativação', rel.linhas.some(l => l.cpf === MEDIA2 && l.negativacoes === 2 && l.total > 0));
t('filtro por CPF', (await req('GET', '/api/consultas-spc?q=' + AVAL, { token: dir })).json.linhas.length === 3);
t('filtro só reaproveitadas', (await req('GET', '/api/consultas-spc?tipo=reaproveitadas', { token: dir })).json.linhas.length === 1);
const lupa = (await req('GET', '/api/consultas-spc/' + linhaAv.id, { token: dir })).json;
t('lupa: consulta completa + histórico do CPF', lupa.consulta?.resultado?.situacao === 'nada_consta' && lupa.historico.length === 3);

// médios: sem avalista, negativação média → aguardando avalista
const c4 = await novo('A4-' + sufixo, 'Carla Media Sem', '39053344705'); await preencher(c4);
d = await statusApos(c4);
t('nome novo da etapa: "Aguardando avalista"', d.cadastro.statusNome === 'Aguardando avalista', d.cadastro.statusNome);
const grande = await novo('A5-' + sufixo, 'Rita Grande', '15350946056'); await preencher(grande); await statusApos(grande);
rel = (await req('GET', '/api/consultas-spc?medios=1', { token: dir })).json;
t('médios: não aprovadas com negativação (do menor pro maior)', rel.linhas.length === 2 && rel.linhas[0].total <= rel.linhas[1].total, rel.linhas.map(l => l.codigo + ':' + l.total).join(','));
t('médios com teto de valor', (await req('GET', '/api/consultas-spc?medios=1&valorMax=1000', { token: dir })).json.linhas.length === 1);
t('aprovadas não entram nos médios', !rel.linhas.some(l => l.status.startsWith('aprovado')));

// ---------- 3) Ponte com o CRM: quem é a atendente ----------
await req('POST', '/api/usuarios', { token: dir, body: { name: 'Natália Souza', email: 'natalia@teste.local', password: '123456', role: 'consultora' } });
await req('POST', '/api/usuarios', { token: dir, body: { name: 'Bia Lima', email: 'bia@teste.local', password: '123456', role: 'consultora' } });
const nat = await novo('CRM-' + sufixo, 'Fernanda Prospectada', '52998224725', { consultora: 'Natália', consultora_email: 'Natalia@teste.local', crm_user_id: 7 });
t('CRM cria cadastro com a atendente (nome, e-mail, id)', nat.http === 201 && nat.consultora === 'Natália' && nat.consultora_email === 'natalia@teste.local' && nat.crm_user_id === '7');
t('sem origem informada = Prospecção ativa', nat.origem === 'Prospecção ativa');
t('resumo traz situação nova', nat.situacao === 'formulario_enviado' && nat.situacao_nome === 'Formulário enviado');
const tokNat = await login('natalia@teste.local');
const listaNat = (await req('GET', '/api/cadastros', { token: tokNat })).json;
t('consultora vê o cadastro pelo e-mail (nome diferente no CRM)', listaNat.some(c => c.id === nat.id));
t('consultora não vê o relatório de SPC', (await req('GET', '/api/consultas-spc', { token: tokNat })).status === 403);
const tokBia = await login('bia@teste.local');
t('outra consultora não vê', !(await req('GET', '/api/cadastros', { token: tokBia })).json.some(c => c.id === nat.id));

const deNovo = await novo('CRM-' + sufixo, 'Fernanda Prospectada', '52998224725', { consultora: 'Natália', consultora_email: 'natalia@teste.local', crm_user_id: 7 });
t('mesma atendente de novo: mesmo cadastro, sem aviso', deNovo.http === 200 && deNovo.id === nat.id && !deNovo.aviso);
const bia = await novo('CRM-' + sufixo, 'Fernanda Prospectada', '52998224725', { consultora: 'Bia', consultora_email: 'bia@teste.local', crm_user_id: 9 });
t('outra atendente: avisa de quem é e desde quando', bia.http === 200 && bia.id === nat.id && /Natália/.test(bia.aviso || '') && /iniciado em \d{2}\/\d{2}\/\d{4}/.test(bia.aviso || ''), bia.aviso);
t('dona continua a Natália', bia.consultora === 'Natália');
await novo('CRM-' + sufixo, 'Fernanda Prospectada', '52998224725', { consultora: 'Bia', consultora_email: 'bia@teste.local', crm_user_id: 9 });
const pend = (await dossie(nat.id)).pendencias.filter(p => p.alerta?.startsWith('abordagem:') && !p.resolvidaEm);
t('pendência pra gerência (1 só, não trava liberação)', pend.length === 1 && pend[0].bloqueia === false && pend[0].descricao.includes('Bia'));

// cadastro sem dona (ex.: veio do quiz) → a 1ª atendente que manda fica com ele
const semDona = await novo('SD-' + sufixo, 'Lead do Trafego', '11144477735');
t('sem atendente: sem dona', semDona.http === 201 && !semDona.consultora);
const pega = await novo('SD-' + sufixo, 'Lead do Trafego', '11144477735', { consultora: 'Bia', consultora_email: 'bia@teste.local', crm_user_id: 9 });
t('1ª atendente que manda fica com o cadastro', pega.consultora === 'Bia' && !pega.aviso);

// aviso de webhook leva a atendente
await espera(800);
const rec = (await req('GET', '/api/crm-teste/recebidos', { token: dir })).json;
t('lista de recebidos do CRM de teste responde', Array.isArray(rec));

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
