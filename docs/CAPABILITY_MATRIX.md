# Matriz de Capacidades — Fonte de Verdade (`v0.10.0`)

Este documento separa explicitamente o **Catálogo LIVE Streamable HTTP** (`src/live-gateway.mjs`, autenticado via OAuth 2.1 + Sanctum por operador) do **Catálogo MOCK Local** (`src/server.mjs`, 100% sintético com `mock: true` e `source: "fixture"`). No modo LIVE, `crm_capacidades` publica exclusivamente as ferramentas reais do gateway Live — sem misturar ferramentas `MOCK_ONLY`.

---

## 1. Catálogo LIVE (`src/live-gateway.mjs`)

| Domínio / Pergunta | Ferramenta | `LIVE_READ_ONLY_OAUTH` | `LIVE_OPERATOR_FULL_OAUTH` | Fonte Canônica no CRM | Filtros / Paginação / Histórico |
|---|---|---|---|---|---|
| Inventário e `build_commit` implantado | `crm_capacidades` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | Gateway Local (`BUILD_INFO`) | Não / Não / Não |
| Saúde pública do CRM | `crm_status` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | `GET /health/live` | Não / Não / Não |
| Catálogo e disponibilidade pública | `crm_campanha_publica`, `crm_horarios_publicos` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | `/api/public/v1/agenda/*` | Sim / Não / Não |
| Operador autenticado e abilities | `crm_conexao_privada` | `LIVE_ACTIVE` | `LIVE_ACTIVE` | `GET /api/v1/extension/bootstrap` | Não / Não / Não |
| Resumo cadastral e elegibilidade Natal | `crm_cliente_resumo` | `LIVE_ACTIVE` (sem PII sensível) | `LIVE_ACTIVE` (Forense + `/consultar`) | `crm-forensic-bridge.php` + Extension API | Sim / Não / Sim |
| Reconstrução completa do cliente (360) | `crm_cliente_360` | `LIVE_ACTIVE` (sem PII de menores) | `LIVE_ACTIVE` (Forense + Avatar WebP + Auditoria) | `crm-forensic-bridge.php` + Extension API | Sim / Sim / Sim |
| Estatísticas e operação de Natal (`2021–2026`, abas A–F) | `crm_estatisticas_natal` | `LIVE_ACTIVE` (se Direct Read ativo) | `LIVE_ACTIVE` | `crm-natal-bridge.php` (`NatalForensicStatisticsService` + `NatalValidOrdersQuery`) | Sim (`secoes`, `data_corte_mm_dd`, `nivel_detalhe`) / Sim / Sim |
| Demografia, bebês, filhos, parentesco e anomalias de participantes | `crm_natal_participantes_estatisticas` | `LIVE_ACTIVE` (agregados) | `LIVE_ACTIVE` (agregados + anomalias + lista opcional) | `crm-natal-bridge.php` (`mode: natal.participants_stats`) | Sim (`ano`, `secoes`) / Sim / Sim (`2024–2026`) |
| Busca global e filtrada de pedidos | `crm_pedidos_buscar` | `LIVE_ACTIVE` (projeção reduzida) | `LIVE_ACTIVE` (Forense completo) | `crm-forensic-bridge.php` (`orders.search`) | Sim / Sim / Sim |
| Auditoria de pedido por UUID ou ID numérico | `crm_pedido_detalhe` | `LIVE_ACTIVE` (projeção reduzida) | `LIVE_ACTIVE` (Parcelas, Bills, Status, Calendar, Avatar WebP, Personalização) | `crm-forensic-bridge.php` (`orders.detail`) | Sim / Não / Sim |
| Busca de clientes e leads (inclusive 0 pedidos) | `crm_clientes_buscar` | `NOT_AVAILABLE` | `LIVE_ACTIVE` | `crm-forensic-bridge.php` (`customers.search`) | Sim / Sim / Não |
| Relatórios auxiliares legados | `crm_relatorio_itens_vendidos`, `crm_relatorio_natal_sem_participantes`, `crm_relatorio_clientes_natal` | `LIVE_ACTIVE` (se Direct Read ativo) | `LIVE_ACTIVE` | `/api/reports/*` | Sim / Sim / Parcial |
| Prévia da proposta de Natal 2026 | `crm_previa_proposta_natal` | `NOT_AVAILABLE` | `LIVE_ACTIVE` | `POST /api/v1/extension/proposals/preview` | Sim / Não / Não |
| Disparo / agendamento oficial da proposta Natal 2026 | `crm_enviar_proposta_natal` | `NOT_AVAILABLE` | `LIVE_ACTIVE` (**exige `confirmado_pelo_operador: true`**) | `POST /api/v1/extension/proposals/schedule` (`X-Idempotency-Key`) | Não / Não / Não |

---

## 2. Garantias Semânticas e Contratos (`v0.10.0`)

1. **Economia de Contexto e `outputSchema`:** Todas as ferramentas Live declaram `outputSchema` válido (JSON Schema 2020-12), entregam dados estruturados em `structuredContent` e resumo executivo conciso sem PII em `content[0].text` (eliminando duplicação de JSON).
2. **Valores Monetários Canônicos:** Montantes são expostos simultaneamente em centavos inteiros (`*_cents`) e reais numéricos (`*_reais`), distinguindo `method_name` efetivo da parcela (ex.: `Permuta`) de `method_category_label` contábil (ex.: `Dinheiro`).
3. **Conciliação Histórica de Natal Auditada:**
   - **Temporada 2022:** `full_year_valid_orders` consolidado no banco atual (`374`) vs fotografia em `31/12/2022` (`season_end_snapshot_valid_orders = 379`, com `post_season_aborted_orders_count = 5` cancelados em 2023 sem ensaio agendado).
   - **Temporada 2024:** separação explícita entre `distinct_valid_orders` (pedidos únicos), `package_order_occurrences_sum` (pedidos com mais de um pacote distinto no mesmo contrato) e `total_bundle_units` (unidades totais de pacotes).
   - **Sessões Realizadas vs Passadas:** separação explícita entre `confirmed_realized_sessions` (status confirmado pós-sessão) e `past_scheduled_sessions` (horário de `schedule_1` já transcorrido, destacando `past_scheduled_pending_confirmation`).
4. **Rota Canônica de Cliente e Verificação Real de Avatar WebP:**
   - Links de clientes utilizam sempre `https://evydencia.com/gestao/clientes/{uuid}/consultar`.
   - `probeCustomerAvatarAsset` executa verificação SSRF-safe (`HEAD` + `Range: bytes=0-31` `GET`, sem seguir redirects externos), validando status HTTP, `Content-Type` e assinatura binária `RIFF....WEBP` (`asset_check_status: validated | unavailable | restricted | not_checked`).
5. **Indisponibilidade Explícita:** Métricas sem coluna correspondente no schema do CRM (como distribuição por gênero de participantes em `photo_participants` ou áudio personalizado do Papai Noel) retornam `{ available: false, unavailable_reason: "..." }` — nunca `0` silencioso nem inferência por nome.

---

## 3. Catálogo MOCK Demonstrativo (`src/server.mjs` / `src/capabilities.mjs`)

Mantido intacto para desenvolvimento offline e `npm run conversation:smoke` (`EVYD_MOCK_MODE=1`), onde todas as respostas carregam `mock: true` e `source: "fixture"` e nenhuma chamada de rede ou escrita real existe.
