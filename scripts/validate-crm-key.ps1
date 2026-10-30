param()
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
Write-Host '[EVYD] Pré-validação offline e inspeção opcional da chave CRM'
npm run validate:local
if ($LASTEXITCODE -ne 0) { throw 'CRM_VALIDATION_BLOCKED testes offline' }
node scripts/live-api-inspect.mjs
if ($LASTEXITCODE -ne 0) { throw 'CRM_VALIDATION_BLOCKED JSON offline' }
$localEnv = Join-Path $root '.env.live.local'
if (Test-Path $localEnv) {
  Write-Host '[EVYD] Configuração local detectada; executando verificação conforme opt-ins escritos no arquivo (SEM exibir chave)'
  node --env-file=.env.live.local scripts/live-api-inspect.mjs
  if ($LASTEXITCODE -ne 0) { throw 'CRM_VALIDATION_BLOCKED estrutura HTTP/autorização; verifique flags e host, sem publicar segredos' }
} else {
  Write-Host '[EVYD] Nenhuma chave local; apenas contratos offline homologados.'
}
Write-Host 'GO_CRM_READ_DIAGNOSTIC: contratos validados; não há liberação de dados reais no Plugin anônimo nem envio de proposta.'
