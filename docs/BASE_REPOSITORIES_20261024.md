# Repositórios-base auditados — decisão

| Repo | Uso proposto | Decisão |
|---|---|---|
| https://github.com/modelcontextprotocol/typescript-sdk | Runtime oficial v2 2026-07-28, stdio, Client | ADOTADO |
| https://github.com/modelcontextprotocol/inspector | Inspecionar tools MCP (UI e CLI) | TESTAR LOCAL |
| https://github.com/openai/tunnel-client | Primeira conexão ChatGPT sem HTTP público | PRÓXIMA FASE |
| https://github.com/openai/mcp-extensions | UI de confirmação visual | DEPOIS |
| https://github.com/mcp-use/mcp-use | Padrões DX, scaffold, inspector | REFERÊNCIA; não migrar |
| https://github.com/cloudflare/agents | Hospedagem remota com auth | DEPOIS |
| https://github.com/cloudflare/workers-oauth-provider | OAuth 2.1 | DEPOIS |
| https://github.com/supercorp-ai/supergateway | stdio→HTTP | NÃO necessário para Tunnel; proibido sem auth |

Evitar clonar frameworks inteiros; reduzir superfície e alucinação no modelo 3.8 Flash. A autenticação de operador e as três capacidades estatísticas/agenda/busca por nome em APIs stateless ainda são gaps.

Fontes oficiais:
https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28
https://www.antigravity.google/docs/rules/
https://www.antigravity.google/docs/hooks
https://www.antigravity.google/docs/migration/workflows-to-skills/
https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
