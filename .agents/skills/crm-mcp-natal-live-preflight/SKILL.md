---
name: crm-mcp-natal-live-preflight
description: Homologa offline o adaptador privado de indicadores canônicos do Natal 2026 sem editar Laravel, consultar banco real ou habilitar o Plugin anônimo.
---
# Antigravity Flash — uma operação por etapa

1. Abra o clone MCP e rode `git status --short`. Preserve mudanças locais em go.ps1; não usar reset/clean.
2. Leia `docs/MVP_AGREGADOS_EXECUCAO_20261025.md` (fonte de verdade). Nunca inventar endpoints ou valores.
3. Execute `.\scripts\validate-mvp.ps1` em PowerShell; reporte GO_MVP_OFFLINE somente se PASS.
4. Confira que `src/server.mjs` NÃO importa `src/natal-digest-snapshot.mjs` ou `src/order-readiness.mjs`, e que 17 ferramentas anônimas continuam MOCK.
5. `tools/export-natal-digest.php` chama somente método canônico Laravel, mas **não executá-lo em produção** sem autorização explícita e plano de carga. `php -l` e `--help` são seguros.
6. Snapshots devem ficar fora de Git/CRM/webroot, sem nome, telefone ou dados individuais; no Linux mode 0600. Expiram em cinco minutos.
7. Para clientes reais, exigir autenticação OAuth individual em servidor LIVE separado; nunca ativar EVYD_PRIVATE_TOOLS no stdio anônimo.
8. Informe HEAD, resumo de testes, PHP lint, estado de snapshots (PENDENTE se não exportado), confirmação de que CRM Laravel permanece intocado.

Não instalar framework novo, não copiar SQL do dashboard, não tocar Z-API nem executar envio. Se um gate falhar: uma causa → um patch mínimo → rerun.
