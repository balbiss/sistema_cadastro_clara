import { and, eq, inArray, isNull, like, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, documentos, pendencias, type IaDoc } from '../db/schema.js';
import { registrarEvento } from './eventos.js';
import { comprovanteNoPrazo } from './documentos.js';
import { DOC_NOME } from './status.js';
import { getOperacao, getSetores } from './settings.js';
import { ler } from './storage.js';
import { soDigitos } from './util.js';

// Item 5 do briefing: conferência apoiada por IA. Lê o documento, extrai os dados e compara com o
// formulário. NUNCA aprova sozinha: divergência/dúvida vira pendência que TRAVA a liberação até
// alguém da equipe conferir o documento (o briefing pede exatamente isso).
const MODELO = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';
export const iaDisponivel = () => !!process.env.OPENAI_API_KEY;
const IA = 'IA (conferência de documentos)';

const PROMPT = `Você confere documentos de cadastro de revendedoras no Brasil. Leia a imagem/PDF e responda SÓ um JSON:
{"tipo_documento": "RG" | "CNH" | "comprovante_residencia" | "outro",
 "nome": string|null, "cpf": string|null, "data_nascimento": "AAAA-MM-DD"|null,
 "data_emissao": "AAAA-MM-DD"|null  (comprovante: data de emissão/vencimento/referência da conta),
 "endereco": string|null, "cep": string|null, "cidade": string|null,
 "legivel": boolean, "sinais_adulteracao": string[] (rasuras, montagem, fontes diferentes, recortes; [] se nada),
 "observacoes": string}
Use null quando não der pra ler. Não invente dados.`;

const norm = (s?: string | null) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
/** mesmo primeiro e último nome (aceita nome do meio abreviado/faltando) */
function nomesBatem(a?: string | null, b?: string | null) {
  const x = norm(a).split(' ').filter(p => p.length > 2), y = norm(b).split(' ').filter(p => p.length > 2);
  if (!x.length || !y.length) return null;
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
}

/** aceita AAAA-MM-DD, DD/MM/AAAA, DD-MM-AAAA ou MM/AAAA (conta de consumo) e devolve AAAA-MM-DD */
function dataIso(v?: string | null) {
  const t = String(v || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/.-](\d{4})$/); if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  return null;
}

async function lerArquivo(arquivo: string) {
  const s = await ler(arquivo.replace(/\\/g, '/'));
  if (!s) return null;
  const partes: Buffer[] = [];
  for await (const p of s) partes.push(Buffer.from(p));
  return Buffer.concat(partes);
}

