# EXECUTAR NO ANTIGRAVITY (Gemini 3.8 Flash) — AVELL Windows 11

**Missao curta:** preparar duas copias ISOLADAS para validar o CRM MCP + Gameplay. Gameplay ainda NAO existe neste PC. Este AVELL opera uma impressora e o CRM MCP ja funciona. **PROIBIDO** trocar a branch da instalacao MCP operacional, parar servicos, mexer em printserver, EvydFlow, driver, portas, variaveis de producao, pastas de clientes, Laravel, Z-API ou Caddy. Nenhum deploy nesta rodada.

Nao criar plano extenso, nao iniciar agentes paralelos e nao procurar outra arquitetura. Os codigos e testes ja existem nas PRs:

- MCP: https://github.com/hypeneural/evydencia-crm-mcp/pull/11
- Gameplay: https://github.com/hypeneural/gameplay/pull/43
- EvydFlow: https://github.com/hypeneural/evydflow/pull/54 — apenas referencia, nao clonar.
- Leia `docs/AVELL_ANTIGRAVITY_RUNBOOK_20261026.md` se um comando falhar.

## ETAPA 1 — Executar EXATAMENTE este bloco no PowerShell 5.1 do Avell

```powershell
node --version
git --version
$w = Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
New-Item -ItemType Directory -Force -Path $w | Out-Null
$m = Join-Path $w 'crm-mcp-dev'
if (-not (Test-Path $m)) {
  git clone --depth 1 --filter=blob:none --single-branch --branch feat/gameplay-read-client-20261026 https://github.com/hypeneural/evydencia-crm-mcp.git $m
  if ($LASTEXITCODE -ne 0) { throw 'STOP: FALHA NO CLONE DO MCP' }
}
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w
if ($LASTEXITCODE -ne 0) { throw 'STOP: PREPARADOR AVELL FALHOU' }
Get-Content (Join-Path $w 'antigravity-preflight.json')
```

**O que vai acontecer:** clone do MCP PR #11 e clone REDUZIDO (sparse-checkout) de codigo Gameplay PR #43. Tudo somente em `%LOCALAPPDATA%\Evydencia\Antigravity\gameplay-mcp-20261026`. Nenhuma instalacao, nenhum deploy e nenhuma alteracao na impressora ou no MCP atualmente em uso. O preparador executa o teste local rapido MCP.

Se Git ou Node nao existirem, login GitHub falhar, script falhar ou houver branch errada/arquivos alterados: PARE. Nao use `git reset --hard`, `git clean`, `git checkout -f`, `git push --force` e nao passe credenciais por texto.

## ETAPA 2 — Conferir APENAS os 5 arquivos que importam

No MCP isolado (`$m`):
1. `AGENTS.md` (proibicoes e gates).
2. `src/gameplay-read-client.mjs` (cliente de leitura, 5s, 50 UUIDs, origem privada/publica).
3. `src/live-gateway.mjs` (buscas `crm_gameplay_links` e `crm_gameplay_auditoria`; nao alterar Z-API).
4. `scripts/validate-gameplay-read.mjs` (teste rapido).
5. `docs/GAMEPLAY_CRM_READ_INTEGRATION_20261026.md` (contrato).

No Gameplay isolado (`$w\gameplay-code`), ler `AGENTS.md`, `apps/catalog-server/AGENTS.md`, `deploy/readiness.json` e `apps/catalog-server/src/publication/GameplayStatusLookup.ts`. Nao tentar instalar Node 24 globalmente: o Avell roda Node 22 no MCP/operacao. Gameplay exige Node 24, e o CI GitHub da PR #43 ja validou o build. Nao clonar todas as imagens por conta propria.

## ETAPA 3 — UM ciclo curto de testes MCP isolados

Se o preparador da etapa 1 deu PASS e o computador estiver sem impressao pesada em andamento, executar:

```powershell
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --run-mcp-tests
if ($LASTEXITCODE -ne 0) { throw 'STOP: FALHA NOS TESTES MCP' }
```

Este comando roda `npm ci --ignore-scripts`, `npm test`, `npm run gateway:test`, somente dentro do clone. Nao executar `npm start`, `node scripts/start-gateway.mjs`, workflows, envs reais ou drivers. Se testes falharem, ler a falha uma vez, corrigir APENAS a causa identificada na branch correta e executar novamente APENAS o teste afetado (uma vez).

## ETAPA 4 — Checar CI e dependencias, SEM deploy

- MCP PR #11: GitHub Actions `test` + `validate` verdes.
- Gameplay PR #43: `Quality Gates & Build` + `Gallery mobile E2E` verdes na CI.
- Gameplay PR #43 depende da cadeia PR #30 e de publicacao. `deploy/readiness.json` tem `pilotReady=false`, `customerDataAllowed=false`, `automaticDeliveryAllowed=false`. Sem alterar.
- Contrato: Natal 2026, apenas status ATUAL `waiting_product_retrieve` (10) e `order_completed` (12) gera cobranca de publicacao.
- Busca por nome ambigua deve listar pedidos sem links e pedir ID. Pedido por ID/UUID unico pode obter link, caso publicacao ACTIVE.
- Batch de auditoria NUNCA retorna URL capability, telefone, token ou link secreto.
- EvydFlow consome API privada do Gameplay pelo adaptador; nao usar MCP OAuth como backend de painel.

## ETAPA 5 — Encerrar, sem loops

Resposta final deve ter SOMENTE:
1. Caminhos dos dois clones e SHAs atuais do `antigravity-preflight.json`.
2. Resultado do teste local rapido e dos testes MCP `npm test/gateway:test`.
3. Resultado das 2 CI GitHub (MCP e Gameplay).
4. Alertas reais encontrados com arquivo/linha exata (se houver).
5. **NO-GO para fotos reais/implantacao** enquanto Gameplay readiness, Caddy /internal e seguranca do piloto nao estiverem validados.

**Nao criar nova PR se nenhuma correcao for necessaria.** Se corrigir codigo, usar PR #11 para MCP e PR #43 para Gameplay, NUNCA escrever na main nem no MCP operacional do computador. FIM.
