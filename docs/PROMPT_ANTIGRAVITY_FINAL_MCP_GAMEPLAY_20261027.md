# Handoff Antigravity — MCP × Gameplay — 27/10/2026

## Fonte auditada e release gates
- MCP PR #11 continua **draft** em `feat/gameplay-read-client-20261026`. A linha operacional `release/live-35tools-gameplay-printserver` divergiu: ao comparar `release...feature`, feature +18 commits e release +72. NÃO substituir release diretamente, nem eliminar as ferramentas PrintServer/Z-API/OAuth.
- Gameplay PR #43 continua **draft**, base `audit/p0-catalog-pilot-order-allowlist-20261012`, não a branch padrão `codex/puzzle-native-like-v1`. A comparação padrão→feature retornou +305/-35 commits. NÃO fazer merge direto na principal.
- Gameplay PR #30 (gate de publicação por pedido) ainda draft. `deploy/readiness.json` possui os três gates false; testes/compilação não são prova de browser, media grants, banco produtivo ou entrega WhatsApp.
- Hardening de PR #43: sidecar `CATALOG_PRIVATE_METADATA_READ_ONLY=1` atende somente `/healthz` e `/internal/v1/sessions/lookup*`, bloqueando `/`, `/demo/*`, `/s/*`, com teste Vitest de regressão. Não confundir com habilitar links ou fotografias reais.

## Execução local simples e segura
1. **Não executar merge, deploy, docker compose up, stackctl mutável, editar segredos, alterar DNS/Caddy, alterar readiness, imprimir nem enviar WhatsApp.** Nenhum `tailscale login` interativo em loop.
2. Nos dois worktrees existentes: `git status --short`, `git fetch --prune`, registrar `git rev-parse HEAD` e `git rev-parse @{upstream}`; interromper atualização se worktree sujo ou branch divergente. Sem force/reset.
3. Gameplay: garantir HEAD atualizado da PR #43 com o hardening de rotas privadas; `pnpm install --frozen-lockfile`, `pnpm exec vitest run apps/catalog-server/src/CatalogServer.test.ts apps/catalog-server/src/publication/GameplayStatusLookup.test.ts apps/catalog-server/src/publication/GameplayStatusLookup.integration.test.ts`, `pnpm check`, `pnpm release:staging`, `pnpm release:verify`. No Windows: preservar LF via `core.autocrlf=false` por repo e `core.eol=lf` caso haja alteração de checkout, sem reformatar tudo.
4. MCP: `npm ci`, `node --test test/gameplay-links.test.mjs test/gameplay-read-client.test.mjs test/gameplay-real-audit.test.mjs`, `npm run gateway:test`, `npm test`. Preservar feature OFF `EVYD_GAMEPLAY_READ_ENABLED` fora de ambiente de teste.
5. Auditar `git merge-base`, `git log --left-right --oneline --cherry-pick`, `git diff --name-status` (a) release MCP vs PR #11; (b) Gameplay principal/release consolidada vs PR #43 e PR #30. Propor branch nova de integração, sem commitar na linha operacional. Inventariar ferramentas MCP antes/depois, incluindo PrintServer, Z-API e proposta. Checar incompatibilidades de schema e migrations.
6. Produzir recibo compacto: SHA exato, worktree limpo, CI do novo HEAD, testes quantificados, divergências, plano de merge com conflitos e rollback. NÃO declarar GO produção por PASS local.

## Evidências obrigatórias antes de qualquer futuro GO real
- Sidecar privado em 127.0.0.1 no host correto, acesso MCP→Media VPS por túnel autenticado; autenticação errada 401, batch sem links, externo /internal bloqueado.
- Provar dataset real, SQLite/WAL backup **e restore**, permissões de mídia por sessão/revisão, isolamento cruzado, canário WebP thumb/card/game, URL real HTTP + browser Safari/Chrome de 1 pedido autorizado e revogação.
- `/s/:token` é hub/jogos, `/s/:token/fotos` galeria; links não são comprovados pelo token isolado. Não produzir URLs em lote ou em logs.
- PrintServer/etiquetas/status de retirada permanecem feature independente, issue #10 / PR #12. Mudança de status CRM depende de autorização, financeiro, idempotência e API segura; não usar endpoint legado de atualização.
