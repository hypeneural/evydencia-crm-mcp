# Relatório de Homologação Forense Final no Avell — Gameplay × CRM MCP
**Data:** 26/10/2026 • **Ambiente:** Avell (Windows 11) • **Executor:** Antigravity  
**Alvo:** PR #11 (`hypeneural/evydencia-crm-mcp`) & PR #43 (`hypeneural/gameplay`)

---

## 1. Contexto do Ambiente Host (Avell Windows 11)

- **Estação de Trabalho:** Avell Windows 11 executando o Evidência CRM MCP operacional e os serviços de impressora.
- **Workspace Isolado:** `%LOCALAPPDATA%\Evydencia\Antigravity\gameplay-mcp-20261026`.
- **Integridade de Produção:** Nenhum serviço do Windows, fila de spooler da impressora física, backend Laravel de produção, Z-API, EvydFlow ou dados de clientes foi modificado.
- **Node.js Local:** v24.22.1 nativo (sem alteração de dependências globais).
- **Git State:**
  - `crm-mcp-dev` sincronizado na branch `feat/gameplay-read-client-20261026` (`a7cab86651356ed869edd2d2afcf7cbd2ec5c404`).
  - `gameplay-code` sincronizado na branch `feat/gameplay-status-read-api-20261026` (`6b7b8b5bbe2009662a060a05cb2e70f1f65fdff7`).

---

## 2. Evidências de Teste Executadas Localmente (Saída TAP Real)

### 2.1 Testes de Contrato Gameplay (Standalone Client)
Executado via `scripts/antigravity/prepare-avell.mjs`:
```text
✔ batch status never requests family capability URLs (43.2642ms)
✔ single link endpoint accepts pinned public origin distinct from private backend (1.1007ms)
✔ batch rejects accidental secret capability URL leaks (1.3955ms)
✔ single rejects a gallery URL belonging to another token (0.9811ms)
✔ oversized stream with dishonest content-length is rejected (1.9321ms)
✔ configuration refuses insecure origin or weak secret (0.396ms)
✔ many-order capability URL reads are blocked before network (0.2945ms)
✔ configuration is disabled until explicitly enabled (1.5411ms)
✔ invalid origin and missing bearer fail closed (2.2228ms)
✔ batch validates identity and deduplicates requests (37.997ms)
✔ cross-origin public capability URLs are rejected (0.8372ms)
✔ upstream downtime is not converted to not_found (0.3458ms)
ℹ tests 12 | pass 12 | fail 0 | duration_ms 191.2067
```

### 2.2 Testes Cirúrgicos Direcionados (Pedidos × Fotos × Smoke)
Executado via `node --test test/gameplay-order-status.test.mjs test/smoke-gameplay-readonly.test.mjs`:
```text
✔ current CRM status 10 and uncreated Gameplay means a publication requirement, not zero original photos (2.1026ms)
✔ staged photos are counted separately and do not imply playable game (0.2103ms)
✔ published 20 photos is metadata-ready, never proof of all runtime games (0.2881ms)
✔ CRM status 11 must not create operational publication demand (0.1689ms)
✔ early CRM statuses do not create false operational alerts (0.2028ms)
✔ incomplete active revision photos are not counted as published or playable (0.2104ms)
✔ invalid preparation is an explicit anomaly, never a published photo (0.1639ms)
✔ missing or unrecognized Gameplay state must not be silently considered published (0.5918ms)
✔ unauthorized smoke never makes a network call (1.8317ms)
✔ read-only smoke requests only metadata and redacts order UUID and family URLs (33.4776ms)
ℹ tests 10 | pass 10 | fail 0 | duration_ms 165.6969
```

### 2.3 Paginação Canônica e Projeção dos 13 Status
Executado via `node --test test/gameplay-canonical-pagination.test.mjs test/vps-readonly-preflight.test.mjs`:
```text
✔ Laravel meta proves canonical server-side pages without PHP bridge (62.6874ms)
✔ Laravel status 11 stays ineligible even when returned by the server (1.4041ms)
✔ HTTP fallback projects early statuses for safe customer-name search (1.2403ms)
✔ canonical fallback refuses unpaged Laravel response (2.0011ms)
✔ canonical fallback rejects forged page totals and missing rows (0.701ms)
✔ null total is rejected rather than silently interpreted as zero (0.52ms)
✔ regular non-canonical search keeps existing behavior (0.4784ms)
✔ VPS preflight cannot assert live CRM or Gameplay from filesystem presence (2.0992ms)
✔ VPS preflight preserves missing prerequisite state (0.3158ms)
ℹ tests 9 | pass 9 | fail 0 | duration_ms 220.8191
```

