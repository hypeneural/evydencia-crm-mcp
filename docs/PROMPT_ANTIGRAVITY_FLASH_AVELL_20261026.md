# Antigravity — continuação P0 pós-walkthrough no Avell (Gemini 3.8 Flash)

**MISSÃO ÚNICA:** sincronizar as duas cópias já existentes, executar dois testes direcionados novos e fechar relatório. O walkthrough anterior já comprovou localmente 12/12 contratos e 24/24 testes cirúrgicos, conforme o relato do operador. **NÃO repita essas suítes nem instale pacotes.**

**Arquivos e PRs:** MCP `hypeneural/evydencia-crm-mcp` PR #11, branch `feat/gameplay-read-client-20261026`; Gameplay `hypeneural/gameplay` PR #43, branch `feat/gameplay-status-read-api-20261026` (base PR #30). O Gameplay não precisa ser compilado no Avell.

**É PROIBIDO:** mexer no MCP operacional, impressora/printserver, serviços Windows, Laravel, EvydFlow, Z-API, Caddy, VPS, credenciais, fotos de clientes, variáveis globais ou readiness; clonar de novo; instalar Node 24; fazer deploy.

## 1 — Executar um único bloco PowerShell 5.1

```powershell
$ErrorActionPreference = 'Stop'
$w = Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
$m = Join-Path $w 'crm-mcp-dev'
$g = Join-Path $w 'gameplay-code'
foreach ($p in @($m,$g)) {
  if (-not (Test-Path (Join-Path $p '.git'))) { throw "REPOSITORIO_AUSENTE: $p" }
  $dirty = git -C $p status --porcelain
  if ($LASTEXITCODE -ne 0 -or $dirty) { throw "ARVORE_SUJA_OU_INVALIDA: $p" }
}
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --refresh
if ($LASTEXITCODE -ne 0) { throw 'STOP: atualização falhou' }
Push-Location $m
try {
  node --test test/gameplay-canonical-pagination.test.mjs test/vps-readonly-preflight.test.mjs
  if ($LASTEXITCODE -ne 0) { throw 'STOP: testes direcionados falharam' }
} finally { Pop-Location }
git -C $m rev-parse HEAD
git -C $g rev-parse HEAD
Get-Content (Join-Path $w 'antigravity-preflight.json')
```

`--refresh` deve usar `git merge --ff-only`, verificar remoto/branch e preservar dados locais. Se houver falha, PARE. NÃO usar `--run-mcp-tests` nesta etapa, nem refazer `npm ci`, `npm test` ou `gateway:test`.

## 2 — Inspecionar documentação já atualizada

Ler exclusivamente `$m/docs/AUDITORIA_FORENSE_AVELL_ETAPA4_20261026.md`.

Confirmar em `src/legacy-api-read.mjs` que a projeção HTTP paginada agora traduz os 13 IDs do enum Laravel para status_key, incluindo status 4 em consulta por nome e status 11 inelegível para cobrança de publicação. A auditoria só considera os estados atuais 10 e 12, com mês/ano de 2026 e o filtro de produto Natal. A consulta em lote ao Gameplay nunca pode retornar capability URLs.

## 3 — Confirmar CI do HEAD, não do relatório antigo

```powershell
gh pr view 11 -R hypeneural/evydencia-crm-mcp --json headRefOid,isDraft,baseRefName,url
gh pr checks 11 -R hypeneural/evydencia-crm-mcp --json name,state,bucket,link
gh pr view 43 -R hypeneural/gameplay --json headRefOid,isDraft,baseRefName,url
gh pr checks 43 -R hypeneural/gameplay --json name,state,bucket,link
```

Se o gh estiver indisponível, anotar e conferir links do GitHub no navegador autenticado; não instalar aplicativos ou autenticar com token exposto.

## 4 — Próximo gate, estritamente LEITURA (fora do Avell)

O relatório já comprovou `crm_laravel_autoload_present=false` no Avell; isso é esperado. Não repetir essa checagem como se fosse erro.

O próximo objetivo é comprovar **na VPS autorizada**, separadamente, a presença dos pré-requisitos e o estado do serviço MCP sem modificar a operação. Existe script novo `scripts/antigravity/vps-readonly-preflight.mjs` para rodar em ambiente Linux onde a branch já esteja acessível, **somente** com acesso existente e autorização de leitura; não copiar arquivos para produção nem abrir SSH novo por conta própria. Se não for possível executar, deixar `VPS_FILESYSTEM=not_verified`. Mesmo após esse script, `CRM_CANONICAL_SEARCH_VPS`, `GAMEPLAY_PRIVATE_API`, `CADDY_ACL` e `BROWSER_RUNTIME` continuam `not_verified` até provas independentes.

## 5 — Entrega e FIM

Trazer SOMENTE:
- SHAs e estado Git dos clones (não reportar clean sem comando real);
- TAP dos dois arquivos afetados;
- CI GitHub por SHA dos dois PRs, com link e resultados;
- `VPS_FILESYSTEM`: `verified_files_present` ou `not_verified`; sem inventar SSH;
- `CRM_CANONICAL_SEARCH_VPS=not_verified` até smoke autenticado explicitamente aprovado;
- `PRINTER_BASELINE=not_measured` sem aferição;
- Decisão **GO código e testes isolados / NO-GO dados reais e deploy** até Gameplay PR #43 ser reconciliada, Caddy privado, SQLite WAL backup/restauração, grant de mídia e piloto real autorizados.

**Não criar novas PRs, scripts ou fluxos. Não iniciar loops de testes. Encerrar após essas evidências.**
