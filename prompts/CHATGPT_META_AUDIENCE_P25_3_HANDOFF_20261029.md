# PROMPT DE HANDOFF — P25.3 PARA AUDITORIA CHATGPT

> **Como usar:** Copie integralmente o texto abaixo e cole no chat com o ChatGPT para a validação final da entrega do Antigravity.

---

```markdown
# AUDITORIA INDEPENDENTE — P25.3 META AUDIENCE CSV (RETORNO ANTIGRAVITY)

Olá ChatGPT. O Antigravity concluiu a validação local independente dos hotfixes e novas proteções da etapa P25.3/P25.3.1 na branch `feat/meta-audience-crm-export-foundation-20261029` da PR #23 do repositório `hypeneural/evydencia-crm-mcp`.

## 1. Estado Atual do Repositório e da PR
- **Repositório:** `hypeneural/evydencia-crm-mcp`
- **Branch:** `feat/meta-audience-crm-export-foundation-20261029`
- **PR:** #23 — mantida estritamente em **DRAFT**
- **HEAD Anterior da Auditoria P25.3:** `d336225250003dd5f1f1426fa4b9bb08a8b49097`
- **HEAD Atual Validado:** `48f3720c1064ec45618b2ce2986831446ab1412d`
- **Ambiente de Teste:** Node `v24.22.1`, PHP `8.3.36`

## 2. Ajuste Pontual Identificado e Corrigido
Durante a execução de `bash scripts/antigravity/validate-meta-audience-p25-local.sh` no HEAD `d336225`, 40 de 41 testes focados passaram, com uma única falha em:
- `test/meta-audience-mcp.test.mjs` (linha 247)
- **Causa:** No commit `eb91e3c`, o retorno de `scopeChallenge` em `src/live-gateway.mjs` (linha 948) foi alterado para `[...requiredScopes]`. Contudo, o `@modelcontextprotocol/server` (`v2.4.0`) implementa `validateScopeChallenge(challenge)` exigindo estritamente a propriedade `scopes: string[]` no objeto (`!Array.isArray(challenge.scopes)` disparava `TypeError`, fazendo o router do MCP retornar HTTP 500 em vez do HTTP 403 esperado).
- **Correção:** No commit `48f3720`, a linha 948 de `src/live-gateway.mjs` foi ajustada para retornar um objeto híbrido `Object.assign([...requiredScopes], { scopes: [...requiredScopes] })`. O MCP SDK validou o challenge com sucesso e emitiu o HTTP 403 esperado para clientes sem o escopo `crm.audience.export`.

## 3. Resultados da Validação Automatizada (Gate A)
Com a correção pontual aplicada, o script oficial `bash scripts/antigravity/validate-meta-audience-p25-local.sh` foi reexecutado e concluído com **código 0**:
- `node --check` em 6 módulos de audiência, bridge e gateway: **PASS**
- `node --test` nos 4 arquivos de teste focados de audiência: **PASS** (41 testes, 0 falhas, 1.20s)
  - `test/meta-audience-csv.test.mjs`: 20/20 PASS
  - `test/meta-audience-mcp.test.mjs`: 10/10 PASS
  - `test/meta-audience-private-files.test.mjs`: 2/2 PASS
  - `test/meta-audience-php-contract.test.mjs`: 9/9 PASS
- `php -l` nos 5 arquivos PHP (leitor, preflight, bridge e classificador): **PASS** (0 erros sintáticos)
- Classificador Comercial PHP Puro (`test/meta-audience-purchase-classifier.php`): **PASS** (13/13 cenários)
- `npm run check` (52 arquivos): **PASS**
- `npm test` completo (21 suítes, 348 testes): **PASS** (**348/348 testes**, 0 falhas, 0 cancelados, 9.10s)

## 4. Matriz de Conformidade com os Portões P25.3
1. **Gate B (Regras Financeiras):** 13 cenários de teste PHP puros exercitados e aprovados. Quarentena individual de compradores ambíguos validada sem bloquear contatos elegíveis não relacionados.
2. **Gate B (MySQL Live):** Marcado como **UNKNOWN / NÃO EXECUTADO EM LIVE** para manter o CRM legado 100% intocado.
3. **Gate C (Propostas e Supressões):** Filtro de propostas restrito a `scheduled`, `allowed/eligible` e não duplicadas/abortadas. Validação estrita de HMAC de supressão com hasher Laravel canônico.
4. **Gate D (OAuth e CSV):** HTTP 403 via `scopeChallenge` comprovado; gate de upload exige >= 100 pessoas distintas E >= 100 telefones válidos; formato CSV manual `email,phone,fn,ln,country` sem CPF ou IDs.
5. **Gate E (Privacidade e Logs):** Zero PII em logs; telemetria agregada com `sql_count` e `sql_ms`.
6. **Gate F (Pendências Conhecidas):**
   - **Download no ChatGPT Web:** Permanece registrado como pendência funcional não implementada (arquivo gravado em disco privado com 0600).
   - **Atestação LGPD:** Servidor falha fechado se não aprovado; decisão formal de política do DPO pendente.
   - **Homologação em Réplica:** Benchmark de índices pendente em ambiente staging.

## 5. Arquivos para Revisão
- `docs/META_AUDIENCE_P25_3_VALIDATION_HANDOFF_20261029.md` (recibo técnico detalhado)
- `src/live-gateway.mjs` (commit `48f3720`)
- `PR #23` no GitHub (mantida em DRAFT)

## 6. Parecer
- **Código e Testes Locais:** `LOCAL_QA_GO`
- **Produção / Upload Meta Ads:** `LIVE_EXPORT_NO_GO`
- **PR #23:** Mantida em **DRAFT**.
```
