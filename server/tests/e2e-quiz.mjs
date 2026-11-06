// Quizzes de perfil (vários): CRUD, links próprios, regras de pontos/eliminatória/condicional, respostas por quiz.
// Uso: E2E_API=https://servidor-de-teste node tests/e2e-quiz.mjs  (servidor com usuários de teste)
const API = process.env.E2E_API;
if (!API) { console.error('Defina E2E_API'); process.exit(2); }
let ok = 0, falhas = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : falhas++; console.log(`${cond ? '✔' : '✘'} ${nome}${cond ? '' : ' — ' + JSON.stringify(extra).slice(0, 400)}`); };
async function req(method, path, { token, body } = {}) {
  const headers = {}; if (token) headers.Authorization = 'Bearer ' + token; if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: r.status, json };
}
const login = async email => (await req('POST', '/api/auth/login', { body: { email, password: '123456' } })).json.token;
const dir = await login('diretoria@teste.local'), adm = await login('administrativo@teste.local');
const suf = Date.now().toString().slice(-6);
const tel = n => '149' + suf.slice(-4) + String(n).padStart(4, '0');

// ---- quiz principal (o antigo vira o 1º) ----
let lista = (await req('GET', '/api/quizzes', { token: dir })).json;
const principal = lista.find(q => q.padrao);
t('existe um quiz principal', !!principal && /\/quiz$/.test(principal.link), lista);
const pub = (await req('GET', '/api/quiz-publico')).json;
t('/quiz abre o principal', pub.perguntas?.length > 5 && pub.slug === principal.slug, pub);
t('pontos não vão pro navegador', !JSON.stringify(pub).includes('"pontos"') && !JSON.stringify(pub).includes('elimina'));

// garante o principal ligado e sem WhatsApp pra testar as regras
const cfgP = (await req('GET', '/api/quizzes/' + principal.id, { token: dir })).json;
await req('PUT', '/api/quizzes/' + principal.id, { token: dir, body: { nome: cfgP.nome, slug: cfgP.slug, quiz: { ...cfgP.quiz, ativo: true, whatsapp: '', notaCorte: 13 } } });
const boa = { motivo: 'renda_extra', meta: '1000a3000', idade: '25a34', filhos: 'nao', apoio: 'total', casa: 'propria', trabalho: 'clt', atividade: 'Vendedora há 3 anos', vende: 'frequencia', semijoias: 'sucesso', instagram: 'ativo', negativado: 'limpo', regras: 'sim' };
const responder = (caminho, nome, n, respostas, extra = {}) => req('POST', caminho, { body: { nome, telefone: tel(n), cidade: 'Bauru/SP', respostas, aceite: true, ...extra } });
let r = await responder('/api/quiz-publico', 'Maria Boa ' + suf, 1, boa);
t('perfil bom aprovado', r.status === 200 && r.json.aprovado === true, r.json);
t('sem WhatsApp configurado = sem botão', r.json.whatsapp === null);
t('menor de 18 elimina', (await responder('/api/quiz-publico', 'Ana Menor', 2, { ...boa, idade: 'menor18' })).json.aprovado === false);
t('falta responder → erro', (await responder('/api/quiz-publico', 'Sem Resp', 3, { motivo: 'casa' })).status === 400);
t('condicional vira obrigatória (filhos=1 sem idade do mais novo)', (await responder('/api/quiz-publico', 'Cond', 4, { ...boa, filhos: '1' })).status === 400);
t('mesmo WhatsApp aprovado não duplica cadastro', (await responder('/api/quiz-publico', 'Maria Boa ' + suf, 1, boa)).json.aprovado === true);
const cadsMaria = (await req('GET', '/api/cadastros?q=' + encodeURIComponent('Maria Boa ' + suf), { token: dir })).json;
t('1 cadastro só pra mesma pessoa', cadsMaria.length === 1 && cadsMaria[0].status === 'quiz_aprovado', cadsMaria);
t('origem do cadastro = nome do quiz (sem ?origem)', cadsMaria[0]?.origem === principal.nome, cadsMaria[0]?.origem);

