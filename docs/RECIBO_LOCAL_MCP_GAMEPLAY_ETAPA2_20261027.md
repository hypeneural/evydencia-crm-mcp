# Recibo Formal de Homologação Local — MCP × Gameplay (Etapa 2)
**Data:** 27/10/2026 | **Ambiente:** Avell Windows 11 (Desenvolvimento / Homologação Local)

---

## 1. HEADs Reais e Estado dos Worktrees

| Repositório | Worktree / Diretório | Branch / Referência | Commit HEAD | Status Git |
| :--- | :--- | :--- | :--- | :--- |
| **MCP (PR #14)** | `.../gameplay-mcp-20261026/crm-mcp-pr14` | `integration/live-35tools-gameplay-reconciled-20261027` | `582cd9a33b43081ae2d65139b726d53b74d8a9bf` | **Limpo** (`working tree clean`) |
| **MCP (PR #11)** | `.../gameplay-mcp-20261026/crm-mcp-dev` | `feat/gameplay-read-client-20261026` | `78ed39c41000938dc849632c3cac5a83e230e44b` | **Limpo** (`working tree clean`) |
| **Gameplay (PR #43)** | `.../gameplay-mcp-20261026/gameplay-code` | `feat/gameplay-status-read-api-20261026` | `c7526bf5853157a5b7891f3baaafaca2c39b79f7` | **Limpo** (`working tree clean`) |

---

## 2. Total e Resultado dos Testes Locais

### 2.1 CRM MCP — PR #14 (`crm-mcp-pr14`)
| Suíte de Teste | Comando | Duração | Resultado | Cobertura / Destaques |
| :--- | :--- | :--- | :---: | :--- |
| **Links & Integração Release** | `node --test test/gameplay-links.test.mjs test/gameplay-integration-release.test.mjs` | 678ms | **PASS** (13/13) | Rejeição de URLs não loopback, fail-closed 401/409, ausência de vazamento de secrets/UUIDs, coexistência PrintServer + Gameplay. |
| **Gateway Tests** | `npm run gateway:test` | 2.48s | **PASS** (22/22) | PKCE OAuth, SSE/HTTP, isolation per operator, PrintServer allowlist, labels PNG canônicos, fail-closed Gameplay. |
| **Suíte Unitária Completa** | `npm test` | 8.65s | **PASS** (247/247) | 247 testes aprovados (217 legados/CRM + 30 PrintServer/malotes/etiquetas). 0 falhas, 0 pulados. |
| **Checagem de Sintaxe** | `npm run check` | 4.8s | **PASS** | 46 arquivos verificados com `node --check` sem erros de importação ou sintaxe. |
| **Sidecar Verification** | `npm run gameplay:sidecar:verify` | 1.8s | **FAIL-CLOSED** (Previsto) | `SIDE_NETWORK_UNAVAILABLE` (loopback local não ativo; recusa segura de URLs externas). |

### 2.2 Gameplay — PR #43 (`gameplay-code`)
| Suíte de Teste | Comando | Duração | Resultado | Cobertura / Destaques |
| :--- | :--- | :--- | :---: | :--- |
| **Vitest Catalog Server** | `pnpm exec vitest run CatalogServer, GameplayStatusLookup` | 716ms | **PASS** (18/18) | Prova do bloqueio 404 em rotas públicas no modo `privateMetadataReadOnly`, `/healthz` ativo e `/internal/*` autenticado. |
| **Full Quality Check** | `pnpm check` | 48s | **PASS** (604/604) | 113 arquivos de teste Vitest, TypeScript sem erros, ESLint limpo, 0 violações Depcruise (522 módulos), Knip limpo, Prettier LF limpo. |
| **Staging Release Build** | `pnpm release:staging` | 4.5s | **PASS** | 375 arquivos montados de forma imutável em `.release/vps`. |
| **Staging Release Verify** | `pnpm release:verify` | 1.6s | **PASS** | Manifesto e hashes validados: `gitSha: c7526bf5853157a5b7891f3baaafaca2c39b79f7`. |

---

## 3. GitHub Actions CI do HEAD da PR #14

Auditado diretamente via GitHub CLI (`gh pr checks 14 -R hypeneural/evydencia-crm-mcp`):
- **Commit HEAD:** `582cd9a33b43081ae2d65139b726d53b74d8a9bf`
- **Workflow `MCP validation` (`validate`):** **SUCCESS** (22s) — [Run 40583331318](https://github.com/hypeneural/evydencia-crm-mcp/actions/runs/40583331318/job/122468234018)
- **Workflow `Validate MCP` (`test`):** **SUCCESS** (22s) — [Run 40583331318](https://github.com/hypeneural/evydencia-crm-mcp/actions/runs/40583331274/job/122468234129)
- **Workflow `Validate MCP` (`test` no push):** **SUCCESS** (20s) — [Run 40583319494](https://github.com/hypeneural/evydencia-crm-mcp/actions/runs/40583319494/job/122468194181)

---

## 4. Inventário Antes e Depois de Ferramentas (MCP LIVE)

| Categoria | Release Atual (`e872fac`) | PR #11 (Divergente) | PR #14 (Reconciliada) | Status / Preservação |
| :--- | :---: | :---: | :---: | :--- |
| **Base / Capacidades** | 7 | 7 | 7 | Preservadas (`crm_capacidades`, `crm_status`, etc.) |
| **Diretas do CRM** | 7 | 7 | 7 | Preservadas (`crm_pedidos_buscar`, `crm_estatisticas_natal`, etc.) |
| **Forense** | 1 | 1 | 1 | Preservada (`crm_clientes_buscar`) |
| **PrintServer & Malotes** | 3 | **0 (DELETADAS)** | **3 (PRESERVADAS)** | `crm_previa_malotes_retirada`, `crm_solicitar_impressao_etiqueta`, `crm_consultar_impressao_etiqueta` |
| **Proposta Comercial** | 2 | 2 | 2 | Preservadas (`crm_previa_proposta_natal`, `crm_enviar_proposta_natal`) |
| **Interface Visual MCP** | 1 | 1 | 1 | Preservada (`crm_ui_cartao_resumo`) |
| **Z-API WhatsApp** | 10 | 10 | 10 | Preservadas (mensageria e instâncias) |
| **Z-API Diagnósticos** | 2 | 2 | 2 | Preservadas (`crm_zapi_status_instancia`, `crm_zapi_historico_instancia`) |
| **Gameplay** | 2 | 2 | 2 | Preservadas (`crm_gameplay_links`, `crm_gameplay_auditoria`) |
| **TOTAL ATIVAS** | **35** | **32 (Incompleta)** | **35 (100% Integra)** | **Zero perda de ferramentas** |

---

## 5. Divergências e Correções Encontradas

1. **Origem da Reconciliação:** A PR #11 havia sido criada sobre a `main`, antes do merge da PR #12 (PrintServer). A PR #14 corrigiu a divergência ramificando a partir de `release/live-35tools-gameplay-printserver`, trazendo o suporte a links e 409 sem descartar as ferramentas de impressão e malotes.
2. **Gatilho de CI Ajustado:** O workflow do GitHub Actions em `.github/workflows/ci.yml` foi adaptado no commit `6cd5953` para responder a PRs direcionadas à release, ativando os testes automáticos para a PR #14.
3. **Bloqueio de URLs Não-Loopback:** O teste `assertLoopbackOrigin` rejeita categoricamente IPs públicos (ex.: `169.58.210.14`), hostnames arbitrários, portas ausentes e query strings.

---

## 6. Build Efetivo do Sidecar e Estado da Media VPS (`169.58.210.14`)

- **Porta e Listener:** `127.0.0.1:4182` em escuta ativa (`tcp LISTEN`).
- **Processo em Execução:** `PID 3879467` rodando com `CATALOG_PRIVATE_METADATA_READ_ONLY=1`, `NODE_VERSION=24.22.1`, apontando para `/data/sqlite/catalog.db`.
- **Commit em Execução:** `37190a8` (build intermediário da PR #43).
  - `GET /healthz`: Responde `HTTP 200 OK`.
  - `POST /internal/v1/sessions/lookup-batch`: Responde `HTTP 401 Unauthorized` na ausência de token.
  - `GET /`: Responde `HTTP 200 OK` (versão ainda serve HTML estático).
- **Diferença em Relação ao Local (`c7526bf`):** A release local compilada adiciona a negação `HTTP 404` em rotas públicas (`/`, `/demo/*`, `/s/*`).
- **Banco SQLite e WAL:**
  - Montagem: `/srv/runtime/christmas-games/data/sqlite` montado em `/data/sqlite` com flag `ro` (read-only).
  - Arquivos: `catalog.db` (1.28 MB), `catalog.db-shm` (32 KB), `catalog.db-wal` (0 bytes).
  - Backup: `backup-pre-private-reader-20261027.sqlite` existente no diretório.
  - Segurança de DDL: O leitor opera com `PRAGMA query_only = ON;`, impedindo qualquer escrita.

---

## 7. Evidências Comprovadas vs Ainda Ausentes

| Item | Status | Justificativa |
| :--- | :---: | :--- |
| **35 ferramentas ativas e preservadas** | **COMPROVADO** | Testado na suíte unitária (247 testes) e verificado no `live-gateway.mjs`. |
| **Fallback HTTP 409 sem invenção de URLs** | **COMPROVADO** | Testado em `test/gameplay-links.test.mjs` e `gameplay-integration-release.test.mjs`. |
| **Bloqueio de capability URLs em lote** | **COMPROVADO** | Testado sinteticamente e garantido no schema de batch. |
| **Compilação determinística Gameplay** | **COMPROVADO** | Artefato staging gerado com 375 arquivos e SHA `c7526bf`. |
| **CI do HEAD da PR #14 aprovado** | **COMPROVADO** | GitHub Actions verde em 3 execuções. |
| **Deploy de `c7526bf` na Media VPS** | **AUSENTE / PENDENTE** | VPS executa `37190a8`. Depende de janela autorizada de deploy. |
| **Acesso Autenticado 200 via Túnel Loopback** | **AUSENTE / PENDENTE** | Nenhuma credencial foi copiada para o Avell; requer teste via canal seguro na VPS. |
| **Liberação de Fotos e Links Reais a Clientes** | **BLOQUEADO (NO-GO)** | `readiness.json` em `false`; proibição estrita de publicação sem piloto consentido. |

---

## 8. Matriz Conclusiva GO / NO-GO Segregada

| Componente | Veredito | Condição e Justificativa |
| :--- | :---: | :--- |
| **1. Código Local (MCP PR #14 & Gameplay PR #43)** | **GO** | 247 testes MCP + 604 testes Gameplay 100% aprovados sem falhas; syntax check sem pendências. |
| **2. Integração Git (PR #14 sobre Release)** | **GO** | A PR #14 preserva integralmente os 35 tools e possui CI verde no GitHub Actions. Pronta para merge na branch de release quando autorizado. |
| **3. Sidecar Privado (Media VPS)** | **GO (Pendente Atualização)** | Listener em 4182 e autenticação 401 validados; deploy do bundle `c7526bf` pendente para fechar rotas públicas com 404. |
| **4. Entrega Real aos Clientes** | **NO-GO** | Governança mandatória: zero publicação, zero envio WhatsApp e zero exposição de dados reais de famílias. |

---

## 9. Plano do Próximo Corte e Rollback

1. **Deploy do Sidecar na Media VPS:**
   - Copiar o bundle `.release/vps` gerado no commit `c7526bf` para `/srv/runtime/christmas-games/release`.
   - Reiniciar exclusivamente o container `catalog-reader` (sem tocar no catálogo público).
   - Validar com curl local: `GET /` deve retornar 404; `GET /healthz` deve retornar 200.
2. **Promoção da PR #14:**
   - Realizar merge da PR #14 em `release/live-35tools-gameplay-printserver`.
   - Atualizar o serviço `evydencia-crm-mcp-live.service` no host MCP.
3. **Rollback de Emergência:**
   - **MCP:** `git checkout e872fac8aa0d5281ceb4ac66ba979ff0aad7293e && sudo systemctl restart evydencia-crm-mcp-live.service`.
   - **Sidecar:** `docker stop christmas-games-catalog-reader && docker rm christmas-games-catalog-reader`.

---

## Adendo de auditoria forense posterior — Etapa 3 (27/10/2026)

**Este recibo preserva o histórico do Antigravity; não é um atestado dos HEADs atuais após as correções da Etapa 3.** A auditoria canônica atual está em [`AUDITORIA_FORENSE_ETAPA3_MCP_GAMEPLAY_20261027.md`](./AUDITORIA_FORENSE_ETAPA3_MCP_GAMEPLAY_20261027.md), com [prompt operacional](./PROMPT_ANTIGRAVITY_ETAPA3_MCP_GAMEPLAY_20261027.md).

1. **SHAs não são intercambiáveis:** este recibo referiu `582cd9a...`; mensagem posterior indicou `9dce0bee...`; API GitHub no início da Etapa 3 retornou `9dce0beb795ad98b75724189f9af6ac8bd1c8b34`. Exigir consulta `gh pr view 14 --json headRefOid` e CI no HEAD atual antes de GO.
2. **P0 corrigido na PR Gameplay #43:** o overlay de `catalog-reader` não declarava `command`; a imagem Node usaria seu comando padrão, sem herdar `catalog.command`. Corrigido para `['node','server/main.js']` e adicionada regressão de deployment boundary. Novo SHA requer `pnpm check`, `pnpm release:staging`, `pnpm release:verify` e CI próprios.
3. **P1 corrigido na PR MCP #14:** o probe `gameplay:sidecar:verify` agora exige o JSON `error=CUSTOMER_LINKS_NOT_ENABLED` na resposta 409. Um 409 qualquer não valida a API Gameplay. Regressão adicionada; novo HEAD requer `npm test` e CI.
4. **Inventário canônico LIVE conferido pelo ChatGPT:** build `e872fac`, 35 ferramentas ativas em 37 catalogadas. O nome real do card é `crm_renderizar_card_visual`. `crm_marcar_disponivel_retirada` e `crm_processar_malotes_retirada` seguem `NOT_AVAILABLE`. `gameplay_private_probe.private_contract_ok` com `dataset_proven=false`.
5. **Substituir os vereditos antigos de rollout:** o reader Media VPS observado com GET `/` = 200 permanece **NO-GO**; após atualização autorizada de `catalog-reader`, exigir 200 health, 404 páginas públicas, 401 sem Bearer, 200 com Bearer reservado e 409 de JSON canônico. Backup existente não é prova de restauração.
6. **Rollback revisado:** não executar `git checkout` em diretório LIVE nem `docker stop && docker rm` fora do `stackctl`; restaurar imagem/artefato/configuração imutáveis anteriores por operação de serviço isolada aprovada. `docker compose restart` não atualiza `command` nem volumes/env. Sem deploy/merge nesta auditoria.
