import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cadastros } from '../db/schema.js';
import { getPrazos } from './settings.js';
import { registrarEvento } from './eventos.js';
import { soDigitos } from './util.js';

export type NovoCadastro = {
  nome: string; telefone?: string | null; email?: string | null; cpf?: string | null;
  crmLeadId?: string | null; crmContactId?: string | null; consultoraNome?: string | null; origem?: string | null; campanha?: string | null;
};

/** Abre o cadastro e o link do formulário (etapa 4 do fluxo: "Formulário enviado"). */
export async function criarCadastro(d: NovoCadastro, autor: string) {
  const prazos = await getPrazos();
  const agora = new Date();
  const [c] = await db.insert(cadastros).values({
    codigo: 'tmp-' + crypto.randomUUID(), formToken: crypto.randomBytes(18).toString('base64url'),
    nome: d.nome.trim(), telefone: soDigitos(d.telefone) || null, email: d.email || null, cpf: soDigitos(d.cpf) || null,
    crmLeadId: d.crmLeadId || null, crmContactId: d.crmContactId || null, consultoraNome: d.consultoraNome || null,
    origem: d.origem || null, campanha: d.campanha || null,
    status: 'formulario_enviado', formEnviadoEm: agora, etapaEntradaEm: agora,
    prazoEtapa: new Date(agora.getTime() + (prazos.formulario_enviado || 48) * 3600_000),
  }).returning();
  const [pronto] = await db.update(cadastros).set({ codigo: 'CAD-' + String(c.id).padStart(5, '0') }).where(eq(cadastros.id, c.id)).returning();
  await registrarEvento(c.id, 'formulario_enviado', 'Cadastro aberto e link do formulário gerado', autor,
    { origem: d.origem, campanha: d.campanha, consultora: d.consultoraNome });
  return pronto;
}
