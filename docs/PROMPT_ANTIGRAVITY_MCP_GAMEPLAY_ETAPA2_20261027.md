# Prompt operacional — Antigravity Etapa 2 — Avell / MCP × Gameplay

**Objetivo:** validar a nova integração em branch neutra (sem deploy), fechar CI e preparar o futuro teste REAL de leitura no ChatGPT. **Não** prometer GO produção nem solicitar confirmações que o dossiê já responde.

## Premissas auditadas pelo ChatGPT
- Gameplay PR #43, SHA-fonte `c7526bf`; relatado 604 testes locais PASS; Media VPS ainda informada com build `37190a8`. 200 health + 401 sem bearer **não** provam hardening, acesso válido ou links reais.
- MCP release operacional `release/live-35tools-gameplay-printserver` (base da branch de integração). PR #11 baseada em main **não pode substituir** a release: preservar OAuth, Z-API, PrintServer e malotes.
- Branch já publicada por ChatGPT: `integration/live-35tools-gameplay-reconciled-20261027`. Contém o fallback de 409, projeção de hub/galeria, schema MCP, proteção de coexistência e smoke sintético de sidecar.
- Guia canônico: `docs/START_HERE_MCP_GAMEPLAY_20261027.md`.

## Fazer AGORA no Avell (sem loops, não recriar pastas)
1. Abrir os dois worktrees existentes. `git fetch --prune`, `git status --short`, registrar `git rev-parse HEAD` e branch. Não sobrescrever modificações locais.
2. No MCP, usar um worktree **novo e isolado apenas se necessário** para `origin/integration/live-35tools-gameplay-reconciled-20261027`; jamais force/reset/rebase/mergear a branch de release. Rodar:
   - `npm ci`
   - `node --test test/gameplay-links.test.mjs test/gameplay-integration-release.test.mjs test/gameplay-read-client.test.mjs`
   - `npm run gateway:test`
   - `npm test`
   - `npm run check`
3. Provar inventário de ferramentas em processo sintético local: `crm_gameplay_links`, `crm_gameplay_auditoria`, três ferramentas PrintServer, Z-API, proposta, OAuth, malotes. Validar `OUT_GAMEPLAY_LINKS` com `unavailable_http_409` sem URL fabricada. Não executar envio, impressão ou writes.
4. No Gameplay PR #43: `pnpm install --frozen-lockfile`; `pnpm exec vitest run apps/catalog-server/src/CatalogServer.test.ts apps/catalog-server/src/publication/GameplayStatusLookup.test.ts apps/catalog-server/src/publication/GameplayStatusLookup.integration.test.ts`; `pnpm check`; `pnpm release:staging`; `pnpm release:verify`. Apenas 1 repetição se corrigir falha determinística; preservar LF.
5. Verificar CI **nos HEADs novos**, incluindo PR Draft da branch de integração MCP. Comparar `git diff --name-status origin/release/live-35tools-gameplay-printserver...HEAD`; nenhuma remoção de PrintServer, Z-API, OAuth, status de malotes ou scripts legados.

## Preparar o TESTE REAL (NÃO executar deploy nesta fase)
6. Ler o runbook no guia. Pelo SSH administrativo **somente leitura**, confirmar serviço/processo/contêiner efetivo e SHAs, `127.0.0.1:4182`, status da API, presença do reader, nenhuma rota `/internal/*` pública, e origem de SQLite. Não coletar valores de segredo, dados pessoais ou tokens. Se 404 de `/s/*` não estiver provado no PROCESSO VIVO, registrar **NO-GO sidecar**, pois `37190a8` é build anterior ao `c7526bf`.
7. O script `npm run gameplay:sidecar:verify` aceita SOMENTE loopback. Sem credencial privativa ele retorna `INCOMPLETE_NO_AUTHORIZED_READER_SECRET` com exit 2 — isso não é falha do script, nem prova de GET autorizado. **Não extrair/copiar credencial para Avell.** A leitura autenticada positiva é tarefa futura do operador via segredo já aprovisionado na VPS.
8. Preparar checklist de corte futuro do **catalog-reader apenas**, baseado em artefato imutável SHA e wrapper `stackctl`, com rollback; backup online + restore SQLite/WAL documentado e testado antes do corte. Nenhum `docker compose up` geral, alteração de Caddy público, `readiness.json`, PrintServer/CRM/Z-API, upload ou WhatsApp.

## Recibo final (enviar para ChatGPT)
Um único arquivo `docs/RECIBO_LOCAL_MCP_GAMEPLAY_ETAPA2_20261027.md` na branch de integração MCP, sem segredos/PII, com:
- HEAD/branch e estado dos worktrees;
- resultado de cada teste e CI no HEAD;
- lista de ferramentas preservadas e de alterações da branch;
- status do sidecar realmente em execução, build SHA, `200/401/404/409` e POST autorizado: `PROVADO | NÃO_PROVADO`;
- presença/identidade de dataset, WAV/SQLite WAL restore, WebP, HTTP público, browser: `PROVADO | NÃO_PROVADO`;
- GO código local, GO condicional reconciliação, NO-GO produção quando faltarem provas;
- uma próxima ação técnica objetiva + rollback.

**Proibições absolutas:** não mergear main/release automaticamente, não publicar fotos, não liberar links reais, não disparar WhatsApp/Z-API, não imprimir, não alterar status CRM, não copiar segredos, não modificar VPS sem aprovação separada. Não retornar “100% operacional” somente pelo CI verde.
