# Comece aqui — MCP × Gameplay — Natal 2026
**Estado:** Integração sob revisão, sem promoção automática | **Data:** 27/10/2026

## 1. Qual problema estamos resolvendo?

O ChatGPT deve consultar um pedido do Natal 2026 no CRM e, sob autorização do operador, informar se sua experiência digital já possui publicação ativa, fotos em preparação, galeria e jogos. O hub principal e dos jogos é `/s/:token`; a galeria é `/s/:token/fotos`. Links individuais de jogo só existem com um `gameId` real. Gerar um token **não** prova que o cliente tem acesso à página, fotos WebP ou jogos Phaser.

Esta integração é SOMENTE leitura. **Não** imprime etiquetas, altera status de retirada, envia Z-API, publica fotos, cria sessões, executa migrations ou libera automaticamente clientes.

## 2. Quem é autoridade em cada ação?
| Área | Autoridade | Guarda |
| --- | --- | --- |
| Identidade do pedido, status 10/12 e filtro Natal 2026 | CRM Laravel/Extension/bridge canônico | Nome retorna candidatos; UUID/ID explícito antes de buscar capability |
| Metadados `photo_sessions`, STAGED/ACTIVE, variantes | Gameplay Catalog + SQLite existente | `DatabaseSync({readOnly:true})`, `PRAGMA query_only=ON`, sem migrations |
| URL do hub/galeria | Gameplay; apenas lookup individual autenticado | Pode retornar 409. Nunca inventar URL. Batch sem capability |
| Distribuição/abertura de link | CRM/Z-API com recibo por revisão | Sem recibo: `not_verified`; nunca `not_sent` |
| Impressão/malotes e status de retirada | PrintServer e CRM, workstream separado | PR MCP #12 / issue #10; não se misturam à PR Gameplay #11 |

## 3. Estado auditado das branches
| Repositório | Branch/PR | Situação |
| --- | --- | --- |
| MCP | `release/live-35tools-gameplay-printserver` | Linha operacional relatada; preservar OAuth, Z-API e PrintServer |
| MCP | `feat/gameplay-read-client-20261026` / #11 | Draft baseado em `main`; 19 commits exclusivos em relação à release, com 72 da release ausentes |
| MCP | `integration/live-35tools-gameplay-reconciled-20261027` | **Nova branch de integração baseada na release**; traz apenas links/409 seguros, scripts e testes; NÃO está implantada |
| Gameplay | `feat/gameplay-status-read-api-20261026` / #43 | Draft; HEAD fonte `c7526bf` validado pelo Antigravity |
| Gameplay | `codex/puzzle-native-like-v1` | Branch padrão separada, com histórico divergente; não mesclar diretamente |
| Gameplay | `deploy/readiness.json` | `pilotReady=false`, `customerDataAllowed=false`, `automaticDeliveryAllowed=false` |

**Atenção:** os 35 tools informados foram auditados no inventário da release do MCP. Um teste com código local não comprova a contagem ou identidade dos tools de um gateway VPS recém-implantado: comparar `crm_capacidades.build_commit`, names/scopes e ferramentas efetivamente registradas na própria VPS.

## 4. O que o Antigravity relatou e o que ainda NÃO provou

Relato (não reexecutado nesta auditoria): Gameplay 604/604, MCP 217/217, CI verde nos HEADs `c7526bf` e `78ed39c`. O sidecar em Media VPS responde 200 em `/healthz` e 401 no POST sem Bearer, porém a versão apontada para o processo vivo é **`37190a8`**, anterior ao hardening `c7526bf`.

Logo, **P0 NO-GO atualização do sidecar até comprovar**: artefato e hash realmente em execução; GET/HEAD `/s/*` e `/demo/*` = 404; POST com Bearer autorizado = 200 contrato v1 sem URLs; POST `include_links:true` = 409; acesso externo `/internal/*` negado no ingresso; vinculação do banco real e backup/restore consistente WAL. Health 200 + 401 isoladamente NÃO é GO.

## 5. Verificação local mínima (sem rede real)

No Avell, utilize worktrees existentes, não clone nem faça `tailscale login`:
```powershell
# MCP — branch de integração, com Node >=22
git status --short
npm ci
node --test test/gameplay-links.test.mjs test/gameplay-integration-release.test.mjs
npm run gateway:test
npm test

# Gameplay — PR #43, Node 24 e pnpm 11
pnpm install --frozen-lockfile
pnpm exec vitest run apps/catalog-server/src/CatalogServer.test.ts apps/catalog-server/src/publication/GameplayStatusLookup.test.ts apps/catalog-server/src/publication/GameplayStatusLookup.integration.test.ts
pnpm check
pnpm release:staging
pnpm release:verify
```