// ---- criar um quiz novo ----
t('administrativo vê a lista', (await req('GET', '/api/quizzes', { token: adm })).status === 200);
t('administrativo não cria quiz', (await req('POST', '/api/quizzes', { token: adm, body: { nome: 'X' } })).status === 403);
const nome = 'Campanha Teste ' + suf;
const novo = await req('POST', '/api/quizzes', { token: dir, body: { nome, base: 'modelo' } });
t('cria quiz a partir do modelo', novo.status === 201 && novo.json.slug === 'campanha-teste-' + suf && novo.json.link.endsWith('/quiz/campanha-teste-' + suf), novo.json);
const id = novo.json.id, slug = novo.json.slug;
t('nasce desligado (link mostra fechado)', (await responder('/api/quiz-publico/' + slug, 'Teste Fechado', 5, boa)).status === 403);
t('link que não existe → 404', (await req('GET', '/api/quiz-publico/nao-existe-' + suf)).status === 404);

// editar: nome, link, perguntas, ligar
let ed = (await req('GET', '/api/quizzes/' + id, { token: dir })).json;
const novoSlug = 'insta-' + suf;
const qz = { ...ed.quiz, ativo: true, notaCorte: 2, whatsapp: '+55 (14) 98827-8429',
  perguntas: [{ id: 'gosta', texto: 'Você gosta de vender?', tipo: 'escolha', opcoes: [{ id: 's', texto: 'Sim', pontos: 2 }, { id: 'n', texto: 'Não', pontos: 0 }, { id: 'nunca', texto: 'Odeio', pontos: 0, elimina: true }] }] };
let sv = await req('PUT', '/api/quizzes/' + id, { token: dir, body: { nome: nome + ' Insta', slug: novoSlug, quiz: qz } });
t('edita nome, link e perguntas', sv.status === 200 && sv.json.slug === novoSlug && sv.json.quiz.whatsapp === '5514988278429', sv.json);
t('link antigo deixa de existir', (await req('GET', '/api/quiz-publico/' + slug)).status === 404);
const pubNovo = (await req('GET', '/api/quiz-publico/' + novoSlug)).json;
t('link novo abre o quiz certo (1 pergunta)', pubNovo.perguntas?.length === 1 && pubNovo.perguntas[0].texto === 'Você gosta de vender?', pubNovo);
t('pergunta com 1 opção é recusada', (await req('PUT', '/api/quizzes/' + id, { token: dir, body: { nome: nome, slug: novoSlug, quiz: { ...qz, perguntas: [{ id: 'a', texto: 'Só uma?', tipo: 'escolha', opcoes: [{ id: 'x', texto: 'X', pontos: 1 }] }] } } })).status === 400);
t('link igual ao de outro quiz é recusado', (await req('PUT', '/api/quizzes/' + id, { token: dir, body: { nome, slug: principal.slug, quiz: qz } })).status === 409);
r = await responder('/api/quiz-publico/' + novoSlug, 'Bia Insta ' + suf, 6, { gosta: 's' }, { origem: 'instagram' });
t('responde pelo link novo e aprova com a regra dele', r.json.aprovado === true && r.json.whatsapp?.startsWith('https://wa.me/5514988278429'), r.json);
t('opção eliminatória do quiz novo reprova', (await responder('/api/quiz-publico/' + novoSlug, 'Odeia', 7, { gosta: 'nunca' })).json.aprovado === false);

// respostas por quiz
const rsp = (await req('GET', '/api/quiz/respostas?quiz=' + id, { token: dir })).json;
t('respostas filtradas pelo quiz', rsp.lista.length === 2 && rsp.lista.every(x => x.quizId === id && x.quizNome === nome + ' Insta') && rsp.resumo.total === 2 && rsp.resumo.aprovadas === 1, rsp.resumo);
const cadBia = (await req('GET', '/api/cadastros?q=' + encodeURIComponent('Bia Insta ' + suf), { token: dir })).json[0];
const dBia = (await req('GET', '/api/cadastros/' + cadBia.id, { token: dir })).json;
t('cadastro guarda de qual quiz veio + origem do link', dBia.cadastro.quiz?.quizNome === nome + ' Insta' && dBia.cadastro.origem === 'instagram', dBia.cadastro.quiz);
lista = (await req('GET', '/api/quizzes', { token: dir })).json;
t('lista mostra contagem por quiz', lista.find(q => q.id === id)?.respostas === 2 && lista.find(q => q.id === id)?.aprovadas === 1);

