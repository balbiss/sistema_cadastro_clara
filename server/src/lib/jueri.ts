import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros, type ResumoJueri } from '../db/schema.js';
import { registrarEvento } from './eventos.js';
import { soDigitos } from './util.js';

// Itens 2, 9 e 12 do briefing: a revendedora iniciada é ligada ao cadastro dela no ERP Jueri (pelo CPF)
// e o cadastro passa a ler o resultado real: 1ª carga, pedidos, acertos, peças em aberto, inadimplência.
// Mesma API e credenciais que o CRM v2 já usa (JUERI_API_TOKEN, JUERI_CLIENTE_SISTEMA, JUERI_API_URL).
// Só LEITURA (GET) — nada é alterado no Jueri.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const jueriConfigurado = () => !!(process.env.JUERI_API_TOKEN && process.env.JUERI_CLIENTE_SISTEMA);
const MIN_PECAS = () => Number(process.env.JUERI_MIN_PECAS_ATIVA) || 25; // critério da Bel: ativa = mais de 25 peças abertas
const ATRASO_INADIMPLENTE = () => Number(process.env.JUERI_DIAS_ATRASO_INADIMPLENTE) || 15; // provisório até a Bel definir
const ABERTO = 1, BAIXADO = 2, CANCELADO = 3, PERDIDO = 4;
const LABEL: Record<string, number> = { Aberto: ABERTO, Baixado: BAIXADO, Cancelado: CANCELADO, Perdido: PERDIDO };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function jueri(path: string, params: Record<string, any> = {}): Promise<any> {
  const base = (process.env.JUERI_API_URL || 'https://jueri.com.br/sis').replace(/\/$/, '');
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)])).toString();
  const url = `${base}/api/v1/${process.env.JUERI_CLIENTE_SISTEMA}${path}${qs ? `?${qs}` : ''}`;
  for (let tentativa = 0; ; tentativa++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.JUERI_API_TOKEN}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (r.status === 429 && tentativa < 3) { await sleep(5000 * (tentativa + 1)); continue; } // limite do Jueri
    const txt = await r.text();
    const body = txt ? JSON.parse(txt) : null;
    if (!r.ok) throw new Error(`Jueri ${r.status}: ${body?.message || body?.error || r.statusText}`);
    return body;
  }
}
async function paginado(path: string, extra: Record<string, any> = {}) {
  const out: any[] = [];
  for (let page = 1; page <= 400; page++) {
    const res = await jueri(path, { ...extra, page, per_page: 500 });
    const items = Array.isArray(res) ? res : res?.data || [];
    if (!items.length) break;
    out.push(...items);
    if (Array.isArray(res) || !res.next_page_url) break;
  }
  return out;
}

const dia = (s: any): string | null => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s ?? '')); return m ? m[1] : null; };
const num = (v: any) => (v == null || v === '' ? 0 : Number(String(v).replace(',', '.')) || 0);
const status = (p: any) => ('status' in p && typeof p.status === 'string' ? LABEL[p.status] ?? ABERTO : [1, 2, 3, 4].includes(Number(p.fk_status_pedido_id)) ? Number(p.fk_status_pedido_id) : ABERTO);
const pecas = (p: any) => num(p.quantidade_antes_baixa) || num(p.quantidade);

/** Resumo do desempenho a partir dos pedidos (e das vendas, se o Jueri entregar). */
export function resumir(nome: string | undefined, pedidos: any[], vendas: any[] | null, hoje = new Date()): ResumoJueri {
  const validos = pedidos.filter(p => status(p) !== CANCELADO).sort((a, b) => String(a.data_criacao).localeCompare(String(b.data_criacao)));
  const abertos = validos.filter(p => status(p) === ABERTO);
  const perdidos = validos.filter(p => status(p) === PERDIDO);
  const hojeStr = hoje.toISOString().slice(0, 10);
  const atrasos = abertos.map(p => dia(p.data_acerto)).filter((d): d is string => !!d && d < hojeStr)
    .map(d => Math.floor((+new Date(hojeStr) - +new Date(d)) / 86400_000));
  const atraso = atrasos.length ? Math.max(...atrasos) : 0;
  const pecasAbertas = abertos.reduce((s, p) => s + pecas(p), 0);
  const p1 = validos[0];
  return {
    atualizadoEm: hoje.toISOString(), nome,
    primeiraCarga: p1 ? { data: dia(p1.data_criacao), pecas: pecas(p1), valor: p1.valor_total != null ? num(p1.valor_total) : null } : null,
    pedidos: validos.length, acertos: validos.filter(p => status(p) === BAIXADO).length,
    ultimoPedido: validos.length ? dia(validos[validos.length - 1].data_criacao) : null,
    pecasAbertas, ativa: pecasAbertas > MIN_PECAS(),
    valorConsignado: Math.round(validos.reduce((s, p) => s + num(p.valor_total), 0) * 100) / 100,
    faturamento: vendas ? Math.round(vendas.reduce((s, v) => s + num(v.valor_total ?? v.valor ?? v.total), 0) * 100) / 100 : null,
    perdidos: { n: perdidos.length, valor: Math.round(perdidos.reduce((s, p) => s + num(p.valor_total), 0) * 100) / 100 },
    acertoAtrasadoDias: atraso, inadimplente: perdidos.length > 0 || atraso >= ATRASO_INADIMPLENTE(),
  };
}

