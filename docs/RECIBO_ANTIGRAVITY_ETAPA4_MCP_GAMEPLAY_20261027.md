# Recibo Técnico Etapa 4 — MCP × Gameplay (Preflight e Auditoria Forense Completa, SEM DEPLOY)

**Data:** 27/10/2026 | **Ambiente:** Avell Windows 11 (Desenvolvimento / Homologação Local) & Media VPS (`169.58.210.14`)  
**Autores da Auditoria:** Antigravity (execução local Avell & SSH read-only Media VPS) & ChatGPT (auditoria remota cruzada GitHub).  
**Procedimento Canônico:** `docs/PROMPT_ANTIGRAVITY_ETAPA4_MCP_GAMEPLAY_20261027.md`.  
**Runbook de Referência:** `docs/integrations/READER_ONLY_CUT_PREFLIGHT_20261027.md` (Gameplay PR #43).

---

## 1. HEADs Reais Auditados e Estado dos Worktrees

| Repositório | Worktree / Diretório | Branch / PR | Commit HEAD Real | Status do Worktree |
| :--- | :--- | :--- | :--- | :---: |
| **MCP (PR #14)** | `.../crm-mcp-pr14` | `integration/live-35tools-gameplay-reconciled-20261027` | [`2d5bac66f87d1373c96f8e7f65ff06e207cae454`](https://github.com/hypeneural/evydencia-crm-mcp/commit/2d5bac66f87d1373c96f8e7f65ff06e207cae454) | **100% Limpo** |
| **Gameplay (PR #43)** | `.../gameplay-code` | `feat/gameplay-status-read-api-20261026` | [`dd9788e196a549c955378ea6a3e45c88ae8f818a`](https://github.com/hypeneural/gameplay/commit/dd9788e196a549c955378ea6a3e45c88ae8f818a) | **100% Limpo** |

Ambos os worktrees locais estão sincronizados com os upstreams remotos do GitHub por fast-forward, sem merge commits, sem bifurcação e com status estritamente limpo (`working tree clean`).

---

## 2. GitHub Actions CI dos HEADs Canônicos

Auditado diretamente via GitHub CLI (`gh pr checks`):

- **MCP PR #14 (HEAD `2d5bac66f87d1373c96f8e7f65ff06e207cae454`):**
  - `validate`: **SUCCESS** (18s) — [Run 40609453416 / Job 122557130569](https://github.com/hypeneural/evydencia-crm-mcp/actions/runs/40609453416/job/122557130569)
  - `test` (PR): **SUCCESS** (29s) — [Run 40609453432 / Job 122557130597](https://github.com/hypeneural/evydencia-crm-mcp/actions/runs/40609453432/job/122557130597)
  - `test` (push): **SUCCESS** (30s) — [Run 40609447258 / Job 122557109212](https://github.com/hypeneural/evydencia-crm-mcp/actions/runs/40609447258/job/122557109212)

- **Gameplay PR #43 (HEAD `dd9788e196a549c955378ea6a3e45c88ae8f818a`):**
  - `Quality Gates & Build`: **SUCCESS** (1m13s) — [Run 40609037075 / Job 122555736602](https://github.com/hypeneural/gameplay/actions/runs/40609037075/job/122555736602)
  - `Gallery mobile E2E`: **SUCCESS** (2m11s) — [Run 40609037075 / Job 122556188940](https://github.com/hypeneural/gameplay/actions/runs/40609037075/job/122556188940)

---

## 3. Verificação de Código e Quality Gates Locais no Avell

### 3.1 Gameplay PR #43 (`gameplay-code`)

| Verificação | Comando | Duração | Resultado | Destaques |
| :--- | :--- | :---: | :---: | :--- |
| **Boundaries Test** | `pnpm exec vitest run tools/deploy/staging-boundaries.test.mjs` | 329ms | **PASS** (3/3) | Comprova desacoplamento de `CATALOG_READER_RELEASE_DIR`, montagens RO, ausência de portas públicas e porta loopback restrita a `127.0.0.1`. |
| **Repo-Map Check** | `pnpm repo:map:check` | 1.1s | **PASS** | Mapeamento sincronizado com novo doc `READER_ONLY_CUT_PREFLIGHT_20261027.md`. |
| **Full Quality Check** | `pnpm check` | 13.6s | **PASS** (605/605) | 113 arquivos / 605 testes Vitest aprovados; TypeScript limpo (`tsc --noEmit`); ESLint limpo; Knip limpo; Prettier LF 100% conforme; DepCruise limpo (0 violações em 522 módulos). |
| **Staging Release Build** | `pnpm release:staging` | 4.8s | **PASS** | Geração do bundle imutável em `.release\vps` contendo exatamente **375 arquivos**. |
| **Staging Release Verify** | `pnpm release:verify` | 1.4s | **PASS** | `{"status":"verified","stage":"staging-demo","gitSha":"dd9788e196a549c955378ea6a3e45c88ae8f818a","fileCount":375}`. |

**Metadados do Bundle Gerado no Avell:**
- `gitSha`: `dd9788e196a549c955378ea6a3e45c88ae8f818a`
- `generatedAt`: `2026-10-28T00:35:28.182Z`
- `fileCount`: 375
- `server/main.js` SHA256: `66AFD7CE52568242304B2EBD34577921C4196B8202779218960E8CDB8BF60ECD` (9.311 bytes)

### 3.2 CRM MCP PR #14 (`crm-mcp-pr14`)

| Verificação | Comando | Duração | Resultado | Destaques |
| :--- | :--- | :---: | :---: | :--- |
| **Gateway Tests** | `npm run gateway:test` | 2.4s | **PASS** (22/22) | PKCE OAuth, SSE/HTTP, isolamento por operador, PrintServer allowlist, labels PNG canônicos e fail-closed de rotas de Gameplay. |
| **Release & Audit Tests** | `node --test test/gameplay-integration-release.test.mjs test/audit-gameplay-reader-compose.test.mjs test/check-stackctl-reader-readonly.test.mjs` | 563ms | **PASS** (22/22) | Validação do fallback 409 `CUSTOMER_LINKS_NOT_ENABLED`; rejeição de HTTP 409 genérico de proxy; rejeição de origens não loopback; 11 testes de boundaries do Compose; 3 testes de fail-closed do wrapper `stackctl`. |
| **Syntax & Module Check** | `npm run check` | 3.5s | **PASS** | 50 arquivos verificados com `node --check` sem erros de importação ou sintaxe. |

**Inventário de Ferramentas Auditado (Exatamente 35 Ativas):**
- 37 ferramentas mapeadas no catálogo total:
  - Base / Capacidades (7): `crm_capacidades`, `crm_status`, `crm_campanha_publica`, `crm_horarios_publicos`, `crm_conexao_privada`, `crm_cliente_resumo`, `crm_cliente_360`.
  - Diretas do CRM (7): `crm_estatisticas_natal`, `crm_natal_participantes_estatisticas`, `crm_pedidos_buscar`, `crm_pedido_detalhe`, `crm_relatorio_itens_vendidos`, `crm_relatorio_natal_sem_participantes`, `crm_relatorio_clientes_natal`.
  - Forense (1): `crm_clientes_buscar`.
  - PrintServer (3): `crm_previa_malotes_retirada`, `crm_solicitar_impressao_etiqueta`, `crm_consultar_impressao_etiqueta`.
  - Proposta Comercial Natal (2): `crm_previa_proposta_natal`, `crm_enviar_proposta_natal`.
  - Interface Visual MCP Cards (1): `crm_renderizar_card_visual`.
  - Z-API Diagnósticos (2): `zapi_instancia_diagnostico`, `zapi_instancia_historico`.
  - Z-API Mensageria (10): conexões, texto, imagem, vídeo e grupos.
  - Gameplay (2): `crm_gameplay_links`, `crm_gameplay_auditoria`.
  - Malotes de Escrita Bloqueados (`NOT_AVAILABLE`): `crm_marcar_disponivel_retirada`, `crm_processar_malotes_retirada`.
- **Ferramentas Ativas:** **35** (exatamente idêntico à linha LIVE auditada `e872fac`).

---

## 4. Dry-Run Compose com Variáveis Desacopladas (Valores Sintéticos)

### 4.1 Errata Obrigatória do Recibo da Etapa 3
O recibo histórico da Etapa 3 (§6, passo 2) sugeria `RELEASE_DIR=<novo-reader>` no `stackctl`. Conforme formalizado no adendo de PR #14, essa instrução era anterior ao desacoplamento da Etapa 4 e **não pode ser executada**, pois alteraria o bundle do catálogo público e do gateway.  
A variável nova do leitor isolado é **estritamente** `CATALOG_READER_RELEASE_DIR`, enquanto `RELEASE_DIR` permanece apontando para o bundle público em execução.

### 4.2 Prova Automatizada via `verifyReaderComposeModel()`
O modelo Docker Compose foi renderizado via engine Compose (`docker compose config --format json`) com variáveis sintéticas e submetido ao validador oficial `scripts/antigravity/audit-gameplay-reader-compose.mjs`:

```json
{
  "status": "COMPOSE_BOUNDARY_PASS",
  "public_services_unchanged": true,
  "independent_reader_release": true,
  "private_loopback_only": true,
  "private_sqlite_mount_readonly": true,
  "explicit_reader_command": true,
  "media_publication_enabled": false,
  "stackctl_compatibility": "NOT_VERIFIED",
  "production_release_hash": "NOT_VERIFIED",
  "backup_restore_proven": false,
  "deploy_performed": false
}
```

### 4.3 Estrutura do Modelo Normalizado (Redigida)
```yaml
services:
  catalog-reader:
    image: node:24-alpine
    command: ['node', 'server/main.js']
    profiles: ['audit-private']
    read_only: true
    security_opt: ['no-new-privileges:true']
    ports:
      - host_ip: 127.0.0.1
        published: 4182
        target: 4180
    networks:
      - backend
    volumes:
      - source: /__ctwa_synthetic/reader-r1/server
        target: /app/server
        read_only: true
      - source: /__ctwa_synthetic/reader-r1/package.json
        target: /app/package.json
        read_only: true
      - source: /__ctwa_synthetic/reader-r1/web
        target: /var/www/html/web
        read_only: true
      - source: /srv/runtime/christmas-games/data/sqlite
        target: /data/sqlite
        read_only: true

  catalog: # (PÚBLICO - PERMANECE INTACTO NA RELEASE ANTERIOR)
    image: node:24-alpine
    volumes:
      - source: /__ctwa_synthetic/public-r0/server
        target: /app/server
      - source: /__ctwa_synthetic/public-r0/web
        target: /var/www/html/web

  gateway: # (PÚBLICO - PERMANECE INTACTO NA RELEASE ANTERIOR)
    image: nginx:alpine
    volumes:
      - source: /__ctwa_synthetic/public-r0/web
        target: /var/www/html/web
```

> [!NOTE]
> **Desacoplamento Comprovado:** A montagem de `catalog-reader` utiliza estritamente `CATALOG_READER_RELEASE_DIR`. `catalog` e `gateway` preservam inalteradas as montagens de `RELEASE_DIR`. A comparação estrutural byte-a-byte confirmou `public_services_unchanged: true`.

---

## 5. Auditoria Read-Only da Media VPS (`169.58.210.14`) e Wrapper

### 5.1 Estado do Container Leitor Atualmente em Execução na VPS
- **Processo:** PID `3879467` rodando como usuário `vpsops` via docker-init (PID `3879412`).
- **Comando:** `node server/main.js`.
- **Release em execução:** `20261027-37190a8` (release preliminar, anterior ao commit canônico `dd9788e`).
- **Probes no Loopback `127.0.0.1:4182`:**
  - `GET /healthz` -> `200 OK` (`{"status":"ok","releaseStage":"staging-demo"}`)
  - `GET /` -> `200 OK` (**Alerta:** Confirma o diagnóstico reportado; a versão antiga ainda serve rota pública na raiz e deve ser substituída pela versão endurecida que retorna 404).
  - `POST /internal/v1/sessions/lookup-batch` (sem auth) -> `401 Unauthorized` (`{"error":"UNAUTHORIZED"}`).
- **Borda Pública e Caddy:**
  - O domínio `jogos.fotosdenatal.com` **não possui reverse proxy configurado no Caddy** da Media VPS.
  - A porta `4182` escuta estritamente no bind `127.0.0.1:4182` do host (acesso externo bloqueado).

### 5.2 Avaliação do Wrapper `/usr/local/sbin/stackctl` — `BLOCKED_WRAPPER`

O wrapper real da Media VPS foi inspecionado através do pipe seguro para o analisador oficial:
```bash
ssh vpsops@169.58.210.14 "cat /usr/local/sbin/stackctl" | node scripts/antigravity/check-stackctl-reader-readonly.mjs --stdin
```

**Resultado Emitido:**
```json
{
  "status": "BLOCKED_WRAPPER",
  "checks": {
    "has_independent_reader_variable": false,
    "has_public_release_variable": false,
    "mentions_private_service": false,
    "mentions_no_deps_option": true,
    "mentions_compose": true
  },
  "service_only_command_verified": false,
  "environment_passthrough_verified": false,
  "changes_performed": false
}
```

**Evidência no Código-Fonte de `/usr/local/sbin/stackctl` (linhas 274 a 345):**
1. O comando `cmd_deploy()` executa `docker compose up -d --remove-orphans` sobre a stack inteira `christmas-games`.
2. O wrapper **não aceita** seleção de serviço individual (ex.: `--service catalog-reader`).
3. O wrapper **não aceita nem consome** a variável `CATALOG_READER_RELEASE_DIR`.
4. O `cmd_rollback()` executa apenas `docker compose restart`, sem capacidade de alternar versões imutáveis de bundles independentes.

> [!CAUTION]
> **Veredito do Wrapper: `BLOCKED_WRAPPER`**  
> É expressamente proibido acionar `stackctl deploy` no estado atual para atualizar o leitor privado, pois isso recriaria ou reiniciaria o catálogo público e o gateway.

---

## 6. Integridade SQLite WAL e Plano de Snapshot/Restore Scratch

### 6.1 Estado do Banco de Dados de Produção na VPS
- **Caminho:** `/srv/runtime/christmas-games/data/sqlite/catalog.db` (1.3 MB, WAL 0 bytes, SHM 32 KB).
- **Integridade do Banco Live:**
  - `PRAGMA integrity_check`: `ok`
  - `PRAGMA quick_check`: `ok`
  - Registros atuais: **21 sessões**, **22 revisões**, **2.073 blobs**.

### 6.2 Preflight de Backup e Restauração em Scratch (Isolado)
Foi executada na VPS uma validação em diretório scratch temporário (`/tmp/scratch-sqlite-preflight`), utilizando a SQLite Online Backup API via Python (`src_conn.backup(dest_conn)`):
1. **Backup Online Gerado:** `backup_test.sqlite` (1.282.048 bytes).
2. **Integridade do Backup:** `PRAGMA integrity_check` -> `ok`.
3. **Simulação de Restauração Isolada:** Banco restaurado em diretório isolado de scratch.
4. **Verificação do Banco Restaurado:** `PRAGMA integrity_check` -> `ok`; 21 sessões, 22 revisões, 2.073 blobs conferidos com exatidão.
5. **Limpeza:** Diretório de scratch removido completamente. Zero mutações no banco de produção.

### 6.3 Resguardo de Segurança — Gameplay Issue #44
A função `restoreCatalog()` em `tools/deploy/backup-restore-catalog.mjs` remove arquivos existentes (`catalog.db`, WAL, SHM e diretório de mídia) antes de validar a integridade do SQLite de destino.  
**Decisão:** Conforme orientações canônicas, **a função `restoreCatalog()` NUNCA deve ser executada contra diretórios de produção**. A correção fail-closed será tratada em PR dedicada.

---

## 7. Roteiro de Corte Futuro para o `catalog-reader` (Pós-Autorização)

Quando houver autorização operacional expressa e ajuste do wrapper:

1. **Upload da Release Imutável:**
   Transferir `.release\vps` gerada no commit `dd9788e` para `/srv/runtime/christmas-games/releases/20261027-dd9788e` com dono `vpsops:vpsops`.
2. **Atualização Específica do Serviço (Sem Afetar Outros Containers):**
   Executar comando Compose explícito para recriar **exclusivamente** o serviço `catalog-reader`:
   ```bash
   CATALOG_READER_RELEASE_DIR=/srv/runtime/christmas-games/releases/20261027-dd9788e \
   docker compose --profile audit-private -f compose.persistence.yaml -f compose.private-audit.yaml \
     up -d --no-deps catalog-reader
   ```
3. **Bateria de Probes de Aceitação (Via Loopback `127.0.0.1:4182`):**
   - `GET /healthz` -> Deve retornar `200 OK`.
   - `GET /` -> Deve retornar `404 Not Found`.
   - `GET /demo/fotos` -> Deve retornar `404 Not Found`.
   - `POST /internal/v1/sessions/lookup-batch` (sem Authorization) -> Deve retornar `401 Unauthorized`.
   - `POST /internal/v1/sessions/lookup-batch` (com Bearer válido) -> Deve retornar `200 OK` (sem URLs de capability).
   - `POST /internal/v1/sessions/lookup` (com Bearer e `include_links:true`) -> Deve retornar `409 Conflict` com `{"error":"CUSTOMER_LINKS_NOT_ENABLED"}`.
4. **Critério de Rollback:**
   Caso qualquer probe falhe, apontar `CATALOG_READER_RELEASE_DIR` de volta para `20261027-37190a8` e reiniciar apenas o container leitor.

---

## 8. Tabela de Evidências: PROVADO / NÃO_PROVADO

| Requisito / Propriedade | Status | Evidência Técnica |
| :--- | :---: | :--- |
| **HEADs dos Repositórios Sincronizados** | **PROVADO** | Gameplay `dd9788e` e MCP `2d5bac6` com worktrees 100% limpos. |
| **GitHub Actions CI Verde nos HEADs** | **PROVADO** | Gameplay CI 1m13s/2m11s verde; MCP CI 18s/29s/30s verde. |
| **Quality Gates Locais Gameplay** | **PROVADO** | 605 testes vitest aprovados; 0 violações depcruise; bundle com 375 arquivos (`dd9788e`). |
| **Quality Gates Locais MCP** | **PROVADO** | 44 testes (release, gateway, audit compose e wrapper) aprovados; 35 ferramentas operacionais intactas. |
| **Desacoplamento Compose das Releases** | **PROVADO** | `COMPOSE_BOUNDARY_PASS` emitido por `audit-gameplay-reader-compose.mjs`. |
| **Isolamento de Rede do Reader** | **PROVADO** | Bind estrito a `127.0.0.1:4182`; fora da rede externa `edge`; ausente do Caddy público. |
| **Integridade SQLite e Snapshot Scratch** | **PROVADO** | `PRAGMA integrity_check` ok no live (21 s, 22 r, 2073 b) e restore isolado em scratch ok. |
| **Isolamento de Arquivos de Mídia** | **PROVADO** | Reader não possui montagem do diretório `/srv/runtime/christmas-games/data/media`. |
| **Suporte do `stackctl` a Serviço Único** | **NÃO_PROVADO** | `check-stackctl-reader-readonly.mjs` comprova **`BLOCKED_WRAPPER`** diretamente no wrapper do host. |
| **Execução Segura de `restoreCatalog()` em LIVE** | **NÃO_PROVADO** | Bloqueado por risco de remoção prévia (Gameplay Issue #44). Proibido em produção. |
| **Entrega de Fotos ou WhatsApp a Clientes** | **NÃO_PROVADO** | Links de clientes estritamente desabilitados (`CUSTOMER_LINKS_NOT_ENABLED`); zero disparos. |

---

## 9. Matriz Conclusiva Segregada

| Dimensão | Veredito | Justificativa |
| :--- | :---: | :--- |
| **1. Código Local & Quality Gates (CI)** | **GO** | Cobertura total aprovada em MCP PR #14 e Gameplay PR #43 sem qualquer desvio ou falha. |
| **2. Preflight Compose do Leitor** | **GO** | Modelo Compose desacoplado com sucesso entre `CATALOG_READER_RELEASE_DIR` e `RELEASE_DIR`. |
| **3. Deploy via Stackctl Atual** | **BLOCKED_WRAPPER** | O wrapper atual afeta a stack inteira e não suporta isolamento do `catalog-reader`. |
| **4. Deploy em Produção** | **NO-GO** | Nenhuma alteração foi autorizada para a produção nesta etapa; preservação estrita do ambiente live. |
| **5. Entrega / Disparo a Clientes Reais** | **NO-GO** | Bloqueio de segurança 409 mantido; zero publicações ou mensagens disparadas. |
