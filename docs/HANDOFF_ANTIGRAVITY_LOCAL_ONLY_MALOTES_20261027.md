# Antigravity — escopo local EXCLUSIVO MCP + PrintServer (27/10/2026)

**Governança decidida pelo operador:** Antigravity pode trabalhar somente nos repositórios `hypeneural/evydencia-crm-mcp` (PR #12) e `hypeneural/printserver` (PR #1). CRM é **apenas referência de leitura**. O Codex em OUTRO COMPUTADOR é o único responsável por quaisquer ajustes no CRM (PR #432), claims/CI HIGH e **todos os merges/releases/deploys de produção, inclusive MCP e PrintServer**.

## Descoberta no log recebido (27/10)
- O primeiro `npm run malotes:preflight:read` falhou com *Missing script* porque a estação estava na branch `release/live-35tools-gameplay-printserver`, não na PR #12. O log mostrava a branch local 107 commits à frente do upstream cadastrado. **Nunca usar `git checkout -B` / reset para corrigir isso**. É comando destrutivo para a referência local; preservar histórico e usar worktree dedicado.
- Depois de mudar para `feat/printserver-bridge-20261026` no clone, o script passou e relatou: CRM claim/branch/HIGH bloqueados, MCP/PrintServer source metadata OK. Essa é a interpretação correta e NÃO autoriza o Antigravity a alterar o CRM.
- PrintServer local HEAD `58e01da` e PR #1 tinham CI SUCCESS; MCP PR #12 HEAD `a0876b6` tinha 2/2 SUCCESS naquela verificação. **Novos commits exigem revalidar só o SHA novo**.
- Independentemente do saldo comercial do CRM, é possível fazer **só imprimir** pedido já em status10 e quitado. Não usar status12 (entregue) ao receber fotos.

## Correção técnica agora entregue
A flag nova do MCP `EVYD_MALOTES_PRINT_BATCH_ENABLED` é OFF por padrão. Em `1`, quando também habilitado PrintServer + render CRM natalino, expõe `crm_processar_malotes_retirada` **APENAS com `modo=so_imprime`** sem exigir `crm.orders.write` nem habilitar `crm_marcar_disponivel_retirada`. Cada pedido mantém `expected_status_event_id`, saldo zero, status10 e confirmação expressa. Não inicia o cliente Sanctum de escrita. O gateway tem teste de lista/schema OAuth e a saga tem testes garantindo `markReady` NUNCA chamado.

Quando a PR CRM for homologada, o Codex poderá ativar separadamente a flag `EVYD_MALOTES_BATCH_ENABLED` + `EVYD_MALOTES_READY_WRITE_ENABLED`; combinado `baixa_e_imprime` exige ambas as permissões. Estado em produção deve ser verificado em `crm_capacidades` — NÃO inferir do estado da PR.

## Execução local máxima (sem mudanças remotas ou físicas)
1. Inspecionar `git status --porcelain` e `git branch --show-current` de ambos clones. Se worktree ocupado, usar checkout em **novo worktree** depois de confirmar ausência de colisões, sem `-B`, `reset --hard`, `force`, deleção de branch ou scripts de deploy.
2. No MCP: `npm run malotes:preflight:print`. Alternativa: `node scripts/verify-malotes-release-readonly.mjs --print-only --mcp <DIRETORIO> --print <DIRETORIO>`. **Não exige nem inspeciona CRM.**
3. MCP: `npm run check` e `node --test test/malotes-batch.test.mjs test/live-gateway.test.mjs test/malotes-ready-client.test.mjs`.
4. PrintServer: `npm run check` e `node --test test/crm-label-pdf.test.mjs`.
5. No Windows: `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\Test-LabelPrinter.ps1` do clone PrintServer (somente leitura). `Get-Service Spooler`, `Get-Printer -Name LABEL` e `Get-PrintJob -PrinterName LABEL` são verificações locais. **Não imprimir fixture, não alterar driver/USB ou fila** nesta rodada.
6. Verificar CI somente uma vez por SHA efetivo. Se falhar, corrigir exclusivamente problema reproduzido nos dois repositórios permitidos, publicar commit de branch/PR (não merge) e entregar ao Codex URL/SHA/testes.
7. Relatório final curto: `MCP PR#12 SHA PASS/FAIL`, `PrintServer PR#1 SHA PASS/FAIL`, `Windows LABEL`, `preflight print-only`, riscos + handoff. Não gerar prompt para mexer no CRM.

**Proibido ao Antigravity:** qualquer modificação em `hypeneural/evydencia-crm` (inclusive Issue #431, PR #432, claims, branches, banco, migrations, PHPUnit, SSH Laravel); qualquer `systemctl restart`, merge, deploy/rollback, edição de `.env` de produção, publicação do CRM, WhatsApp, baixa comercial ou impressão física sem autorização operacional contemporânea.

## Base oficial
- Windows PowerShell PrintManagement: https://learn.microsoft.com/en-us/powershell/module/printmanagement/get-printer , https://learn.microsoft.com/en-us/powershell/module/printmanagement/get-printjob
- MCP auth: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- GitHub: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/renaming-a-branch