// desligar pela lista
await req('POST', `/api/quizzes/${id}/ativo`, { token: dir, body: { ativo: false } });
t('desligar fecha o link', (await responder('/api/quiz-publico/' + novoSlug, 'Depois', 8, { gosta: 's' })).status === 403);
await req('POST', `/api/quizzes/${id}/ativo`, { token: dir, body: { ativo: true } });

// duplicar
const dup = await req('POST', '/api/quizzes', { token: dir, body: { nome: nome + ' Insta (cópia)', copiarDe: id } });
const dDup = (await req('GET', '/api/quizzes/' + dup.json.id, { token: dir })).json;
t('duplicar copia as perguntas e nasce desligado', dup.status === 201 && dDup.quiz.perguntas[0].id === 'gosta' && dDup.quiz.ativo === false, dDup);

// tornar principal
await req('POST', `/api/quizzes/${id}/padrao`, { token: dir });
t('outro quiz vira o principal (/quiz)', (await req('GET', '/api/quiz-publico')).json.slug === novoSlug);
lista = (await req('GET', '/api/quizzes', { token: dir })).json;
t('só 1 principal', lista.filter(q => q.padrao).length === 1);

// excluir
t('administrativo não exclui', (await req('DELETE', '/api/quizzes/' + dup.json.id, { token: adm })).status === 403);
t('exclui a cópia', (await req('DELETE', '/api/quizzes/' + dup.json.id, { token: dir })).status === 200);
t('excluir o principal passa o link curto pra outro', (await req('DELETE', '/api/quizzes/' + id, { token: dir })).status === 200 && (await req('GET', '/api/quizzes', { token: dir })).json.filter(q => q.padrao).length === 1);
const rsp2 = (await req('GET', '/api/quiz/respostas', { token: dir })).json;
t('respostas do quiz excluído continuam guardadas', rsp2.lista.some(x => x.quizNome === nome + ' Insta'));
lista = (await req('GET', '/api/quizzes', { token: dir })).json;
for (const q of lista.slice(1)) await req('DELETE', '/api/quizzes/' + q.id, { token: dir });
t('não deixa excluir o último quiz', (await req('DELETE', '/api/quizzes/' + lista[0].id, { token: dir })).status === 409);

