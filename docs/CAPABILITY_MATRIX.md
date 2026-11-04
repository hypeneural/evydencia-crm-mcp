# Matriz de Capacidades — Fonte de Verdade (`v0.12.0`)

Este documento separa explicitamente o **Catálogo LIVE Streamable HTTP** (`src/live-gateway.mjs`, autenticado via OAuth 2.1 + Sanctum por operador) do **Catálogo MOCK Local** (`src/server.mjs`, 100% sintético com `mock: true` e `source: "fixture"`). No modo LIVE, `crm_capacidades` publica exclusivamente as ferramentas reais do gateway Live — preservando todas as **29 ferramentas `v0.12.0`** (`legacy_v012_tools_preserved_count: 29`) mais a ferramenta desacoplada opcional de card visual (`crm_renderizar_card_visual`, totalizando **30 ferramentas ativas** quando o OAuth da Z-API está autorizado).

---

## 1. Catálogo LIVE (`src/live-gateway.mjs`) e Escopos OAuth

Escopos OAuth suportados e validados no servidor (`_meta.securitySchemes` + enforcement por handler):
- `crm.read`: leitura autenticada do CRM, Cliente 360, relatórios analíticos, diagnósticos Z-API e card visual.
- `crm.proposal.write`: disparo idempotente de proposta Natal 2026 (`crm_enviar_proposta_natal`), concedido apenas quando o token Sanctum do operador possui `extension:proposal-write` (e `EVYD_STRICT_READONLY_TOKEN` está desativado).
- `zapi.message.send`: envio explícito de mensagens avulsas WhatsApp via Z-API MCP (`zapi_send_text`, `zapi_send_image`, `zapi_send_video`).
- `zapi.group.manage`: gestão de grupos WhatsApp via Z-API MCP (`zapi_group_create`, `zapi_group_add_participant`, `zapi_group_remove_participant`, `zapi_group_add_admin`, `zapi_group_remove_admin`).

