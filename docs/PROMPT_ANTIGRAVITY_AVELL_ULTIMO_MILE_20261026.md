# Antigravity — execução final isolada Avell, antes do teste real CRM × Gameplay

**Data:** 26/10/2026. **Ambiente:** Avell, Windows 11, PowerShell 5.1.
**Repositórios existentes:** `hypeneural/evydencia-crm-mcp` PR #11 (`feat/gameplay-read-client-20261026`) e `hypeneural/gameplay` PR #43 (`feat/gameplay-status-read-api-20261026`).

## Objetivo exato
Atualizar SOMENTE clones isolados, confirmar a correção recém-aplicada contra drift de status do CRM, executar os dois testes cirúrgicos MCP e verificar o HEAD da CI dos dois PRs. **Não** tocar no Evidência CRM MCP operacional, impressora/Printserver/spooler, EvydFlow, Laravel, Z-API, Node global, bancos, secrets ou serviços Windows.

## Código já ajustado
- `src/gameplay-order-status.mjs`: recusa contradição entre `status_id` numérico e `status_key` textual para status 10 e 12. `registerDistinctGameplayOrderStatus` falha se o mesmo UUID for visto duas vezes em etapas diferentes.
- `src/live-gateway.mjs`: auditoria Gameplay não oculta uma mudança de status entre a varredura `waiting_product_retrieve` e `order_completed`.
- `test/gameplay-order-status.test.mjs`: testes de inconsistência e UUID repetido.
- `scripts/antigravity/validar-ultima-etapa-avell.ps1`: único script de validação direcionada (com opção `-SkipRefresh`).

## A — uma única execução local, nenhuma instalação

```powershell
$ErrorActionPreference='Stop'
$w=Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
$m=Join-Path $w 'crm-mcp-dev'
$g=Join-Path $w 'gameplay-code'
foreach($p in @($m,$g)){
 if(-not (Test-Path (Join-Path $p '.git'))){throw "CLONE_AUSENTE: $p"}
 $dirty=@(git -C $p status --porcelain)
 if($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0){throw "CLONE_MODIFICADO: $p"}
}
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --refresh
if($LASTEXITCODE -ne 0){throw 'REFRESH_FALHOU'}
& (Join-Path $m 'scripts\antigravity\validar-ultima-etapa-avell.ps1') -SkipRefresh
if(-not $?) {throw 'VALIDACAO_AVELL_FALHOU'}
```

O script de validação já compara as branches, executa `node --test test/gameplay-order-status.test.mjs test/live-gateway.test.mjs` e verifica `gh pr view/checks` das PRs #11/#43, reportando SHAs. **Não** repetir `npm ci`, `npm test` completo nem `pnpm check` no Avell. GitHub CI é a fonte da validação integral.

## B — relatar sem inventar dados

Entregar um relatório em até 10 linhas com:
- `MCP_SHA`, `GAMEPLAY_SHA`, worktrees limpas;
- TAP dos dois testes afetados;
- `test/validate` MCP e `Quality Gates & Build/Gallery mobile E2E` Gameplay no HEAD atual;
- `CRM_REAL`: última evidência canônica (22 pedidos em 26/10, 11 status 10 + 11 status 12), **não** simular nova consulta nem reutilizar número como valor atual se não reconsultar;
- `GAMEPLAY_DB_REAL`, `CRM_GAMEPLAY_PRIVATE_JOIN`, `CHATGPT_GAMEPLAY_TOOLS`: verificar fonte real, ou `not_verified`, nunca presumir;
- `PRINTER_BASELINE=not_measured` se não houve medição.

## C — primeiro teste real necessário (NÃO É etapa do Avell)

O próximo trabalho é na infraestrutura Gameplay, não outra suíte sintética local. Somente no host privado aprovado, com Node24, usuário read-only e caminho real do DB previamente atestados:
```bash
node scripts/forensic/audit-real-catalog-readonly.mjs
```
A prova mínima é `consistent_sqlite_read_transaction=true`, `sessions_total`, `ready_active_album_photos`, `staged_manifest_photos`, confirmação administrativa do banco da instância e nenhum dado pessoal no relatório.

Somente depois da prova de isolamento do Caddy público, bearer read-only independente e permissão real sobre os UUIDs, executar **no host MCP autorizado com credenciais já provisionadas**:
```bash
node scripts/antigravity/audit-real-crm-gameplay.mjs --crm-only
node scripts/antigravity/audit-real-crm-gameplay.mjs --cross-check
```
Se as condições não estiverem atendidas, **não executar** essas etapas nem configurar secrets no Avell. Manter `NO_GO_CUSTOMER_PUBLICATION`.

## D — próximo gate do ChatGPT

Após rollout expressamente aprovado do gateway MCP e do catálogo privado:
- `crm_capacidades` deve anunciar `crm_gameplay_auditoria` e `crm_gameplay_links` (no LIVE atual 0.12.0 ainda não aparecem);
- executar primeiro auditoria agregada (sem URLs), depois consulta por `order_id`/UUID específico autorizado;
- uma pesquisa por nome só identifica candidatos e nunca entrega diretamente capability URL;
- `published_unverified` não significa prova da execução Phaser no celular.

**Proibido:** alterar `deploy/readiness.json`, implantar clientes reais, enviar WhatsApp, copiar DB/segredos ao Avell, abrir Caddy `/internal/*` na internet ou iniciar loops de testes. Encerrar após o relatório.
