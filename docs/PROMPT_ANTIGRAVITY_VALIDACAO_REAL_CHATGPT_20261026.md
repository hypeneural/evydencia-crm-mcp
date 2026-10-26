# Antigravity (Gemini 3.8 Flash) — Última validação LOCAL + preparação REAL no ChatGPT

**Escopo obrigatório:** não instalar ferramentas globais, não recriar branches/clones, não reiniciar MCP, impressora, Printserver, Laravel, Z-API ou EvydFlow. Não fazer deploy por conta própria. Usar worktrees existentes. O usuário deseja chegar ao teste real aqui no ChatGPT, mas o conector LIVE ainda NÃO possui Gameplay (33 ferramentas, build `f6f93b5`).

**PRs:** MCP `hypeneural/evydencia-crm-mcp#11` / `feat/gameplay-read-client-20261026`; Gameplay `hypeneural/gameplay#43` / `feat/gameplay-status-read-api-20261026` (base PR #30, draft). O CRM Laravel é SOMENTE leitura.

## A. AVELL — um bloco PowerShell, sem instalações

```powershell
$ErrorActionPreference = 'Stop'
$w = Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
$m = Join-Path $w 'crm-mcp-dev'
$g = Join-Path $w 'gameplay-code'
foreach ($p in @($m,$g)) {
  if (-not (Test-Path (Join-Path $p '.git'))) { throw "WORKTREE_AUSENTE: $p" }
  $dirty = git -C $p status --porcelain
  if ($LASTEXITCODE -ne 0 -or $dirty) { throw "WORKTREE_NAO_LIMPA: $p" }
}
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --refresh
if ($LASTEXITCODE -ne 0) { throw 'REFRESH_FALHOU' }
Push-Location $m
try {
 node --test test/gameplay-real-audit.test.mjs test/gameplay-order-status.test.mjs test/smoke-gameplay-readonly.test.mjs
 if ($LASTEXITCODE -ne 0) { throw 'TESTE_AFETADO_FALHOU' }
} finally { Pop-Location }
git -C $m rev-parse HEAD
git -C $g rev-parse HEAD
```

**Não rodar** `npm ci`, `npm test` completo nem `pnpm install`. Não iniciar API local com fotos reais. A CI GitHub executa os testes completos do Gameplay.

## B. CONFERIR CI DOS DOIS SHAs ATUAIS

```powershell
gh pr view 11 -R hypeneural/evydencia-crm-mcp --json headRefOid,isDraft,baseRefName,url
gh pr checks 11 -R hypeneural/evydencia-crm-mcp --json name,state,bucket,link
gh pr view 43 -R hypeneural/gameplay --json headRefOid,isDraft,baseRefName,url
gh pr checks 43 -R hypeneural/gameplay --json name,state,bucket,link
```
Qualquer failure/pending no SHA atual = NO-GO para merge; não alegar sucesso por jobs de SHA antigo. Não repetir suite em loop.

## C. LER 1 DOCUMENTO CANÔNICO
`$m/docs/CHATGPT_GAMEPLAY_EVIDENCIA_REAL_20261026.md`.

Ali estão a população CRM real consultada pelo ChatGPT (22 pedidos com status atual 10/12), estrutura dos endpoints, campos de fotos, privacidade, origens e todos os gates do ambiente real. Não copiar nomes/UUIDs para o relatório.

## D. PRÓXIMO TESTE REAL — EXECUTAR SOMENTE QUANDO JÁ EXISTIR ACESSO APROVADO

**1. Gameplay SQLite:** em host Linux autorizado **com PR já disponível e DB real já acessível**, usuário restrito read-only, Node24 e variáveis `CATALOG_REAL_DB_AUDIT_AUTHORIZED`, `CATALOG_DATABASE_PATH`, `CATALOG_REAL_DB_ALLOWED_DIR` previamente provisionadas, executar:
```bash
node scripts/forensic/audit-real-catalog-readonly.mjs
```
Validar `consistent_sqlite_read_transaction=true`, `sessions_total`, `ready_active_album_photos`, `staged_manifest_photos`. Não copiar DB para Avell. O código não retorna UUIDs nem links.

**2. CRM em host MCP autorizado:** com credenciais legítimas e preexistentes, operador autorizado, sem capturar ou imprimir secrets, executar:
```bash
node scripts/antigravity/audit-real-crm-gameplay.mjs --crm-only
```

**3. Gameplay privado:** somente quando a API for demonstradamente privada (bloqueio `/internal/*` no Caddy público), bearer read-only isolado e autorização explícita para UUIDs reais, e quando for confirmado que a base consultada é a implantação correta, executar no host MCP autorizado:
```bash
node scripts/antigravity/audit-real-crm-gameplay.mjs --cross-check
```

Nenhum desses comandos deve ser executado no Avell com credenciais de produção. Sem permissão/infraestrutura, reportar `not_verified` em vez de habilitar Caddy, publicar mídia, mudar readiness ou montar tokens manualmente.

## E. COMO FAZER O TESTE AQUI NO CHATGPT DEPOIS DO ROLLOUT AUTORIZADO
1. Verificar que o MCP LIVE implantado de fato contém a PR aprovada e o catálogo Gameplay privado na rede correta.
2. `crm_capacidades` deve anunciar `crm_gameplay_auditoria` e `crm_gameplay_links` para o operador OAuth com permissão `crm.read` + full CRM. Se só houver as 33 ferramentas antigas, **o sistema ainda não está pronto**.
3. Nesta conversa, pedir `crm_gameplay_auditoria` (`pagina=1,limite=20,incluir_publicados=true`) e conferir saída sem URLs em lote. Contar estados `not_found`, `not_published`, `partial`, `published_unverified`, `revoked` e fotos `published_photo_count`/`preparing_photo_count`.
4. Somente então testar `crm_gameplay_links` por pedido individual EXPRESSAMENTE autorizado. Nunca usar nome ambíguo para enviar links.
5. Sem prova de navegador Android/iOS, manter `browser_runtime_verified=false`.

## F. RELATÓRIO DE SAÍDA OBRIGATÓRIO (5 LINHAS)
- `AVELL_SHA_CI`: MCP SHA/checks, Gameplay SHA/checks, testes locais executados.
- `CRM_REAL`: fonte, status 10 e 12, total e paginação (somente números).
- `GAMEPLAY_DB_REAL`: `verified_readonly` + agregados OU `not_verified`.
- `CRM_GAMEPLAY_PRIVATE_JOIN`: `verified` + contagens OU `not_verified`.
- `CHATGPT_AND_RELEASE`: ferramentas realmente expostas? dados reais permitidos? `GO_READ_ONLY` ou `NO_GO`. Cliente/piloto segue NO-GO enquanto flags e gates de segurança não aprovados.

**FIM.** Não pedir para reconstruir arquitetura, refazer Etapa 1, fazer deploy automático ou criar nova branch. Entregar relatório e blockers concretos; nunca “real” para testes sintéticos.
