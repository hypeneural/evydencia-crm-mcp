# Matriz de Capacidades — Fonte de Verdade (`v0.12.0`)

Este documento separa explicitamente o **Catálogo LIVE Streamable HTTP** (`src/live-gateway.mjs`, autenticado via OAuth 2.1 + Sanctum por operador) do **Catálogo MOCK Local** (`src/server.mjs`, 100% sintético com `mock: true` e `source: "fixture"`). No modo LIVE, `crm_capacidades` publica exclusivamente as ferramentas reais do gateway Live — preservando todas as **29 ferramentas `v0.12.0`** (`legacy_v012_tools_preserved_count: 29`) mais a ferramenta desacoplada opcional de card visual (`crm_renderizar_card_visual`, totalizando **30 ferramentas ativas** quando o OAuth da Z-API está autorizado).

---

## 1. Catálogo LIVE (`src/live-gateway.mjs`)

| Domínio / Pergunta | Ferramenta | `LIVE_READ_ONLY_OAUTH` | `LIVE_OPERATOR_FULL_OAUTH` | Fonte Canônica | Filtros / Paginação / Histórico |
|---|---|---|---|---|---|
| Inventário, `build_commit` e telemetria real | `crm_capacidades` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | Gateway Local (`BUILD_INFO` + `performance_telemetry`) | Não / Não / Não |
| Saúde pública do CRM | `crm_status` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | `GET /health/live` | Não / Não / Não |
| Catálogo e disponibilidade pública | `crm_campanha_publica`, `crm_horarios_publicos` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | `/api/public/v1/agenda/*` | Sim / Não / Não |
| Operador autenticado e abilities | `crm_conexao_privada` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | `GET /api/v1/extension/bootstrap` | Não / Não / Não |
| Resumo cadastral e elegibilidade Natal | `crm_cliente_resumo` | `LIVE_ACTIVE` (sem PII sensível) | `LIVE_ACTIVE` (Forense + `/consultar`) | `crm-forensic-bridge.php` + Extension API | Sim / Não / Sim |
| Reconstrução completa do cliente (360) | `crm_cliente_360` | `LIVE_ACTIVE` (sem PII de menores) | `LIVE_ACTIVE` (Forense + Avatar WebP + Auditoria) | `crm-forensic-bridge.php` + Extension API | Sim / Sim / Sim |
| Estatísticas e operação de Natal (`2021–2026`, + `kpi_minimal`) | `crm_estatisticas_natal` | `LIVE_ACTIVE` (se Direct Read ativo) | `LIVE_ACTIVE` | `crm-natal-bridge.php` (`NatalForensicStatisticsService` + `NatalValidOrdersQuery`) | Sim (`perfil_resposta`, `secoes`, `data_corte_mm_dd`, `nivel_detalhe`) / Sim / Sim |
| Demografia, bebês, filhos, parentesco e anomalias de participantes | `crm_natal_participantes_estatisticas` | `LIVE_ACTIVE` (agregados) | `LIVE_ACTIVE` (agregados + anomalias + lista opcional) | `crm-natal-bridge.php` (`mode: natal.participants_stats`) | Sim (`ano`, `secoes`) / Sim / Sim (`2024–2026`) |
| Busca global e filtrada de pedidos | `crm_pedidos_buscar` | `LIVE_ACTIVE` (projeção reduzida) | `LIVE_ACTIVE` (Forense completo) | `crm-forensic-bridge.php` (`orders.search`) | Sim / Sim / Sim |
| Auditoria de pedido por UUID ou ID numérico | `crm_pedido_detalhe` | `LIVE_ACTIVE` (projeção reduzida) | `LIVE_ACTIVE` (Parcelas, Bills, Status, Calendar, Avatar WebP, Personalização) | `crm-forensic-bridge.php` (`orders.detail`) | Sim / Não / Sim |
| Busca de clientes e leads (inclusive 0 pedidos) | `crm_clientes_buscar` | `NOT_AVAILABLE` | `LIVE_ACTIVE` | `crm-forensic-bridge.php` (`customers.search`) | Sim / Sim / Não |
| Card Visual interativo ChatGPT Web (MCP App) | `crm_renderizar_card_visual` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (`ui://evydencia/crm-visual-card-v1.html`) | `mcp-ui-cards.mjs` + `crm-forensic-bridge.php` | Sim (`tipo`, `order_id`, `customer_uuid`, etc.) / Não / Sim |
| Relatórios auxiliares legados | `crm_relatorio_itens_vendidos`, `crm_relatorio_natal_sem_participantes`, `crm_relatorio_clientes_natal` | `LIVE_ACTIVE` (se Direct Read ativo) | `LIVE_ACTIVE` | `/api/reports/*` | Sim / Sim / Parcial |
| Prévia da proposta de Natal 2026 | `crm_previa_proposta_natal` | `NOT_AVAILABLE` | `LIVE_ACTIVE` | `POST /api/v1/extension/proposals/preview` | Sim / Não / Não |
| Disparo / agendamento oficial da proposta Natal 2026 | `crm_enviar_proposta_natal` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (**exige `confirmado_pelo_operador: true`**) | `POST /api/v1/extension/proposals/schedule` (`X-Idempotency-Key`) | Não / Não / Não |
| Diagnóstico em tempo real de instância Z-API | `zapi_instancia_diagnostico` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (somente leitura GET) | `zapi-instance-diagnostics.mjs` (`https://api.z-api.io`) | Sim (`escopo`, `nivel_detalhe`) / Não / Não |
| Histórico de conexão e quedas Z-API | `zapi_instancia_historico` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (somente leitura) | Webhooks CRM (`ConnectedCallback` / `DisconnectedCallback`) + Poll Log | Sim / Sim / Sim |
| Estado OAuth do MCP oficial Z-API | `zapi_status_conexao` | `NOT_AVAILABLE` | `LIVE_ACTIVE` | `zapi-mcp-auth.mjs` / `zapi-mcp-client.mjs` | Não / Não / Não |
| Mensagens e grupos oficiais WhatsApp Z-API (9 tools) | `zapi_send_text`, `zapi_send_image`, `zapi_send_video`, `zapi_group_create`, `zapi_group_add_participant`, `zapi_group_remove_participant`, `zapi_group_add_admin`, `zapi_group_remove_admin`, `zapi_group_metadata` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (quando `zapi_oauth_status === "authorized"`) | Servidor oficial `https://mcp.z-api.io/mcp` (`fromJsonSchema` preservado) | Conforme schema oficial Z-API |

