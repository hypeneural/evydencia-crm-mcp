---
name: crm-mcp-preflight
description: Verifica ambiente, configuração e compatibilidade do servidor MCP com as rotas existentes do CRM.
---
# Preflight
1. Confirmar que o projeto atual NÃO é o CRM Laravel.
2. Confirmar Node.js >=22 e dependências travadas via package-lock.
3. Verificar .env só local, 0600 onde aplicável, sem publicar credenciais.
4. Executar npm run check, npm test e MCP Inspector em stdio.
5. Confirmar que EVYD_PRIVATE_TOOLS=0 no primeiro teste.
6. NÃO executar POST proposals/schedule para diagnóstico.
Retornar evidências e bloqueios de execução.
