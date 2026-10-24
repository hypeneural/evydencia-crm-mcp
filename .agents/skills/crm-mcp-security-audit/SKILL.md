---
name: crm-mcp-security-audit
description: Audita o MCP Evydência antes de release, verificando privacidade, mock, contratos HTTP, autenticação e proibição de envios.
---
# Auditoria de segurança
1. Ler AGENTS.md, docs/OFFICIAL_DOCS_AUDIT.md, docs/CONTRATOS_CRM.md e .agents/rules/security.md.
2. Confirmar que a única rota POST no adaptador é /api/v1/extension/proposals/preview. Não adicionar schedule, abort ou Z-API.
3. Executar npm run check, npm test, npm run smoke; inspecionar structuredContent e rejeições.
4. Verificar que EVYD_MOCK_MODE=1 exige NODE_ENV=development/test; nenhum dado real em fixtures ou logs.
5. Revisar privacidade de participantes, contratos inválidos, HTTP >1 MiB, timeouts, redirects, 401/403/409/422/429/503.
6. Para qualquer plano de HTTP remoto, exigir OAuth 2.1/OIDC, issuer/audience, scopes, autorização por operador e auditoria sem PII.
7. Devolver GO_LOCAL, GO_HOMOLOG, GO_CHATGPT ou BLOCKED com evidências; não prometer envio.