export async function conferirComIa(docId: number, autor = IA) {
  const op = await getOperacao();
  if (!op.ia || !iaDisponivel()) return null;
  const [d] = await db.select().from(documentos).where(eq(documentos.id, docId)).limit(1);
  if (!d || !d.arquivo) return null;
  const [c] = await db.select().from(cadastros).where(eq(cadastros.id, d.cadastroId)).limit(1);
  if (!c) return null;
  const nomeDoc = DOC_NOME[d.tipo] || d.tipo;
  const resultado: IaDoc = { em: new Date().toISOString(), modelo: MODELO(), divergencias: [], ok: [] };

  try {
    const buf = await lerArquivo(d.arquivo);
    if (!buf) throw new Error('arquivo não encontrado');
    const mime = d.mime || 'image/jpeg';
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    const anexo = mime === 'application/pdf'
      ? { type: 'file', file: { filename: d.nomeOriginal || 'documento.pdf', file_data: dataUrl } }
      : { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } };
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(90_000),
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELO(), temperature: 0, response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, anexo] }] }),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || 'OpenAI ' + r.status);
    resultado.extraido = JSON.parse(j.choices[0].message.content);
    const ex = resultado.extraido!;
    ex.data_nascimento = dataIso(ex.data_nascimento) || undefined;
    ex.data_emissao = dataIso(ex.data_emissao) || undefined;
  } catch (e) {
    resultado.erro = (e as Error).message;
  }

  // ---- comparação com o formulário (titular ou avalista) ----
  const x = resultado.extraido;
  if (x) {
    const doAvalista = d.tipo.startsWith('avalista_');
    const pessoa = doAvalista ? { nome: c.avalista?.nome, cpf: c.avalista?.cpf, nasc: c.avalista?.dataNascimento } : { nome: c.nome, cpf: c.cpf, nasc: c.dataNascimento };
    const comprovante = d.tipo.endsWith('comprovante_residencia');
    const diverge = (t: string) => resultado.divergencias.push(t);
    const confere = (t: string) => resultado.ok.push(t);

    if (x.legivel === false) diverge('Documento ilegível ou cortado');
    if (x.sinais_adulteracao?.length) diverge('Possível adulteração: ' + x.sinais_adulteracao.join('; '));
    if (comprovante && x.tipo_documento && x.tipo_documento !== 'comprovante_residencia') diverge(`Não parece um comprovante de residência (parece ${x.tipo_documento})`);
    if (!comprovante && x.tipo_documento === 'comprovante_residencia') diverge('Foi enviado um comprovante no lugar do documento de identidade');

    const nb = nomesBatem(x.nome, pessoa.nome);
    if (nb === true) confere('Nome confere');
    else if (nb === false) diverge(`Nome no documento ("${x.nome}") diferente do formulário ("${pessoa.nome}")${comprovante ? ' — comprovante pode estar em nome de terceiro' : ''}`);

    if (!comprovante) {
      const cpfDoc = soDigitos(x.cpf);
      if (cpfDoc.length === 11) cpfDoc === soDigitos(pessoa.cpf) ? confere('CPF confere') : diverge(`CPF no documento (${cpfDoc}) diferente do formulário`);
      if (x.data_nascimento && pessoa.nasc) x.data_nascimento === pessoa.nasc ? confere('Data de nascimento confere') : diverge(`Nascimento no documento (${x.data_nascimento}) diferente do formulário (${pessoa.nasc})`);
    } else {
      if (!x.data_emissao) diverge('Não deu pra ler a data do comprovante');
      else if (!comprovanteNoPrazo(x.data_emissao)) diverge(`Comprovante de ${x.data_emissao} — mais de 3 meses`);
      else confere(`Comprovante de ${x.data_emissao} (dentro de 3 meses)`);
      const end = doAvalista ? (c.avalista?.endereco || {}) : (c.endereco || {});
      const cepDoc = soDigitos(x.cep);
      if (cepDoc.length === 8 && end.cep) cepDoc === soDigitos(end.cep) ? confere('CEP confere') : diverge(`CEP do comprovante (${cepDoc}) diferente do formulário (${end.cep})`);
      else if (x.cidade && end.cidade && norm(x.cidade) !== norm(end.cidade)) diverge(`Cidade do comprovante (${x.cidade}) diferente do formulário (${end.cidade})`);
    }
  }

  await db.update(documentos).set({ ia: resultado }).where(eq(documentos.id, d.id));

  // documento novo do mesmo tipo substitui o antigo: a pendência da IA do antigo não vale mais
  const outros = (await db.select({ id: documentos.id }).from(documentos).where(and(eq(documentos.cadastroId, c.id), eq(documentos.tipo, d.tipo), ne(documentos.id, d.id)))).map(o => 'ia:' + o.id);
  if (outros.length) await db.update(pendencias).set({ resolvidaEm: new Date(), resolvidaPor: 'sistema (documento substituído)' })
    .where(and(isNull(pendencias.resolvidaEm), inArray(pendencias.alerta, outros)));

  if (resultado.erro) {
    await registrarEvento(c.id, 'ia_documento', `IA não conseguiu ler ${nomeDoc} (${resultado.erro}) — conferir manualmente`, autor, { documento_id: d.id });
  } else if (resultado.divergencias.length) {
    const [ja] = await db.select().from(pendencias).where(and(eq(pendencias.alerta, 'ia:' + d.id), isNull(pendencias.resolvidaEm))).limit(1);
    if (!ja) {
      const setores = await getSetores();
      await db.insert(pendencias).values({ cadastroId: c.id, descricao: `Conferir ${nomeDoc} — IA apontou: ${resultado.divergencias.join('; ')}`,
        criadaPor: autor, responsavelId: setores.responsaveis.administrativo || c.responsavelId || null, alerta: 'ia:' + d.id, bloqueia: true });
    }
    await registrarEvento(c.id, 'ia_documento', `IA: ${nomeDoc} com divergência — ${resultado.divergencias.join('; ')}`, autor, { documento_id: d.id, divergencias: resultado.divergencias });
  } else {
    await registrarEvento(c.id, 'ia_documento', `IA: ${nomeDoc} sem divergência (${resultado.ok.join(', ') || 'lido'}) — falta a conferência da equipe`, autor, { documento_id: d.id });
  }
  return resultado;
}

/** A equipe conferiu (aceitou ou recusou) o documento: a pendência da IA dele está tratada. */
export async function fecharPendenciaIa(docId: number, quem: string) {
  await db.update(pendencias).set({ resolvidaEm: new Date(), resolvidaPor: quem })
    .where(and(isNull(pendencias.resolvidaEm), eq(pendencias.alerta, 'ia:' + docId)));
}

/** Cliente reenviou um documento recusado: a pendência "Reenviar X" foi cumprida. */
export async function fecharPendenciaReenvio(cadastroId: number, tipo: string, quem: string) {
  await db.update(pendencias).set({ resolvidaEm: new Date(), resolvidaPor: quem })
    .where(and(eq(pendencias.cadastroId, cadastroId), isNull(pendencias.resolvidaEm), like(pendencias.descricao, `Reenviar ${DOC_NOME[tipo] || tipo}:%`)));
}
