# Antigravity — reimpressão explícita auditável (29/10/2026)

## Repositórios / PRs
- PrintServer: https://github.com/hypeneural/printserver/pull/5 (branch `feat/explicit-audited-label-reprint-20261029`, base `codex/3-independent-order-label-receipts-20261028`).
- MCP: https://github.com/hypeneural/evydencia-crm-mcp/pull/22 (branch homônima, base congelada `base/reprint-live-6abe039-20261029` exatamente no SHA publicado `6abe03992549cee83732ea538e728377a3c989fe`).

## Objetivo
Adicionar `crm_reimprimir_etiqueta` independente da impressão comum, com autorização explícita, **sem campo motivo**, com data/hora e vínculo ao job anterior. Não alterar CRM Laravel, banco, mensagens, pagamento, driver Windows ou protocolo do agente de impressão.

## Contrato seguro
- Nova ferramenta: `crm_reimprimir_etiqueta({order_id,job_id_anterior,confirmado_pelo_operador:true,request_id: UUID})`.
- Autorização: operador OAuth `crm.read` + `print.jobs.write`, operador com permissão PrintServer, CRM fresco para ID e nome, arte CRM original validada.
- Broker: `POST /v1/jobs/reprint`, exclusiva para token admin, novo job apenas com último recibo em `spooled`, arte `crm_canonical`, `reprint_of_job_id` coincidente (CAS), nunca reaproveitar request ID para outro pedido.
- Resposta: `job_id`, `reprint_of_job_id`, `created_at` epoch ms (converter para BRT na UI), `request_id`, estado. `spooled` nunca significa confirmação física.
- Recibos: `GET /v1/orders/{id}/label-history` com linha do tempo persistente e auditável, `GET /v1/jobs/{id}` para históricos; retenção do histórico (somente metadados) após pruning da fila.
- Timeout 5xx, estados `unknown` ou `claimed`: sem repetir automaticamente. Reconsultar `request_id` no histórico.
- Nenhum motivo obrigatório; sem PII/tokens/artes no histórico ou logs.
- Não liberar reimpressão de `minimal`, `failed`, `expired` ou arte antiga sem reconciliação.

## Procedimento local (sem produzir etiqueta real)
1. Conferir worktrees existentes e alterações locais; não usar reset/clean/force.
2. Inspecionar os dois PRs e confirmar 2 arquivos + teste no PrintServer; 2 arquivos + teste no MCP. Verificar HEADs exatos e divergências de deploy.
3. PrintServer Node >=22: `npm run check`, `npm test`, `npm run agent:validate:local`. Revisar migração JSON v2->v3 com cópia/backup; rollback precisa restaurar binário E estado juntos, sem reintroduzir Jobs já impressos.
4. MCP Node >=22: `npm ci`, `npm test`, `npm run gateway:test`, `npm run check`, `node --test test/printserver-reprint.test.mjs`.
5. Os testes devem cobrir sucesso com PNG sintético válido, replay com mesmo request_id, CAS conflitante, concorrência, estados incertos, restart/prune, histórico sem PII, gates OAuth, 401/403, 409, timeouts e falha de persistência.
6. Testar broker apenas em servidor HTTP loopback sintético, sem VPS, sem impressora, sem clientes.
7. Validar que reverse proxy encaminha `/v1/jobs/reprint` e `/v1/orders/{id}/label-history` apenas à rota broker já protegida; preservar regras de acesso.
8. Se os testes passarem, preparar relatório de GO/NO-GO e commits/PRs finais. **Não fazer deploy automático, merge, impressão comercial ou reimpressão de pedido real.**

## Requisitos de aceite
- Fluxo original `crm_solicitar_impressao_etiqueta` continua deduplicado.
- Primeiro job preservado; novo job com timestamp e pai auditável, sem exigir motivo.
- Falha em gravar JSON não deixa job novo na fila.
- Confirmação via catálogo MCP/Web só após deploy separado; nenhum `spooled` interpretado como papel entregue.
- Dependência: homologar Broker PR #5 antes de promover MCP PR #22. Sem alterar a branch principal do CRM.