| Domínio / Pergunta | Ferramenta | Escopos OAuth (`securitySchemes`) | `LIVE_READ_ONLY_OAUTH` | `LIVE_OPERATOR_FULL_OAUTH` | Fonte Canônica | Filtros / Paginação / Histórico |
|---|---|---|---|---|---|---|
| Inventário, `build_commit` e telemetria real | `crm_capacidades` | `crm.read` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | Gateway Local (`BUILD_INFO` + `performance_telemetry`) | Não / Não / Não |
| Saúde pública do CRM | `crm_status` | `crm.read` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | `GET /health/live` | Não / Não / Não |
| Catálogo e disponibilidade pública (slugs `entao-e-natal`, `ho-ho-ho`, `boas-festas`) | `crm_campanha_publica`, `crm_horarios_publicos` | `crm.read` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | `/api/public/v1/agenda/*` (404 mapeado para `NOT_FOUND` explícito) | Sim / Não / Não |
| Operador autenticado e abilities | `crm_conexao_privada` | `crm.read` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | `GET /api/v1/extension/bootstrap` | Não / Não / Não |
| Resumo cadastral, homônimos seguros e elegibilidade Natal | `crm_cliente_resumo` | `crm.read` | `LIVE_ACTIVE` (sem PII sensível) | `LIVE_ACTIVE` (Forense + `/consultar`) | `crm-forensic-bridge.php` (`STDIN`) + Extension API | Sim / Não / Sim |
| Reconstrução completa do cliente (360 paginada + KPIs canônicos) | `crm_cliente_360` | `crm.read` | `LIVE_ACTIVE` (sem PII de menores) | `LIVE_ACTIVE` (Forense 3 camadas + Avatar WebP + Auditoria) | `crm-forensic-bridge.php` (`STDIN`) + Extension API | Sim / Sim / Sim |
| Estatísticas e operação de Natal (`2021–2026`, + `kpi_minimal`) | `crm_estatisticas_natal` | `crm.read` | `LIVE_ACTIVE` (se Direct Read ativo) | `LIVE_ACTIVE` | `crm-natal-bridge.php` (`STDIN`, seções desacopladas) | Sim (`perfil_resposta`, `secoes`, `data_corte_mm_dd`, `nivel_detalhe`) / Sim / Sim |
| Demografia, bebês, filhos, parentesco e anomalias de participantes | `crm_natal_participantes_estatisticas` | `crm.read` | `LIVE_ACTIVE` (agregados) | `LIVE_ACTIVE` (agregados + anomalias + lista opcional) | `crm-natal-bridge.php` (`mode: natal.participants_stats`) | Sim (`ano`, `secoes`) / Sim / Sim (`2024–2026`) |
| Busca global e filtrada de pedidos | `crm_pedidos_buscar` | `crm.read` | `LIVE_ACTIVE` (projeção reduzida) | `LIVE_ACTIVE` (Forense completo) | `crm-forensic-bridge.php` (`orders.search`) | Sim / Sim / Sim |
| Auditoria de pedido por UUID ou ID numérico | `crm_pedido_detalhe` | `crm.read` | `LIVE_ACTIVE` (projeção reduzida) | `LIVE_ACTIVE` (Parcelas, Bills, Status, Calendar, Avatar WebP, Personalização) | `crm-forensic-bridge.php` (`orders.detail`) | Sim / Não / Sim |
| Busca de clientes e leads (inclusive 0 pedidos) | `crm_clientes_buscar` | `crm.read` | `NOT_AVAILABLE` | `LIVE_ACTIVE` | `crm-forensic-bridge.php` (`customers.search`) | Sim / Sim / Não |
| Card Visual interativo ChatGPT Web (MCP App v2) | `crm_renderizar_card_visual` | `crm.read` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (`ui://evydencia/crm-visual-card-v2.html` + fallback `v1`) | `mcp-ui-cards.mjs` + `crm-forensic-bridge.php` | Sim (`tipo`, `order_id`, `customer_uuid`, etc.) / Não / Sim |
| Relatórios auxiliares legados | `crm_relatorio_itens_vendidos`, `crm_relatorio_natal_sem_participantes`, `crm_relatorio_clientes_natal` | `crm.read` | `LIVE_ACTIVE` (se Direct Read ativo) | `LIVE_ACTIVE` | `/api/reports/*` | Sim / Sim / Parcial |
| Prévia da proposta de Natal 2026 | `crm_previa_proposta_natal` | `crm.read` (`extension:proposal-read`) | `NOT_AVAILABLE` | `LIVE_ACTIVE` | `POST /api/v1/extension/proposals/preview` | Sim / Não / Não |
| Disparo / agendamento oficial da proposta Natal 2026 | `crm_enviar_proposta_natal` | `crm.read`, `crm.proposal.write` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (**exige `confirmado_pelo_operador: true` + `extension:proposal-write`**) | `POST /api/v1/extension/proposals/schedule` (`X-Idempotency-Key`) | Não / Não / Não |
| Conciliação de solicitação Natal | `crm_consultar_solicitacao_proposta_natal` | `crm.read` (`extension:proposal-read`) | `NOT_AVAILABLE` | `LIVE_ACTIVE` | `GET /api/v1/extension/proposals/requests/{requestId}` | Não / Não / Não |
| Diagnóstico em tempo real de instância Z-API | `zapi_instancia_diagnostico` | `crm.read` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (somente leitura GET) | `zapi-instance-diagnostics.mjs` (`https://api.z-api.io`) | Sim (`escopo`, `nivel_detalhe`) / Não / Não |
| Histórico de conexão e quedas Z-API | `zapi_instancia_historico` | `crm.read` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (somente leitura) | Webhooks CRM (`ConnectedCallback` / `DisconnectedCallback`) + Poll Log | Sim / Sim / Sim |
| Estado OAuth do MCP oficial Z-API | `zapi_status_conexao` | `crm.read` | `NOT_AVAILABLE` | `LIVE_ACTIVE` | `zapi-mcp-auth.mjs` / `zapi-mcp-client.mjs` | Não / Não / Não |
| Consulta de metadados de grupo Z-API (1 tool leitura) | `zapi_group_metadata` | `crm.read` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (quando `zapi_oauth_status === "authorized"`) | Servidor oficial `https://mcp.z-api.io/mcp` (`fromJsonSchema`) | Conforme schema oficial Z-API |
| Envio de mensagens WhatsApp Z-API (3 tools escrita) | `zapi_send_text`, `zapi_send_image`, `zapi_send_video` | `crm.read`, `zapi.message.send` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (quando `zapi_oauth_status === "authorized"`) | Servidor oficial `https://mcp.z-api.io/mcp` (`fromJsonSchema`) | Conforme schema oficial Z-API |
| Gestão de grupos WhatsApp Z-API (5 tools escrita) | `zapi_group_create`, `zapi_group_add_participant`, `zapi_group_remove_participant`, `zapi_group_add_admin`, `zapi_group_remove_admin` | `crm.read`, `zapi.group.manage` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (quando `zapi_oauth_status === "authorized"`) | Servidor oficial `https://mcp.z-api.io/mcp` (`fromJsonSchema`) | Conforme schema oficial Z-API |

