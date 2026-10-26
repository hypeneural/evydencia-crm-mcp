# Revisão forense do plano Antigravity (Avell) — Etapa 2, 26/10/2026

## Estado CONFIRMADO
- PR MCP #11 `feat/gameplay-read-client-20261026`, baseada em `main`.
- PR Gameplay #43 `feat/gameplay-status-read-api-20261026`, baseada na branch da PR #30, NÃO na principal.
- O relatório enviado pelo Antigravity diz que já existem dois clones **limpos** em `%LOCALAPPDATA%\Evydencia\Antigravity\gameplay-mcp-20261026`; o GitHub não consegue atestar o sistema de arquivos ou a impressora Avell. Tratar isso como evidência fornecida pelo executor, a ser reconfirmada uma vez.
- O relatório usou nome de teste `gameplay-client.test.mjs`, porém os arquivos rastreados são `test/gameplay-read-client.test.mjs` e `test/gameplay-read-client-hardening.test.mjs`. A contagem de testes deve ser lida do TAP, nunca inferida dos nomes.
- `gh pr view` sozinho não garante jobs verdes. Usar `gh pr checks <numero> -R <repo> --json name,state,bucket,link` e cruzar com `headRefOid`.
- Nenhum teste local da impressora foi demonstrado em evidência versionada; NÃO escrever "zero impacto comprovado" apenas porque o preparador usou AppData.

## Achado P0: paginação real da consulta CRM
`src/legacy-api-read.mjs` tem dois mecanismos:
1. `runForensicBridge('orders.search')` quando o backend PHP do Laravel e o bridge privado realmente estão presentes. Paginação e filtro canônicos do servidor.
2. Fallback HTTP `/api/orders/search`, que ordena e usa `.slice` local nos registros obtidos. Essa rota NÃO prova cobertura exaustiva de páginas nos mesmos moldes do bridge. Não usar `total_matching_orders` e `has_more` desse fallback para declarar que toda a lista de Natal foi conferida.

**Correção nesta PR:** `legacyReadClient.search(...,{canonicalPaginationRequired:true})` falha com `legacy_read_canonical_pagination_unavailable` se não houver bridge PHP. `crm_gameplay_auditoria` e consulta por `nome_cliente` exigem cobertura canônica. Pedidos por ID/UUID usam validação explícita de igualdade e preservam a busca direta existente. Teste: `test/gameplay-canonical-pagination.test.mjs`.

**Bloqueio novo:** validar na VPS DO MCP se `EVYD_CRM_APP_PATH/vendor/autoload.php` e o bridge forense privado existem e o executor pode usá-los sem alterar o Laravel. Se o MCP está isolado da aplicação Laravel e não possui bridge, **NO-GO para auditoria completa**. Abrir tarefa específica de endpoint seguro/paginado no CRM por canal autorizado; não ativar uma varredura truncada nem forçar `has_more=false`.

Na amostra atual `crm_pedidos_buscar(nivel_detalhe=resumo)`, `items` pode estar vazio. Não tentar validar Natal por presença de `items`; confie somente no filtro `product_slug=natal` do servidor canônico ou falhe explicitamente.

## Segurança e semântica
- Elegíveis à cobrança: Natal 2026 status ATUAL `waiting_product_retrieve` (10) OU `order_completed` (12). Estado 11 não entra. Contagens históricas (12+10) são snapshot, não constante.
- `GameplayStatusLookup.lookup` faz leitura SQLite sem `resolveOrCreateSession`, sem upload, sem alterar revisão.
- `lookup-batch` não retorna capability URLs; pedidos individuais podem retornar links somente com autorização CRM OAuth + modo full e `include_links=true`.
- `published_unverified` prova somente metadados SQLite/revisão READY/token canônico, não HTTP 200/mídia decodificada/jogo Phaser executado.
- Falha de rede, ausência do bridge, timeout e resultado parcial são ERRO, não ausência de galeria.
- Em ambientes privados, URL da API Gameplay e URL pública `https://jogos.fotosdenatal.com` são origens diferentes.
- `pilotReady=false`, `customerDataAllowed=false`, `automaticDeliveryAllowed=false` impedem afirmar que fotos reais estão prontas ou que o fluxo é liberável por CI.
- A PR #43 permanece draft e depende da consolidação da cadeia de publicação PR #30 e seus pré-requisitos. Não alterar readiness por suposição.

## Instruções cirúrgicas para a máquina AVELL onde a Etapa 1 JÁ RODOU
**Não repetir o clone manual nem criar workspace/branches novas.** Antes, verificar em leitura:
```powershell
$ErrorActionPreference='Stop'
$w=Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
$m=Join-Path $w 'crm-mcp-dev'
$g=Join-Path $w 'gameplay-code'
foreach($p in @($m,$g)){ if(-not (Test-Path (Join-Path $p '.git'))){ throw "WORKSPACE_NAO_ENCONTRADO: $p" } }
git -C $m status --porcelain
git -C $g status --porcelain
git -C $m rev-parse HEAD
git -C $g rev-parse HEAD
```

Se qualquer `git status --porcelain` retornar alterações, PARAR (não apagar, stash nem sobrescrever). Se limpos, atualizar e executar **uma única rodada**:
```powershell
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --refresh --run-mcp-tests
if ($LASTEXITCODE -ne 0) { throw 'PREPARADOR_OU_TESTES_FALHARAM' }
Get-Content (Join-Path $w 'antigravity-preflight.json')
```

`--refresh` só avança `git merge --ff-only` e verifica remotos/branches; não usa hard-reset nem toca MCP operacional. `--run-mcp-tests` instala dependências **somente no clone isolado**, sem scripts de instalação, e executa `npm test` e `npm run gateway:test`. Com os hashes no JSON, verificar GitHub:
```powershell
gh pr view 11 -R hypeneural/evydencia-crm-mcp --json headRefOid,isDraft,baseRefName,url
gh pr checks 11 -R hypeneural/evydencia-crm-mcp --json name,state,bucket,link
gh pr view 43 -R hypeneural/gameplay --json headRefOid,isDraft,baseRefName,url
gh pr checks 43 -R hypeneural/gameplay --json name,state,bucket,link
```
Se `gh` não disponível/autenticado, registrar limitação (não instalar login forçado nem inventar resultado). Conferir resultados no navegador autenticado.

## Relatório final obrigatório
- `LOCAL_CHECKOUTS`: caminho + SHA atual + worktree clean de ambos.
- `MCP_TESTS`: testes executados, TAP test/pass/fail e erro, **extraídos do stdout real**.
- `GITHUB_CI`: SHA atual dos dois PRs, nomes dos checks + bucket, URLs, não só um "PASS" genérico.
- `CRM_CANONICAL_SEARCH`: `available`, `unavailable` ou `not_verified`; sem provar bridge canônico não declarar inventário de pendências completo.
- `GAMEPLAY_RUNTIME`: `not_verified` até confirmação da mídia/navegador com piloto permitido, independentemente do CI.
- `PRINTER/PRINTSERVER`: `not_measured` na ausência de baseline real (não inventar porta 3000).
- `DECISION`: GO somente para desenvolvimento e testes isolados; NO-GO implantação/dados reais enquanto readiness/edge/backup/media authorization não comprovados.

## Fontes oficiais
- GitHub CLI checks: https://cli.github.com/manual/gh_pr_checks
- Node.js child_process no Windows: https://nodejs.org/api/child_process.html
- Git sparse-checkout: https://git-scm.com/docs/git-sparse-checkout
- MCP tools outputSchema/structuredContent: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- OWASP BOLA: https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
