$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js não encontrado." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm não encontrado." }
Write-Host "Node: $(node --version)"
if (Test-Path package-lock.json) {
    npm ci --ignore-scripts --no-audit --no-fund
} else {
    Write-Warning 'package-lock.json ausente. Execute npm install e versione o lockfile.'
    npm install --ignore-scripts --no-audit --no-fund
}
if ($LASTEXITCODE -ne 0) { throw "Falha na instalação" }
npm run check
if ($LASTEXITCODE -ne 0) { throw "Falha na sintaxe" }
npm test
if ($LASTEXITCODE -ne 0) { throw "Falha nos testes" }
npm run smoke
if ($LASTEXITCODE -ne 0) { throw "Falha no transporte MCP" }
Write-Host "Validação local concluída com sucesso."
