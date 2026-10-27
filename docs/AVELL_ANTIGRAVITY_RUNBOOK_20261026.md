# Avell / Windows 11 — guia de execucao em uma unica rodada

**Leia este arquivo antes de agir.** Este computador opera a impressora e possui uma instalacao existente do Evydencia CRM MCP. Nao tocar nessa instalacao. Nao ha checkout do Gameplay local. A preparacao e **somente para desenvolvimento**.

## O que vai existir depois

Pasta de trabalho isolada no perfil do usuario:

```text
%LOCALAPPDATA%\Evydencia\Antigravity\gameplay-mcp-20261026\
  crm-mcp-dev\             # clone de desenvolvimento PR #11
  gameplay-code\           # clone PARCIAL de codigo PR #43, sem assets completos
  antigravity-preflight.json
  LEIA_PRIMEIRO.md
```

NENHUM destes diretorios e o MCP operacional, o printserver, a pasta de fotos, G:\Meu Drive, EvydFlow ou o banco do CRM.

## Passo A — Preflight simples (PowerShell 5.1, sem administrador)

Copiar/executar de uma unica vez:

```powershell
node --version
git --version
$w = Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
New-Item -ItemType Directory -Force -Path $w | Out-Null
$m = Join-Path $w 'crm-mcp-dev'
if (-not (Test-Path $m)) {
  git clone --depth 1 --filter=blob:none --single-branch --branch feat/gameplay-read-client-20261026 https://github.com/hypeneural/evydencia-crm-mcp.git $m
  if ($LASTEXITCODE -ne 0) { throw 'ERRO NO CLONE DO MCP DE DESENVOLVIMENTO' }
}
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w
if ($LASTEXITCODE -ne 0) { throw 'PREPARACAO INCOMPLETA: INSPECIONAR ERRO ACIMA' }
Get-Content (Join-Path $w 'LEIA_PRIMEIRO.md')
```

- O script clona o Gameplay em **sparse checkout**: o codigo de `apps/catalog-server` e docs essenciais, sem fazer checkout de todas as imagens de `apps/play/public`.
- Usa Git oficial com shallow clone / partial blobs. Nao faz push, deploy, push de tags, troca de branch na instalacao existente, instala drivers ou reinicia impressora.
- O quick gate roda `node scripts/validate-gameplay-read.mjs` sem precisar de `npm ci`.
- Se `git clone` pedir login do GitHub, usar credencial Git/GCM autorizada. Nunca colocar PAT no comando, arquivo .env ou conversa.
- Se Git ou Node nao estiverem disponiveis, PARAR e registrar versao/erro; **nao instalar pacotes globais**.
- Se a pasta ja existe, nao sobrescrever; o script verifica remoto, branch e nao limpa alteracoes.

## Passo B — Verificar o resultado e executar testes cirurgicos

```powershell
$w = Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
Get-Content (Join-Path $w 'antigravity-preflight.json')
Push-Location (Join-Path $w 'crm-mcp-dev')
node scripts/validate-gameplay-read.mjs
Pop-Location
```

Se o resultado de preflight for PASS, executar **somente no clone isolado** os testes MCP, uma unica rodada:

```powershell
$m = Join-Path $w 'crm-mcp-dev'
Push-Location $m
npm ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm ci falhou' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'testes MCP falharam' }
npm run gateway:test
if ($LASTEXITCODE -ne 0) { throw 'testes Gateway falharam' }
Pop-Location
```

OU usar a opcao integrada para fazer exatamente isso:

```powershell
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --run-mcp-tests
```

**IMPORTANTE:** Evitar `npm run validate:local` neste Avell como primeiro gate, pois essa tarefa tem preflight e componentes externos nao necessarios para este corte. A CI do MCP executa verificacoes amplas sem consumir recursos da impressora.

## Passo C — Gameplay: nao trocar Node global

- O Gameplay declara Node `>=24 <25` e pnpm `>=11.19.0`.
- O Avell possui historicamente Node 22.x, valido para o MCP mas nao para a suite Gameplay.
- **Nao trocar a versao global** de Node nem reiniciar servicos; o servidor de impressao usa este Windows.
- Consultar a CI GitHub da PR #43; ultimo status consultado antes deste documento: CI completa verde para SHA `36cfef13a1272a678a26896d446a15787bc58533`. Confirmar de novo no momento da execucao.
- Se necessario rodar Gameplay local, configurar Node 24 **somente em processo/terminal isolado** ou container compatível, nao como padrao do Windows. Nao instalar Node 24 via atualizacao global sem aprovar impacto na impressora.
- Para baixar todos os assets completos APENAS se necessario e com disco suficiente, rodar `--full-gameplay` no script de preparacao e verificar as mudancas antes. O clone reduzido e suficiente para auditoria de codigo/contratos, nao para full E2E de jogos.

## Passo D — O que verificar no codigo (ordem imutavel)

