# Revisão forense do plano Antigravity (Avell) — Etapa 2, 26/10/2026

## Estado CONFIRMADO
- PR MCP #11 `feat/gameplay-read-client-20261026`, baseada em `main`.
- PR Gameplay #43 `feat/gameplay-status-read-api-20261026`, baseada na branch da PR #30, NÃO na principal.
- O relatório enviado pelo Antigravity diz que já existem dois clones **limpos** em `%LOCALAPPDATA%\Evydencia\Antigravity\gameplay-mcp-20261026`; o GitHub não consegue atestar o sistema de arquivos ou a impressora Avell. Tratar isso como evidência fornecida pelo executor, a ser reconfirmada uma vez.
- O relatório usou nome de teste `gameplay-client.test.mjs`, porém os arquivos rastreados são `test/gameplay-read-client.test.mjs` e `test/gameplay-read-client-hardening.test.mjs`. A contagem de testes deve ser lida do TAP, nunca inferida dos nomes.
- `gh pr view` sozinho não garante jobs verdes. Usar `gh pr checks <numero> -R <repo> --json name,state,bucket,link` e cruzar com `headRefOid`.
- Nenhum teste local da impressora foi demonstrado em evidência versionada; NÃO escrever "zero impacto comprovado" apenas porque o preparador usou AppData.

## Achado P0 corrigido — paginação remota canônica sem PHP local

A auditoria adicional leu **Laravel `app/Services/Api/OrderService.php`**: `GET /api/orders/search` implementa `paginate(200)`. O problema estava em `src/legacy-api-read.mjs`, que paginava novamente uma amostra local usando `.slice()`.

**Correção de código na PR #11:**
1. Preferir `scripts/crm-forensic-bridge.php` quando o MCP está co-localizado com Laravel, com paginação canônica de até 25 pedidos.
2. Se o bridge PHP não está disponível, consumir a API Laravel já existente com `page` no servidor, exigindo `data[]`, `meta.current_page`, `meta.per_page`, `meta.total` e `meta.last_page` consistentes. O MCP não inventa cobertura; erro explícito caso a API não prove a página. Limite de 1 MiB da resposta HTTP continua valendo.
3. `OrderResource.status` retorna **ID e nome, sem chave**. Converter explicitamente IDs atuais 10/11/12 em `waiting_product_retrieve`, `product_retrieve_confirmed`, `order_completed` no fallback, conforme `app/Enums/OrderStatus.php`.
4. `src/live-gateway.mjs` reconcilia contagens entre páginas, total estável e UUIDs distintos; falha se a paginação for contraditória.
5. Teste `test/gameplay-canonical-pagination.test.mjs` cobre duas páginas, ausência de meta, página incompleta e status 11 inelegível.
6. Teste `test/inspect-canonical-bridge.test.mjs` impede que mera presença de arquivos do PHP seja apresentada como prova de API funcional.

**NO-GO de ambiente ainda necessário:** verificar no MCP operacional se o bridge local está disponível OU se a rota HTTPS privada existente aceita paginação servidor com meta estável e Authorization correta. Não instalar Laravel no Avell e não criar novo endpoint no CRM. A consulta do Avell só testa contratos sintéticos; a capacidade real do host VPS continua `not_verified` até smoke autenticado autorizado.

**Documentação oficial:** Laravel pagination <https://laravel.com/docs/10.x/pagination>; GitHub CLI <https://cli.github.com/manual/gh_pr_checks>; MCP tools <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>.

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