---

## 3. Validação das 7 Regras e Relações de Negócio

1. **Identidade do Pedido e Join:**
   - O número do pedido pertence ao CRM. O acoplamento com o Gameplay ocorre estritamente via `crm_order_uuid`.
2. **Status Corrente do CRM:**
   - O status avaliado para regras de negócio é rigorosamente o status atual no momento da consulta.
3. **Elegibilidade Operacional Natal 2026:**
   - Apenas os pedidos em status atual `10` (`waiting_product_retrieve`) e `12` (`order_completed`) possuem demanda de publicação digital.
   - O status `11` (`product_retrieve_confirmed`) permanece formalmente **excluído**.
4. **Separação Rígida de Fotos:**
   - Fotos publicadas (`published_photo_count`) refletem somente a revisão ativa com todos os blobs `READY`.
   - Fotos em preparação (`preparing_photo_count`) vêm do objeto de staging (`preparation: { state: 'staged', photo_count }`) e jamais inflam o total publicado.
5. **Revisões Incompletas:**
   - Revisões com blobs pendentes (`state = 'partial'`) ou sem ativação mantêm a contagem de fotos publicadas em zero.
6. **Desacoplamento de Runtime:**
   - Um álbum publicado (`published_unverified`) atesta metadados e integridade do banco SQLite, mas **não** comprova execução dos jogos Phaser em navegadores móveis (`browser_runtime_verified: false`).
7. **Privacidade em Lote:**
   - A consulta em lote (`lookup-batch`) e auditorias retornam sempre `hub_url: null` e `gallery_url: null`. Links só são gerados em consultas individuais sob operador OAuth autorizado.

---

## 4. Classificações Formais de Governança

| Dimensão | Classificação | Justificativa |
|---|---|---|
| **CRM Real** | `validado` | Amostragem canônica prévia confirmou 22 pedidos elegíveis (11 status 10 e 11 status 12). |
| **Ligação UUID Pedido–Gameplay** | `contrato_validado` | Validação de schema, identificador único e fail-closed aprovados em testes unitários e de integração. |
| **Publicação Real Gameplay** | `nao_verificada` | Catálogo Gameplay não habilitado no gateway MCP live e API privada não consultada ao vivo a partir do Avell. |
| **Quantidade Real de Fotos por Pedido** | `nao_verificada` | Contratos de contagem isolada aprovados sinteticamente; verificação com fotos reais depende de host autorizado. |
| **Execução dos Jogos no Navegador** | `nao_verificada` | Metadados publicados não atestam decodificação de WebP ou ciclo de vida Phaser em Android Chrome / iOS Safari. |
| **VPS Filesystem** | `not_verified` | Script `vps-readonly-preflight.mjs` não executado no Avell como prova da VPS (Avell é Windows 11). |
| **CRM Canonical Search VPS** | `not_verified` | Depende de smoke autenticado em ambiente Linux autorizado. |
| **Printer Baseline** | `not_measured` | Nenhum serviço de impressão foi alterado ou medido. |
| **Deploy de Cliente Real** | **NO-GO** | Bloqueado por `deploy/readiness.json`, Caddy, mídias privadas e backup SQLite WAL. |

---

## 5. Handoff e Próximos Passos para o ChatGPT

Para os próximos ajustes no repositório e infraestrutura da VPS:
1. **Infraestrutura VPS & Caddy:**
   - Configurar o Caddy para rejeitar qualquer acesso externo às rotas `/internal/*` do catálogo Gameplay, permitindo tráfego apenas via interface privada (Tailscale ou loopback).
2. **Autorização de Mídias Privadas:**
   - Finalizar a concessão de mídias privadas com cabeçalhos `X-Accel-Redirect` / `X-Sendfile`.
3. **Backup do SQLite WAL:**
   - Estabelecer e homologar rotinas automáticas de backup consistente e restauração do SQLite em modo WAL sob concorrência.
4. **Readiness Gates:**
   - Preservar `pilotReady: false` em `deploy/readiness.json` até a validação do piloto com fotos reais nos dispositivos móveis alvo (Android e iOS).
