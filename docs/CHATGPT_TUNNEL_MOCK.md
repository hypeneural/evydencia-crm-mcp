# ChatGPT por Secure MCP Tunnel — primeira conexão em MOCK

Documentação oficial: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
Cliente oficial: https://github.com/openai/tunnel-client
Plugins ChatGPT: https://developers.openai.com/plugins/deploy/connect-chatgpt

1. Rodar .\scripts\bootstrap-mock.ps1 e .\scripts\validate.ps1 com sucesso (sem token CRM).
2. Confirmar tunnel_id e permissões do workspace/organização OpenAI por conta própria; não inventar IDs.
3. Baixar tunnel-client somente do painel Platform ou de release oficial. Validar binary com tunnel-client help quickstart.
4. Para stdio, a documentação indica: tunnel-client init --sample sample_mcp_stdio_local --profile local-stdio --tunnel-id ID_REAL --mcp-command "node --env-file=.env scripts/start-mock.mjs". Ajustar working directory absoluto; não registrar token em arquivo do Git.
5. Executar tunnel-client doctor --profile local-stdio --explain e tunnel-client run --profile local-stdio. Conferir health/ready.
6. No ChatGPT: Plugins > Add custom MCP server > Tunnel > selecionar tunnel_id > criar Plugin. UI depende da versão e das permissões disponíveis.
7. Testar primeiro crm_capacidades, depois crm_natal_resumo, crm_agenda_hoje e proposta simulada.
8. Se todas as ferramentas retornarem mock:true/source:fixture e nenhum envio, classificar GO_CHATGPT_MOCK.
9. Voz exige teste adicional da experiência do usuário; não assumir suporte sem validação.

NUNCA abrir porta pública improvisada, habilitar EVYD_PRIVATE_TOOLS=1 no MOCK, colar API key em commit, usar /proposals/schedule ou consultar dados reais durante essa etapa.
