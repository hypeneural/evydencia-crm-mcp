> **PROTOCOLO DE AGENTE LOCAL LIMITADO — 27/10/2026.** Para o agente de validação local, a ÚNICA entrada autorizada é [docs/VALIDACAO_LOCAL_AGENTE_20261027.md](docs/VALIDACAO_LOCAL_AGENTE_20261027.md), seguida de `npm run agent:validate:local`. Trabalhar somente nos arquivos deste checkout e em dados sintéticos. Não descobrir ou ler outros diretórios de projetos, não executar SSH/serviços remotos, não consultar sistemas reais, não usar credenciais, não alterar configuração de produção, não efetuar deploy/merge/branch reset, não emitir trabalhos de impressão nem enviar mensagens. Outras seções históricas deste documento são **informação para mantenedores**, não tarefas para o agente local. Alterações permitidas apenas mediante causa reproduzida na branch atual; publique somente commits da PR existente, sem executar release.

# Evydência CRM MCP — Instruções Operacionais (`v0.12.0` LIVE)

## Estado Atual da Branch `main` e Produção
- **Versão LIVE:** `0.12.0` (PRs #7, #8 e #9 já reconciliadas e integradas em `main`).
- **Catálogo LIVE:** **30 ferramentas ativas** (`29` originais preservadas + `crm_renderizar_card_visual` desacoplada).
- **MCP Apps UI:** `ui://evydencia/crm-visual-card-v2.html` (recurso principal de Pedido e Cliente 360) + `ui://evydencia/crm-visual-card-v1.html` (fallback temporário de compatibilidade/rollback).
- **Topologia de Deploy na VPS (`185.241.151.207`):** serviço `systemd` nativo `evydencia-crm-mcp-live.service` em `/opt/evydencia-mcp/app` (`User=evydmcp`, Node 22 em `/opt/evydencia-mcp/.node22/bin/node`, `EnvironmentFile=/srv/secrets/evydencia-crm-mcp/gateway.env`, proxy reverso Caddy -> `https://mcp-crm.etijucas.com.br/mcp`). Os artefatos em `deploy/gateway/` são referência offline validada por `npm run vps:preflight`.

## Extensão PrintServer (PR #12, opt-in)
- O catálogo original da `main` tem 30 ferramentas (29 originais + 1 card visual). Na PR #12/produção que a publicou, o catálogo do operador autorizado tem **33** (3 ferramentas PrintServer adicionais); conferir o SHA implantado com `crm_capacidades`. O item `legacy_v012_tools_preserved_count` exclui também as 3 novas ferramentas.
- As chamadas da versão atual para `crm_capacidades` também retornam `oauth_authorization` com **escopos efetivamente concedidos** — não confundir `scopes_supported` do manifesto com `granted_scopes`.
- A única exceção ao lookup de pedido na **consulta de status** da impressão é `order_id=999999`, fixture sintética sem pedido comercial. Exigir escopo `print.jobs.write`, operador em allowlist e reconciliação de `job.order_id`; para qualquer outro ID, consulta CRM obrigatória.
- Para auditoria sem efeitos colaterais: `npm run printserver:smoke:read` na VPS autenticada, `crm_previa_malotes_retirada` em pedidos aprovados e `crm_consultar_impressao_etiqueta` do job sintético; nunca gerar trabalho novo em smoke.
- Referência para Antigravity: `docs/AUDITORIA_CHATGPT_LIVE_PRINTSERVER_20261026.md`. PRs podem estar implantadas a partir de branch mesmo **Draft**; reconciliar o SHA remoto antes de cogitar merge/deploy. Não tocar no PrintServer Windows ou CRM durante esse hotfix.

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
