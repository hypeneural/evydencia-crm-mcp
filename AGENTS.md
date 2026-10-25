# Evydência CRM MCP — contrato operacional do agente (Antigravity)

**Workspace permitido:** apenas hypeneural/evydencia-crm-mcp.
**Workspace proibido:** hypeneural/evydencia-crm (somente leitura para conferir API).
**Modo atual:** MOCK + consultas GET e POST preview estritamente permitidos. Nenhum envio real.
**Modelo local:** Gemini 3.8 Flash; use esforço High para auditorias de segurança/contrato e Medium apenas para correções isoladas.

## Ordem de verdade (sem inferência)
1. Implementação e testes do CRM Laravel no HEAD comprovado; rotas e scopes autorizados.
2. Contratos OpenAPI em contracts/ e fixtures auditadas.
3. Código deste MCP e testes.
4. Docs. Se faltar fonte: marcar UNVERIFIED, não criar endpoint/tool live.

## Ciclo obrigatório (uma hipótese e um patch pequeno)
1. git status --short; git rev-parse HEAD; ler somente arquivos relevantes.
2. Consultar docs/CAPABILITY_MATRIX.md; identificar estado LIVE_PUBLIC, LIVE_EXTENSION, MOCK_ONLY, WRITE_GATED ou BLOCKED.
3. Executar node scripts/doctor.mjs e testes atuais para obter baseline.
4. Alterar no máximo 3 arquivos por ciclo de correção com testes negativos. Não remover assert para ficar verde.
5. npm run validate:local (doctor, syntax, unit, stdio smoke e conversation smoke).
6. Anotar comando, exit code, evidência, diff e risco. Nada de 'funcionou' sem logs.
7. Publicação, edição de .env, CRM ou mudança de autorização exigem aprovação humana. Verificar hooks via /hooks.

## Nunca
- Chamar Z-API, /proposals/schedule, /abort, API manager SingleAuthentication ou SQL.
- Registrar dados reais (o repositório GitHub é público).
- Assumir que sessão de voz significa autorização para enviar.
- Converter OpenAPI para expor endpoints indiscriminadamente.
- Declarar MOCK de estatística/agenda/busca por nome como dados reais.
- Instalar plataforma alternativa MCP sem comparar SDK oficial e aprovar PR.
- Publicar Streamable HTTP sem OAuth individual e proteção de secrets.

## Primeiro teste seguro
PowerShell: .\scripts\bootstrap-mock.ps1; .\scripts\validate.ps1.
Depois npm run conversation:smoke, inspecionar docs/CONVERSATION_PLAYBOOK.md.
Voz/Textos são ambas entradas MCP; qualquer pedido de enviar por voz vai APENAS simular em desenvolvimento.

## Skills (invoque a necessária, uma de cada vez)
- /crm-mcp-preflight
- /crm-mcp-security-audit
- /crm-mcp-contract-parity
- /crm-mcp-conversation-harness
- /crm-mcp-capability-audit
- /crm-mcp-chatgpt-connect
- /crm-mcp-proposal-design (somente planejamento)
Leia docs/ANTIGRAVITY_LOCAL.md, docs/CAPABILITY_MATRIX.md e docs/CONVERSATION_PLAYBOOK.md antes da execução.
