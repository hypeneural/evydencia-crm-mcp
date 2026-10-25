---
name: crm-mcp-chatgpt-connect
description: Guiar conexão MOCK do MCP ao ChatGPT pelo Secure MCP Tunnel sem expor HTTP ou credenciais.
---
# ChatGPT local
1. Exigir GO_LOCAL com npm run validate:local.
2. Ler docs/CHATGPT_TUNNEL_MOCK.md e docs oficiais do tunnel.
3. Validar tunnel-client instalado, perfil, autenticação e tunnel_id reais; nunca inventar.
4. Manter credenciais fora do Git. Não publicar HTTP nem habilitar escritura.
5. Testar crm_capacidades, crm_natal_resumo, crm_agenda_hoje e crm_previa_proposta_natal.
6. Classificar GO_CHATGPT_MOCK só com tool calls reais no ChatGPT e mock=true.
