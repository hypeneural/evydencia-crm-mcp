# ANTIGRAVITY — Release leaf da consulta Natal 2026 no ChatGPT MCP
**Referência:** PR #18, commit de origem `5711f6b0b88a300551c28bb2683795d1ec733459`.
**Operação:** última validação local + implantação controlada, zero disparo real.
**Contexto:** o LIVE do ChatGPT reportou `99f3808` (HEAD detached), 36 tools, **sem** `crm_propostas_natal_consultar_lote` durante a auditoria de 28/10. Confirmar novamente, pois o release pode ter avançado.

## 1. Não sobrescrever trabalho paralelo
- Abrir worktree limpo do MCP, `git fetch --prune`, anotar SHA completo de `main`, PRs #14/#15/#16/#18 e do **checkout LIVE real** na VPS.
- A PR #18 é filha da PR #15, mas o LIVE está numa linha mais nova/divergente; **não** publicar a árvore inteira da PR #18.
- Criar *release leaf branch* a partir do SHA implantado e reconciliar **apenas o diff da PR #18 sobre sua base** (`git diff 9c0f1dd29f776f98860c5a9d1c98a4d026da01b7 5711f6b0b88a300551c28bb2683795d1ec733459`).
- Aplicar diff com revisão do resultado e resolver conflitos localmente, sem `reset --hard`, `force push` nem alterar as branches de outras PRs. Não carregar commits da PR #15 que não façam parte do release LIVE sem passar os próprios gates.
- Revalidar `src/live-gateway.mjs`, `src/legacy-api-read.mjs`, bridge PHP, testes e zod. O PHP exige Laravel `vendor/` somente no host apropriado.

## 2. Gates locais, uma rodada por candidato
```bash
npm ci
php -l scripts/crm-forensic-bridge.php
php -l scripts/crm-proposal-history-read.php
php -l scripts/crm-proposal-history-evidence.php
php -l scripts/crm-proposal-history-phones.php
php -l test/proposal-history-scenarios.php
php test/proposal-phone-variants.php
php test/proposal-history-evidence.php
node --test test/proposal-phone-variants.test.mjs
npm run gateway:test
npm run validate:local
npm run gateway:bench -- --calls=200 --concurrency=4
```
- `EVYD_CRM_APP_PATH` aponta para o clone Laravel com dependências instaladas.
- Executar `php test/proposal-history-scenarios.php` com o reader **atualizado**. O teste usa `evyAssert` (41 verificações explícitas; não depende de `zend.assertions`). Um teste negativo intencional deve sair com erro, nunca imprimir PASS.
- Executar outra rodada **MySQL/Laravel sintética com schema REAL**, sem mocks de `GetProposalExecutionProgress` e `NatalValidOrdersQuery`: campanhas 415/416, legados, dispatches, múltiplos reenvios, evidências do provedor, callbacks, customer ambiguity, no-9, destinatário divergente, destinatário vazio e truncamento. Somente leitura e sem PII real.
- Conferir SQL preparado, `SET SESSION TRANSACTION READ ONLY`, `beforeExecuting`, limites de lote e memória, latência p95, ausência de N+1, escopo `crm.read`, permissionamento 401/403 e não exposição dos dados em logs.
- **Não** considerar os 16 PASS originais como prova do novo leitor: o código mudou e havia `assert()` desativável.

## 3. Go/no-go e canário LIVE
- GO apenas após exames locais + homologação MySQL + comparação real **read-only** com a tela do CRM para 1–3 telefones fornecidos privadamente pelo operador (jamais registrar telefone/nome/CPF nos logs ou PR).
- No canário, verificar `crm_capacidades` (build SHA completo e ferramenta registrada), `tools/list` sob OAuth autorizado, query real `crm_propostas_natal_consultar_lote`, estágios e comprovantes de envio (`provider_message_id`, `accepted_at`, `delivered_at`, `read_at`), status de pedido válido e ambiguidade. Corrigir qualquer divergência antes de ampliar.
- Comparar hora BRT com a atividade no CRM; `created_at` não é sinônimo de envio. Não chamar ferramenta de envio da proposta ou ferramentas Z-API de escrita, nem disparar SMS, e-mail, voz, impressão ou modificar CRM.
- Recibo do deploy: SHA LIVE anterior/pós, branch release, tools count anterior/pós, testes, rollback em diretório de release anterior, health checks, erros de syslog sem PII.
- Em falha: rollback **somente do MCP** para o SHA anterior, sem tocar CRM/Gameplay/PrintServer/Z-API; reportar `BLOCKED_WITH_EXACT_REASON`.
- Após sucesso, avisar que a ferramenta foi ativada para o operador ChatGPT. Se `tools/list` estiver em cache, solicitar atualização/reconexão do conector; o GPT executará o primeiro teste real **somente leitura** aqui.
