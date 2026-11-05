import { pgTable, serial, text, integer, boolean, timestamp, jsonb, date } from 'drizzle-orm/pg-core';

// Tabelas do Clara Cadastros (Sistema 2 do briefing da Bel): sistema SEPARADO do CRM, que conversa
// com ele por API (entrada) e webhook (saída). O CPF + o código do lead no CRM ligam os dois.

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // diretoria = tudo + configurações; analise = decide crédito + documentos;
  // administrativo = documentos e pendências (não decide crédito)
  role: text('role').notNull().default('analise'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value'),
});

export type Endereco = { cep?: string; rua?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string };
export type Avalista = { nome?: string; cpf?: string; telefone?: string; dataNascimento?: string; endereco?: Endereco };
export type Checagem = { regra: string; ok: boolean; detalhe: string };
export type Inicializacao = {
  agendadoPara?: string; carga?: string; valorCarga?: number; valorFrete?: number; pagoEm?: string;
  rastreio?: string; enviadoEm?: string; entregueEm?: string; entreguePor?: string; observacao?: string;
};

export const cadastros = pgTable('cadastros', {
  id: serial('id').primaryKey(),
  codigo: text('codigo').notNull().unique(),
  // ligação com o CRM
  crmLeadId: text('crm_lead_id').unique(),
  crmContactId: text('crm_contact_id'),
  consultoraNome: text('consultora_nome'),
  origem: text('origem'),
  campanha: text('campanha'),
  // formulário
  nome: text('nome').notNull(),
  telefone: text('telefone'),
  email: text('email'),
  cpf: text('cpf'),
  dataNascimento: date('data_nascimento'),
  endereco: jsonb('endereco').$type<Endereco>(),
  declarouRestricao: boolean('declarou_restricao'),
  temAvalista: boolean('tem_avalista'),
  avalista: jsonb('avalista').$type<Avalista>(),
  modalidade: text('modalidade'), // presencial | online
  aceiteLgpdEm: timestamp('aceite_lgpd_em', { withTimezone: true }),
  formToken: text('form_token').notNull().unique(),
  formEnviadoEm: timestamp('form_enviado_em', { withTimezone: true }),
  formIniciadoEm: timestamp('form_iniciado_em', { withTimezone: true }),
  formConcluidoEm: timestamp('form_concluido_em', { withTimezone: true }),
  // situação (ver lib/status.ts)
  status: text('status').notNull().default('formulario_enviado'),
  motivo: text('motivo'),
  checagens: jsonb('checagens').$type<Checagem[]>(),
  decididoPor: text('decidido_por'), // automatico | nome da pessoa
  decididoEm: timestamp('decidido_em', { withTimezone: true }),
  responsavelId: integer('responsavel_id'),
  // item 3 do briefing: toda etapa tem data de entrada e prazo
  etapaEntradaEm: timestamp('etapa_entrada_em', { withTimezone: true }).notNull().defaultNow(),
  prazoEtapa: timestamp('prazo_etapa', { withTimezone: true }),
  // formalização (item 9) e inicialização (itens 10-11)
  valorCredito: integer('valor_credito'), // valor da promissória, em reais
  liberadoEm: timestamp('liberado_em', { withTimezone: true }),
  inicEtapa: text('inic_etapa'), // sub-etapa da inicialização (ver lib/inicializacao.ts)
  inicializacao: jsonb('inicializacao').$type<Inicializacao>(),
  iniciadaEm: timestamp('iniciada_em', { withTimezone: true }),
  // resumo do quiz de perfil (1ª etapa), quando o cadastro nasceu dele
  quiz: jsonb('quiz').$type<{ respostaId: number; pontos: number; itens: { pergunta: string; resposta: string; pontos: number }[] }>(),
  cidade: text('cidade'),
  // setor dono da etapa atual (item 7) e descarte LGPD (item 10)
  setor: text('setor'),
  // ligação com o ERP Jueri (item 2/12): id da revendedora lá + resumo do desempenho (1ª carga, pedidos, inadimplência)
  jueriId: text('jueri_id'),
  jueri: jsonb('jueri').$type<ResumoJueri>(),
  descartadoEm: timestamp('descartado_em', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const consultasCredito = pgTable('consultas_credito', {
  id: serial('id').primaryKey(),
  cadastroId: integer('cadastro_id').notNull(),
  pessoa: text('pessoa').notNull(), // titular | avalista
  cpf: text('cpf').notNull(),
  provedor: text('provedor').notNull(),
  resultado: jsonb('resultado').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documentos = pgTable('documentos', {
  id: serial('id').primaryKey(),
  cadastroId: integer('cadastro_id').notNull(),
  tipo: text('tipo').notNull(),
  arquivo: text('arquivo').notNull(),
  nomeOriginal: text('nome_original'),
  mime: text('mime'),
  tamanho: integer('tamanho'),
  status: text('status').notNull().default('enviado'), // enviado | conferido | recusado
  observacao: text('observacao'),
  dataEmissao: date('data_emissao'), // comprovante de residência: até 3 meses (item 5)
  conferidoPor: text('conferido_por'),
  conferidoEm: timestamp('conferido_em', { withTimezone: true }),
  // leitura da IA (item 5): dados extraídos + divergências. Nunca aprova sozinha.
  ia: jsonb('ia').$type<IaDoc>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pendencias = pgTable('pendencias', {
  id: serial('id').primaryKey(),
  cadastroId: integer('cadastro_id').notNull(),
  descricao: text('descricao').notNull(),
  responsavelId: integer('responsavel_id'),
  prazo: date('prazo'),
  criadaPor: text('criada_por'),
  resolvidaEm: timestamp('resolvida_em', { withTimezone: true }),
  resolvidaPor: text('resolvida_por'),
  // alerta automático (ex.: 'formulario_parado', 'ia_doc_12') — o sistema abre e fecha sozinho
  alerta: text('alerta'),
  // false = só avisa/cobra; true = trava a liberação (pendência manual, divergência da IA)
  bloqueia: boolean('bloqueia').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Histórico do cadastro. Cada evento também é avisado ao CRM (crm_status) — é daí que o CRM
// monta os relatórios finais.
export const eventos = pgTable('eventos', {
  id: serial('id').primaryKey(),
  cadastroId: integer('cadastro_id').notNull(),
  tipo: text('tipo').notNull(),
  descricao: text('descricao').notNull(),
  dados: jsonb('dados'),
  autor: text('autor'),
  crmStatus: text('crm_status').notNull().default('pendente'), // pendente | enviado | falhou | sem_crm
  crmTentativas: integer('crm_tentativas').notNull().default(0),
  crmErro: text('crm_erro'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Contrato + nota promissória gerados para o cadastro (item 9). Refazer cancela a versão anterior
// e as assinaturas dela. O texto fica guardado como foi assinado (com o hash).
export const formalizacoes = pgTable('formalizacoes', {
  id: serial('id').primaryKey(),
  cadastroId: integer('cadastro_id').notNull(),
  versao: integer('versao').notNull(),
  contrato: text('contrato').notNull(),
  promissoria: text('promissoria').notNull(),
  valor: integer('valor').notNull(),
  hash: text('hash').notNull(),
  provedor: text('provedor').notNull(), // simulado | (serviço de assinatura escolhido)
  criadoPor: text('criado_por'),
  canceladaEm: timestamp('cancelada_em', { withTimezone: true }),
  concluidaEm: timestamp('concluida_em', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assinaturas = pgTable('assinaturas', {
  id: serial('id').primaryKey(),
  formalizacaoId: integer('formalizacao_id').notNull(),
  cadastroId: integer('cadastro_id').notNull(),
  papel: text('papel').notNull(), // titular | avalista
  nome: text('nome').notNull(),
  cpf: text('cpf').notNull(),
  token: text('token').notNull().unique(),
  assinadoEm: timestamp('assinado_em', { withTimezone: true }),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// SQL de criação (o banco local é o PGlite — Postgres dentro do Node, sem Docker).
// Toda resposta do quiz de perfil (aprovada ou não) — base do relatório do quiz.
export const quizRespostas = pgTable('quiz_respostas', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  telefone: text('telefone').notNull(),
  cidade: text('cidade'),
  respostas: jsonb('respostas').$type<Record<string, string>>().notNull(),
  itens: jsonb('itens').$type<{ pergunta: string; resposta: string; pontos: number }[]>().notNull(),
  pontos: integer('pontos').notNull(),
  aprovado: boolean('aprovado').notNull(),
  eliminatorias: jsonb('eliminatorias').$type<string[]>(),
  origem: text('origem'),
  campanha: text('campanha'),
  cadastroId: integer('cadastro_id'),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ResumoJueri = {
  atualizadoEm: string; nome?: string; erro?: string;
  primeiraCarga?: { data: string | null; pecas: number; valor: number | null } | null;
  pedidos: number; acertos: number; ultimoPedido: string | null;
  pecasAbertas: number; ativa: boolean;
  valorConsignado: number; // soma do valor das maletas (NÃO é venda — só referência)
  faturamento: number | null; // venda real: soma do valor vendido nos acertos (pedido baixado, valor depois da baixa)
  comissao?: number;
  perdidos: { n: number; valor: number }; acertoAtrasadoDias: number; inadimplente: boolean;
};

export type IaDoc = {
  em: string; modelo: string; erro?: string;
  extraido?: { tipo_documento?: string; nome?: string; cpf?: string; data_nascimento?: string; data_emissao?: string; endereco?: string; cep?: string; cidade?: string; legivel?: boolean; sinais_adulteracao?: string[]; observacoes?: string };
  divergencias: string[]; ok: string[];
};

export const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'analise', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb);
CREATE TABLE IF NOT EXISTS cadastros (
  id serial PRIMARY KEY, codigo text NOT NULL UNIQUE, crm_lead_id text UNIQUE, crm_contact_id text,
  consultora_nome text, origem text, campanha text, nome text NOT NULL, telefone text, email text, cpf text,
  data_nascimento date, endereco jsonb, declarou_restricao boolean, tem_avalista boolean, avalista jsonb,
  modalidade text, aceite_lgpd_em timestamptz, form_token text NOT NULL UNIQUE, form_enviado_em timestamptz,
  form_iniciado_em timestamptz, form_concluido_em timestamptz, status text NOT NULL DEFAULT 'formulario_enviado',
  motivo text, checagens jsonb, decidido_por text, decidido_em timestamptz, responsavel_id integer,
  etapa_entrada_em timestamptz NOT NULL DEFAULT now(), prazo_etapa timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS cadastros_cpf_idx ON cadastros (cpf);
CREATE INDEX IF NOT EXISTS cadastros_status_idx ON cadastros (status);
CREATE TABLE IF NOT EXISTS consultas_credito (
  id serial PRIMARY KEY, cadastro_id integer NOT NULL, pessoa text NOT NULL, cpf text NOT NULL, provedor text NOT NULL,
  resultado jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS documentos (
  id serial PRIMARY KEY, cadastro_id integer NOT NULL, tipo text NOT NULL, arquivo text NOT NULL, nome_original text,
  mime text, tamanho integer, status text NOT NULL DEFAULT 'enviado', observacao text, data_emissao date, conferido_por text,
  conferido_em timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS pendencias (
  id serial PRIMARY KEY, cadastro_id integer NOT NULL, descricao text NOT NULL, responsavel_id integer, prazo date,
  criada_por text, resolvida_em timestamptz, resolvida_por text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS eventos (
  id serial PRIMARY KEY, cadastro_id integer NOT NULL, tipo text NOT NULL, descricao text NOT NULL, dados jsonb,
  autor text, crm_status text NOT NULL DEFAULT 'pendente', crm_tentativas integer NOT NULL DEFAULT 0, crm_erro text,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS eventos_cadastro_idx ON eventos (cadastro_id);
ALTER TABLE cadastros ADD COLUMN IF NOT EXISTS valor_credito integer;
ALTER TABLE cadastros ADD COLUMN IF NOT EXISTS liberado_em timestamptz;
ALTER TABLE cadastros ADD COLUMN IF NOT EXISTS inic_etapa text;
ALTER TABLE cadastros ADD COLUMN IF NOT EXISTS inicializacao jsonb;
ALTER TABLE cadastros ADD COLUMN IF NOT EXISTS iniciada_em timestamptz;
ALTER TABLE cadastros ADD COLUMN IF NOT EXISTS quiz jsonb;
ALTER TABLE cadastros ADD COLUMN IF NOT EXISTS cidade text;
CREATE TABLE IF NOT EXISTS quiz_respostas (
  id serial PRIMARY KEY, nome text NOT NULL, telefone text NOT NULL, cidade text, respostas jsonb NOT NULL, itens jsonb NOT NULL,
  pontos integer NOT NULL, aprovado boolean NOT NULL, eliminatorias jsonb, origem text, campanha text, cadastro_id integer, ip text,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS quiz_respostas_tel_idx ON quiz_respostas (telefone);
ALTER TABLE pendencias ADD COLUMN IF NOT EXISTS alerta text;
ALTER TABLE pendencias ADD COLUMN IF NOT EXISTS bloqueia boolean NOT NULL DEFAULT true;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS ia jsonb;
ALTER TABLE cadastros ADD COLUMN IF NOT EXISTS setor text;
ALTER TABLE cadastros ADD COLUMN IF NOT EXISTS descartado_em timestamptz;
ALTER TABLE cadastros ADD COLUMN IF NOT EXISTS jueri_id text;
ALTER TABLE cadastros ADD COLUMN IF NOT EXISTS jueri jsonb;
CREATE TABLE IF NOT EXISTS formalizacoes (
  id serial PRIMARY KEY, cadastro_id integer NOT NULL, versao integer NOT NULL, contrato text NOT NULL, promissoria text NOT NULL,
  valor integer NOT NULL, hash text NOT NULL, provedor text NOT NULL, criado_por text, cancelada_em timestamptz, concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS assinaturas (
  id serial PRIMARY KEY, formalizacao_id integer NOT NULL, cadastro_id integer NOT NULL, papel text NOT NULL, nome text NOT NULL,
  cpf text NOT NULL, token text NOT NULL UNIQUE, assinado_em timestamptz, ip text, user_agent text, created_at timestamptz NOT NULL DEFAULT now());
`;
