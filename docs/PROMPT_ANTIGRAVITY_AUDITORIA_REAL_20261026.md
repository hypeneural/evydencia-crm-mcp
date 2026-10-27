# PROMPT CANÔNICO PARA ANTIGRAVITY FLASH — REAL CRM ↔ GAMEPLAY (26/10/2026)

**Contexto confirmado e não refazer:** Avell Windows 11 com MCP/impressora operacionais. Workspace isolado já tem `crm-mcp-dev` na PR #11 e `gameplay-code` na PR #43. Relatório `docs/AUDITORIA_HOMOLOGACAO_AVELL_FINAL_20261026.md` já foi publicado pelo Antigravity. Não instalar Node ou Gameplay globalmente, não reiniciar impressora, não criar branches ou PRs extras.

**Missão:** executar a auditoria real de pedidos Natal 2026 e avançar nas provas de Gameplay REAL **apenas com infraestrutura e autorização de leitura já existentes**, mantendo os resultados por fase. **NÃO** tratar os 22 pedidos confirmados no CRM como 22 galerias faltantes; essa conclusão só é possível depois da consulta privada Gameplay.

## 0 — Fonte de verdade
- CRM Laravel: pedido, número, UUID, pacote, criação 2026 e status atual. Os únicos elegíveis são status 10 `waiting_product_retrieve` e 12 `order_completed`; status 11 excluído.
- Gameplay: `photo_sessions.crm_order_uuid` e `photo_revisions`/ `revision_blobs`; informações de publicação e contagem de fotos. Três variantes (thumb/card/game) NÃO são três fotografias.
- Estado `published_unverified` não é prova de jogo Phaser no Android/iOS.
- Resposta de servidor `not_found` significa que não há sessão naquela base, NÃO significa ausência de fotos no Drive.
- Nunca imprimir UUID, nome, telefone, tokens, URLs privadas, `gateway.env`, caminhos absolutos do banco ou nomes de mídias em logs/PR.

## 1 — Avell: atualizar cópias, executar SOMENTE testes novos

PowerShell 5.1 em usuário não administrador:
```powershell
$ErrorActionPreference = 'Stop'
$w = Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
$m = Join-Path $w 'crm-mcp-dev'
$g = Join-Path $w 'gameplay-code'
foreach ($p in @($m,$g)) {
  if (-not (Test-Path (Join-Path $p '.git'))) { throw "REPOSITORIO_AUSENTE: $p" }
  $dirty=git -C $p status --porcelain
  if ($LASTEXITCODE -ne 0 -or $dirty) { throw "WORKTREE_NAO_LIMPA: $p" }
}
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --refresh
if ($LASTEXITCODE -ne 0) { throw 'PREFLIGHT_FAILED' }
Push-Location $m
try {
  node --test test/gameplay-real-audit.test.mjs
  if ($LASTEXITCODE -ne 0) { throw 'TESTES_AFETADOS_FALHARAM' }
} finally { Pop-Location }
git -C $m rev-parse HEAD
git -C $g rev-parse HEAD
```
Não repetir `npm ci`, `npm test` ou `pnpm check` no Avell; estes pertencem ao CI dos PRs.

## 2 — CRM: consulta REAL, sem mocks

Se Antigravity tiver o conector autenticado `Evydencia CRM LIVE`, chamar `crm_capacidades` e **duas consultas** `crm_pedidos_buscar`:
- ambas: `product_slug=natal`, `created_start=2026-01-01`, `created_end=2026-12-31`, `nivel_detalhe=resumo`, `pagina=1`, `limite=25`;
- primeira: `order_status=waiting_product_retrieve`;
- segunda: `order_status=order_completed`.

Checar `source`, `pagination.page`, `returned_count`, `total_matching_orders`, `has_more`, `status_id/status_key`, UUID presente e UUIDs não repetidos. Se `has_more=true`, paginar até terminar, sem pular ou reutilizar total antigo. Rejeitar páginas truncadas.

**Evidência já vista por ChatGPT nesta data:** 11 + 11 = 22 pedidos; origem `CRM_FORENSIC_READ_ONLY_BRIDGE`. É snapshot, não número fixo. Não enviar nomes/telefones/UUIDs ao relatório.

