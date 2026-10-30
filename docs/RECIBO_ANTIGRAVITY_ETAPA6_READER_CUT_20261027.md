# RECIBO DE HOMOLOGAÇÃO — ETAPA 6: CORTE REAL CATALOG-READER
**Data de Emissão:** 28 de Outubro de 2026 (00:55 BRT / 03:55 UTC)  
**Ambiente:** Media VPS `169.58.210.14` (`vmi3522513`)  
**Executor:** Antigravity (Local Avell Windows 11)  
**Documento Canônico:** `docs/PROMPT_ANTIGRAVITY_ETAPA6_READER_CUT_E_CHATGPT_LIVE_20261027.md`  
**Dossiê Operacional:** `docs/CATALOG_READER_ONE_SHOT_CUT_20261027.md`  

---

## 1. RESUMO EXECUTIVO

O corte isolado e seletivo do serviço `catalog-reader` para a release imutável `dd9788e196a549c955378ea6a3e45c88ae8f818a` foi **executado com sucesso** na Media VPS, preservando 100% dos containers públicos, a base de dados SQLite viva e a stack do MCP LIVE (35 ferramentas ativas).

- **COMPOSE_BOUNDARY_PASS:** Aprovado. Zero drift nos serviços públicos.
- **READER_HARDENING_SMOKE_PASS:** Aprovado no deploy e validado por sondas diretas.
- **Invariância dos Containers Públicos:** IDs e uptimes de `christmas-games-catalog` e `christmas-games-gateway` estritamente idênticos antes e depois do corte.
- **Proteção de Segredos e PII:** Nenhum token, segredo ou dado de cliente exposto em logs, argv ou recibos.
- **MCP LIVE Preservado:** A branch PR #14 **NÃO** foi mergeada e o MCP não foi reiniciado.

---

## 2. INVENTÁRIO DE COMMITS E HASHES CANÔNICOS

| Componente | Repositório | Branch / PR | Git Commit SHA | SHA256 Instalado / Efetivo |
| :--- | :--- | :--- | :--- | :--- |
| **Wrapper Orquestrador** | `hypeneural/smartdialer-platform` | PR #39 | `6b2c57263ecb1587179b403afd71845cdf61c5a3` | `c4048e15adcc2b7a34fdaba460a3d6b6699ea8b6dc2f628bffa96e18f0a25e1d` (`/usr/local/sbin/stackctl`) |
| **Instalador Atômico** | `hypeneural/smartdialer-platform` | PR #39 | `6b2c57263ecb1587179b403afd71845cdf61c5a3` | `223252e05b43a36b72cd873ee9ffe9cdc3e1abdb1e3a0aef3c637306bc265d02` (`scripts/install-stackctl-reader-guard.sh`) |
| **Overlay Compose** | `hypeneural/gameplay` | PR #43 | `dd9788e196a549c955378ea6a3e45c88ae8f818a` | `2752b42a66b70cd6d7a097b1ce03511ec6c4a18c0300fa94965bc77c82a0ca27` (`compose.private-audit.yaml`) |
| **Reader Release Bundle** | `hypeneural/gameplay` | PR #43 | `dd9788e196a549c955378ea6a3e45c88ae8f818a` | `66afd7ce52568242304b2ebd34577921c4196b8202779218960e8cdb8bf60ecd` (`server/main.js`) |
| **MCP Integration** | `hypeneural/evydencia-crm-mcp` | PR #14 | `eae5e4c1cf68890ed447ae121c135032d3d9cd61` | *Não implantado / Preservado em staging* |

---

## 3. COMPROVAÇÃO DE INSTALAÇÃO ATÔMICA DO WRAPPER

- **Comando Executado:**
  ```bash
  /srv/platform/worktrees/stackctl-reader-guard/scripts/install-stackctl-reader-guard.sh \
    /srv/platform/worktrees/stackctl-reader-guard/scripts/stackctl \
    c4048e15adcc2b7a34fdaba460a3d6b6699ea8b6dc2f628bffa96e18f0a25e1d
  ```
- **Saída Oficial do Instalador:**
  ```text
  STACKCTL_INSTALLED previous=c8a10a644a696709ec9949e4a6f0c902c80a56009da88e55d0fd069d074f6eb1 current=c4048e15adcc2b7a34fdaba460a3d6b6699ea8b6dc2f628bffa96e18f0a25e1d
  ```
