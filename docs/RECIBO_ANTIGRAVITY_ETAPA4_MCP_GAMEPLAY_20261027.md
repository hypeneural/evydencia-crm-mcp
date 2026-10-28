# Recibo Técnico Etapa 4 — MCP × Gameplay (somente preflight, NO DEPLOY)

**Data:** 2026-10-27 (BRT)  
**Autor da auditoria de repositório:** ChatGPT, via conector GitHub.  
**Procedimento Antigravity:** `docs/PROMPT_ANTIGRAVITY_ETAPA4_MCP_GAMEPLAY_20261027.md`.

> Este é um recibo de **auditoria cruzada e preparação de execução**. Não é um log de ações locais do Antigravity nem comprova acesso ao filesystem da Media VPS nesta rodada. A tarefa fornecida foi o *prompt da etapa*, não evidências da execução local. Onde não houver observação da VPS, o resultado é **NÃO_PROVADO**.

## 1. Branches, escopo e responsabilidade

| Sistema | PR e branch | HEAD auditado antes dos novos ajustes | Controle |
|---|---|---|---|
| MCP 35-tools | [#14](https://github.com/hypeneural/evydencia-crm-mcp/pull/14) `integration/live-35tools-gameplay-reconciled-20261027` | `37ad9a2a75b179ecba287e404a3506653520cdc2` | branch existente, sem merge/deploy |
| Gameplay reader | [#43](https://github.com/hypeneural/gameplay/pull/43) `feat/gameplay-status-read-api-20261026` | `d9b268afd8baa0c9205da6e0cb681714b91ece47` | branch existente, sem merge/deploy |
| SQLite restore | [Issue #44](https://github.com/hypeneural/gameplay/issues/44) | aberta | separado desta entrega; nenhum restore LIVE |

**Commits de preparação publicados:**
- MCP: `ee93ea8407aa7e4435870b1d7a71a7329c903ce4` (auditoria Compose), `5c532c0750df99b04de107a8e089deab695b1699` (testes), `1984ddd554a442fcd4e6ea9e19f3b55a3e20dbdc` (inspeção stackctl), `d0b8dad334ce8bf3b4384ddb05c71d0b0fa94b77` (SSH por stdin), `9179eb16989236bb169d69cc305dc39e2a74e415` (adendo do runbook). O SHA definitivo deve ser lido no remoto ANTES de execução e registrado pelo Antigravity.
- Gameplay: `dd9788e196a549c955378ea6a3e45c88ae8f818a` (regressão de quantidade de mounts), após corrigir falha de Prettier no primeiro candidato.

**CI observado via GitHub:** MCP `9179eb1` teve `Validate MCP` = **SUCCESS** e `MCP validation` = **SUCCESS**. Gameplay HEAD `dd9788e` foi submetido ao CI; registrar o resultado FINAL atual antes do preflight. Os runs mais antigos, mesmo verdes, **não substituem** CI do HEAD final. Testes locais no Avell: **NÃO_EXECUTADOS NESTA AUDITORIA**. Nenhuma alegação de `pnpm release:verify` no novo commit sem recibo.

## 2. Revisão de código e principais achados

1. **Separação de release: PROVADO NO YAML FONTE.** Gameplay `deploy/vps/docker/compose.private-audit.yaml` usa `CATALOG_READER_RELEASE_DIR` para os três mounts privados (`server`, `package.json`, `web`), e `compose.persistence.yaml` mantém `RELEASE_DIR` público em `catalog`/`gateway`. `tools/deploy/staging-boundaries.test.mjs` verifica exatamente três ocorrências privadas e cinco públicas.
2. **Compose renderizado: AINDA NÃO PROVADO NO HOST.** MCP `scripts/antigravity/audit-gameplay-reader-compose.mjs` chama EXCLUSIVAMENTE `docker compose config --format json` com variáveis sintéticas, compara estruturalmente o serviço público antes/depois e exige rede backend única, porta 127.0.0.1:4182, `node server/main.js`, UID/GID, `read_only`, cap drop, no-new-privileges e sete montagens somente leitura. O script não imprime o modelo nem faz `up`.
3. **Script do wrapper: somente pré-inspeção.** MCP `scripts/antigravity/check-stackctl-reader-readonly.mjs` lê fonte de `stackctl` por arquivo ou stdin SSH, sem execução ou exposição da fonte. Se faltar variável separada/serviço/flag: `BLOCKED_WRAPPER`. Mesmo com marcadores presentes: `REVIEW_WRAPPER_MANUAL_PROOF_REQUIRED`, pois grep em shell script não prova o uso correto do Compose e dos envs.
4. **Recebimento de pedidos: PRIVADO, fail closed.** Sidecar `CATALOG_PRIVATE_METADATA_READ_ONLY=1`, `DatabaseSync({readOnly:true})`, `PRAGMA query_only=ON`, secrets de leitura/servidor distintos. Disponibilizar links fica OFF na Etapa 4; HTTP 409 canônico `CUSTOMER_LINKS_NOT_ENABLED`. Batch não publica capability URLs. Prova do runtime implantado: **NÃO_PROVADO**.
5. **Script de restore inseguro: confirmado na issue #44.** `tools/deploy/backup-restore-catalog.mjs::restoreCatalog()` pode executar `unlink(targetDbPath)`, `unlink(-wal)`, `unlink(-shm)` e remover storage antes de `integrity_check` do DB restaurado. **PROIBIDO contra LIVE**. A implementação de substituição atômica com rollback pertence a PR separada, não ao reader-only; não mexemos neste script.
6. **Release não é imutável apenas por caminho.** `RELEASE.json` inclui SHA do Git, inventário e SHA256 por arquivo; a imagem `node:24-alpine` usa tag móvel, não digest OCI imutável. Antes do corte, conferir imagem efetiva/digest e fixar via mecanismo aprovado sem alterar os serviços públicos. `RELEASE_DIR` público jamais recebe bundle do novo reader.
7. **SSH/media runtime:** relato anterior Etapa 3 indica reader intermediário `20261027-37190a8`, bind 127.0.0.1:4182 e GET `/` = 200 (incompatível com hardening 404). **Não foi reconfirmado nesta rodada**; se persistir, não homologar a release antiga.

## 3. Comandos locais seguros — Antigravity

**Gameplay PR #43 (Avell):**
```powershell
git fetch --prune
git status --short
git rev-parse HEAD
pnpm install --frozen-lockfile
pnpm exec vitest run tools/deploy/staging-boundaries.test.mjs
pnpm repo:map:check
pnpm check
pnpm release:staging
pnpm release:verify
```
Conferir `.release/vps/RELEASE.json`, `gitSha`, arquivo `server/main.js`, contagem/hash real. O número histórico 375 pertence ao SHA `ab672a4`, **não é prova do novo HEAD**. Antes de construir release, worktree limpo exigido.

**MCP PR #14 (Avell):**
```bash
git fetch --prune
git status --short
git rev-parse HEAD
npm ci
npm test
npm run gateway:test
npm run check
npm run gameplay:compose:audit -- --gameplay-root "<WORKTREE_GAMEPLAY>"
```
O auditor usa arquivos Gameplay reais e `docker compose config` sintético; se Docker Compose local não estiver disponível, deve emitir `NO_GO_COMPOSE`, não concluir que o Compose está validado. Nunca divulgar saída completa do modelo.

**Media VPS — inspeção read-only do wrapper, via Avell, sem salvar conteúdo:**
```bash
ssh vpsops@169.58.210.14 'sudo -n cat /usr/local/sbin/stackctl' |
  node scripts/antigravity/check-stackctl-reader-readonly.mjs --stdin
```
Conferir exclusivamente `help`, `show`, `status` ou `dry-run` se forem explicitamente não mutáveis na implementação REAL. Exigir prova de `CATALOG_READER_RELEASE_DIR` distinta, `RELEASE_DIR` público intacto e opção que atinja **apenas** `catalog-reader` sem recriar `catalog`/`gateway`. Caso contrário **BLOCKED_WRAPPER**. Nunca contornar wrapper executando `docker compose up` direto na VPS.

## 4. Integridade SQLite WAL e plano isolado de recuperação

- Antes de depender do reader, verificar de maneira read-only sob o **UID/GID efetivo** do reader se `catalog.db`, `catalog.db-wal` e `catalog.db-shm` estão presentes e legíveis. SQLite >=3.22 pode abrir WAL readonly se sidecars existem e são acessíveis, ou outras condições documentadas. O volume `:ro` não assegura por si só que `readOnly:true` consiga abrir a base.
- Criar snapshot **em futuro procedimento autorizado** usando API online ou `VACUUM INTO` para destino novo, verificação SHA256, `PRAGMA integrity_check` da cópia e verificação de blobs. A cópia da mídia deve corresponder à mesma janela de publicação; snapshot do SQLite sozinho não prova consistência de fotos.
- Restaurar cópia **somente para diretório scratch vazio, separado dos mounts LIVE** e executar SELECTs sintéticos, schema, contagem de manifests e integridade, sem divulgar clientes/UUIDs reais. Se backup/restore não for ensaiado, `BACKUP_RESTORE_NOT_PROVEN`. Nunca excluir WAL/SHM LIVE.
- Fonte: https://www.sqlite.org/backup.html ; https://www.sqlite.org/wal.html ; https://sqlite.org/lang_vacuum.html .

## 5. Prova pós-corte SOMENTE após autorização futura

- Só atualizar `catalog-reader` com bundle verificado/imutável, **sem** reconfigurar catálogo público, gateway, MCP, CRM, PrintServer, Z-API ou Caddy.
- GET loopback `/healthz` -> 200 com schema correto.
- GET `/`, `/demo/fotos`, `/s/synthetic` -> 404, inclusive HEAD público.
- POST `/internal/v1/sessions/lookup-batch` sem Bearer -> 401.
- POST autenticado com UUID sintético inexistente -> 200, `state=not_found`, sem links.
- POST individual autenticado `include_links:true` -> 409 com `CUSTOMER_LINKS_NOT_ENABLED`.
- Executar o probe seguro `npm run gameplay:sidecar:verify` apenas por loopback/SSH aprovado, secret previamente existente no host e sem registrá-lo em argv/log. Sem secret: resultado `INCOMPLETE`, **não PASS**.
- Pós-prova: consulta `crm_capacidades` e `crm_gameplay_auditoria` somente leitura no ChatGPT. Nenhuma publicação, foto, URL individual ou WhatsApp ao cliente sem autorização específica.

## 6. Status e decisão P0

| Gate | Resultado nesta auditoria | Justificativa |
|---|---|---|
| Branch MCP, 35 tools e CI no SHA `9179eb1` | **CÓDIGO / CI PASS** | fonte/PR auditadas; dois workflows verdes; ferramentas PrintServer/Z-API/OAuth não modificadas |
| Gameplay separação YAML de releases | **FONTE PROVADA** | `CATALOG_READER_RELEASE_DIR` em 3 montagens privadas; `RELEASE_DIR` preservada no público |
| Gameplay CI HEAD final e release manifesto | **REVALIDAR** | consultar workflow do SHA novo e `release:verify` local do Antigravity |
| Docker Compose renderizado com ambiente sintético | **NÃO_PROVADO** | script criado, falta executar onde Docker Compose existe |
| `stackctl` real e isolamento de um único serviço | **BLOCKED_WRAPPER** | fonte real/dry-run não inspecionados nesta rodada |
| SQLite restore/integridade/blobs/rollback | **NÃO_PROVADO** | issue #44 aberta; não restaurar LIVE |
| HTTP 200/404/401/200/409 do reader atualizado | **NÃO_PROVADO** | sem corte nesta rodada; runtime antigo não homologável |
| Entrega cliente real | **NO-GO** | `readiness.json` OFF, grants/mídia/browser e consentimento não concluídos |
| Deploy/merge | **NÃO REALIZADO — NO-GO** | Etapa 4 é exclusivamente preflight |

**DECISÃO:** avançar com **preflight local e inspeção read-only**. Estado de implantação `BLOCKED_WRAPPER` até suporte operacional efetivo ser comprovado. A falta de prova não pode ser contornada com alterações diretas em Compose/stackctl ou restauração em LIVE. Próxima pessoa/agente executa somente o runbook acima e reporta nova evidência sem segredos e PII.
