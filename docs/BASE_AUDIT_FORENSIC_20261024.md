# Bases GitHub — decisão cirúrgica para o Antigravity Flash

Projetos conferidos em 24/10/2026:

| Origem | Evidência / abordagem | Decisão |
|---|---|---|
| modelcontextprotocol/typescript-sdk | SDK `@modelcontextprotocol/server` v2.4.0, `serveStdio`, `McpServer`, `Client`; instruções no constructor | ADOTADO; sem reescrita |
| modelcontextprotocol/inspector | Interface de invocação manual, negociação e análise de schema/annotations | Opcional após smoke; não necessário para primeiro CI |
| openai/tunnel-client | Suporta MCP stdio privado, `doctor`, `run`, `/healthz`, `/readyz`, `/ui`; exige túnel/credenciais reais | Preferir para primeira conexão ChatGPT MOCK |
| openai/mcp-extensions | Sidebar, composer e formulários avançados ChatGPT | Não importar antes de haver Plugin autenticado |
| mcp-use/mcp-use | DX, scaffold e alternativas de auth; outra stack/runtime | Padrões seletivos, não clonar monorepo |
| cloudflare/agents | Estado durável e deploy Workers; pode servir futuro journal | Não necessário em Windows MOCK |
| cloudflare/workers-oauth-provider | OAuth remoto com worker | Somente após decidir IdP e requisitos de produção |

**Diagnóstico de complexidade:** importar três frameworks duplicados para fazer ponte HTTP gera mais superfície de erro, mais dependências e mais decisões para o Flash. Com SDK oficial v2 + fixtures + scripts fechados, a IA só precisa rodar e inspecionar evidências.

**Lacunas de fato:** não há plugin no ChatGPT; sem OAuth/identidade por operador; sem API Extension de estatísticas privadas/agenda/lookup por nome; sem journal de envio; sem teste de ligação por voz. Não descrever isso como pronto.

**Antigravity official:** regras `.agents/rules/*.md` requerem trigger no frontmatter; `AGENTS.md` é sempre ativo e escopado por pasta; skills precisam de `SKILL.md` + description; hooks em `.agents/hooks.json` têm `SessionStart` e `PreToolUse` com JSON stdin/stdout. Hooks são guardrails adicionais, não sandbox.

Referências:
- https://ts.sdk.modelcontextprotocol.io/v2/
- https://antigravity.google/docs/rules/
- https://antigravity.google/docs/skills/
- https://antigravity.google/docs/hooks
- https://developers.openai.com/plugins/build/mcp-server
