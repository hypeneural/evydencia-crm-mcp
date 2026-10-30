param()
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
Write-Host '[EVYD] MVP OFFLINE: testes MCP, contrato de Natal, exportador PHP'
npm run validate:local
if ($LASTEXITCODE -ne 0) { throw 'MVP_BLOCKED npm run validate:local falhou' }
if (-not (Get-Command php -ErrorAction SilentlyContinue)) {
    throw 'MVP_BLOCKED PHP CLI não encontrado; instale a versão 8.3+ no ambiente local antes de homologar o exportador'
}
php -l tools/export-natal-digest.php
if ($LASTEXITCODE -ne 0) { throw 'MVP_BLOCKED sintaxe do exportador PHP' }
php tools/export-natal-digest.php --help
if ($LASTEXITCODE -ne 0) { throw 'MVP_BLOCKED ajuda do exportador PHP' }
Write-Host 'GO_MVP_OFFLINE: contratos e testes aprovados; NENHUMA consulta SQL real, disparo, exportação ou conexão ao Plugin LIVE foi feita.'
