---
name: crm-mcp-contract-parity
description: Compara fixtures sintéticos, projeções e rotas do MCP com os contratos atuais da Extension API do CRM.
---
# Auditoria de paridade
1. Consultar `hypeneural/evydencia-crm` no HEAD e identificar diferenças em `routes/extension-api.php`, resources, controllers e Scribe.
2. Comparar `contracts/extension-api.v1.openapi.yaml` com as rotas e escopos Sanctum; não criar ferramentas automaticamente.
3. Conferir `fixtures/*.json`, sem dados de produção; os mocks devem manter `mock:true` e `source:'fixture'`.
4. Executar `npm test` e `npm run smoke` antes de propor alterações.
5. Falhas de paridade exigem patch e teste correlato; nunca habilitar schedule ou abort sem confirmação e journal.
