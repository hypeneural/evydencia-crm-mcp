# PROMPT CANÔNICO — ANTIGRAVITY ETAPA 3 (MCP × GAMEPLAY)
**Ambiente:** Avell Windows 11; worktrees já existentes. **Meta imediata:** fechar regressões e preparar preflight imutável para futuro corte do sidecar, sem afetar produção.

## Contexto de abertura — leia antes de executar
Dois sistemas independentes são integrados: `evydencia-crm-mcp` fornece no ChatGPT `crm_gameplay_links` e `crm_gameplay_auditoria`, usando dados de pedidos Natal 2026 do CRM; `gameplay` fornece metadados publicados/STAGED por UUID via sidecar privado na Media VPS. A release do MCP tem **35 ferramentas ativas**, incluindo OAuth, Z-API e PrintServer, que não podem ser perdidas. Separar publicação de foto, link válido, browser e entrega via WhatsApp: uma consulta de metadados NÃO comprova nenhum dos últimos três.

**Branches corretas:** MCP `integration/live-35tools-gameplay-reconciled-20261027` [PR #14] baseada em `release/live-35tools-gameplay-printserver`; Gameplay `feat/gameplay-status-read-api-20261026` [PR #43] baseada na dependência #30. Não fazer merge com `main`. Ler primeiro `docs/AUDITORIA_FORENSE_ETAPA3_MCP_GAMEPLAY_20261027.md`.

**Correções já feitas pelo ChatGPT nesta etapa:**
- Gameplay `deploy/vps/docker/compose.private-audit.yaml`: `catalog-reader` ganhou `command: ['node','server/main.js']` (era omitido; comando do outro serviço não era herdado).
- Gameplay `tools/deploy/staging-boundaries.test.mjs`: teste de não-regressão Compose.
- MCP `scripts/antigravity/verify-private-gameplay-reader.mjs`: 409 exige JSON com `CUSTOMER_LINKS_NOT_ENABLED`; teste adicional `gameplay-integration-release.test.mjs`.
- Documentação de deploy e rollback em ambas as PRs. Portanto, HEADs e CI anteriores deixam de ser prova para a NOVA revisão.

## EXECUTE LOCAL AGORA — sem testes infinitos
1. Nos worktrees Avell existentes, `git fetch --prune`, `git status --short`, `git rev-parse HEAD`, `git rev-parse @{upstream}`. **Atenção:** recibo citado como `9dce0bee...` não bate com `9dce0beb...` retornado pelo GitHub na auditoria. Não adivinhar; registrar SHA real com `gh pr view 14 -R hypeneural/evydencia-crm-mcp --json headRefOid`. Atualizar com fast-forward somente se limpo e ancestral confirmado. Sem reset, force, rebase ou merge.
2. No MCP PR #14, execute uma vez `npm ci`, `node --test test/gameplay-links.test.mjs test/gameplay-integration-release.test.mjs`, `npm run gateway:test`, `npm test`, `npm run check`. Testar especialmente o 409 JSON canônico, 401, 404 e zero leaks. Contar as 35 tools contra o inventário LIVE: `crm_renderizar_card_visual`, três PrintServer, duas Gameplay, ferramentas Z-API e propostas; duas ferramentas de baixa/malotes seguem NOT_AVAILABLE. Sem chamadas de escrita.
3. No Gameplay PR #43, executar `pnpm install --frozen-lockfile`, `pnpm exec vitest run tools/deploy/staging-boundaries.test.mjs apps/catalog-server/src/CatalogServer.test.ts apps/catalog-server/src/publication/GameplayStatusLookup.test.ts apps/catalog-server/src/publication/GameplayStatusLookup.integration.test.ts`, `pnpm check`, `pnpm release:staging`, `pnpm release:verify`. Confirmar artefato `.release/vps/server/main.js` com release manifest e SHA novo, `readiness.json` com flags false. Sem normalizar o Git inteiro; preservar LF.
4. Conferir CI das PRs #14 e #43 no **HEAD exato** por `gh pr checks`, não no commit pré-correção. Se o novo CI estiver pendente, reportar PENDING (não GO). Corrigir falha de lint/teste determinística sem alterar fora do escopo.

## PREPARAR CORTE FUTURO, NÃO IMPLANTAR NESTA EXECUÇÃO
5. Com acesso já autorizado, somente SSH de diagnóstico read-only à Media VPS: confirmar `catalog-reader` atual, SHA/binário efetivo, `Cmd`/entrypoint, mounts, diretório release anterior, loopback `127.0.0.1:4182`, público `/internal/*` bloqueado. Documentar que build `37190a8` reportado ainda servia GET `/` HTTP 200: **NO-GO**. Não tocar em segredos (nem imprimi-los), usuário real, banco, Caddy ou containers.
6. No checkout local, conferir contrato Compose combinado por dry-run `docker compose -f deploy/vps/docker/compose.persistence.yaml -f deploy/vps/docker/compose.private-audit.yaml --profile audit-private config --quiet` **somente com variáveis de paths autorizadas e sintéticas**, sem secrets reais. Como a topologia da VPS pode diferir, antes do corte real o operador deve repetir pelo `stackctl` oficial e confrontar a configuração renderizada real de mounts e comando; nenhum `compose up` nesta fase.
7. Criar checklist de **backup + restore isolado** do SQLite/WAL, sem rodar a função de restore contra LIVE. Checar presença de -wal/-shm e teste `PRAGMA integrity_check` em cópia restaurada, sem copiar UUIDs/tokens/PII para relatório. Registrar que zero bytes de WAL ou backup pré-existente não basta.
8. Preparar plano de implantação de **somente `catalog-reader`** usando release nova imutável, `stackctl` e operação equivalente a `compose up -d --no-deps catalog-reader` com atualização de config. `docker compose restart` não aplica novo command/mount; NÃO utilizar `docker stop/rm` solto. Rollback: artefato anterior e wrapper previamente validados; se versão anterior expõe páginas públicas, considerar reader desabilitado como contenção. Não executar nesta fase.
9. Planejar smoke APÓS autorização de corte: health 200; `GET /`, `GET /demo/fotos` e `GET/HEAD /s/:token` sintético = 404; POST sem Bearer = 401; POST autenticado com UUID reservado = 200 `not_found`, sem URL; single `include_links=true` = 409 JSON canônico. Rodar `npm run gameplay:sidecar:verify` na própria VPS **ou em túnel privado loopback aprovado**. `SIDE_NETWORK_UNAVAILABLE` no Avell sem túnel é esperado, não serve como GO.
10. Segundo momento de teste no ChatGPT é **somente leitura** após o sidecar passar: `crm_capacidades(verificar_gameplay=true)` (esperado reachability privado, mas dataset_proven=false) e `crm_gameplay_auditoria` agregada, sem dados pessoais. Cliente real/browser/links/media só em ticket piloto consentido com verificação Safari/Chrome, WebP e grants por sessão. Nunca disparar Z-API nem imprimir nesse smoke.

## ENTREGAR
Registrar em `docs/RECIBO_ANTIGRAVITY_ETAPA3_MCP_GAMEPLAY_20261027.md` na PR #14:
- SHAs reais, worktrees, CI HEADs, comandos/contagens;
- Diff das 35 tools com nomes e estados corretos;
- Build/Compose/rollback preflight, o que foi comprovado vs não comprovado;
- GO local (se novos testes verdes), NO-GO sidecar até deploy isolado + 200/401/404/409 reais, NO-GO fotos/jogos/WhatsApp;
- próximo corte técnico proposto e procedimento de reversão.

**Não alterar produção, GitHub main, releases operacionais, Caddy, PrintServer, CRM Laravel, banco/secret, readiness, WhatsApp nem dispositivos físicos. Não executar merge ou deploy sem autorização específica. Não repetir suíte completa se já aprovada para SHA imutável.**
