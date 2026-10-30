# Auditoria de documentação oficial e lacunas — 24/10/2026

## Fontes oficiais consultadas
- SDK MCP TypeScript v2: https://ts.sdk.modelcontextprotocol.io/v2/
- Primeiro servidor (registerTool, z.object, serveStdio, Inspector): https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server
- Primeiro cliente (Client, StdioClientTransport, listTools, callTool): https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client
- Pacotes e subpaths v2: https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages
- MCP 2026-07-28 / OAuth: https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28
- ChatGPT / Responses API, MCP remoto e Secure MCP Tunnel: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- Google Antigravity Skills: https://antigravity.google/docs/skills/
- Migração de workflows legados: https://antigravity.google/docs/migration/workflows-to-skills/
- Código CRM auditado: https://github.com/hypeneural/evydencia-crm/tree/995101b34d5587d5523d885e28c3070337157f6a

## Compatibilidade validada documentalmente
- SDK v2 usa @modelcontextprotocol/server, @modelcontextprotocol/server/stdio, McpServer e serveStdio; cliente usa @modelcontextprotocol/client e /stdio. Implementação alinhada.
- O MCP atual é somente stdio; ChatGPT remoto requer Streamable HTTP e segurança própria, ou Secure MCP Tunnel. Não afirmar integração ChatGPT já concluída.
- Antigravity usa .agents/skills/<nome>/SKILL.md com frontmatter name e description. Não criar novos workflows legados.
- CRM Sanctum: customer-context, customer-360 e bootstrap GET; proposals/preview POST requer extension:proposal-read, pode sondar worker mas NÃO agenda. proposals/schedule e abort exigem proposal-write e estão ausentes do MCP.
- CustomerContextRequest e ProposalPreviewRequest usam BrazilMobilePhone::fromProposalInput; normalização de 8 para 9 dígitos é correta para estas rotas. ProposalRecipientName rejeita controles, ponto e vírgula, ausência de letras e nomes >80 caracteres.

## Correções implementadas no MCP
1. Leitura de JSON por stream com limite de 1 MiB ANTES de acumular o corpo; verifica content-length e content-type, rejeita redirecionamento e JSON inválido.
2. Falha fechada (crm_contract_invalid) para envelopes incompletos/alterados de customer-context, customer-360, agenda e preview.
3. Validação/normalização local de nome com o mesmo princípio do CRM, antes de enviar o POST de preview.
4. Respostas de sucesso MCP incluem structuredContent e JSON de texto, sem PII adicional.
5. Mock apenas quando NODE_ENV é explicitamente development/test; respostas sempre marcadas mock:true/source:fixture.
6. Disponibilidade mock retorna somente datas existentes na fixture e dentro do intervalo solicitado.
7. Testes negativos de HTTP, contrato, nome, ambiente, privacidade e smoke stdio.

## Lacunas priorizadas (não implementadas nesta fase)
P0 — Gerar e versionar package-lock.json no Windows; migrar para npm ci em todos os ambientes; executar npm audit e revisar dependências.
P0 — Validar npm install, npm test, npm run smoke e Inspector no Windows 11; CI no GitHub é evidência complementar, não homologação CRM.
P0 — Manter o GitHub sem PII e segredos; o repositório está público. Considerar mudar para privado.
P1 — Se for necessário acesso remoto: criar transporte Streamable HTTP com autenticação OAuth por operador, resource metadata, issuer/audience, PKCE, TLS, isolamento de token Sanctum, autorização por tool, rate limits, CORS/origin e auditoria sem PII. Fazer em PR separado; NÃO publicar endpoint sem auth.
P1 — Validar com API de homologação do CRM (EXTENSION_API_ENABLED, scopes mínimos, schema_version, 401/403/409/422/429/503, dados anonimizados).
P2 — Planejar journal durável, confirmação humana vinculada à intenção, UUID/idempotência estável, reconciliação de timeout; envio deve permanecer DESABILITADO até revisão formal.

## Critérios de aceite
- GO_LOCAL: npm run check + npm test + npm run smoke + Inspector (mock) e nenhum token real.
- GO_HOMOLOG: comparação de contrato real com fixtures, sem criar proposta nem reserva.
- GO_CHATGPT: OAuth/autorização individual e transporte remoto seguro testados; ou Secure MCP Tunnel com controles de acesso.
- GO_SEND: somente após aprovação explícita, journal, auditoria, escopo write isolado e testes de idempotência. Não habilitar agora.

## Observação de segurança
Mesmo a prévia (POST /proposals/preview) pode sondar a saúde do worker. Ela não é anotada como estritamente read-only no MCP. Não executar preview real em smoke automático.