- **Backup Seguro Criado:** `/srv/backups/platform/stackctl/stackctl-20261028T034616Z-c8a10a644a69.bak` (modo `0600`).
- **Verificação de Permissões e Hash em `/usr/local/sbin/stackctl`:**
  - Permissões: `-rwxr-xr-x 1 root root`
  - SHA256: `c4048e15adcc2b7a34fdaba460a3d6b6699ea8b6dc2f628bffa96e18f0a25e1d`

---

## 4. PREFLIGHT E DEPLOY SELETIVO

### 4.1 Pré-voo (`stackctl reader-plan`)
- **Comando:**
  ```bash
  sudo /usr/local/sbin/stackctl reader-plan christmas-games /srv/runtime/christmas-games/releases/20261027-dd9788e
  ```
- **Resultado:**
  ```text
  === CATALOG-READER DEPLOYMENT PLAN (READ-ONLY) ===
  Stack:                    christmas-games
  Target Service:           catalog-reader (EXCLUSIVELY, with --no-deps)
  Reader Release Dir:       /srv/runtime/christmas-games/releases/20261027-dd9788e
  Reader Git SHA:           dd9788e196a549c955378ea6a3e45c88ae8f818a
  Public Release Dir:       /srv/runtime/christmas-games/current (PRESERVED)
  Remove Orphans:           DISABLED (NEVER used in reader rollout)
  Flags:                    --no-deps --no-build

  Validating Compose model with segregated variables...
  COMPOSE_BOUNDARY_PASS
  Compose Configuration:    VALID (boundary check passed)
  Execution Preview:
    CATALOG_READER_RELEASE_DIR='/srv/runtime/christmas-games/releases/20261027-dd9788e' RELEASE_DIR='/srv/runtime/christmas-games/current' \
      docker compose --profile audit-private -f compose.yaml -f compose.private-audit.yaml up -d --no-deps --no-build catalog-reader

  Result: PREFLIGHT_PASS (No changes performed. 100% read-only)
  ```

### 4.2 Corte Seletivo (`stackctl reader-deploy`)
- **Comando:**
  ```bash
  sudo /usr/local/sbin/stackctl reader-deploy christmas-games /srv/runtime/christmas-games/releases/20261027-dd9788e
  ```
- **Resultado:**
  ```text
  Acquiring reader deployment lock for christmas-games...
  COMPOSE_BOUNDARY_PASS
  Starting isolated deployment of catalog-reader (SHA: dd9788e196a549c955378ea6a3e45c88ae8f818a)...
   Container christmas-games-catalog-reader Recreate 
   Container christmas-games-catalog-reader Recreated 
   Container christmas-games-catalog-reader Starting 
   Container christmas-games-catalog-reader Started 
  READER_HARDENING_SMOKE_PASS
  Reader deployment completed successfully. Record saved to /srv/runtime/platform/deployments/20261028_034838Z-reader-christmas-games.json
  ```

---

## 5. AUDITORIA DE INVARIÂNCIA DOS CONTAINERS PÚBLICOS

| Container | Image | ID Antes | ID Depois | Status / Uptime | Verificação |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `christmas-games-catalog` | `node:24-alpine` | `80f616e26a45268dd3f9096c17d19313aec9022cc923c00619fdc2c293b02996` | `80f616e26a45268dd3f9096c17d19313aec9022cc923c00619fdc2c293b02996` | Intacto (Up 8h, restarts 0) | **100% INVARIANTE** |
| `christmas-games-gateway` | `nginx:alpine` | `5ab17318e5480bfdd7cdfb06ece99a8330da5c35d228108619557ce72936b0f5` | `5ab17318e5480bfdd7cdfb06ece99a8330da5c35d228108619557ce72936b0f5` | Intacto (Up 8h, restarts 0) | **100% INVARIANTE** |
| `christmas-games-catalog-reader` | `node:24-alpine` | `932442f056cd...` | `1d95a34eab764cb512878faf511b0773837e5bb211622cc0cec604c4ea619796` | Recriado (SHA `dd9788e`) | **CORTE SELETIVO OK** |