// ---- aparência: cores, logo, capa, fotos nas opções, vídeo ----
const ap = await req('POST', '/api/quizzes', { token: dir, body: { nome: 'Visual ' + suf, base: 'branco' } });
const apId = ap.json.id, apSlug = ap.json.slug;
async function envia(nomeArq, tipo, bytes, token = dir) {
  const fd = new FormData(); fd.append('arquivo', new Blob([bytes], { type: tipo }), nomeArq);
  const r = await fetch(API + '/api/quizzes/' + apId + '/imagem', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
t('administrativo não envia imagem', (await envia('a.png', 'image/png', png, adm)).status === 403);
t('arquivo que não é imagem/vídeo é recusado', (await envia('a.pdf', 'application/pdf', png)).status === 400);
const img = await envia('foto.png', 'image/png', png);
t('envia imagem e recebe o endereço', img.status === 200 && /^\/api\/quiz-midia\/quiz\/\d+\/[a-f0-9]+\.png$/.test(img.json.url) && img.json.video === false, img.json);
const rImg = await fetch(API + img.json.url);
t('imagem é servida pública com o tipo certo', rImg.status === 200 && rImg.headers.get('content-type') === 'image/png' && (await rImg.arrayBuffer()).byteLength === png.length);
const videoBytes = Buffer.alloc(5000, 7);
const vid = await envia('v.mp4', 'video/mp4', videoBytes);
t('envia vídeo MP4', vid.status === 200 && vid.json.url.endsWith('.mp4') && vid.json.video === true, vid.json);
const parte = await fetch(API + vid.json.url, { headers: { Range: 'bytes=100-199' } });
t('vídeo sai em pedaços (iPhone)', parte.status === 206 && parte.headers.get('content-range') === 'bytes 100-199/5000' && (await parte.arrayBuffer()).byteLength === 100);
t('mídia inexistente → 404', (await fetch(API + '/api/quiz-midia/quiz/999999/abcdef.png')).status === 404);
t('caminho fora do quiz não é servido', (await fetch(API + '/api/quiz-midia/../../etc/passwd')).status === 404);

let cfgAp = (await req('GET', '/api/quizzes/' + apId, { token: dir })).json;
t('quiz novo já vem com aparência padrão (cores da Clara)', cfgAp.quiz.aparencia?.corPrincipal === '#8e2a46' && cfgAp.quiz.aparencia.logo === 'clara');
const yt = 'https://youtu.be/dQw4w9WgXcQ';
const quizVisual = { ...cfgAp.quiz, ativo: true, notaCorte: 1,
  aparencia: { corPrincipal: '#123456', corTitulo: '#222222', corFundo: '#ffffff', corCabecalho: '#eeeeee', logo: 'propria', logoUrl: img.json.url, capaUrl: vid.json.url, layoutOpcoes: 'grade', imagemAprovado: yt, imagemReprovado: img.json.url },
  perguntas: [{ id: 'cor', texto: 'Qual estilo você mais gosta?', imagem: yt, tipo: 'escolha', opcoes: [
    { id: 'dourado', texto: 'Dourado', imagem: img.json.url, pontos: 1 }, { id: 'prata', texto: 'Prata', pontos: 0, emoji: '🤍' }] }] };
let sAp = await req('PUT', '/api/quizzes/' + apId, { token: dir, body: { nome: 'Visual ' + suf, slug: apSlug, quiz: quizVisual } });
t('salva cores, logo, capa em vídeo, layout em cartões, fotos', sAp.status === 200 && sAp.json.quiz.aparencia.layoutOpcoes === 'grade', sAp.json);
t('cor inválida é recusada', (await req('PUT', '/api/quizzes/' + apId, { token: dir, body: { nome: 'Visual ' + suf, slug: apSlug, quiz: { ...quizVisual, aparencia: { ...quizVisual.aparencia, corPrincipal: 'vermelho' } } } })).status === 400);
t('imagem de site de fora é recusada', (await req('PUT', '/api/quizzes/' + apId, { token: dir, body: { nome: 'Visual ' + suf, slug: apSlug, quiz: { ...quizVisual, aparencia: { ...quizVisual.aparencia, capaUrl: 'https://site-estranho.com/x.png' } } } })).status === 400);
const pubAp = (await req('GET', '/api/quiz-publico/' + apSlug)).json;
t('quiz público traz a aparência', pubAp.aparencia?.corPrincipal === '#123456' && pubAp.aparencia.logo === 'propria' && pubAp.aparencia.capaUrl === vid.json.url);
t('quiz público traz foto da pergunta e das opções', pubAp.perguntas[0].imagem === yt && pubAp.perguntas[0].opcoes[0].imagem === img.json.url && pubAp.perguntas[0].opcoes[1].emoji === '🤍');
t('pontos continuam escondidos', !JSON.stringify(pubAp).includes('"pontos"'));
const rAp = await req('POST', '/api/quiz-publico/' + apSlug, { body: { nome: 'Visual Teste', telefone: tel(20), cidade: 'Bauru', respostas: { cor: 'dourado' }, aceite: true } });
t('resultado aprovado traz a imagem/vídeo configurado', rAp.json.aprovado === true && rAp.json.imagem === yt, rAp.json);
const rAp2 = await req('POST', '/api/quiz-publico/' + apSlug, { body: { nome: 'Visual Teste Dois', telefone: tel(21), cidade: 'Bauru', respostas: { cor: 'prata' }, aceite: true } });
t('resultado não aprovado traz a imagem dele', rAp2.json.aprovado === false && rAp2.json.imagem === img.json.url, rAp2.json);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
