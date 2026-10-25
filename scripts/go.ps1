param([switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
Write-Host '[EVYD] FASE 1/3 — validar configuracao local MOCK'
& (Join-Path $PSScriptRoot 'bootstrap-mock.ps1')
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: bootstrap ou configuracao MOCK falhou.' }
Write-Host '[EVYD] FASE 2/3 — dependencias e suite automatizada'
if ($SkipInstall) {
    if (-not (Test-Path 'node_modules')) { throw 'BLOCKED: node_modules ausente. Execute sem -SkipInstall.' }
    npm run validate:local
    if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: validate:local falhou.' }
} else {
    & (Join-Path $PSScriptRoot 'validate.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: validate.ps1 falhou.' }
}
Write-Host '[EVYD] FASE 3/3 — pronto para inspecao manual'
Write-Host 'GO_LOCAL_MOCK: runtime, fixtures e MCP stdio validados; CRM real e ChatGPT AINDA NAO conectados.'
Write-Host 'Proximo comando (somente em terminal separado para Inspector/Tunnel): node --env-file=.env scripts/start-mock.mjs'