---

## 2. Garantias Semânticas, Financeiras, UI e Performance (`v0.12.0`)

1. **Rota Rápida (`perfil_resposta="kpi_minimal"`) e Cache Single-Flight:**
   - Perguntas simples de vendas/recebidos/metas de Natal 2026 retornam em `<5 KB` com `integrity_checks`, `data_status`, `loaded_sections: ["resumo"]` e metas base (`R$ 300.000,00`) vs ampliada (`R$ 400.000,00`, `40000000` centavos).
   - O proxy somente-leitura do Redis (`mcp_readonly_proxy`) opera sem closure estática inválida, combinado com cache single-flight + TTL curto (`15s`) e telemetria real (`gateway_ms`, `php_ms`, `sql_count`, `sql_ms`, `cache_hit`, `response_bytes`, `p50`, `p95`, `error_rate`).
2. **Reconciliação Financeira Auditável (`financial_aging_vs_canonical` & `receipts_economic_breakdown_2026`):**
   - Explica determinística e matematicamente a divergência entre `getFinancialAgingData()` (que soma valor de face `orders_installments.total` em parcelas com `payment_at`) e o caixa canônico (`orders_installments.payment_total`): ex.: `+R$ 1.470,00` de sobreavaliação por face em entradas parciais/divididas e `-R$ 240,00` de subavaliação de acréscimo (`increase`), reconciliando exatamente o delta líquido de `+R$ 1.230,00`.
   - Separa `economic_nature` (`non_cash_barter` para `Permuta` vs `monetary_receipt`), `cash_effect` e `payment_rail` (`debit_card` para `Stone Débito`, nunca confundido com crédito).
3. **Semântica Honesta de Horário de Compra e Escopo Demográfico:**
   - `purchase_timing_semantics` explicita `basis: "order_created_at"`, `confirmed_sale_time_available: false` e `ads_roas_available: false`.
   - `crm_natal_participantes_estatisticas(ano="todos")` explicita `primary_population_year: 2026` e `historical_comparison_years: [2024, 2025, 2026]`.
4. **Card Visual Desacoplado (`MCP Apps`) e 4 Estados Honestos de Avatar:**
   - `ui://evydencia/crm-visual-card-v1.html` (`mimeType: "text/html;profile=mcp-app"`, CSP restrita a `https://evydencia.com` e `https://pps.whatsapp.net`) é vinculado apenas a `crm_renderizar_card_visual`, mantendo todas as 29 ferramentas analíticas/operacionais em JSON puro.
   - Distingue 4 estados explícitos de avatar: `url_validated_pending_widget_load` (HTTP 200 + WebP válido no servidor ≠ imagem exibida), `image_loaded` (confirmado exclusivamente no `onload` do `<img>`), `image_blocked_or_error` (`onerror` de sandbox/rede ou HTTP restrito) e `initials_fallback` (sem foto cadastrada).

---

## 3. Catálogo MOCK Demonstrativo (`src/server.mjs` / `src/capabilities.mjs`)

Mantido intacto para desenvolvimento offline e `npm run conversation:smoke` (`EVYD_MOCK_MODE=1`), onde todas as respostas carregam `mock: true` e `source: "fixture"` e nenhuma chamada de rede ou escrita real existe.