1. `crm-mcp-dev/AGENTS.md` e `src/AGENTS.md`. Nao modificar Laravel, Z-API nem a instalacao MCP de producao.
2. `gameplay-code/AGENTS.md`, `apps/catalog-server/AGENTS.md`, `.agents/current-state.json` e `deploy/readiness.json`. Respeitar flags: `pilotReady=false`, `customerDataAllowed=false`, `automaticDeliveryAllowed=false`.
3. `gameplay-code/apps/catalog-server/src/publication/GameplayStatusLookup.ts`: API read-only por UUID; `lookup-batch` retorna somente status/contagens (sem links).
4. `crm-mcp-dev/src/gameplay-read-client.mjs`: compara origem PUBLICA `EVYD_GAMEPLAY_PUBLIC_ORIGIN` com URLs de galeria, origem PRIVADA `EVYD_GAMEPLAY_READ_ORIGIN` com endpoint interno.
5. `crm-mcp-dev/src/live-gateway.mjs`: `crm_gameplay_links` e `crm_gameplay_auditoria`, `crm_capacidades`, schema Zod e busca resumida CRM.
6. `docs/GAMEPLAY_CRM_READ_INTEGRATION_20261026.md` e `docs/PROMPT_ANTIGRAVITY_GAMEPLAY_MCP_20261026.md`.
7. PRs abertas: Gameplay #43 (base PR #30), CRM MCP #11, EvydFlow #54 (somente futura integracao). Nao criar outra implementacao.

## Critérios de saida (nao expandir o escopo)

- Preflight criou as 2 copias isoladas e gerou JSON com SHAs e readiness.
- Node teste MCP PASS, `npm test` PASS, `npm run gateway:test` PASS quando solicitados.
- PR #43 CI GitHub verde, sem tomar node24 do computador da impressora.
- Sem secrets e sem urls capability em relatórios batch/logs.
- Natal 2026 + status **atual** 10/12; outros estados nao geram atraso de publicacao.
- Responder GO/NO-GO com motivo. NO-GO para fotos reais se readiness bloquear, mesmo que CI esteja verde.
- Nao fazer deploy nem ativar `EVYD_GAMEPLAY_READ_ENABLED=1` automaticamente.

## Retomada em outro dia

```powershell
$w = Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
$m = Join-Path $w 'crm-mcp-dev'
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --refresh
```

Se houver arquivos locais modificados, `--refresh` para em vez de sobrescrever. Registrar as alteracoes e revisar antes de continuar.

## Referencias oficiais

- https://git-scm.com/docs/git-clone.html
- https://git-scm.com/docs/git-sparse-checkout
- https://learn.microsoft.com/pt-br/powershell/module/microsoft.powershell.core/about/about_execution_policies
- https://github.com/nodejs/corepack/blob/main/README.md
- https://pnpm.io/installation/

## Estado de liberacao

**PR pronta para revisar e testar, nao equivale a publicacao real de fotos.** Caddy /internal, integridade backup/restore SQLite, autorizacao de sessao e piloto nao podem ser ignorados.

## Revisao forense do preparador (26/10/2026)
- Em Windows, `npm` usa launcher `.cmd` e precisa ser invocado com `cmd.exe`; o preparador usa uma allowlist fixa de `npm ci`, `npm test` e `npm run gateway:test`, sem execucao arbitraria de shell.
- Repositorios preexistentes sao verificados por remote/branch, `--refresh` requer `git status --porcelain` limpo e `git merge --ff-only`. Sem `reset --hard`, `clean -fd` ou troca de branch no checkout operacional.
- Paths apontando via junction/symlink para printserver, EvydFlow ou instalacao MCP operacional sao recusados antes de escrever clones.
- As ferramentas de links so existem para operadores OAuth com acesso CRM completo; nao usar token da Gameplay como substituto da identidade CRM.
- O GitHub CI de cada PR permanece referencia da suite completa e nao comprova que fotos reais foram publicadas em producao.

## Etapa 3 — após walkthrough local aprovado
A última execução reportada do Antigravity concluiu clones limpos, 179/179 testes MCP e 17/17 testes gateway em Avell. **Não repetir a Etapa 1.**

A auditoria de código posterior encontrou e corrigiu a paginação do Laravel: no CRM `GET /api/orders/search` usa `paginate(200)` e responde `data/meta/links`. O MCP (PR #11) prefere o bridge PHP, mas agora aceita o fallback HTTP quando os metadados da **paginação de servidor** são completos e reconciliáveis, sem `.slice()` local. O `OrderResource.status` tem `id/name`, não `key`: IDs 10/11/12 foram normalizados no adaptador. Os testes são totalmente sintéticos, sem clientes reais.

O único comando de retomada deve vir de `docs/PROMPT_ANTIGRAVITY_FLASH_AVELL_20261026.md`: verifica worktrees limpas, atualiza por `--refresh` e executa somente os testes afetados. Não usar `--run-mcp-tests` novamente sem causa.

`node scripts/antigravity/inspect-canonical-bridge.mjs --json` verifica só os arquivos locais do PHP. No Avell, `false` é esperado; nem `true` neste probe comprova que o MCP na VPS possui conexão/auth/latência/resultado corretos.

**Próximo gate externo:** quando autorizado, verificar read-only na VPS a opção bridge PHP ou o endpoint HTTP paginado sob a credencial de serviço de leitura. Não trazer bearer ou dados de clientes ao Avell. Enquanto isso manter `CRM_CANONICAL_SEARCH_VPS=not_verified` e `GAMEPLAY_RUNTIME=not_verified`; nunca considerar CI como autorização de fotos reais.