---

## 2. Garantias Semânticas, Financeiras, Isolamento, UI v2 e Performance (`v0.12.0`)

1. **Rota Rápida (`perfil_resposta="kpi_minimal"`), Seções Desacopladas e Cache Isolado por Operador:**
   - Perguntas simples de vendas/recebidos/metas de Natal 2026 retornam em `<= 5 KB` com `integrity_checks`, `data_status`, `loaded_sections: ["resumo"]` e metas base (`R$ 300.000,00`) vs ampliada (`R$ 400.000,00`, `40000000` centavos).
   - `secoes: ["resumo"]` carrega apenas os KPIs correntes de 2026 sem hidratar a série multi-ano 2021–2025; `financeiro_caixa` reutiliza uma única conciliação de caixa sem recomputar `getFinancialSituation2026` / `2025`.
   - `SHARED_BRIDGE_READ_CACHE` isola chaves por HMAC-SHA256 (`operatorId`, `authScope`, `upstreamGrantHash`, `projectionVersion`, `queryHash`), impedindo vazamento em memória entre operadores distintos; entradas para PHP trafegam exclusivamente por `STDIN` com limite de tamanho.
2. **Reconciliação Financeira Auditável e `centsOrNull`:**
   - Valores financeiros em centavos inteiros são a única fonte primária; campos ausentes/desconhecidos permanecem `null` (`centsOrNull`) e são exibidos como `"Não informado"` (`data_status = "unavailable"`), nunca `0`.
   - `financial_aging_vs_canonical` reconcilia determinísticamente `orders_installments.total` vs `orders_installments.payment_total` (`+R$ 1.230,00`), e `receipts_economic_breakdown_2026` separa `Permuta` (`non_cash_barter`) de `Stone Débito` (`debit_card`).
3. **Resolução Segura de Homônimos e Semântica Honesta:**
   - Buscas por nome (`resolvePhoneByName`, `crm_cliente_resumo`, `crm_cliente_360`, `crm_renderizar_card_visual`) retornam `matched`, `not_found` ou `ambiguous`, jamais escolhendo arbitrariamente o primeiro homônimo.
   - `purchase_timing_semantics` explicita `basis: "order_created_at"`, `confirmed_sale_time_available: false` e `ads_roas_available: false`.
   - Invariantes históricos consolidados permanecem preservados: `2021=478`, `2022=374`, `2023=384`, `2024=397`, `2025=388`.
4. **Card Visual v2 (`MCP Apps`) com Fallback `v1` e Contratos Exatos:**
   - `ui://evydencia/crm-visual-card-v2.html` (`mimeType: "text/html;profile=mcp-app"`, CSP restrita a `https://evydencia.com` e `https://pps.whatsapp.net`) é vinculado apenas a `crm_renderizar_card_visual`, enquanto `ui://evydencia/crm-visual-card-v1.html` permanece registrado como fallback temporário.
   - **Card de Pedido v2:** exibe parcelas reais (`total_cents`, `paid_cents`, `remaining_cents`, `paid/partial/open`, sem confundir `card_split_count` com número de parcelas do pedido), bônus comprovado apenas em `campaign_bonus` / `manual_bonus_override`, Google Calendar real (`is_synced: true` preservado mesmo com `sync_enabled: false`; `unknown` quando não consultado) e `status_timeline` cronológica real.
   - **Card Cliente 360 v2:** usa estritamente os KPIs canônicos lifetime (`lifetime_contracted_valid_cents`, `lifetime_received_cents`, `lifetime_remaining_valid_cents`), status Natal 2026 em 3 estados (`purchased: true | false | null`) e 4 estados honestos de avatar (`url_validated_pending_widget_load`, `image_loaded`, `image_blocked_or_error`, `initials_fallback`) sem PII de menores.

---

## 3. Catálogo MOCK Demonstrativo (`src/server.mjs` / `src/capabilities.mjs`)

Mantido intacto para desenvolvimento offline e `npm run conversation:smoke` (`EVYD_MOCK_MODE=1`), onde todas as respostas carregam `mock: true` e `source: "fixture"` e nenhuma chamada de rede ou escrita real existe.
