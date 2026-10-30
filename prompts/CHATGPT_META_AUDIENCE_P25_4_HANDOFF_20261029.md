# PROMPT DE HANDOFF — P25.4 PARA AUDITORIA CHATGPT

> **Como usar:** Copie integralmente o texto abaixo e cole no chat com o ChatGPT para a validação final da entrega do Antigravity.

---

```markdown
# AUDITORIA INDEPENDENTE — P25.4 META AUDIENCE CSV (HOMOLOGAÇÃO FINAL E RELEASE PREP)

Olá ChatGPT. O Antigravity concluiu a validação local independente do novo HEAD da etapa P25.4 na branch `feat/meta-audience-crm-export-foundation-20261029` da PR #23 do repositório `hypeneural/evydencia-crm-mcp`.

## 1. Estado Atual do Repositório e da PR
- **Repositório:** `hypeneural/evydencia-crm-mcp`
- **Branch:** `feat/meta-audience-crm-export-foundation-20261029`
- **PR:** #23 — mantida estritamente em **DRAFT**
- **HEAD Anterior da Auditoria P25.3:** `58b066077d06f5320aeee960a7b09ed5cc7a729f`
- **HEAD Atual Validado:** `f68e20c7684f2b5cf84e4bab4c6cf488f5a5f2d4`
- **Ambiente de Teste:** Node `v24.22.1`, PHP `8.3.36`

## 2. Resultados da Validação Automatizada (Gate 0)
O script oficial `bash scripts/antigravity/validate-meta-audience-p25-local.sh` foi executado em worktree limpo e concluído com **código 0**:
- `node --check` em 8 módulos (audiência, gateway, OAuth, leitor, preflight e janitor): **PASS**
- `node --test` nos 5 arquivos de teste focados de audiência: **PASS** (48 testes, 0 falhas, 1.20s)
  - `test/meta-audience-csv.test.mjs`: 20/20 PASS
  - `test/meta-audience-mcp.test.mjs`: 12/12 PASS
  - `test/meta-audience-private-files.test.mjs`: 3/3 PASS
  - `test/meta-audience-php-contract.test.mjs`: 10/10 PASS
  - `test/meta-audience-release-preflight.test.mjs`: 3/3 PASS
- `php -l` nos 5 arquivos PHP (leitor, preflight, bridge e classificador): **PASS** (0 erros sintáticos)
- Classificador Comercial PHP Puro (`test/meta-audience-purchase-classifier.php`): **PASS** (13/13 cenários)
- `npm run check` (52 arquivos): **PASS**
- `npm test` completo (21 suítes, 356 testes): **PASS** (**356/356 testes**, 0 falhas, 0 cancelados, 9.34s)

## 3. Conformidade dos Portões Críticos P25.4
1. **OAuth scopeChallenge:** Objeto canônico do MCP SDK v2.4 `{ scopes: [...requiredScopes], errorDescription: '...' }` aprovado, emitindo HTTP 403 real via handshake MCP HTTP.
2. **Isolamento de Diretório Privado:** Bloqueio comprovado contra geração de CSV dentro do checkout Git ou via symlinks (`crm_meta_audience_private_directory_inside_checkout`).
3. **Performance SQL e Paridade de Status:** Paginação de pedidos em lotes de 1.000 IDs e join com `MAX(id)` para último status operacional em paridade com `CurrentOrderStatusResolver`.
4. **Isolamento de Recursos:** Limite de 45s e 24 MiB isolado para a extração Meta, preservando limites de 8 MiB das demais ferramentas.
5. **Preflight e Janitor Offline:** Preflight offline valida `status: "FEATURE_DISABLED"` sem expor segredos; janitor opera em dry-run seguro por padrão.

## 4. Roteiro Operacional de Release em Duas Fases (Canário OFF)
- **Fase 1 (Implantação Inerte):**
  - Publicar código com `EVYD_META_AUDIENCE_ENABLED=0` e `EVYD_AUDIENCE_EXPORT_ENABLED=0`.
  - Nenhuma ferramenta nova de público é registrada; CRM, PrintServer, Z-API e Gameplay operam 100% inalterados.
  - Rollback simples documentado (reversão do commit e reinício da unit).
- **Fase 2 (Ativação Parcial / Homologação):**
  - Ligar prévia apenas após atestação formal do DPO (LGPD) e testes em réplica MySQL.
  - Exportação privada requer aprovação separada com operador allowlisted e diretório `0700` fora do checkout.

## 5. Arquivos para Revisão
- `docs/META_AUDIENCE_P25_4_VALIDATION_HANDOFF_20261029.md` (recibo técnico detalhado)
- `docs/META_AUDIENCE_P25_4_PRODUCTION_RUNBOOK_20261029.md` (runbook operacional)
- `PR #23` no GitHub (mantida em DRAFT)

## 6. Parecer
- **Código e Testes Locais:** `LOCAL_QA_GO`
- **Produção / Upload Meta Ads:** `LIVE_EXPORT_NO_GO`
- **PR #23:** Mantida em **DRAFT**.
```
