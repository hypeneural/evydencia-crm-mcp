# Auditoria forense — pós-walkthrough Avell / Gameplay + MCP (26/10/2026)

## Evidência relatada pelo Antigravity (não aferida diretamente neste computador)
- `crm-mcp-dev` clean no SHA `6e766260316012c6b2a4620525ff248c081ea09a`.
- `gameplay-code` clean no SHA `65730d9eff8f3ec4787b40d79f41533d0cad0caf`.
- Testes locais apresentados: contratos 12/12; cirúrgicos 24/24.
- `inspect-canonical-bridge` no Avell: `forensic_bridge_script_present=true`, `crm_laravel_autoload_present=false`, `canonical_search_verified=false`.
- Impressora: `not_measured`. Nenhum baseline antes/depois deve ser inventado.
- A CI GitHub desses SHAs estava verde na inspeção, mas precisa ser revalidada para o HEAD atual de cada PR.

## Fonte de verdade do código
- `hypeneural/evydencia-crm-mcp` PR #11. LIVE usa Node >=22, OAuth e operador com `EVYD_ENABLE_OPERATOR_FULL_CRM=1`.
- `hypeneural/gameplay` PR #43, baseada na PR #30; o catálogo exige Node 24, SQLite e ainda está em `staging-demo`.
- Código do CRM Laravel (referência, não editar): `app/Services/Api/OrderService.php` usa `OrderResource::collection($query->paginate(200))`.
- `app/Http/Resources/OrderResource.php` retorna `status: {id,name}`, sem key.
- `app/Enums/OrderStatus.php`: IDs 1–13; elegíveis à cobrança de publicação apenas 10 e 12 (status ATUAL); 11 NÃO entra.

## Correções aplicadas depois do walkthrough
1. `src/legacy-api-read.mjs`: o fallback HTTP com paginação canônica preserva o `status_key` para **todos** os 13 status do enum, não somente 10/11/12. Isso deixa a busca nominal honesta com pedidos ainda em etapas anteriores.
2. `test/gameplay-canonical-pagination.test.mjs`: cobertura do status `waiting_payment` no modo HTTP.
3. `scripts/antigravity/vps-readonly-preflight.mjs`: inspeção passiva de estrutura Laravel, script forense PHP e serviço `evydencia-crm-mcp-live.service`, sem acessar dados/segredos nem modificar o sistema.
4. `test/vps-readonly-preflight.test.mjs`: garante que serviço/arquivos presentes **não** elevam `canonical_search_vps` nem runtime Gameplay a `verified`.

Nenhum arquivo da PR #43 Gameplay foi alterado nesta rodada. Nenhuma operação de VPS, banco, WhatsApp, impressora ou cliente real foi executada a partir desta auditoria.

## Questões abertas e limites da evidência
- `CRM_CANONICAL_SEARCH_AVELL`: contrato sintético validado; a ausência de Laravel no notebook é esperada.
- `CRM_CANONICAL_SEARCH_VPS`: `not_verified`. Inspeção passiva no Linux não comprova serviço HTTP paginado, token de operador, projeções de pedido ou cobertura de status.
- API de consulta interna Gameplay não está publicada nem demonstrada via rede privada em VPS. A PR #43 verde não basta.
- Laravel `GET /api/orders/search` tem paginação por 200 e recursos extensos. O fallback MCP tem limite de 1 MiB e pode falhar quando uma página retornar payload maior. Só diagnosticar com evidência, nunca aumentar limites e expor PII sem análise.
- Os filtros `product.slug` do PHP bridge e do CRM usam `LIKE`; não inferir equivalência exata do texto `natal` com uma campanha se o catálogo tiver slugs parecidos. Validar a regra antes de relatórios oficiais.
- No Gameplay `published_unverified` comprova metadados SQLite prontos e token íntegro, não HTTP 200, imagens decodificadas nem jogos Phaser no navegador.
- `deploy/readiness.json` segue `pilotReady=false`, `customerDataAllowed=false`, `automaticDeliveryAllowed=false`. Não alterar para aprovar artificialmente a publicação.
- Caddy `/internal/*`, backup/restauração do SQLite WAL, autorização entre sessões A/B e piloto físico mobile continuam fora do escopo do notebook.

## Execução do Antigravity: só diferenças novas
1. Conferir `git status --porcelain` dos dois clones. Não usar `git reset --hard`, `git clean`, novo clone ou nova branch.
2. Em workspace limpo, chamar `prepare-avell.mjs --workspace <workspace> --refresh` (sem `--run-mcp-tests`).
3. Testes somente dos arquivos afetados: `node --test test/gameplay-canonical-pagination.test.mjs test/vps-readonly-preflight.test.mjs`. Não reinstalar dependências.
4. `gh pr view/checks` nos dois repositórios para verificar SHAs HEAD; conferir GitHub CI completo do MCP e Gameplay.
5. Só se houver acesso SSH **previamente autorizado** a VPS, planejar uma checagem passiva do servidor com o script VPS. Não obter novas credenciais, não editar `gateway.env`, não iniciar/parar services, não copiar código para a VPS sem autorização explícita de escopo. De outra forma manter `CRM_CANONICAL_SEARCH_VPS=not_verified`.
6. Relatar brevemente os estados separados: `AVELL_CODE`, `MCP_CI`, `GAMEPLAY_CI`, `VPS_FILESYSTEM`, `VPS_AUTHENTICATED_CRM`, `GAMEPLAY_BROWSER_RUNTIME` e `PRODUCTION_READINESS`. A conclusão é GO somente para código/teste isolado; NO-GO para dados reais/deploy.

## Fontes oficiais verificadas
- Laravel 10 API resources: https://laravel.com/docs/10.x/eloquent-resources#pagination
- Node.js child_process Windows: https://nodejs.org/api/child_process.html
- GitHub CLI checks: https://cli.github.com/manual/gh_pr_checks
- MCP tools: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- OWASP authorization by object: https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
