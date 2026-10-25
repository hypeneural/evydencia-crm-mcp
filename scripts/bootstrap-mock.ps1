param()
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'BLOCKED: Node.js >= 22 necessário.' }
if (Test-Path '.env') {
    node scripts/check-mock-env.mjs --require
    if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: .env existente NAO e seguro para MOCK. Revise manualmente, sem revelar segredos.' }
    Write-Host 'MOCK_ENV_OK: arquivo local já existente e validado. Nenhuma alteração.'
    exit 0
}
$lines = @(
    'NODE_ENV=development',
    'EVYD_MOCK_MODE=1',
    'EVYD_PRIVATE_TOOLS=0',
    'CRM_BASE_URL=https://crm.example.com',
    'CRM_READ_TOKEN=',
    'CRM_REQUEST_TIMEOUT_MS=7000'
)
[System.IO.File]::WriteAllLines((Join-Path $root '.env'), $lines, [System.Text.UTF8Encoding]::new($false))
node scripts/check-mock-env.mjs --require
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: erro ao gerar .env MOCK.' }
Write-Host 'MOCK_ENV_CREATED: dados sinteticos, sem acesso ao CRM. Nunca versionar .env.'
