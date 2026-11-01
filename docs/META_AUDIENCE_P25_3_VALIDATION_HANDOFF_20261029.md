# P25.3 — Recibo de Validação Local e Handoff para ChatGPT

Data de referência: 29/10/2026.  
Repositório: `hypeneural/evydencia-crm-mcp`  
Branch: `feat/meta-audience-crm-export-foundation-20261029`  
PR: [#23](https://github.com/hypeneural/evydencia-crm-mcp/pull/23) (mantida estritamente em **DRAFT**)  
Base LIVE: `6abe03992549cee83732ea538e728377a3c989fe`  
HEAD testado e aprovado: [`48f3720c1064ec45618b2ce2986831446ab1412d`](https://github.com/hypeneural/evydencia-crm-mcp/commit/48f3720c1064ec45618b2ce2986831446ab1412d)  
Ambiente de Execução: Node `v24.22.1`, PHP `8.3.36 (cli) (ZTS Visual C++ 2019 x64)`

---

## 1. Resumo da Execução Automatizada (Gate A)

A validação oficial foi disparada em worktree limpa via comando canônico:
```bash
bash scripts/antigravity/validate-meta-audience-p25-local.sh
```

**Resultado consolidado dos testes:**
- **Checagem de Sintaxe JS (`node --check`):** **PASS** (6 módulos de audiência, gateway e bridges verificados).
- **Suíte Focada Meta Audience (`node --test`):** **41/41 PASS** (0 falhas, duração ~1.20s):
  - `test/meta-audience-csv.test.mjs` (20/20 PASS)
  - `test/meta-audience-mcp.test.mjs` (10/10 PASS)
  - `test/meta-audience-private-files.test.mjs` (2/2 PASS)
  - `test/meta-audience-php-contract.test.mjs` (9/9 PASS)
- **Lint de Código PHP (`php -l`):** **PASS** em 5 arquivos (`crm-meta-audience-purchase-classifier.php`, `crm-meta-audience-read.php`, `crm-meta-audience-preflight-read.php`, `crm-forensic-bridge.php`, `test/meta-audience-purchase-classifier.php`).
- **Classificador Comercial PHP Puro:** **13/13 PASS** (`php test/meta-audience-purchase-classifier.php`).
- **Verificação Global de Tipos e Módulos (`npm run check`):** **PASS** (52 arquivos sem erros).
- **Suíte Completa do Conector (`npm test`):** **348/348 PASS** (0 falhas, 0 cancelados, duração ~9.10s).

---

## 2. Diagnóstico da Falha Encontrada e Correção Aplicada

Durante a primeira execução no HEAD `d336225`, 40 de 41 testes focados passaram, com uma única falha em:
- **Arquivo:** `test/meta-audience-mcp.test.mjs` (linha 247)
- **Teste afetado:** `Meta Audience: crm.read alone can request preview, but export is blocked with 403`
- **Erro:** `AssertionError [ERR_ASSERTION]: expected HTTP OAuth scope challenge. Actual: SdkHttpError: Error POSTing to endpoint: {"jsonrpc":"2.0","error":{"code":-32603,"message":"Internal server error"}} (HTTP 500)`

### Causa-Raiz
No commit `eb91e3c`, o retorno de `scopeChallenge` em `src/live-gateway.mjs` (linha 948) foi alterado para `[...requiredScopes]`.  
Entretanto, na implementação de `@modelcontextprotocol/server` (`v2.4.0`), o método `validateScopeChallenge(challenge)` requer estritamente:
```javascript
if (challenge === null || typeof challenge !== "object" || !Array.isArray(challenge.scopes) || challenge.scopes.length === 0) {
  throw new TypeError("scope challenge must contain at least one scope");
}
```
Como `[...requiredScopes]` era um array puro sem a propriedade `.scopes`, `challenge.scopes` resultava em `undefined`, disparando o `TypeError` capturado pelo router HTTP e retornado como HTTP 500 ("Internal server error"), em vez do HTTP 403 com desafio OAuth esperado pelo cliente MCP.

### Correção Aplicada
No commit [`48f3720`](https://github.com/hypeneural/evydencia-crm-mcp/commit/48f3720c1064ec45618b2ce2986831446ab1412d), a linha 948 de `src/live-gateway.mjs` foi ajustada para retornar um objeto híbrido:
```javascript
?undefined:Object.assign([/*?undefined:[...requiredScopes]*/...requiredScopes],{scopes:[...requiredScopes]})
```
Esse formato satisfaz plenamente:
1. `validateScopeChallenge` e `createScopeChallengeResponse` do MCP SDK (`challenge.scopes` é um array de escopos com length >= 1).
2. Qualquer consumidor que avalie o retorno diretamente como array de escopos (`Array.isArray(challenge) === true`).
3. A asserção estática do teste de contrato em `test/meta-audience-php-contract.test.mjs`.

Após a correção, o teste passou com emissão perfeita de HTTP 403 `insufficient_scope`.

---

## 3. Matriz de Avaliação dos Portões P25.3

| Portão | Critério Auditado | Resultado | Detalhe Técnico |
| :--- | :--- | :---: | :--- |
| **Gate A** | Checklist automatizado único | **PASS** | `validate-meta-audience-p25-local.sh` executado com código 0. 348 testes Node e 13 testes PHP PASS. |
| **Gate B** | Classificador comercial PHP | **PASS Sintético** | 13 cenários de teste cobrindo compra 2026, waiting payment, compras 2025 pagas em 2026, estornos, chargebacks e quarentena de múltiplos pedidos da mesma pessoa. |
| **Gate B (Live)** | Execução contra MySQL real / Staging | **UNKNOWN** | Intocado para proteção estrita do CRM legado e ausência de risco operacional. |
| **Gate C** | Propostas, leads e supressões | **PASS** | Propostas elegíveis exigem `status=scheduled`, `eligibility_status in (allowed, eligible)` e `duplicate_of_id NULL`. Contatos apenas agendados viram métrica `scheduled_only_not_exported`. Validação HMAC de supressão com hasher canônico. |
| **Gate D** | OAuth, UX e formato CSV | **PASS** | HTTP 403 `scopeChallenge` comprovado para clientes sem `crm.audience.export`. Reuso de preview 45s. Gate de upload exige >= 100 pessoas distintas E >= 100 telefones válidos. CSV com `email,phone,fn,ln,country` sem CPF ou IDs. |
| **Gate E** | Logs e privacidade | **PASS** | Zero PII, segredos, SQL raw ou caminhos de arquivo privado nos logs. Telemetria agregada com `sql_count` e `sql_ms`. Erros amigáveis ao gestor com categorias e hints. |
| **Gate F** | Documentação e Recibo | **PASS** | Recibo atualizado na PR #23 mantendo-a em DRAFT. |

---

## 4. Pendências Reais para Produção

1. **[PENDÊNCIA FUNCIONAL]: Transporte de Download no ChatGPT Web**  
   O conector MCP grava o CSV em disco privado (`0600`) e responde com `arquivo_id` opaco, contagens e SHA-256. Não existe endpoint ou rota autenticada de download direto pelo operador no chat do ChatGPT.
2. **[PENDÊNCIA JURÍDICA]: Atestação LGPD e Base Legal**  
   O conector valida o fail-closed quando `EVYD_META_AUDIENCE_LGPD_APPROVED !== '1'`. A decisão formal sobre a base legal e preenchimento de `EVYD_META_AUDIENCE_LGPD_POLICY_REF` cabe exclusivamente ao DPO / assessoria jurídica.
3. **[PENDÊNCIA HOMOLOGAÇÃO]: Validação de Índices em Réplica MySQL**  
   Execução do preflight e medição de latência em réplica de homologação autorizada com dados reais mascarados antes do cutover em produção.

---

## 5. Parecer Conclusivo

- **Qualidade de Código e Testes Locais:** **LOCAL_QA_GO** para o HEAD `48f3720c1064ec45618b2ce2986831446ab1412d`.
- **Produção / Deploy / Upload Meta Ads / Disparos:** **ESTRITO LIVE_EXPORT_NO_GO**.
- **PR #23:** Mantida em **DRAFT**.