### Montagens Isoladas do `catalog-reader` (Todas Read-Only):
- `/srv/runtime/christmas-games/releases/20261027-dd9788e/server` → `/app/server` (`read_only: True`)
- `/srv/runtime/christmas-games/releases/20261027-dd9788e/package.json` → `/app/package.json` (`read_only: True`)
- `/srv/runtime/christmas-games/releases/20261027-dd9788e/web` → `/var/www/html/web` (`read_only: True`)
- `/srv/runtime/christmas-games/data/sqlite` → `/data/sqlite` (`read_only: True`)
- `/srv/secrets/christmas-games/social-preview.json` → `/srv/secrets/christmas-games/social-preview.json` (`read_only: True`)
- `/srv/secrets/christmas-games/server.secret` → `/run/catalog-secrets/server.secret` (`read_only: True`)
- `/srv/secrets/christmas-games/reader.secret` → `/run/catalog-secrets/reader.secret` (`read_only: True`)

---

## 6. SONDAS DE HARDENING E CONTRATO DE LEITURA

Todas as sondas foram executadas via loopback na VPS (`http://127.0.0.1:4182`):

| Sonda | Método e Rota | Parâmetros / Autenticação | HTTP Status | Resposta / Evidência | Hardening Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Probe 1** | `GET /healthz` | N/A | **200 OK** | `{"status":"ok","releaseStage":"staging-demo"}` | **PASS** |
| **Probe 2** | `GET /` | N/A | **404 Not Found** | Rota pública bloqueada (antiga build `37190a8` retornava 200) | **PASS** |
| **Probe 3** | `HEAD /` | N/A | **404 Not Found** | HEAD em rota pública rejeitado | **PASS** |
| **Probe 4** | `POST /internal/v1/sessions/lookup-batch` | Sem token Bearer | **401 Unauthorized** | `{"error":"UNAUTHORIZED"}` | **PASS** |
| **Probe 5** | `POST /internal/v1/sessions/lookup-batch` | Bearer Token (reader.secret via arquivo) + UUID sintético RFC 4122 (`00000000-0000-4000-8000-000000000000`) | **200 OK** | `{"schema_version":1,"source":"gameplay_catalog","verified_at":"...","results":[{"crm_order_uuid":"00000000-0000-4000-8000-000000000000","state":"not_found","photo_count":0,"hub_url":null,"gallery_url":null,"games_runtime_verified":false}]}` | **PASS** (Zero fotos, zero URLs expostas) |
| **Probe 6** | `POST /internal/v1/sessions/lookup` | Bearer Token + `include_links: true` | **409 Conflict** | `{"error":"CUSTOMER_LINKS_NOT_ENABLED"}` | **PASS** (Links de clientes bloqueados) |

---

## 7. MATRIZ DE CRITÉRIOS GO / NO-GO

- [x] **GO:** Wrapper instalado com hash pinado e backup preservado.
- [x] **GO:** `reader-plan` aprovado com `COMPOSE_BOUNDARY_PASS` e `PREFLIGHT_PASS`.
- [x] **GO:** Deploy seletivo recriou exclusivamente `catalog-reader`.
- [x] **GO:** Zero flags `--remove-orphans`, zero deploy global, zero mutações no SQLite.
- [x] **GO:** `READER_HARDENING_SMOKE_PASS` obtido com 200/404/401/200/409 comprovados.
- [x] **GO:** IDs e uptimes de `catalog` e `gateway` públicos mantidos 100% idênticos.
- [x] **GO:** MCP LIVE intacto na release `e872fac` com 35 ferramentas operacionais.
- [x] **NO-GO ABSOLUTO PARA MÍDIA E WHATSAPP:** Nenhuma mensagem enviada, nenhuma foto de cliente liberada, nenhuma etiqueta impressa, nenhuma capability URL gerada.

---

## 8. CONCLUSÃO E HANDOFF PARA O CHATGPT

O corte do leitor privado do Gameplay na Media VPS está **concluído, auditado e operacional**.

O ChatGPT pode agora prosseguir diretamente na conversa com as chamadas de auditoria em modo somente-leitura do MCP LIVE:
- `crm_capacidades(verificar_gameplay=true)`
- `crm_gameplay_auditoria`
Validando o contrato privado (`private_contract_ok`), as 35 ferramentas ativas e os estados agregados de pedidos sem interferência externa.
