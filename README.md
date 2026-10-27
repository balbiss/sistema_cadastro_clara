# Clara Cadastros

Sistema 2 do briefing "Setor de Prospecção e Abertura de Novas Revendedoras" (Clara Ferreira):
gestão de novos cadastros — formulário da cliente, análise de crédito com regras configuráveis,
avalista, dossiê de documentos, pendências com responsável e prazo.

**Separado do CRM**, mas conversando com ele:
- CRM → Cadastros: `POST /api/integracao/cadastros` (header `X-Api-Key`) abre o cadastro e devolve o link do formulário.
- Cadastros → CRM: cada acontecimento vai por webhook, em ordem, com status, motivo e link do dossiê (o CRM move o card e monta os relatórios).

## Rodar local (sem Docker)

```bash
cd server && npm install && node --import tsx src/index.ts   # API :3013 (banco PGlite em server/data)
npm install && npx vite                                       # tela :5185
node server/scripts/demo.mjs                                  # cadastros de exemplo (opcional)
```

Logins de teste (senha `123456`): diretoria@teste.local · analise@teste.local · administrativo@teste.local

Teste de ponta a ponta (sobe um servidor próprio num banco temporário): `cd server && npm test`

## Ainda não feito
- Consulta real ao SPC (hoje é simulada — ver tela Regras › SPC de teste)
- Conferência de documentos por IA, contrato/promissória, assinatura eletrônica, inicialização, ponte no CRM v2
