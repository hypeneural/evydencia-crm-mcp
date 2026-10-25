# Inventário e Arquitetura da Integração LIVE — Evydência CRM MCP (`v0.10.0`)

- **Repositório MCP:** `hypeneural/evydencia-crm-mcp` (`Node.js >= 22`, `@modelcontextprotocol/server` `2.4.0`, `zod/v4`)
- **Repositório CRM (somente inspeção / não modificado):** `hypeneural/evydencia-crm` (`Laravel 10`, `PHP 8.3`, `MySQL`, `Redis`, `Sanctum`)
- **Modo de Produção:** `LIVE_OPERATOR_FULL_OAUTH` sobre Streamable HTTP (`/mcp`) com OAuth 2.1 + PKCE (`S256`) por operador autenticado e `Cache-Control: private, no-store`.

---

## 1. Camadas de Integração no Host Oficial

| Camada | Componente | Proteção de Leitura / Segurança | Papel |
|---|---|---|---|
| **OAuth 2.1 + Gate por Operador** | `src/oauth-gateway.mjs`, `src/live-gateway.mjs` | Tokens selados AEAD (`AES-256-GCM`), allowlist `EVYD_ALLOWED_OPERATOR_IDS`, verificação Sanctum em `/api/v1/extension/bootstrap`, recusa de token wildcard (`*`), rate limit por operador | Garante que cada requisição MCP opere sob identidade individual verificada. |
| **Bridge Analítico e Demográfico de Natal** | `scripts/crm-natal-bridge.php` | `SET SESSION TRANSACTION READ ONLY` + bloqueador `beforeExecuting` (apenas `SELECT`/`SHOW`/`DESCRIBE`/`EXPLAIN`) + **Read-Only Cache Proxy** (`mcp_readonly_proxy`, lê chaves quentes do Redis sem jamais gravar/invalidar chaves no Redis) | Reutiliza `NatalForensicStatisticsService` e `NatalValidOrdersQuery` para servir `crm_estatisticas_natal` (abas A–F sob demanda) e `crm_natal_participantes_estatisticas` (demografia, faixas de bebês/crianças, famílias e anomalias). |
| **Bridge Forense de Pedidos e Clientes 360** | `scripts/crm-forensic-bridge.php` | `SET SESSION TRANSACTION READ ONLY` + bloqueador SQL estrito | Reutiliza `Order`, `Customer`, `OrderCalculator`, `OrderParticipantManagementViewData`, `OrderCalendarUiStateService`, `PagarmeCardProfileService` e `order_bonus_applications` para servir `crm_pedido_detalhe`, `crm_pedidos_buscar`, `crm_cliente_resumo`, `crm_cliente_360` e `crm_clientes_buscar`. |
| **Sonda SSRF-Safe de Avatar WebP** | `probeCustomerAvatarAsset` (`src/legacy-api-read.mjs`) | Allowlist estrita de origem (`CRM_BASE_URL`), `https:` obrigatório fora de loopback, caminho restrito a `/storage/`, `redirect: "manual"`, leitura máxima de `32` bytes (`Range: bytes=0-31`) | Confirma acessibilidade HTTP (`200`/`206`), `Content-Type` (`image/webp`) e cabeçalho mágico binário `RIFF....WEBP`, preenchendo `asset_accessible` e `asset_check_status`. |
| **Propostas Natal 2026 (Extension API)** | `crm_previa_proposta_natal`, `crm_enviar_proposta_natal` | Token Sanctum do próprio operador + Regra de Ouro do CRM + `confirmado_pelo_operador: true` obrigatório (sem default) + `X-Idempotency-Key` | Permite simular prévia sem envio e agendar proposta apenas mediante confirmação explícita do operador. |

---

## 2. Parâmetros de Proporcionalidade e Economia de Tokens

- **`crm_estatisticas_natal`:**
  - `data_corte_mm_dd` (`MM-DD` opcional)
  - `nivel_detalhe`: `'resumo'` (padrão ~9 KB), `'padrao'` ou `'completo'`
  - `secoes`: array opcional entre `resumo`, `historico`, `simulador_previsao`, `financeiro_caixa`, `clientes_recompra_campanhas`, `agenda_demanda`, `pacotes_produtos_bonus`, `operacional_listas`
  - `ano` (`2021..2026`), `pagina` (`1..50`), `limite` (`1..50`)
- **`crm_natal_participantes_estatisticas`:**
  - `ano`: `'2026' | '2025' | '2024' | 'todos'`
  - `secoes`: `resumo`, `faixas_etarias`, `parentesco`, `familias_filhos`, `pacotes_cruzamentos`, `historico_recompra`, `qualidade_cadastro`
  - `incluir_anomalias` (`boolean`, padrão `true`), `incluir_lista_participantes` (`boolean`, padrão `false`), `pagina`, `limite`
- **`crm_pedidos_buscar` / `crm_pedido_detalhe`:**
  - `nivel_detalhe`: `'resumo' | 'padrao' | 'forense'`

---

## 3. Verificação Pós-Deploy (Homologação Operacional)

1. `GET https://<HOST_MCP>/healthz` deve retornar `ok: true`, `version: "0.10.0"` e `build_commit` igual ao `HEAD` da `main`.
2. `crm_capacidades` deve reportar `version: "0.10.0"`, `build_commit` atualizado, `tools_active_count: 17` (em `LIVE_OPERATOR_FULL_OAUTH`) e zero ferramentas `MOCK_ONLY`.
3. `git status` no diretório do CRM Laravel (`/var/www/evydencia/current`) deve permanecer 100% limpo e intocado.
