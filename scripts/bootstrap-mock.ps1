param()
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
if (Test-Path '.env') {
    Write-Host '.env já existe: preservado. Revise manualmente NODE_ENV/EVYD_MOCK_MODE/CRM_READ_TOKEN.'
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
[System.IO.File]::WriteAllLines((Join-Path (Get-Location) '.env'), $lines, [System.Text.UTF8Encoding]::new($false))
Write-Host '.env local criado em modo MOCK, sem token e sem chamadas CRM. NUNCA versionar.'
