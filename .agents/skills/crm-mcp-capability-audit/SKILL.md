---
name: crm-mcp-capability-audit
description: Comprova rotas e scopes CRM e impede que mocks sejam classificados incorretamente como LIVE.
---
# Audit
1. Ler docs/CAPABILITY_MATRIX.md.
2. Inspecionar CRM routes/extension-api.php e controller no HEAD.
3. Sem rota escopada comprovada, marcar MOCK_ONLY. Não inventar endpoint.
4. Validar src/capabilities.mjs e testes. Proibir SingleAuthentication, SQL e Z-API.
5. Executar npm run validate:local; documentar resultado sem editar Laravel.
