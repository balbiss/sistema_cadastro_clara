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
  cidade?: string | null; quiz?: typeof cadastros.$inferInsert['quiz'];
  /** veio do quiz de perfil: nasce em "Perfil aprovado (quiz)", sem link enviado ainda */
  doQuiz?: boolean;
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
    cidade: d.cidade || null, quiz: d.quiz || null,
    status: d.doQuiz ? 'quiz_aprovado' : 'formulario_enviado', formEnviadoEm: d.doQuiz ? null : agora, etapaEntradaEm: agora,
    prazoEtapa: new Date(agora.getTime() + ((d.doQuiz ? prazos.quiz_aprovado : prazos.formulario_enviado) || (d.doQuiz ? 24 : 48)) * 3600_000),
  }).returning();
  const [pronto] = await db.update(cadastros).set({ codigo: 'CAD-' + String(c.id).padStart(5, '0') }).where(eq(cadastros.id, c.id)).returning();
  if (d.doQuiz) await registrarEvento(c.id, 'quiz_aprovado', `Perfil aprovado no quiz (${d.quiz?.pontos ?? 0} pontos)`, autor,
    { origem: d.origem, campanha: d.campanha, cidade: d.cidade, quiz: d.quiz });
  else await registrarEvento(c.id, 'formulario_enviado', 'Cadastro aberto e link do formulário gerado', autor,
    { origem: d.origem, campanha: d.campanha, consultora: d.consultoraNome });
  return pronto;
}
