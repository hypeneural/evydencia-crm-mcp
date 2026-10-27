# Handoff Antigravity — ROTAS ATUAIS (atualizado 27/10/2026)

O guia antigo de validação **exclusivamente local** foi substituído pela separação de duas etapas:

1. **Etapa local, sem rede:** [docs/VALIDACAO_LOCAL_AGENTE_20261027.md](VALIDACAO_LOCAL_AGENTE_20261027.md), com `npm run agent:validate:local`.
2. **Etapa de release autorizada exclusivamente na VPS do MCP:** [docs/OPERACAO_MCP_VPS_ANTIGRAVITY_20261027.md](OPERACAO_MCP_VPS_ANTIGRAVITY_20261027.md).

A autoridade do Antigravity é **MCP + broker PrintServer** e a VPS própria desses serviços. O outro ambiente de negócios não integra o escopo e não deve ser acessado. O release da VPS MCP não autoriza imprimir fisicamente, mudar pedidos, enviar WhatsApp, publicar outros sistemas ou forçar branches locais.

Se existir divergência de commits locais: preservar o histórico, fazer `git fetch origin` e criar **worktrees detached novos** no HEAD aprovado de cada PR, sem reset/rebase/force-push. O runner local aprovado é `scripts/validate-agent-local.mjs`; não reutilizar a cópia duplicada `agent-validate-local.mjs`.

Esta página substitui as instruções operacionais antigas. O Git conserva o histórico original para consulta por mantenedores.
