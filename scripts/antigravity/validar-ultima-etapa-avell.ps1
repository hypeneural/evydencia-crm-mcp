#requires -Version 5.1
# Última etapa local: somente clones isolados, fast-forward e testes afetados.
# Não interage com impressora, serviços, secrets, CRM LIVE ou SQLite de produção.
$ErrorActionPreference = 'Stop'
if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA_AUSENTE' }
$workspace = Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
$mcp = Join-Path $workspace 'crm-mcp-dev'
$gameplay = Join-Path $workspace 'gameplay-code'

function Assert-CleanRepository([string]$path, [string]$expectedBranch) {
    if (-not (Test-Path (Join-Path $path '.git'))) { throw "CLONE_AUSENTE: $path" }
    $dirty = @(git -C $path status --porcelain)
    if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw "WORKTREE_NAO_LIMPA: $path" }
    $branch = (git -C $path branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne $expectedBranch) { throw "BRANCH_INCORRETA: $path" }
}
Assert-CleanRepository $mcp 'feat/gameplay-read-client-20261026'
Assert-CleanRepository $gameplay 'feat/gameplay-status-read-api-20261026'

$prepare = Join-Path $mcp 'scripts\antigravity\prepare-avell.mjs'
if (-not (Test-Path $prepare)) { throw 'PREPARE_AUSENTE' }
node $prepare --workspace $workspace --refresh
if ($LASTEXITCODE -ne 0) { throw 'REFRESH_FALHOU' }

Push-Location $mcp
try {
    # Esses são os únicos testes locais necessários após a correção de status.
    node --test test/gameplay-order-status.test.mjs test/live-gateway.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'TESTES_DIRECIONADOS_FALHARAM' }
}
finally { Pop-Location }

$shaMcp = (git -C $mcp rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'SHA_MCP_INDISPONIVEL' }
$shaGameplay = (git -C $gameplay rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'SHA_GAMEPLAY_INDISPONIVEL' }
Write-Host "MCP_SHA=$shaMcp"
Write-Host "GAMEPLAY_SHA=$shaGameplay"

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($null -ne $gh) {
    gh pr view 11 -R hypeneural/evydencia-crm-mcp --json headRefOid,isDraft,baseRefName,url
    gh pr checks 11 -R hypeneural/evydencia-crm-mcp --json name,state,bucket,link
    if ($LASTEXITCODE -ne 0) { throw 'CI_MCP_NAO_APROVADA' }
    gh pr view 43 -R hypeneural/gameplay --json headRefOid,isDraft,baseRefName,url
    gh pr checks 43 -R hypeneural/gameplay --json name,state,bucket,link
    if ($LASTEXITCODE -ne 0) { throw 'CI_GAMEPLAY_NAO_APROVADA' }
}
else {
    Write-Host 'GH_INDISPONIVEL: conferir PRs no navegador sem instalar ferramentas'
}
Write-Host 'GO_CODIGO_LOCAL: finalizado. GAMEPLAY_DB_REAL e CRM_GAMEPLAY_JOIN_REAL ainda requerem VPS privada autorizada.'
