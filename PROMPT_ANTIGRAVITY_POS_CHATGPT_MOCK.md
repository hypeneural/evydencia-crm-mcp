# PROMPT READY — Antigravity Flash: ChatGPT Mock já conectado

Contexto comprovado: o Secure MCP Tunnel do Evydência CRM Mock JÁ foi conectado ao ChatGPT e usado para chamadas reais em 24/10/2026. O Plugin tem 17 ferramentas sintéticas e NÃO tem ferramenta de envio real. O relatório forense está em docs/AUDITORIA_FORENSE_TUNNEL_CHATGPT_20261024.md.

**Missão: validar a nova main e manter a conexão existente estável. NÃO recriar Tunnel, Plugin, perfil ou credenciais.**

## Executar nesta ordem
1. Abra C:\Projetos\hypeneural\evydencia-crm-mcp. Execute:
   - git status --short
   - git diff -- scripts/go.ps1
   - git fetch origin
   - git pull --ff-only origin main
   Se o pull disser que sobrescreveria alterações locais, PARE e reporte. Não use reset, clean, restore ou stash automático. O arquivo scripts/go.ps1 foi modificado localmente pelo Antigravity para recomendar start-mock.mjs. Preservar esse diff.

2. Leia SOMENTE AGENTS.md, docs/AUDITORIA_FORENSE_TUNNEL_CHATGPT_20261024.md e esta instrução. Não passe por todas as 30 documentações de novo.

3. Valide a nova main:
   - node --version
   - npm --version
   - npm run validate:local
   - node scripts/tunnel-ready.mjs
   O teste de Tunnel só acessa localhost. Deve indicar TUNNEL_MOCK_PASS e exatamente 17 ferramentas. Se falhar, não inicie imediatamente outro daemon.

4. Se não houver TUNNEL_MOCK_PASS, rode `tunnel-client doctor --profile local-stdio --explain`. Verifique o processo ativo. **Jamais rode duas instâncias do tunnel-client para o mesmo Tunnel ID com stdio**. Pare a anterior antes de um reinício, somente se necessário. Não faça download/install ou regenere profile se o serviço atual está saudável.

5. Confirme no ChatGPT o Plugin EXISTENTE Evydencia CRM Mock: chame crm_capacidades. Deve retornar mock=true/source=fixture e crm_agendar_proposta_natal WRITE_GATED. Depois teste crm_natal_indicadores_mock(modulo=financeiro) e crm_pedidos_filtrar_mock com amostra. Nenhuma resposta pode ser apresentada como receita real.

6. Como houve melhoria em descrições e instruções de ferramentas, atualize a descoberta/metadados do Plugin EXISTENTE se não aparecer a versão nova. Não recrie conexão para 'resolver' caches sem necessidade.

7. Teste a pergunta 'Como está a agenda HOJE?' e confirme que a agenda sintética é datada de 24/10/2026. Qualquer data diferente sem fixture deve ser descrita como DADOS INDISPONÍVEIS, nunca agenda vazia. Verifique 137 vendas fictícias versus catálogo de 10 pedidos de demonstração, sem somá-los.

8. Validação de voz é opcional: execute SOMENTE em modo de voz do ChatGPT que realmente permita tools do Plugin. Não afirme suporte sem chamada registrada e retorno real. **Voz não autoriza disparo**, mesmo se houver ferramenta de escrita no futuro.

9. Ao final, revise o diff local de scripts/go.ps1. Se for apenas a orientação do entrypoint seguro e o usuário já tiver autorizado a publicação, faça commit desse ÚNICO arquivo e push; o hook exigirá confirmação. NÃO publique .env ou dados do Tunnel.

## RESTRIÇÕES
- Não alterar hypeneural/evydencia-crm, Laravel, Z-API, VPS ou produção.
- Não ativar EVYD_PRIVATE_TOOLS nem ligar token Sanctum ao Plugin sem OAuth 2.1 individual.
- Não habilitar schedule/abort, batch, reenvio, ou gravar runtime key, org ID, Tunnel ID e identidade do operador no Git.
- Não fazer benchmark com dados reais nem entrar em loop de testes.

## Relatório final objetivo
SHA Git, status do arquivo go.ps1, Node/npm, tests/passed, smokes, TUNNEL_MOCK_PASS, 17 ferramentas sem envio, teste ChatGPT atualizado, status de voz (não testado/testado), última atividade do daemon sem segredos. Classificar GO_CHATGPT_MOCK ou BLOCKED com causa. **Não confundir GO_CHATGPT_MOCK com produção autenticada ou GO_SEND.**
