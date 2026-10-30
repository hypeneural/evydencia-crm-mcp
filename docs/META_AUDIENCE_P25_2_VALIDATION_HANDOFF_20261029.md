> HISTÓRICO P25.2 — este documento registra somente a execução anterior do Antigravity (commit 01aec393). NÃO comprova os hotfixes P25.3 posteriores. Para executar e obter recibo atualizado, consulte docs/META_AUDIENCE_P25_3_FORENSIC_AUDIT_20261029.md e prompts/ANTIGRAVITY_P25_3_LOCAL_VALIDATION_ONLY_20261029.md. PR #23 continua DRAFT / LIVE NO-GO.

# P25.2 — Recibo de Validação Local e Handoff para ChatGPT

Data de referência: 29/10/2026.  
Repositório: `hypeneural/evydencia-crm-mcp`  
Branch: `feat/meta-audience-crm-export-foundation-20261029`  
PR: [#23](https://github.com/hypeneural/evydencia-crm-mcp/pull/23) (mantida estritamente em **DRAFT**)  
Base LIVE: `6abe03992549cee83732ea538e728377a3c989fe`  
HEAD testado e aprovado: [`01aec393f349703cd3179dd7897141a984ccf400`](https://github.com/hypeneural/evydencia-crm-mcp/commit/01aec393f349703cd3179dd7897141a984ccf400)  

---

## 1. Resumo Executivo da Validação Antigravity

A suíte local e os portões estáticos foram executados nativamente via Node 22 e PHP 8.3 através do script de homologação oficial:
```bash
bash scripts/antigravity/validate-meta-audience-p25-local.sh
```

**Resultado consolidado:**
- **Módulos JS (`node --check`):** 6 módulos de audiência, bridge e gateway validados sem erros sintáticos.
- **Testes Focados (`node --test test/meta-audience-*.test.mjs`):** **35/35 testes PASS** (0 falhas, duração ~1.46s).
- **Lint de Código PHP (`php -l`):** 3 scripts PHP verificados sem erros de sintaxe (`crm-meta-audience-read.php`, `crm-meta-audience-preflight-read.php`, `crm-forensic-bridge.php`).
- **Verificação Global de Tipos e Módulos (`npm run check`):** 52 arquivos validados com código de saída 0.
- **Suíte Completa do Conector (`npm test`):** **342/342 testes PASS** (0 falhas, 0 cancelados, duração ~11.33s).

---

## 2. Diagnóstico da Falha Encontrada e Correção Aplicada

Durante a primeira passagem do script no commit `650c071`, 34 de 35 testes focados passaram, com uma única falha em:
- **Arquivo:** `test/meta-audience-mcp.test.mjs` (linha 271)
- **Teste afetado:** `Meta Audience: export requires explicit confirmado_pelo_operador: true`
- **Erro:** `SyntaxError: Unexpected token 'I', "Input vali"... is not valid JSON at JSON.parse`

### Causa-Raiz
No hotfix commit `5e8593f`, o ChatGPT tornou obrigatório o campo `snapshot_id: z.string().min(16).max(100)` no Zod schema de `crm_meta_publico_natal_exportar` em `src/live-gateway.mjs`.  
Porém, no teste negativo da linha 284 de `test/meta-audience-mcp.test.mjs`, o argumento `arguments: { confirmado_pelo_operador: false }` foi passado sem o campo `snapshot_id`.  
Consequentemente, o MCP SDK rejeitou a chamada na camada de validação de esquema de entrada com uma mensagem de texto puro (`Input validation failed: snapshot_id: Required`), antes mesmo de invocar o handler da ferramenta. A tentativa do teste de fazer `JSON.parse(res.content[0].text)` disparava o `SyntaxError`.

### Correção Pontual Aplicada
O teste foi ajustado para fornecer um `snapshot_id` válido no formato do schema:
```javascript
// test/meta-audience-mcp.test.mjs
const res = await client.callTool({
  name: 'crm_meta_publico_natal_exportar',
  arguments: { confirmado_pelo_operador: false, snapshot_id: 'snapshot-dummy-12345678' },
});
assert.equal(res.isError, true);
const data = JSON.parse(res.content[0].text);
assert.equal(data.error, 'operator_confirmation_required');
```
Com o `snapshot_id` presente, a validação de entrada MCP é satisfeita, o handler é executado, a verificação `confirmado_pelo_operador !== true` dispara a exceção tratada `operator_confirmation_required` e o retorno estruturado `{ error: 'operator_confirmation_required' }` passa no teste com sucesso.

- **Commit:** [`01aec39`](https://github.com/hypeneural/evydencia-crm-mcp/commit/01aec393f349703cd3179dd7897141a984ccf400)  
- **Mensagem:** `test(meta): satisfy snapshot_id contract in export confirmation test`

---

## 3. Resposta aos 6 Bloqueios Apontados no Parecer Forense do ChatGPT

Em conformidade com `docs/META_AUDIENCE_P25_2_FORENSIC_REVIEW_20261029.md`:

| # | Bloqueio Apontado pelo ChatGPT | Status Atual Antigravity | Evidência / Observação |
| :-: | :--- | :---: | :--- |
| **1** | **SQL/MySQL Real** (homologar status, joins, schema LIVE, REPEATABLE READ) | **UNKNOWN (Local)** | **Não executado em Live/Produção.** Nenhum acesso ou alteração foi feito no banco legado para garantir risco zero. A validação de queries permaneceu em fixtures sintéticas isoladas. O preflight read-only valida a estrutura quando o host MySQL estiver autorizado. |
| **2** | **Atestação LGPD / Política Legal** | **CONTRATO PASS / POLÍTICA PENDENTE** | Comprovado nos testes estáticos que sem `EVYD_META_AUDIENCE_LGPD_APPROVED=1` e sem `EVYD_META_AUDIENCE_LGPD_POLICY_REF`, o conector falha fechado (zero contatos retornados e erro `crm_meta_audience_legal_basis_not_verified`). A atestação formal do DPO permanece pendente antes do go-live. |
| **3** | **Download via ChatGPT Web** | **PENDÊNCIA FUNCIONAL REGISTRADA** | O conector gera o CSV estritamente no diretório privado do gateway (`0600`) e responde apenas com metadados (`arquivo_id`, `sha256`, contagens). **Não existe** rota/download autenticado entregue ao chat. Permanece como pendência arquitetural. |
| **4** | **Arquivos Órfãos / Janitor Privado** | **PASS** | Validado em `test/meta-audience-private-files.test.mjs` que a rotina `purgeExpiredAudienceExports` exclui exclusivamente arquivos gerados pelo próprio conector (`meta-audience-natal2026-*.csv`) expirados, sem tocar em arquivos de outros serviços nem seguir symlinks. |
| **5** | **SDK scopeChallenge HTTP 403** | **PASS** | Testado em `test/meta-audience-mcp.test.mjs` que um cliente autenticado apenas com `crm.read` recebe HTTP 403 via `scopeChallenge` ao tentar invocar `crm_meta_publico_natal_exportar`, impedindo execução não autorizada. |
| **6** | **Política de Compras 2026 de qualquer produto** | **PASS** | Comprovado que compradores de qualquer produto em 2026 são excluídos, inclusive quando identificados apenas por e-mail ou telefone secundário, considerando status `payment_refunded` e `payment_chargeback` e liquidações em 2026 de pedidos de 2025. |

---

## 4. Matriz de Gates

- **Gate A (Checklist Automatizado Único):** **PASS** (`validate-meta-audience-p25-local.sh` executou com sucesso integral).
- **Gate B (Contrato SQL e Relacionamentos):** **PASS Sintético / UNKNOWN Live**.
- **Gate C (Autorização OAuth e Handshake MCP):** **PASS** (Zero PII, 403 scopeChallenge, snapshot imutável, expiração e revalidação no export).
- **Gate D (Recibo e Stop):** **CONCLUÍDO** (Recibo publicado na PR #23, sem deploy, sem mutações e branch preservada).

---

## 5. Parecer e Recomendações

1. **Aprovação de Código e Testes Locais:** **GO** para o commit `01aec393f349703cd3179dd7897141a984ccf400`.
2. **Homologação em Produção / Meta Upload:** **ESTRITO NO-GO**.
3. **PR #23:** Manter em **DRAFT** aguardando alinhamento com a equipe sobre o transportador de arquivos do ChatGPT e homologação em réplica MySQL.
