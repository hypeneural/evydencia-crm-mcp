param([switch]$StrictLock)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js >=22.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Instale npm.' }
Write-Host "Node $(node --version); npm $(npm --version)"
if (-not (Test-Path 'package-lock.json')) {
    if ($StrictLock) { throw 'BLOCKED: lockfile ausente. Execute npm install --package-lock-only e versione-o.' }
    Write-Warning 'Lockfile ausente: execute npm install --package-lock-only e versione-o.'
    npm install --ignore-scripts --no-audit --no-fund
} else {
    npm ci --ignore-scripts --no-audit --no-fund
}
if ($LASTEXITCODE -ne 0) { throw 'Instalação npm falhou.' }
npm run validate:local
if ($LASTEXITCODE -ne 0) { throw 'Gate validate:local falhou.' }
if ($StrictLock) {
    node scripts/doctor.mjs --strict-lock
    if ($LASTEXITCODE -ne 0) { throw 'Gate --strict-lock falhou.' }
}
Write-Host 'GO_LOCAL_MOCK: gates automáticos aprovados; NÃO é homologação CRM ou ChatGPT conectado.'
