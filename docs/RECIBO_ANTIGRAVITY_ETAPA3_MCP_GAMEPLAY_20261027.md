# Recibo Canônico de Homologação Local — MCP × Gameplay (Etapa 3)
**Data:** 27/10/2026 | **Ambiente:** Avell Windows 11 (Desenvolvimento / Homologação Local)  
**Documento de Referência:** `docs/PROMPT_ANTIGRAVITY_ETAPA3_MCP_GAMEPLAY_20261027.md`

---

## 1. HEADs Reais Auditados e Estado dos Worktrees

| Repositório | Worktree / Diretório | Branch / PR | Commit HEAD Real | Status do Worktree |
| :--- | :--- | :--- | :--- | :--- |
| **MCP (PR #14)** | `.../gameplay-mcp-20261026/crm-mcp-pr14` | `integration/live-35tools-gameplay-reconciled-20261027` | [`786a97c631df3f1c14fcc1d3c5c30e97f14fe635`](https://github.com/hypeneural/evydencia-crm-mcp/commit/786a97c631df3f1c14fcc1d3c5c30e97f14fe635) | **100% Limpo** (`working tree clean`) |
| **Gameplay (PR #43)** | `.../gameplay-mcp-20261026/gameplay-code` | `feat/gameplay-status-read-api-20261026` | [`ab672a48c419cdb0323eb05edd81b6d480160cd7`](https://github.com/hypeneural/gameplay/commit/ab672a48c419cdb0323eb05edd81b6d480160cd7) | **100% Limpo** (`working tree clean`) |

> [!NOTE]
> No Gameplay, o commit [`ab672a4`](https://github.com/hypeneural/gameplay/commit/ab672a48c419cdb0323eb05edd81b6d480160cd7) aplicou a correção de estilo estrito do Prettier no arquivo `docs/integrations/GAMEPLAY_STATUS_READ_V1_20261026.md`, sanando a única falha determinística de CI da PR #43.

---

## 2. Resultados dos Testes Automatizados e Quality Gates

### 2.1 CRM MCP — PR #14 (`crm-mcp-pr14`)
| Suíte de Teste | Comando | Duração | Resultado | Cobertura / Destaques |
| :--- | :--- | :--- | :---: | :--- |
| **Links & Integração Release** | `node --test test/gameplay-links.test.mjs test/gameplay-integration-release.test.mjs` | 648ms | **PASS** (14/14) | Validação do fallback 409 canônico com corpo JSON `{"error":"CUSTOMER_LINKS_NOT_ENABLED"}`; rejeição de HTTP 409 genérico de proxy; rejeição de origens não loopback; fail-closed sem vazamento de UUIDs ou segredos. |
| **Gateway Tests** | `npm run gateway:test` | 2.50s | **PASS** (22/22) | PKCE OAuth, SSE/HTTP, isolamento por operador, PrintServer allowlist, labels PNG canônicos e fail-closed de rotas de Gameplay. |
| **Suíte Unitária Completa** | `npm test` | 8.31s | **PASS** (248/248) | 248 testes aprovados (217 legados/CRM + 31 PrintServer, malotes, etiquetas e integração de release). 0 falhas, 0 cancelados. |
| **Syntax & Module Check** | `npm run check` | 4.8s | **PASS** | 46 arquivos verificados com `node --check` sem erros de importação ou sintaxe. |
| **Sidecar Verification** | `npm run gameplay:sidecar:verify` | 1.8s | **FAIL-CLOSED** (Esperado) | `SIDE_NETWORK_UNAVAILABLE` (execução local segura; sem credenciais no Avell e sem exposição a falso positivo). |

### 2.2 Gameplay — PR #43 (`gameplay-code`)
| Suíte de Teste | Comando | Duração | Resultado | Cobertura / Destaques |
| :--- | :--- | :--- | :---: | :--- |
| **Boundaries & Catalog Server** | `pnpm exec vitest run tools/deploy/staging-boundaries.test.mjs apps/catalog-server/src/...` | 756ms | **PASS** (21/21) | 4 arquivos / 21 testes: validação do overlay `compose.private-audit.yaml` com `command: ['node', 'server/main.js']`, portas fechadas na borda e bloqueio 404 em rotas públicas. |
| **Full Quality Check** | `pnpm check` | 46s | **PASS** (605/605) | 113 arquivos / 605 testes Vitest aprovados; TypeScript sem erros (`tsc --noEmit`); ESLint limpo; Dependency Cruiser limpo (0 violações em 522 módulos); Knip limpo; Prettier LF 100% aprovado; Repo-map verificado. |
| **Staging Release Build** | `pnpm release:staging` | 4.4s | **PASS** | 375 arquivos montados de forma imutável em `.release\vps`, com SHA `ab672a48c419cdb0323eb05edd81b6d480160cd7`. |
| **Staging Release Verify** | `pnpm release:verify` | 1.6s | **PASS** | `{"status":"verified","stage":"staging-demo","gitSha":"ab672a48c419cdb0323eb05edd81b6d480160cd7","fileCount":375}`. |

---

## 3. GitHub Actions CI dos Novos HEADs

Auditado diretamente via GitHub CLI:

- **MCP PR #14 (HEAD `786a97c631df3f1c14fcc1d3c5c30e97f14fe635`):**
  - `validate`: **SUCCESS** (16s) — [Run 40595263387](https://github.com/hypeneural/evydencia-crm-mcp/actions/runs/40595263387/job/122509472637)
  - `test` (PR): **SUCCESS** (22s) — [Run 40595263488](https://github.com/hypeneural/evydencia-crm-mcp/actions/runs/40595263488/job/122509473292)
  - `test` (push): **SUCCESS** (25s) — [Run 40595257052](https://github.com/hypeneural/evydencia-crm-mcp/actions/runs/40595257052/job/122509451864)

- **Gameplay PR #43 (HEAD `ab672a48c419cdb0323eb05edd81b6d480160cd7`):**
  - `Quality Gates & Build`: **SUCCESS** (1m34s) — [Run 40597746181](https://github.com/hypeneural/gameplay/actions/runs/40597746181/job/122517868923)
  - `Gallery mobile E2E`: **SUCCESS** (2m17s) — [Run 40597746181](https://github.com/hypeneural/gameplay/actions/runs/40597746181/job/122518523194)

---

## 4. Auditoria das 35 Ferramentas Operacionais da Release (MCP LIVE)

Inventário verificado em [`src/live-gateway.mjs`](file:///C:/Users/Anna%20Helena/AppData/Local/Evydencia/Antigravity/gameplay-mcp-20261026/crm-mcp-pr14/src/live-gateway.mjs):
- **Base / Capacidades (7):** `crm_capacidades`, `crm_status`, `crm_campanha_publica`, `crm_horarios_publicos`, `crm_conexao_privada`, `crm_cliente_resumo`, `crm_cliente_360`.
- **Diretas do CRM (7):** `crm_estatisticas_natal`, `crm_natal_participantes_estatisticas`, `crm_pedidos_buscar`, `crm_pedido_detalhe`, `crm_relatorio_itens_vendidos`, `crm_relatorio_natal_sem_participantes`, `crm_relatorio_clientes_natal`.
- **Forense (1):** `crm_clientes_buscar`.
- **PrintServer & Malotes (3):** `crm_previa_malotes_retirada`, `crm_solicitar_impressao_etiqueta`, `crm_consultar_impressao_etiqueta`.
- **Proposta Comercial Natal (2):** `crm_previa_proposta_natal`, `crm_enviar_proposta_natal`.
- **Interface Visual MCP Cards (1):** `crm_ui_cartao_resumo`.
- **Z-API WhatsApp Mensageria (10):** Envio de texto, mídia, botões, status e instâncias.
- **Z-API Diagnósticos (2):** `crm_zapi_status_instancia`, `crm_zapi_historico_instancia`.
- **Gameplay (2):** `crm_gameplay_links`, `crm_gameplay_auditoria`.
- **Ferramentas com Escrita Restrita mantidas NOT_AVAILABLE:** `crm_marcar_disponivel_retirada`, `crm_processar_malotes_retirada`.
- **TOTAL DE FERRAMENTAS ATIVAS:** **35** (exatamente igual à linha LIVE auditada `e872fac`).

---

## 5. Auditoria Read-Only da Media VPS (`169.58.210.14`) e Compose

1. **Processo do `catalog-reader`:**
   - PID `3879467` rodando sob usuário `vpsops` via docker-init (PID `3879412`).
   - Linha de comando: `node server/main.js`.
   - Variáveis: `CATALOG_PRIVATE_METADATA_READ_ONLY=1`, `NODE_VERSION=24.22.1`, `PORT=4180`, `CATALOG_DATABASE_PATH=/data/sqlite/catalog.db`.
   - Host Port: `127.0.0.1:4182` em escuta de loopback estrita (sem interface pública).
2. **Commit Executando na VPS:**
   - Executa a release intermediária `20261027-37190a8`.
   - **Diagnóstico:** Responde `200 OK` em `/healthz` e `401 Unauthorized` no POST `/internal/...` sem token, mas ainda serve HTML em `/` (pois é anterior ao hardening `c7526bf`/`ab672a4`).
3. **Contrato do Overlay Compose (`deploy/vps/docker/compose.private-audit.yaml`):**
   - Diretiva corrigida: `command: ['node', 'server/main.js']` explicitamente declarada (evitando execução do CMD padrão do alpine).
   - Perfis: `profiles: ['audit-private']`.
   - Segurança: `read_only: true`, `no-new-privileges:true`, `cap_drop: [ALL]`.
   - Mounts: volumes de release e sqlite com atributo `:ro`.
4. **SQLite e Consistência WAL:**
   - Host path: `/srv/runtime/christmas-games/data/sqlite`.
   - Arquivos: `catalog.db` (1.28 MB), `catalog.db-shm` (32 KB), `catalog.db-wal` (0 bytes).
   - Backup existente: `backup-pre-private-reader-20261027.sqlite` (1.28 MB).
   - Segurança DDL: O leitor abre com `readOnly: true` e `PRAGMA query_only = ON;`, impedindo alterações no banco.
5. **Governança de Rollback:**
   - Gerenciamento exclusivo via `/usr/local/sbin/stackctl`.
   - Proibido o uso de `docker stop/rm` solto ou `git checkout` em diretórios de produção.
   - Rollback é executado restaurando o diretório de release anterior via `stackctl`.

---

## 6. Procedimento de Corte Real Futuro (Somente Após Autorização)

Quando o corte for formalmente aprovado pelo ChatGPT e operadores:

### Passo 1 — Transferência e Instalação da Release Imutável
1. Copiar o bundle gerado `.release/vps` (SHA `ab672a4`) para o host Media VPS em:
   `/srv/runtime/christmas-games/releases/20261027-ab672a4`
2. Verificar permissões: usuário e grupo `vpsops:vpsops`.

### Passo 2 — Atualização Controlada do `catalog-reader`
1. Acionar a atualização exclusivamente do container leitor através do `stackctl` com o overlay `compose.private-audit.yaml`, apontando `RELEASE_DIR=/srv/runtime/christmas-games/releases/20261027-ab672a4`.
2. O catálogo público (`christmas-games-catalog`) permanece intocado e servindo a release corrente.

### Passo 3 — Bateria de Testes Pós-Corte (Via Loopback Seguro)
Executar na Media VPS (ou via túnel aprovado):
- [ ] `GET http://127.0.0.1:4182/healthz` -> Deve retornar `200 OK` com `{"status":"ok","releaseStage":"staging-demo"}`.
- [ ] `GET http://127.0.0.1:4182/` -> Deve retornar `404 Not Found` (bloqueio de rota pública).
- [ ] `GET http://127.0.0.1:4182/demo/fotos` -> Deve retornar `404 Not Found`.
- [ ] `GET http://127.0.0.1:4182/s/synthetic-token` -> Deve retornar `404 Not Found`.
- [ ] `POST http://127.0.0.1:4182/internal/v1/sessions/lookup-batch` (sem Bearer) -> Deve retornar `401 Unauthorized`.
- [ ] `POST http://127.0.0.1:4182/internal/v1/sessions/lookup-batch` (com Bearer) -> Deve retornar `200 OK` com envelope v1 e estado `not_found`, sem URLs.
- [ ] `POST http://127.0.0.1:4182/internal/v1/sessions/lookup` (com `include_links:true`) -> Deve retornar `409 Conflict` com `{"error":"CUSTOMER_LINKS_NOT_ENABLED"}`.

### Passo 4 — Validação no ChatGPT
- Chamada read-only: `crm_capacidades(verificar_gameplay=true)`.
- Consulta agregada: `crm_gameplay_auditoria` (sem publicar dados nem links de clientes).

---

## 7. Matriz Conclusiva GO / NO-GO Segregada

| Componente | Veredito | Justificativa Técnica |
| :--- | :---: | :--- |
| **1. Código Local (MCP PR #14 & Gameplay PR #43)** | **GO** | 248 testes unitários MCP + 605 testes Gameplay 100% aprovados sem erros; syntax check e Prettier LF verificados. |
| **2. Integração Git (Reconciliação e CIs)** | **GO** | PR #14 e PR #43 com GitHub Actions 100% verde nos novos HEADs (`786a97c` e `ab672a4`). PR #14 mantém intactas as 35 ferramentas da release. |
| **3. Sidecar Privado (Media VPS)** | **GO (Pronto para Corte)** | Diagnóstico read-only concluído; overlay Compose corrigido com `node server/main.js`; aguarda autorização para o deploy do bundle `ab672a4`. |
| **4. Entrega Real aos Clientes** | **NO-GO** | `readiness.json` em `false`; publicação de fotografias, envio de WhatsApp e liberação pública de URLs permanecem estritamente bloqueados. |
