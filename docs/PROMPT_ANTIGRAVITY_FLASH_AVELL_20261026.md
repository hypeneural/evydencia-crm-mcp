# Antigravity (Gemini 3.8 Flash) — uma execucao cirurgica no AVELL

**MAQUINA:** Windows 11 Avell, executando a impressora e uma instalacao FUNCIONAL do CRM MCP. Gameplay NAO esta instalado. Nao mexer no MCP operacional, printserver, EvydFlow, Node global, services.msc, drivers, portas, Z-API, Laravel, servidores VPS ou fotos reais.

**MISSÃO:** executar o preparador seguro ja desenvolvido, baixar DUAS COPIAS ISOLADAS e emitir evidencias. Nao programar nova integracao. Nao inventar outra arquitetura. Nao criar outras branches/PRs.

**PRs de codigo:** https://github.com/hypeneural/evydencia-crm-mcp/pull/11 e https://github.com/hypeneural/gameplay/pull/43. PR #43 baseada na cadeia de publicacao da PR #30.

## Passo 1 — Executar EXATAMENTE este bloco no PowerShell 5.1

```powershell
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node ausente: PARE, nao instale globalmente' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git ausente: PARE, nao instale sem autorizacao' }
node --version
git --version
$w = Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
New-Item -ItemType Directory -Force -Path $w | Out-Null
$m = Join-Path $w 'crm-mcp-dev'
if (-not (Test-Path $m)) {
  git clone --depth 1 --filter=blob:none --single-branch --branch feat/gameplay-read-client-20261026 https://github.com/hypeneural/evydencia-crm-mcp.git $m
  if ($LASTEXITCODE -ne 0) { throw 'STOP: clone MCP falhou' }
}
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --run-mcp-tests
if ($LASTEXITCODE -ne 0) { throw 'STOP: preparar ou validar falhou' }
Get-Content (Join-Path $w 'antigravity-preflight.json')
Get-Content (Join-Path $w 'LEIA_PRIMEIRO.md')
```

O script ja faz: validar Git/branch/remoto e workspace; clonar Gameplay no modo sparse (sem toda biblioteca de imagens); executar preflight offline e `npm ci` + testes + gateway:test SOMENTE na copia MCP isolada. No Windows ele trata `npm.cmd` corretamente. O procedimento nao faz deploy nem altera servicos.

Se houver erro de login, arquivo sujo, branch remota errada ou teste falhando: **PARE**; traga erro exato sem apagar pastas. Nao usar `git reset --hard`, `git clean`, `push --force`, `npm install -g`.

## Passo 2 — Ler SOMENTE os arquivos certos

1. `$m/AGENTS.md`
2. `$m/docs/AUDITORIA_P0_AVELL_GAMEPLAY_MCP_20261026.md`
3. `$m/src/gameplay-read-client.mjs`
4. `$m/src/live-gateway.mjs`
5. `$m/src/oauth-gateway.mjs`
6. `$w/gameplay-code/AGENTS.md`
7. `$w/gameplay-code/apps/catalog-server/AGENTS.md`
8. `$w/gameplay-code/apps/catalog-server/src/publication/GameplayStatusLookup.ts`
9. `$w/gameplay-code/deploy/readiness.json`

Confirmar a regra: Natal 2026, status atual `waiting_product_retrieve` (10) ou `order_completed` (12). Nome ambiguo -> IDs para selecao, SEM multiplos links; lote de auditoria -> status sem capability URL. `published_unverified` NAO significa jogos homologados no browser.

Gameplay usa Node 24/pnpm 11; **nao atualizar Node global do Avell**. Use CI GitHub PR #43 para testes completos de Gameplay, sem baixar assets para o Avell.

## Passo 3 — Concluir sem loops

Revisar o `antigravity-preflight.json` e os workflows de CI das duas PRs. Se o preflight e os testes passarem, NAO repetir e NAO alterar codigo. Se nao passarem, corrigir SOMENTE o erro provado no clone de desenvolvimento/PR correspondente; uma reexecucao do teste afetado basta.

Retornar em formato curto: (a) pastas e SHAs das 2 copias; (b) testes PASS/FAIL e links CI; (c) qualquer erro real; (d) decisão final.

**Decisão obrigatoria: GO para preparo/testes isolados; NO-GO para dados reais/deploy enquanto Gameplay readiness tiver `pilotReady=false`, `customerDataAllowed=false`, `automaticDeliveryAllowed=false` ou Caddy/media grant/SQLite backup nao estiverem comprovados.**

**FIM.** Nao executar envio WhatsApp, deploy, nem ligar `EVYD_GAMEPLAY_READ_ENABLED=1` no gateway operacional.
