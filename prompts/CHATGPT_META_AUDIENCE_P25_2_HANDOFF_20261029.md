> HISTÓRICO P25.2 — este documento registra somente a execução anterior do Antigravity (commit 01aec393). NÃO comprova os hotfixes P25.3 posteriores. Para executar e obter recibo atualizado, consulte docs/META_AUDIENCE_P25_3_FORENSIC_AUDIT_20261029.md e prompts/ANTIGRAVITY_P25_3_LOCAL_VALIDATION_ONLY_20261029.md. PR #23 continua DRAFT / LIVE NO-GO.

# PROMPT DE HANDOFF — P25.2 PARA AUDITORIA CHATGPT

> **Como usar:** Copie integralmente o texto abaixo e cole no chat com o ChatGPT para a validação final da entrega do Antigravity.

---

```markdown
# AUDITORIA INDEPENDENTE — P25.2 META AUDIENCE CSV (RETORNO ANTIGRAVITY)

Olá ChatGPT. O Antigravity concluiu a validação local independente dos hotfixes P25.2 na branch `feat/meta-audience-crm-export-foundation-20261029` da PR #23 do repositório `hypeneural/evydencia-crm-mcp`.

## 1. Estado Atual do Repositório e da PR
- **Repositório:** `hypeneural/evydencia-crm-mcp`
- **Branch:** `feat/meta-audience-crm-export-foundation-20261029`
- **PR:** #23 — mantida estritamente em **DRAFT**
- **HEAD Anterior da Auditoria:** `650c071b13ec9baa423240a0243b4c11ea729c6b`
- **HEAD Atual Validado:** `01aec393f349703cd3179dd7897141a984ccf400`
- **Comentário de Recibo na PR:** https://github.com/hypeneural/evydencia-crm-mcp/pull/23#issuecomment-6513047270

## 2. Ajuste Pontual Identificado e Corrigido
Durante a execução inicial de `bash scripts/antigravity/validate-meta-audience-p25-local.sh` no HEAD `650c071`, 34 de 35 testes focados passaram, com uma única falha em:
- `test/meta-audience-mcp.test.mjs` (linha 271)
- **Causa:** O hotfix do commit `5e8593f` tornou o parâmetro `snapshot_id: z.string().min(16).max(100)` obrigatório em `crm_meta_publico_natal_exportar`. No teste de recusa por `confirmado_pelo_operador: false` (linha 284), o `snapshot_id` havia sido omitido dos argumentos. O SDK MCP rejeitou a chamada na validação de entrada antes de executar o handler, retornando texto puro de erro que quebrou o `JSON.parse`.
- **Correção:** O teste foi ajustado no commit `01aec39` para fornecer um `snapshot_id` de teste válido. O handler foi devidamente acionado e retornou o JSON esperado `{ error: 'operator_confirmation_required' }`.

## 3. Resultados da Validação Automatizada (Gate A)
Após a correção pontual, o script oficial `bash scripts/antigravity/validate-meta-audience-p25-local.sh` foi reexecutado e concluído com **código 0**:
- `node --check` em 6 módulos de audiência, bridge e gateway: **PASS**
- `node --test` nos 4 arquivos de teste focados de audiência: **PASS** (35 testes, 0 falhas, 1.46s)
  - `test/meta-audience-csv.test.mjs`: 18/18 PASS
  - `test/meta-audience-mcp.test.mjs`: 9/9 PASS
  - `test/meta-audience-private-files.test.mjs`: 2/2 PASS
  - `test/meta-audience-php-contract.test.mjs`: 6/6 PASS
- `php -l` nos 3 scripts PHP (`crm-meta-audience-read.php`, `crm-meta-audience-preflight-read.php`, `crm-forensic-bridge.php`): **PASS** (0 erros sintáticos)
- `npm run check` (52 arquivos): **PASS**
- `npm test` completo (21 suites, 342 testes): **PASS** (**342/342 testes**, 0 falhas, 0 cancelados, 11.33s)

## 4. Alinhamento com os 6 Bloqueios Documentados
1. **MySQL Real / Live:** Mantido **UNKNOWN / NÃO EXECUTADO EM LIVE** para evitar qualquer mutação ou risco no CRM legado. Consultas e regras foram validadas exclusivamente via fixtures sintéticas e checagens estáticas.
2. **Atestação LGPD Servidor-side:** Comprovado fail-closed estrito; sem `EVYD_META_AUDIENCE_LGPD_APPROVED=1` e sem política documentada, zero registros são retornados. A atestação formal do DPO permanece pendente antes do go-live.
3. **Transporte de Arquivo no ChatGPT Web:** Registrado explicitamente como **PENDÊNCIA FUNCIONAL NÃO IMPLEMENTADA**. O conector salva o CSV em disco privado (`0600`) e devolve `arquivo_id` opaco, sem expor caminhos físicos. Não há download direto no chat.
4. **Janitor de Arquivos Temporários:** Comprovada exclusão estrita por TTL e propriedade sem tocar em arquivos de outros serviços.
5. **SDK scopeChallenge HTTP 403:** Comprovado que clientes sem `crm.audience.export` recebem 403 no handshake MCP antes do handler.
6. **Exclusões Financeiras de 2026:** Comprovada exclusão de compras gerais em 2026, estornos, chargebacks e liquidações de pedidos de 2025 pagos em 2026.

## 5. Arquivos para Revisão
- `docs/META_AUDIENCE_P25_2_VALIDATION_HANDOFF_20261029.md` (recibo técnico detalhado)
- `test/meta-audience-mcp.test.mjs` (commit `01aec39`)
- `PR #23` no GitHub (mantida em DRAFT)

## 6. Solicitação
Por favor, analise as alterações do commit `01aec39`, confirme se a correção do teste atende integralmente ao contrato dos seus hotfixes e oriente os próximos passos para a homologação em ambiente controlado.
```