No ambiente Windows, manter os LF versionados; não reformatar árvore inteira apenas por checkout CRLF. Teste `npm test` no MCP inclui os novos gates de regressão.

## 6. Smoke privado SEM cliente (segunda etapa, execução autorizada)

O script `scripts/antigravity/verify-private-gameplay-reader.mjs` só permite `http://127.0.0.1:PORT`, nunca domínio ou IP público. Pode testar Avell por um **túnel loopback aprovado** ou executar no host Media VPS por método autorizado, após disponibilizar o script no ambiente.

```bash
# Sem segredo: testes públicos e de 401; retorna INCOMPLETE com exit code 2.
npm run gameplay:sidecar:verify

# Apenas no ambiente privado já autorizado com segredo em arquivo existente:
EVYD_SIDE_READER_SECRET_FILE=/caminho/privado/ja-aprovisionado \
  EVYD_SIDE_READER_ORIGIN=http://127.0.0.1:4182 \
  npm run gameplay:sidecar:verify
```

A credencial nunca deve ser copiada para Git, comando CLI, arquivo de relatório, print, canal do Antigravity ou ChatGPT. **Não criar segredo novo sem gestão aprovada.** Se a linha anterior não se aplicar à topologia real, registrar bloqueio e deixar somente o diagnóstico não autenticado. O script faz leitura sintética com UUID reservado, proíbe URLs no batch e requer 409 para geração de links. Ele não identifica o SQLite real e não prova WebP, público, browser ou backup.

## 7. Gate de liberação em fases

**Gate A (local/Git):** teste integral/CI verde no HEAD da branch de integração, schema JSON, identidades de tools PrintServer e Z-API preservadas. PR Draft para release, nunca merge automático.

**Gate B (sidecar interno):** artefato imutável `c7526bf` ou seu sucessor validado; mudança exclusiva de `catalog-reader` via `stackctl` autorizado; host bind 127.0.0.1:4182; `200/401/404/409` e autorização 200 completa; `/internal/*` bloqueado externamente; backup **mais restauração** WAL testados; rollback identificado. Não usar `docker compose up` amplo nem mudar o catálogo público.

**Gate C (ChatGPT real — somente leitura):** provisionar canal MCP VPS→Media VPS aprovado, ativar feature apenas no gateway autorizado, `crm_capacidades(verificar_gameplay=true)` e auditoria das ordens status atuais 10 e 12; conferir banco/proveniência com operadores e volumes autorizados. Nunca publicar IDs/tokens reais em logs/issues.

**Gate D (cliente real):** ticket distinto exige um único pedido consentido, URLs servidas pelo catálogo público, grant por sessão/revisão para thumb/card/game, teste de revogação e cross-session, Safari/Chrome físico, entrega manual autorizada e recibo. Flags de readiness/entrega automática ficam OFF até prova independente.

## 8. Rollback / limites

- Problema no MCP: manter feature `EVYD_GAMEPLAY_READ_ENABLED=0`, voltar SHA/serviço anterior através do fluxo oficial; **não** mexer em PrintServer, OAuth, Z-API ou Laravel.
- Problema no sidecar: remover/parar **apenas** `catalog-reader` via wrapper aprovado; não tocar no `christmas-games-catalog` público, SQLite live, WAL, dados ou Caddy sem plano próprio.
- `readOnly` não significa backup restaurável: ao ler banco em WAL, verificar condições `-wal` e `-shm`, privilégios e checkpoint/restore; não copiar só `catalog.db` como suposto backup consistente.

## 9. Documentação oficial verificada
- Node 24 `DatabaseSync`: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- SQLite WAL/read-only: https://sqlite.org/wal.html
- Compose merge e caminhos base: https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/
- Caddy path matchers: https://caddyserver.com/docs/caddyfile/matchers
- Nginx `internal` e `X-Accel-Redirect`: https://nginx.org/en/docs/http/ngx_http_core_module.html#internal

**Próximo handoff:** `docs/PROMPT_ANTIGRAVITY_MCP_GAMEPLAY_ETAPA2_20261027.md`.
