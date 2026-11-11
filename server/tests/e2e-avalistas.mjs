// Módulo de avalistas (relatório de ajustes 2, item 3) + score mínimo + documentos obrigatórios configuráveis.
// Sobe servidor próprio (porta 3097) num banco temporário.
// Uso: node tests/e2e-avalistas.mjs   (ou E2E_API=https://… pra rodar contra um servidor no ar, banco zerado)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORTA = 3097;
const API = process.env.E2E_API || `http://localhost:${PORTA}`;
if (!process.env.E2E_API) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clara-cad-aval-'));
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

async function req(method, p, { token, body, apiKey, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (apiKey) headers['X-Api-Key'] = apiKey;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + p, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const txt = await r.text();
  let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: r.status, json };
}
const login = async (email, password = '123456') => (await req('POST', '/api/auth/login', { body: { email, password } })).json.token;
const dir = await login('diretoria@teste.local');
const adm = await login('administrativo@teste.local');
const integ = (await req('POST', '/api/config/integracao/gerar-chave', { token: dir })).json;

// CPF válido a partir de 9 dígitos (cada execução usa números novos)
const base = Number(Date.now().toString().slice(-7));
let seq = 0;
function cpf() {
  const n = String(base * 10 + seq++).padStart(9, '0').slice(-9).split('').map(Number);
  const dv = arr => { const s = arr.reduce((a, d, i) => a + d * (arr.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  n.push(dv(n)); n.push(dv(n));
  return n.join('');
}
const TIT = [cpf(), cpf(), cpf(), cpf(), cpf(), cpf()]; // titulares com negativação média (precisam de avalista)
const AV_SUJO = [cpf(), cpf(), cpf()];                   // avalistas com negativação pequena
const SCORE_BAIXO = cpf();                               // titular com negativação pequena (score 610)
const cfg = (await req('GET', '/api/config/regras', { token: dir })).json;
const cenarios = { ...cfg.cenarios, ...Object.fromEntries(TIT.map(c => [c, 'negativacao_media'])), ...Object.fromEntries(AV_SUJO.map(c => [c, 'negativacao_pequena'])), [SCORE_BAIXO]: 'negativacao_pequena' };
const salvarRegras = r => req('PUT', '/api/config/regras', { token: dir, body: { regras: { ...cfg.regras, ...r }, prazos: cfg.prazos, cenarios } });
t('regras: cenários de teste salvos', (await salvarRegras({})).status === 200);

const cfgAv = (await req('GET', '/api/config/avalista', { token: dir })).json;
t('regras do avalista: padrão 2 tentativas, todos os vínculos aceitos', cfgAv.regras.maxAvalistas === 2 && cfgAv.regras.parentescos.every(p => p.aceito));
const salvarAv = r => req('PUT', '/api/config/avalista', { token: dir, body: { ...cfgAv.regras, ...r } });
t('não deixa todos os vínculos recusados', (await salvarAv({ parentescos: cfgAv.regras.parentescos.map(p => ({ ...p, aceito: false })) })).status === 400);
t('administrativo não altera regras do avalista', (await req('PUT', '/api/config/avalista', { token: adm, body: cfgAv.regras })).status === 403);
// "amigo" não é aceito; idade até 70; uma pergunta eliminatória
const perguntas = [...cfgAv.regras.perguntas, { id: 'ciente', texto: 'O avalista sabe que responde pela dívida?', tipo: 'escolha', opcoes: [{ id: 'sim', texto: 'Sim', pontos: 0 }, { id: 'nao', texto: 'Não', pontos: 0, elimina: true }] }];
t('salva regras do avalista', (await salvarAv({ idadeMaxima: 70, parentescos: cfgAv.regras.parentescos.map(p => p.id === 'amigo' ? { ...p, aceito: false } : p), perguntas })).status === 200);

const endereco = { cep: '66000-000', rua: 'Rua das Flores', numero: '10', bairro: 'Centro', cidade: 'Belém', uf: 'PA' };
const novo = async (lead, nome, c) => {
  const r = await req('POST', '/api/integracao/cadastros', { apiKey: integ.apiKey, body: { crm_lead_id: lead, nome, telefone: '91999990000' } });
  return { ...r.json, token: r.json.link_formulario?.split('/f/')[1], cpf: c, nome };
};
const preencher = (c, extra = {}) => req('POST', `/api/publico/${c.token}/formulario`, { body: {
  nome: c.nome, cpf: c.cpf, dataNascimento: '1990-05-10', telefone: '91999990000', endereco,
  declarouRestricao: false, temAvalista: true, modalidade: 'presencial', aceiteLgpd: true, ...extra } });
const dossie = async id => (await req('GET', '/api/cadastros/' + id, { token: dir })).json;
const estavel = async c => { for (let i = 0; i < 40; i++) { const d = await dossie(c.id); if (d.cadastro.status !== 'formulario_preenchido') return d; await espera(150); } return dossie(c.id); };
const avalista = (nome, c, extra = {}) => ({ nome, cpf: c, dataNascimento: '1965-03-02', telefone: '91988887777', parentesco: 'mae', endereco, respostas: { trabalho: 'clt', moradia: 'propria', ciente: 'sim' }, ...extra });
const mandaAvalista = (c, av) => req('POST', `/api/publico/${c.token}/avalista`, { body: av });
const sufixo = Date.now().toString().slice(-6);

// ---------- 1) 1º avalista recusado por vínculo (sem gastar SPC), 2º aprovado ----------
const A = await novo('av-a-' + sufixo, 'Ana Avalistas', TIT[0]);
await preencher(A);
let d = await estavel(A);
t('negativação média → Aguardando avalista', d.cadastro.status === 'pendente_avalista', d.cadastro.status);
let pub = (await req('GET', `/api/publico/${A.token}`)).json;
t('link mostra o formulário do avalista (vínculos + quiz, sem pontos)', pub.etapa === 'avalista' && pub.avalista.parentescos.length > 5 && pub.avalista.perguntas.length === 3 && !JSON.stringify(pub.avalista).includes('pontos'));
t('tentativa 1 de 2', pub.avalista.tentativa === 1 && pub.avalista.max === 2 && !pub.avalista.outro);
const AV1 = cpf();
await mandaAvalista(A, avalista('Joana Amiga', AV1, { parentesco: 'amigo' }));
d = await estavel(A);
t('avalista "amigo" (não aceito) → volta a aguardar avalista', d.cadastro.status === 'pendente_avalista', d.cadastro.status + ' ' + d.cadastro.motivo);
t('motivo cita o vínculo e a nova tentativa', /vínculo não aceito/i.test(d.cadastro.motivo) && /2º de 2/.test(d.cadastro.motivo), d.cadastro.motivo);
t('avalista 1 guardado como não aprovado', d.avalistas.length === 1 && d.avalistas[0].status === 'reprovado' && d.avalistas[0].parentescoNome === 'Amigo(a)');
t('SPC do avalista recusado NÃO foi consultado (sem custo)', !d.consultas.some(q => q.pessoa === 'avalista'));
t('pendência "conseguir outro avalista" aberta', d.pendencias.some(p => !p.resolvidaEm && /outro avalista/i.test(p.descricao)));
pub = (await req('GET', `/api/publico/${A.token}`)).json;
t('link: tentativa 2 de 2, sem mostrar o motivo', pub.avalista.tentativa === 2 && pub.avalista.outro && !JSON.stringify(pub).includes('vínculo'));
t('mesmo avalista de novo é recusado', (await mandaAvalista(A, avalista('Joana Amiga', AV1))).status === 409);
t('a própria candidata não pode ser avalista', (await mandaAvalista(A, avalista('Ana', TIT[0]))).status === 409);
const AV2 = cpf();
await mandaAvalista(A, avalista('Maria Mãe', AV2));
d = await estavel(A);
t('2º avalista (mãe, nome limpo) → Crédito aprovado com avalista', d.cadastro.status === 'aprovado_avalista', d.cadastro.status + ' ' + d.cadastro.motivo);
const [a1, a2] = d.avalistas;
t('os 2 avalistas ficam no cadastro; o 2º é o que vale', d.avalistas.length === 2 && a1.status === 'reprovado' && a2.status === 'aprovado' && a2.vigente && !a1.vigente);
t('cadastro aponta pro avalista aprovado', d.cadastro.avalistaId === a2.id && d.cadastro.avalista.nome === 'Maria Mãe');
t('SPC do 2º avalista consultado 1 vez', d.consultas.filter(q => q.pessoa === 'avalista').length === 1 && a2.consultas.length === 1);
t('checagens do avalista registradas (idade, vínculo, quiz, SPC)', ['Idade', 'Parentesco', 'Quiz do avalista', 'Restrições no SPC'].every(r => a2.checagens.some(k => k.regra.endsWith(r) && k.ok)));
t('pendência de avalista fechada', !d.pendencias.some(p => !p.resolvidaEm && /avalista/i.test(p.descricao)));
t('histórico: avalista informado / não aprovado / aprovado', ['avalista_informado', 'avalista_reprovado', 'avalista_aprovado'].every(x => d.eventos.some(e => e.tipo === x)));
t('liberação exige "Avalista aprovado" (ok)', d.liberacao.some(r => r.chave === 'avalista' && r.ok));
t('documentos do avalista são exigidos', d.situacaoDocs.itens.filter(i => i.tipo.startsWith('avalista_')).length === 3);
t('3º avalista recusado (limite)', (await req('POST', `/api/cadastros/${A.id}/avalistas`, { token: dir, body: avalista('Terceiro', cpf()) })).status === 409);

// documentos: os do avalista vão pra pasta dele
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const enviaDoc = (token, tipo) => { const f = new FormData(); f.append('tipo', tipo); f.append('arquivo', new Blob([png], { type: 'image/png' }), tipo + '.png'); return req('POST', `/api/publico/${token}/documentos`, { form: f }); };
for (const tipo of ['rg_frente', 'rg_verso', 'comprovante_residencia', 'avalista_rg_frente', 'avalista_rg_verso', 'avalista_comprovante_residencia']) await enviaDoc(A.token, tipo);
d = await dossie(A.id);
const docAv = d.avalistas.find(a => a.vigente).documentos;
t('documentos do avalista ficam na pasta do avalista aprovado', docAv.length === 3 && docAv.every(x => x.avalistaId === d.cadastro.avalistaId));
t('pasta com nome da candidata', typeof d.pasta === 'string' && d.pasta.startsWith('Ana Avalistas'));
const hoje = new Date().toISOString().slice(0, 10);
for (const x of d.documentos) await req('POST', `/api/documentos/${x.id}/conferir`, { token: adm, body: { status: 'conferido', dataEmissao: x.tipo.endsWith('comprovante_residencia') ? hoje : undefined } });
d = await dossie(A.id);
t('docs conferidos → contrato gerado com o avalista aprovado', d.cadastro.status === 'aguardando_assinatura' && d.formalizacao.assinaturas.some(s => s.papel === 'avalista' && s.nome === 'Maria Mãe'), d.cadastro.status);
t('promissória cita o avalista aprovado (não o recusado)', d.formalizacao.promissoria.includes('Maria Mãe') && !d.formalizacao.promissoria.includes('Joana'));

// ---------- 2) avalista com restrição; acabou a tentativa → regra "esgotou" (reprovar) ----------
const B = await novo('av-b-' + sufixo, 'Bia Sem Avalista', TIT[1]);
await preencher(B);
await estavel(B);
await mandaAvalista(B, avalista('Avalista Sujo Um', AV_SUJO[0]));
d = await estavel(B);
t('avalista com negativação (limite R$ 0) → não aprovado, pode outro', d.cadastro.status === 'pendente_avalista' && d.avalistas[0].status === 'reprovado' && /Restrições/.test(d.avalistas[0].motivo), d.cadastro.status + ' ' + d.avalistas[0]?.motivo);
t('desta vez o SPC do avalista foi consultado (passou nos requisitos)', d.consultas.some(q => q.pessoa === 'avalista'));
await mandaAvalista(B, avalista('Avalista Sujo Dois', AV_SUJO[1]));
d = await estavel(B);
t('2º também com restrição → reprovado (acabaram as tentativas)', d.cadastro.status === 'reprovado' && /Nenhum avalista aprovado \(2 de 2\)/.test(d.cadastro.motivo), d.cadastro.status + ' ' + d.cadastro.motivo);
t('link não oferece 3º avalista', (await req('GET', `/api/publico/${B.token}`)).json.etapa === 'encerrado');

// decisão manual: a análise aprova o 2º avalista mesmo assim (dívida quitada)
const av2B = d.avalistas[1];
t('motivo obrigatório na decisão do avalista', (await req('POST', `/api/avalistas/${av2B.id}/decisao`, { token: dir, body: { status: 'aprovado', motivo: '' } })).status === 400);
t('administrativo não decide avalista', (await req('POST', `/api/avalistas/${av2B.id}/decisao`, { token: adm, body: { status: 'aprovado', motivo: 'teste' } })).status === 403);
const r = await req('POST', `/api/avalistas/${av2B.id}/decisao`, { token: dir, body: { status: 'aprovado', motivo: 'Dívida quitada, comprovante no WhatsApp' } });
d = await dossie(B.id);
t('aprovação manual do avalista → Crédito aprovado com avalista', r.status === 200 && d.cadastro.status === 'aprovado_avalista' && d.cadastro.avalistaId === av2B.id, JSON.stringify(r.json));
t('decisão manual registrada com nome e motivo', d.avalistas[1].motivo.includes('decisão manual') && d.eventos.some(e => e.tipo === 'decisao_manual'));
// e volta atrás: reprova → sem tentativa → regra esgotou
await req('POST', `/api/avalistas/${av2B.id}/decisao`, { token: dir, body: { status: 'reprovado', motivo: 'Comprovante não confere' } });
d = await dossie(B.id);
t('reprovar o avalista aprovado → cadastro reprovado e sem avalista', d.cadastro.status === 'reprovado' && !d.cadastro.avalistaId, d.cadastro.status);

// ---------- 3) quiz do avalista: resposta eliminatória ----------
const C = await novo('av-c-' + sufixo, 'Carla Quiz', TIT[2]);
await preencher(C);
await estavel(C);
await mandaAvalista(C, avalista('Avalista Não Ciente', cpf(), { respostas: { trabalho: 'clt', moradia: 'alugada', ciente: 'nao' } }));
d = await estavel(C);
t('resposta eliminatória no quiz do avalista → não aprovado, sem SPC', d.avalistas[0].status === 'reprovado' && /eliminatória/i.test(d.avalistas[0].motivo) && !d.consultas.some(q => q.pessoa === 'avalista'), d.avalistas[0]?.motivo);
t('quiz do avalista guardado (respostas e pontos)', d.avalistas[0].quiz?.itens?.length === 3);

// idade acima do máximo (70)
const D = await novo('av-d-' + sufixo, 'Dora Idade', TIT[3]);
await preencher(D);
await estavel(D);
await mandaAvalista(D, avalista('Avô Velhinho', cpf(), { dataNascimento: '1940-01-01', parentesco: 'avo' }));
d = await estavel(D);
t('avalista acima da idade máxima → não aprovado', d.avalistas[0].status === 'reprovado' && /Idade/.test(d.avalistas[0].motivo), d.avalistas[0]?.motivo);

// ---------- 4) equipe inclui o avalista pelo dossiê ----------
const E = await novo('av-e-' + sufixo, 'Eva Equipe', TIT[4]);
await preencher(E);
await estavel(E);
const inc = await req('POST', `/api/cadastros/${E.id}/avalistas`, { token: dir, body: { nome: 'Irmão da Eva', cpf: cpf(), dataNascimento: '1985-01-01', parentesco: 'irmao', respostas: { trabalho: 'autonomo', moradia: 'propria', ciente: 'sim' } } });
t('equipe inclui avalista → analisado na hora → aprovado com avalista', inc.status === 200 && inc.json.status === 'aprovado_avalista', JSON.stringify(inc.json));
d = await dossie(E.id);
t('avalista incluído pela equipe registra quem incluiu', d.avalistas[0].informadoPor === 'Diretoria' || !!d.avalistas[0].informadoPor);
t('não inclui avalista em cadastro que não está aguardando', (await req('POST', `/api/cadastros/${A.id}/avalistas`, { token: dir, body: avalista('Xavier Tarde', cpf()) })).status === 409);

// ---------- 5) cadastro antigo/API: avalista vindo no formulário principal ----------
const F = await novo('av-f-' + sufixo, 'Fernanda Legado', TIT[5]);
await preencher(F, { avalista: { nome: 'Pedro Legado', cpf: cpf(), dataNascimento: '1970-01-01' } });
d = await estavel(F);
t('avalista no formulário principal (API antiga) vira o 1º avalista', d.avalistas.length === 1 && d.avalistas[0].nome === 'Pedro Legado');
t('sem vínculo/quiz (com regras restritivas) → análise humana, sem SPC do avalista', d.cadastro.status === 'analise_humana' && /não informado|Quiz incompleto/.test(d.cadastro.motivo) && !d.consultas.some(q => q.pessoa === 'avalista'), d.cadastro.status + ' ' + d.cadastro.motivo);

// ---------- 6) score mínimo da titular + documentos obrigatórios ----------
await salvarRegras({ scoreMinimo: 700, acaoScoreBaixo: 'analise_humana' });
const G = await novo('av-g-' + sufixo, 'Gabi Score', SCORE_BAIXO);
await preencher(G, { temAvalista: false });
d = await estavel(G);
t('score 610 abaixo do mínimo 700 → análise humana', d.cadastro.status === 'analise_humana' && d.cadastro.checagens.some(k => k.regra === 'Score de crédito' && !k.ok), d.cadastro.status);
await salvarRegras({ scoreMinimo: 0 });

const docsCfg = (await req('GET', '/api/config/documentos', { token: dir })).json;
t('documentos: 3 da candidata por padrão, 5 possíveis', docsCfg.exigidos.titular.length === 3 && docsCfg.possiveis.titular.length === 5);
t('não aceita ficar sem documento da candidata', (await req('PUT', '/api/config/documentos', { token: dir, body: { titular: [], avalista: [] } })).status === 400);
t('passa a exigir comprovante de renda', (await req('PUT', '/api/config/documentos', { token: dir, body: { titular: [...docsCfg.exigidos.titular, 'comprovante_renda'], avalista: docsCfg.exigidos.avalista } })).status === 200);
const H = await novo('av-h-' + sufixo, 'Helena Renda', cpf());
await preencher(H, { temAvalista: false });
d = await estavel(H);
t('aprovada direto: não exige documento de avalista', d.cadastro.status === 'aprovado' && !d.situacaoDocs.itens.some(i => i.tipo.startsWith('avalista_')));
t('exige o comprovante de renda configurado', d.situacaoDocs.itens.some(i => i.tipo === 'comprovante_renda'));
t('link da cliente pede o comprovante de renda', (await req('GET', `/api/publico/${H.token}`)).json.documentos.some(x => x.tipo === 'comprovante_renda'));
t('cliente sem avalista não envia documento de avalista', (await enviaDoc(H.token, 'avalista_rg_frente')).status === 400);
await req('PUT', '/api/config/documentos', { token: dir, body: docsCfg.exigidos });

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
