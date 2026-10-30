param()
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js >=22.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Instale npm.' }
if (-not (Test-Path package-lock.json)) { throw 'BLOCKED: package-lock.json ausente; clone a main atualizada.' }
node scripts/check-mock-env.mjs --require
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: configure .env exclusivamente MOCK antes de instalar.' }
Write-Host "Node $(node --version); npm $(npm --version)"
npm ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm ci falhou.' }
node scripts/doctor.mjs --strict-lock
if ($LASTEXITCODE -ne 0) { throw 'doctor strict lock falhou.' }
npm run validate:local
if ($LASTEXITCODE -ne 0) { throw 'validate:local falhou.' }
Write-Host 'GO_LOCAL_MOCK: gates automatizados aprovados; ainda não é CRM nem ChatGPT homologado.'
