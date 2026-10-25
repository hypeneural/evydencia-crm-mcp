# Auditoria forense e status de implantação — 24/10/2026

Estado confirmado na main: SDK MCP v2.4.0, cliente HTTP com rotas limitadas, mocks Natal/agenda/cliente, instruções MCP e títulos claros, scripts PowerShell, hooks/rules/skills Antigravity, lockfile e CI.

## P0 corrigido
1. O .env anterior era preservado sem exame: agora bootstrap-mock.ps1 verifica e bloqueia configurações live, tokens e private tools.
2. O processo podia iniciar sem esse exame: agora npm start usa start-mock.mjs, que valida o arquivo e variáveis herdadas antes de abrir stdio.
3. Faltava teste do caminho real de inicialização: startup:smoke invoca MCP sobre stdio e testa rejeição de segredo-canário.
4. O modelo menor precisava de passos fixos: AGENTS.md curto, ONE_COMMAND.md e go.ps1.
5. Tool metadata: titles e server instructions para deixar explícito SIMULAÇÃO e SEM ENVIO.
6. CI: npm ci, testes, dois smokes anteriores, startup smoke e parser sintático PowerShell.

## P1 bloqueado por dependência externa
- Primeira conexão real do ChatGPT requer tunnel_id, permissões e tunnel-client oficial; não presumir já conectado.
- Consulta de vendas de Natal, agenda privada e busca por nome permanece MOCK_ONLY até API read-only autorizada no CRM.
- OAuth individual ainda não existe: não expor dados privados remotamente usando somente token Sanctum de serviço.
- Envio real permanece ausente até journal, confirmação vinculada ao operador e idempotência.
- Repositório é público. Não incluir dados reais, credenciais ou screenshots de produção.

## Repositórios-base inspecionados
- modelcontextprotocol/typescript-sdk v2.4.0: adotado como runtime, sem migração.
- modelcontextprotocol/inspector: diagnóstico opcional.
- openai/tunnel-client: primeiro transporte local privado recomendado.
- openai/mcp-extensions: UI futura, após existir conexão plugin.
- mcp-use/mcp-use: padrões DX, sem copiar monorepo.
- cloudflare/agents + cloudflare/workers-oauth-provider: futura hospedagem/OAuth, não necessário em MOCK.

## Critérios de aprovação
GO_CI_MOCK exige Actions verde; GO_LOCAL_MOCK exige go.ps1 executado no Windows; GO_CHATGPT_MOCK exige chamada real de tool no ChatGPT por Tunnel. Produção e envio real permanecem bloqueados.

Fontes oficiais: https://developers.openai.com/plugins/build/mcp-server ; https://developers.openai.com/plugins/build/auth ; https://developers.openai.com/plugins/build/plugins ; https://developers.openai.com/api/docs/guides/secure-mcp-tunnels ; https://antigravity.google/docs/rules/ ; https://antigravity.google/docs/hooks ; https://ts.sdk.modelcontextprotocol.io/v2/
