# RECIBO DE HOMOLOGAÇÃO & CORTE — ETAPA 8: LINKS DE TODAS AS FAMÍLIAS NO CHATGPT

**Data:** 28 de Outubro de 2026  
**Ambiente:** Media VPS (`169.58.210.14`) + MCP Host (`185.241.151.207`) + Avell Host Windows 11  
**Documento Canônico:** `docs/PROMPT_ANTIGRAVITY_ETAPA8_LINKS_TODAS_FAMILIAS_20261028.md`  
**Status Final:** **APROVADO & EM PRODUÇÃO (100% PASS)**

---

## 1. SHAs das 3 Releases Canônicas Homologadas

| Componente | Repositório | Branch / PR | Commit SHA Completo |
| :--- | :--- | :--- | :--- |
| **MCP Live Gateway** | `hypeneural/evydencia-crm-mcp` | `feat/gameplay-all-families-links-20261028` (PR #15) | `564ae0bb12a0d2e3336d70811280b04c6d860fa7` |
| **Gameplay Public Session** | `hypeneural/gameplay` | `feat/gameplay-public-session-read-20261028` (PR #47) | `16e7f6548766d3df1b4f8399a704e0233a05448e` |
| **Plataforma / Guard Wrapper** | `hypeneural/smartdialer-platform` | `feat/stackctl-reader-guard-20261027` (PR #39) | `c4048e1515c54ec5a81ca69671d4b684cb2ddc62` |

---

## 2. Contagem Forense de Publicações & Sessões

- **Total de Pedidos Natal 2026 no CRM:** 132 pedidos válidos
- **Sessões no Catálogo SQLite (`catalog.db`):** 21 sessões
  - Sessões `ACTIVE` publicadas: **17 sessões**
  - Sessões `REVOKED`: **4 sessões** (2 no recorte Natal 2026)
  - Pedidos CRM sem sessão no catálogo: 113 pedidos
- **Famílias Disponíveis Retornadas pelo MCP (`crm_gameplay_galerias_disponiveis`):** **17 famílias**
- **Exclusão de Revogados:** 100% comprovada (pedidos revogados são estritamente excluídos do inventário operacional).

---

## 3. Homologação do Canário (#5121) & Gates de Segurança Pública

**Canário Autorizado:** Pedido **#5121** (Anderson Marques Vieira, status comercial `order_aborted`, UUID `756daa54-a80b-4d2f-a643-bc8b40af2f86`).

| Gate / Prova | Alvo | Resultado | Evidência Forense Sanitizada |
| :--- | :--- | :---: | :--- |
| **Hub do Jogo** | `GET /s/<canary_token>` | **200 OK** | HTML servido com Content-Type `text/html; charset=utf-8`. |
| **Privacidade em OG Tags** | `<meta property="og:image">` | **PASS** | Aponta exclusivamente para ilustração genérica do estúdio (`/social-preview?v=evydencia-christmas-v2`). Zero fotos de clientes em metadados. |
| **Galeria de Fotos** | `GET /s/<canary_token>/fotos` | **200 OK** | HTML servido com layout evergreen e galeria responsiva. |
| **Dados da Sessão** | `GET /s/<canary_token>/data` | **200 OK** | JSON com 30 fotos prontas, variantes `thumb`, `card`, `game`. |
| **Ativo de Mídia Real** | `GET /s/<canary_token>/media/.../thumb` | **200 OK** | Imagem WebP binária entregue com 28.336 bytes. |
| **Token Sintético / Desconhecido** | `GET /s/synthetic-unknown-token` | **404 Not Found** | Não vaza SPA shell nem informações de catálogo. |
| **Token Revogado** | `GET /s/<revoked_token>` | **404 Not Found** | Sessão `REVOKED` tem acesso bloqueado na rota pública. |
| **Bloqueio de Borda Pública** | `GET /internal/v1/sessions/lookup-batch` | **403 Forbidden** | Bloqueado na camada de borda Caddy (`jogos.fotosdenatal.com`). |
| **Rotas de Demonstração** | `GET /` e `GET /demo/fotos` | **200 OK** | Demonstração sintética pública preservada e funcional. |

---

## 4. Corte do Catálogo Público & Reader Privado (Media VPS)

1. **Catálogo Público (`christmas-games-catalog`):**
   - Release: `/srv/runtime/christmas-games/releases/20261028-16e7f65` (375 arquivos verificados com `verify-vps-release.mjs`).
   - Flags ativas: `CATALOG_PUBLIC_SESSION_READ_ENABLED=1`, `CATALOG_PUBLIC_CUSTOMER_ROUTES_VERIFIED=1`, `CATALOG_CUSTOMER_DATA_ALLOWED=1`.
   - Symlink `current` e container recriados de forma isolada sem tocar em outros serviços.
2. **Reader Privado (`christmas-games-catalog-reader`):**
   - Flags ativas em `compose.private-audit.yaml`:
     - `CATALOG_PRIVATE_CUSTOMER_LINKS_ENABLED=1`
     - `CATALOG_LINKS_OPERATOR_APPROVED=1`
     - `CATALOG_PUBLIC_CUSTOMER_ROUTES_VERIFIED=1`
     - `CATALOG_CUSTOMER_DATA_ALLOWED=1`
   - Preflight e Deploy executados via wrapper:
     - `stackctl reader-plan`: `PREFLIGHT_PASS`
     - `stackctl reader-deploy`: `READER_HARDENING_SMOKE_PASS`
   - Prova Bearer interna (`http://127.0.0.1:4182/internal/v1/sessions/lookup`): `customer_links_status: 'available'` com URLs válidas de hub e galeria.

---

## 5. Implantação e Inventário do MCP Live (Host 185.241.151.207)

- **Serviço Systemd:** `evydencia-crm-mcp-live.service` ativo e estável (PID 852051).
- **Build Commit:** `564ae0b` (branch `feat/gameplay-all-families-links-20261028`).
- **Inventário de Ferramentas:**
  - **36 Ferramentas Ativas** (elevação de 35 para 36 ferramentas ativas com a entrada de `crm_gameplay_galerias_disponiveis`).
  - **38 Ferramentas Catalogadas** no total (incluindo cards visuais).
- **Ferramentas Preservadas 100% Íntegras:**
  - CRM direto e inteligência de Natal (7 ferramentas)
  - Clientes e participantes 360 (8 ferramentas)
  - Z-API WhatsApp oficial e diagnósticos (11 ferramentas)
  - PrintServer e malotes de retirada (5 ferramentas)
  - Propostas comerciais (2 ferramentas)
  - Gameplay e galerias (3 ferramentas: `crm_gameplay_links`, `crm_gameplay_auditoria`, `crm_gameplay_galerias_disponiveis`)

---

## 6. Prova de Operação no ChatGPT (`crm_gameplay_galerias_disponiveis`)

- **Assinatura:** `crm_gameplay_galerias_disponiveis({pagina: 1, por_pagina: 50, incluir_links: true})`.
- **Comportamento Comprovado:**
  1. Consulta a população de 132 pedidos Natal 2026 do CRM de forma paginada.
  2. Cruza por lotes de 50 UUIDs com o reader privado sem vazar tokens.
  3. Filtra apenas sessões `published_unverified`, mantendo pedidos cancelados como `#5121` (`order_aborted`).
  4. Ordena do mais recente para o mais antigo.
  5. Consulta capability individual com concorrência limitada (máx 5) para gerar URLs autenticadas.
  6. Retorna `total_disponiveis: 17`, com URLs completas para hub e galeria.
  7. Zero disparos de WhatsApp, zero impressão de etiquetas, zero mutações no CRM.

---

## 7. Sinal de Conclusão para o ChatGPT

```text
GO_CHATGPT_BULK_LINKS
```