/** Vendas da revendedora — só confia se o Jueri devolver mesmo as vendas DELA (filtro respeitado). */
async function vendasDe(id: string): Promise<any[] | null> {
  try {
    const lista = await paginado('/venda', { fk_revendedor_id: id });
    if (!lista.length) return [];
    return lista.every(v => String(v.fk_revendedor_id ?? '') === id) ? lista : null;
  } catch { return null; }
}

let rodando = false;
export let ultimaSync: { em: string; vinculados: number; atualizados: number; erro?: string } | null = null;

/** Liga as iniciadas (e em inicialização) ao Jueri pelo CPF e atualiza o resumo de cada uma. */
export async function sincronizarJueri(somenteCadastroId?: number) {
  if (!jueriConfigurado()) return { vinculados: 0, atualizados: 0, erro: 'Jueri não configurado' };
  if (rodando) return { vinculados: 0, atualizados: 0, erro: 'Sincronização já em andamento' };
  rodando = true;
  let vinculados = 0, atualizados = 0;
  try {
    const conds = [inArray(cadastros.status, ['inicializacao', 'iniciada']), isNull(cadastros.descartadoEm)];
    if (somenteCadastroId) conds.push(eq(cadastros.id, somenteCadastroId));
    const alvos = await db.select().from(cadastros).where(and(...conds));
    if (!alvos.length) return { vinculados, atualizados };

    // 1) ligar pelo CPF quem ainda não tem id do Jueri
    const semId = alvos.filter(c => !c.jueriId && soDigitos(c.cpf).length === 11);
    let porCpf = new Map<string, any>();
    if (semId.length) {
      const revs = await paginado('/revendedor');
      porCpf = new Map(revs.filter(r => soDigitos(r.cpf).length === 11).map(r => [soDigitos(r.cpf), r]));
      for (const c of semId) {
        const r = porCpf.get(soDigitos(c.cpf));
        if (!r) continue;
        c.jueriId = String(r.id);
        await db.update(cadastros).set({ jueriId: c.jueriId }).where(eq(cadastros.id, c.id));
        await registrarEvento(c.id, 'jueri_vinculado', `Ligada à revendedora ${r.nome || r.id} no Jueri (id ${r.id}) pelo CPF`, 'sistema (Jueri)', { jueri_id: r.id });
        vinculados++;
      }
    }
    // 2) resumo de quem está ligado
    const ligados = alvos.filter(c => c.jueriId);
    if (!ligados.length) return { vinculados, atualizados };
    const ids = new Set(ligados.map(c => c.jueriId!));
    const porRev = new Map<string, any[]>();
    for (const p of await paginado('/pedido')) {
      const rid = p.fk_revendedor_id == null ? '' : String(p.fk_revendedor_id);
      if (!ids.has(rid)) continue;
      porRev.set(rid, [...(porRev.get(rid) || []), p]);
    }
    for (const c of ligados) {
      const nome = [...porCpf.values()].find(r => String(r.id) === c.jueriId)?.nome || c.jueri?.nome;
      const resumo = resumir(nome, porRev.get(c.jueriId!) || [], await vendasDe(c.jueriId!));
      const antes = c.jueri;
      await db.update(cadastros).set({ jueri: resumo }).where(eq(cadastros.id, c.id));
      if (resumo.inadimplente && !antes?.inadimplente)
        await registrarEvento(c.id, 'jueri_inadimplente', `Jueri: ${resumo.perdidos.n ? resumo.perdidos.n + ' pedido(s) perdido(s)' : 'acerto atrasado há ' + resumo.acertoAtrasadoDias + ' dias'}`, 'sistema (Jueri)');
      atualizados++;
    }
    ultimaSync = { em: new Date().toISOString(), vinculados, atualizados };
    return { vinculados, atualizados };
  } catch (e) {
    ultimaSync = { em: new Date().toISOString(), vinculados, atualizados, erro: (e as Error).message };
    return { vinculados, atualizados, erro: (e as Error).message };
  } finally { rodando = false; }
}

export function iniciarJueri() {
  if (!jueriConfigurado()) { console.log('Jueri: não configurado (sem JUERI_API_TOKEN/JUERI_CLIENTE_SISTEMA)'); return; }
  const rodar = () => sincronizarJueri().then(r => console.log('Jueri:', r)).catch(err => console.error('Jueri falhou:', err));
  setTimeout(rodar, 3 * 60_000);
  setInterval(rodar, 6 * 3600_000);
}