Se não houver conector, usar alternativa no **host MCP autorizado já provisionado**, com o operador habilitado e variáveis definidas pelo responsável, sem criar ou exportar credenciais:
```bash
node scripts/antigravity/audit-real-crm-gameplay.mjs --crm-only
```
Se faltar permissão/ambiente, classificar `CRM_REAL=not_verified_on_host` sem tentativas de contornar.

## 3 — Gameplay: consultar o DB REAL sem publicar

No **host privado Gameplay** com Node 24, base REAL existente, usuário read-only e variáveis `CATALOG_REAL_DB_AUDIT_AUTHORIZED`, `CATALOG_DATABASE_PATH`, `CATALOG_REAL_DB_ALLOWED_DIR` já aprovisionadas, e com o código desta PR #43 já disponível em área autorizada:
```bash
node scripts/forensic/audit-real-catalog-readonly.mjs
```

O script abre SQLite usando `DatabaseSync(readOnly:true)` e `PRAGMA query_only=ON`; apenas SELECT. Resultado somente **agregado**, com `sessions_total`, `ready_active_album_photos`, `staged_manifest_photos`. Isso verifica metadados desta base, mas **não** estabelece correspondência com os 22 pedidos CRM nem prova o browser. Não copiar o banco ao Avell, nem clonar/copiá-lo em produção por iniciativa própria. Se não houver tal host/instância, registrar `GAMEPLAY_DB_REAL=not_verified`.

## 4 — Cruzar CRM ↔ Gameplay por pedidos REAIS

**Somente** quando houver uma instância privada realmente implantada, Caddy negar `/internal/*` pela internet, bearer de leitura distinto do Publisher/Server, a origem correta e **autorização explícita para consultar UUIDs reais nessa API**, executar no host privado MCP preprovisionado:
```bash
node scripts/antigravity/audit-real-crm-gameplay.mjs --cross-check
```

Esse comando:
- relê o CRM em duas populações atuais, só em `resumo`, paginação canônica;
- consulta Gameplay em lotes de até 50 UUIDs por `lookup-batch`, **sem** pedir URLs;
- verifica sessão/status/contagens e exige `preparation` compatível;
- relê CRM com cache PHP ignorado e falha se o status ou a população tiver mudado;
- imprime somente totais, estados, fotos publicadas, fotos em preparação, cobertura e timestamp.

**Se qualquer pré-condição falhar, NÃO executar este cruzamento**. A flag `EVYD_REAL_AUDIT_AUTHORIZED=1` não é substituto de permissão de rede, de operador ou de autorização de dados pessoais.

## 5 — CI e conclusão
```powershell
gh pr view 11 -R hypeneural/evydencia-crm-mcp --json headRefOid,isDraft,baseRefName,url
gh pr checks 11 -R hypeneural/evydencia-crm-mcp --json name,state,bucket,link
gh pr view 43 -R hypeneural/gameplay --json headRefOid,isDraft,baseRefName,url
gh pr checks 43 -R hypeneural/gameplay --json name,state,bucket,link
```
Exigir SUCESSO nos checks do SHA atual. Não executar testes em loop para fazer o status "ficar verde".

O relatório deve ter 5 linhas:
1. `CRM_REAL`: `verified` ou `unavailable` (contagens e fonte, sem PII);
2. `GAMEPLAY_DB_REAL`: `verified_readonly` ou `not_verified` (agregados);
3. `CRM_GAMEPLAY_JOIN_REAL`: `verified` ou `not_verified` (totais das fotos, não UUIDs);
4. `BROWSER_RUNTIME`: `not_verified` até teste físico permitido;
5. `RELEASE`: `GO_READONLY_FORENSIC` para leituras aprovadas / `NO_GO_CUSTOMER_PUBLICATION` até readiness, mídia, Caddy, SQLite WAL e piloto em navegadores reais.

**FIM.** Não criar outra arquitetura; não alterar Laravel, CRM, Z-API, Printserver, EvydFlow, serviços Windows, VPS, dados de clientes, segredos nem `readiness.json`.
