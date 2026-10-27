# Prompt operacional — Antigravity: Gameplay × CRM MCP Natal 2026

**Objetivo:** concluir PRs existentes, sem nova implementação paralela, validando leitura por nome/pedido, auditoria em lote e integração futura EvydFlow.

Repositórios:
- Gameplay `hypeneural/gameplay`, PR #43, branch `feat/gameplay-status-read-api-20261026`, base `audit/p0-catalog-pilot-order-allowlist-20261012` (PR #30).
- MCP `hypeneural/evydencia-crm-mcp`, PR #11, branch `feat/gameplay-read-client-20261026`, base `main`.
- EvydFlow `hypeneural/evydflow`, PR #54, branch `feat/gameplay-management-bridge-20261026`. **Não desenvolver painel inteiro nesta etapa.**

## Critérios de negócio
- 2026 Natal apenas; status atual **10** `waiting_product_retrieve` ou **12** `order_completed` requer publicação. Estado **11** `product_retrieve_confirmed` não substitui 12.
- A busca nominal pode mostrar pedido em status anterior, mas não contá-lo como pendência vencida.
- Um `crm_order_uuid` = uma sessão, galeria e hub; homônimos têm pedidos separados.
- Fonte CRM: somente `direct.search` / endpoint canônico com `product.slug=natal`, janela de 2026 e `detailLevel=resumo`.
- Fonte Gameplay: repositório SQLite e revisão ativa; nunca usar `POST /sessions/resolve` para consulta.
- `published_unverified` significa DB ACTIVE + blobs READY, **não** que os 11 jogos funcionaram nem que a mídia física foi provada. Distinguir `not_found` de timeouts e 503.

## Primeiro: auditoria local e CI
1. `git status --short` em cada repo; preserve dirty worktrees, sem force push.
2. Leia `AGENTS.md`, o owner AGENTS, `deploy/readiness.json`, as PRs #11/#15/#23/#27/#30/#43 do Gameplay, `src/live-gateway.mjs` v0.12 e `src/gameplay-read-client.mjs`.
3. Conferir SHA atual dos PRs, CI status e se a branch default Gameplay já incorporou dependências.
4. Gameplay Node **24**, pnpm **11.19.0**: `pnpm agent:doctor`; `pnpm exec vitest run apps/catalog-server/src/publication/GameplayStatusLookup.test.ts apps/catalog-server/src/publication/GameplayStatusLookup.integration.test.ts`; `pnpm check:fast`; `pnpm check`; `pnpm validate` se ativos Playwright disponíveis.
5. MCP Node >=22: `node scripts/validate-gameplay-read.mjs`; `npm run gateway:test`; `npm test`; `npm run validate:local`.
6. Somente seguir para deploy quando CI estiver verde, incluindo Prettier/repo-map no Gameplay.

## Contrato de API e proteção
- Gameplay: `POST /internal/v1/sessions/lookup` com `{"crm_order_uuid":"UUID","include_links":true}`; `POST /internal/v1/sessions/lookup-batch` com `{"crm_order_uuids":["UUID",...]}` (max 50).
- Resposta v1 JSON inclui `schema_version=1`, `verified_at`, `results`. Batch SEMPRE retorna `hub_url=null` e `gallery_url=null`.
- Caddy deve bloquear `/internal/*` na interface pública; liberar só para rede privada + Bearer. Testar externamente 403/404 e internamente 401 sem token, 200 apenas com token válido.
- `CATALOG_INTERNAL_READ_SECRET` deve ser distinto dos segredos de publicação/servidor.
- MCP lê por `EVYD_GAMEPLAY_READ_ORIGIN` privado, valida links contra `EVYD_GAMEPLAY_PUBLIC_ORIGIN=https://jogos.fotosdenatal.com`, com 5s timeout, 64 KiB limite, sem redirects.
- MCP tools apenas com OAuth existente e operador autorizado. Sem Z-API/envio. Testar `crm_capacidades` para presença condicional das ferramentas novas.

## Testes funcionais necessários
- Pedido sintético A: ausente -> sessão criada por publicador existente -> revisão incompleta -> ativa -> revogada; buscar links só quando publicada.
- Pedido B: acesso de A não retorna B, UUID diferente, sem duplicação e sem mutação por consulta.
- Nome homônimo, nome inexistente, UUID inválido, dois pedidos do mesmo cliente.
- 12 pedidos aguardando retirada + 10 concluídos na fotografia do CRM de 26/10; comparar com novo snapshot antes do teste (NÃO codificar 22).
- Desligar Gameplay: erro legível `gameplay_unavailable` e nenhum falso `not_found`.
- Confirmação de que endpoint batch e `crm_gameplay_auditoria` nunca devolvem URLs capability ao chat/painel.
- Executar smoke privado de mídia real somente com piloto devidamente autorizado e readiness do Gameplay cumprido.

## Rollout / rollback
- Não mudar o Laravel nem implantar dados reais no staging-demo; `pilotReady=false`, `customerDataAllowed=false`, `automaticDeliveryAllowed=false` continuam bloqueando.
- Resolver cadeia das PRs de publicação Gameplay antes de merge/deploy da PR #43.
- Validar SQLite WAL backup/restore, diff da revisão, auth cruzada, SHA servido na VPS, Caddy edge, Chrome Android + Safari iOS e publicações reais autorizadas.
- MCP PR #11 pode ficar staged atrás de `EVYD_GAMEPLAY_READ_ENABLED=0` se não houver backend habilitado. Só ligar quando a API privada responder.
- Rollback imediato: desligar flag do MCP; desconfigurar read secret no Gameplay, restaurar SHA anterior.
- Relatar: testes executados com tempos, CI URLs, SHA de cada branch, contratos, resultados com pedidos SINTÉTICOS e decisão GO/NO-GO fundamentada.

**PROIBIDO:** inventar URLs, expor tokens/secrets ou fotos privadas em logs, usar o Gameplay legado, alterar readiness por declaração, disparar Z-API, modificar fluxos reais do EvydFlow ou executar deploy de cliente sem os gates.
