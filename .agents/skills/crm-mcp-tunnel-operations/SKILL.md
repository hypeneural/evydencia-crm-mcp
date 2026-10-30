---
name: crm-mcp-tunnel-operations
description: Verifica e mantém o Secure MCP Tunnel já conectado ao ChatGPT em MOCK com inventário de 17 ferramentas, sem recriar IDs, reiniciar serviços saudáveis ou acessar dados reais.
---
# Procedimento de continuidade (Gemini Flash)

1. Localizar o clone existente, confirmar `git status --short` e `git rev-parse HEAD`. Se `scripts/go.ps1` aparecer modificado, ler o diff; preservar.
2. Consultar `docs/AUDITORIA_FORENSE_TUNNEL_CHATGPT_20261024.md`; o Tunnel **já foi homologado** em conversa real. Não criar outro automaticamente.
3. Executar `node scripts/tunnel-ready.mjs`. Isso lê apenas endpoints de saúde de loopback e testa inventário de 17 ferramentas; não usa chaves.
4. Se aparecer TUNNEL_MOCK_PASS, **NÃO iniciar outra instância do daemon**. Confirmar uma chamada de `crm_capacidades` no Plugin do ChatGPT.
5. Se falhar, executar `tunnel-client doctor --profile local-stdio --explain` e verificar se a instância anterior continua ativa. Reinício requer parar a anterior primeiro; stdio não suporta duas instâncias para o mesmo Tunnel ID.
6. Se houve alteração de descrição/instrução de tool, atualizar/refresh a descoberta do Plugin existente; não criar novo Plugin sem necessidade.
7. Rodar `npm run validate:local` somente uma vez após atualização do código; já há smoke automático.
8. Não exibir tunnel ID, runtime key, screenshots sensíveis, nem copiar variáveis de ambiente para a conversa. Nunca habilitar envio real ou `EVYD_PRIVATE_TOOLS=1`.

Saídas válidas: `GO_LOCAL_MOCK`, `GO_CHATGPT_MOCK` comprovado por chamada real, ou `BLOCKED: <causa>`. A voz é teste separado; não assumir que ferramenta é executável em todos os modos.
