# Evydência CRM MCP — Instruções Operacionais (`v0.12.0` LIVE)

## Estado Atual da Branch `main` e Produção
- **Versão LIVE:** `0.12.0` (PRs #7, #8 e #9 já reconciliadas e integradas em `main`).
- **Catálogo LIVE:** **30 ferramentas ativas** (`29` originais preservadas + `crm_renderizar_card_visual` desacoplada).
- **MCP Apps UI:** `ui://evydencia/crm-visual-card-v2.html` (recurso principal de Pedido e Cliente 360) + `ui://evydencia/crm-visual-card-v1.html` (fallback temporário de compatibilidade/rollback).
- **Topologia de Deploy na VPS (`185.241.151.207`):** serviço `systemd` nativo `evydencia-crm-mcp-live.service` em `/opt/evydencia-mcp/app` (`User=evydmcp`, Node 22 em `/opt/evydencia-mcp/.node22/bin/node`, `EnvironmentFile=/srv/secrets/evydencia-crm-mcp/gateway.env`, proxy reverso Caddy -> `https://mcp-crm.etijucas.com.br/mcp`). Os artefatos em `deploy/gateway/` são referência offline validada por `npm run vps:preflight`.

## Regras Inegociáveis
1. **Escopo estrito:** altere somente `hypeneural/evydencia-crm-mcp`. O CRM Laravel (`hypeneural/evydencia-crm` em `/var/www/evydencia/current`) é referência canônica **somente leitura** — proibido modificar código, banco, migrations, filas ou webhooks do CRM.
2. **Zero disparos reais em testes/smoke:** nunca invoque `zapi_send_*`, `zapi_group_*` de escrita nem `crm_enviar_proposta_natal` durante testes ou smoke checks.
3. **Zero PII e zero segredos:** nunca registre tokens (Sanctum, OAuth, Z-API, chaves internas) nem dados pessoais reais (nomes, telefones, CPFs, e-mails, datas de nascimento, participantes) em fixtures, commits, logs ou `argv` de subprocessos (`STDIN` obrigatório nos bridges PHP).
4. **Isolamento por operador:** `SHARED_BRIDGE_READ_CACHE` deve sempre isolar chaves via HMAC por `operatorId` + `authScope` + `upstreamGrantHash` + `projectionVersion` + `queryHash`. Ferramentas de escrita exigem escopo OAuth explícito (`crm.proposal.write`, `zapi.message.send`, `zapi.group.manage`) + validação server-side das abilities do operador.
5. **Contratos financeiros e visuais honestos:**
   - Centavos inteiros são a única fonte primária; valores ausentes permanecem `null` (`centsOrNull`) e exibem `"Não informado"` (`data_status = "unavailable"`), nunca `0`.
   - Cliente 360 usa exclusivamente os KPIs canônicos lifetime (`kpis.lifetime_contracted_valid_cents`, `kpis.lifetime_received_cents`, `kpis.lifetime_remaining_valid_cents`), nunca soma da página de `orders`.
   - Natal 2026 usa semântica de 3 estados (`purchased = true | false | null`, exibindo `"Não verificado"` quando `null`).
   - Google Calendar prioriza `order_session.is_synced === true` mesmo se `sync_enabled === false`, e reporta `unknown` quando omitido.
   - HTTP 200 / WebP válido (`url_validated_pending_widget_load`) prova apenas asset no servidor; somente `onload` no iframe confirma `image_loaded`.
6. **Isolamento MOCK vs LIVE:** não altere o comportamento sintético do modo MOCK (`src/server.mjs`, `EVYD_MOCK_MODE=1`) nem adicione rotas de escrita em `src/core.mjs`.

## Gates de Validação Local (Executar Sem Loops)
1. Testes cirúrgicos afetados:
   - `node --test test/mcp-ui-cards.test.mjs`
   - `node --test test/order-contracts.test.mjs`
   - `node --test test/forensic-crm-audit.test.mjs`
   - `node --test test/live-gateway.test.mjs`
2. Gate completo antes de commit/deploy (uma execução limpa por candidato):
   - `npm ci`
   - `npm run validate:local`
   - `npm run gateway:bench -- --calls=200 --concurrency=4`

## Documentos de Referência
- `docs/CAPABILITY_MATRIX.md`: matriz de capacidades LIVE (`30` tools), escopos OAuth, recursos UI (`v2` + fallback `v1`) e modo MOCK.
- `docs/AUDITORIA_OPENAI_CHATGPT_MCP_V012_20261025.md`: auditoria forense e reconciliação financeira (`financial_aging_vs_canonical`, metas `R$ 300k` vs `R$ 400k`, `purchase_timing_semantics`).
- `docs/FORENSE_LEGADO_NATAL_20261025.md`: invariantes históricos de Natal (`2021=478`, `2022=374`, `2023=384`, `2024=397`, `2025=388`).
- `docs/CONTRATOS_CRM.md`: contratos das rotas públicas e de extensão do CRM.
