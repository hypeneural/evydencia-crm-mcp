# PROMPT CRAFT — Antigravity | Homologação MCP PrintServer pós-refresh (26/10/2026)

Atue como engenheiro responsável pela homologação e release cirúrgicos do **Evydência CRM MCP LIVE v0.12.0**. Trabalhe em `hypeneural/evydencia-crm-mcp` PR #12, com `hypeneural/printserver` PR #1 **somente para leitura de contratos**. Leia `AGENTS.md` e `docs/AUDITORIA_CHATGPT_LIVE_PRINTSERVER_20261026.md` antes de executar comandos.

## Evidência já validada diretamente no ChatGPT (NÃO REFAZER SEM MUDANÇA DE SHA)
- O refresh da conexão expôs **33 de 33 ferramentas invocáveis**.
- O `crm_capacidades` implantado retornou `build_commit=4c85f82`, 33 tools `LIVE_ACTIVE`; operador autenticado é #2.
- `crm_previa_malotes_retirada` real retornou dois pedidos ainda status 6 e com saldos pendentes, marcando `print_eligible=false`, `changes_applied=false`.
- `crm_solicitar_impressao_etiqueta` chamado com confirmação `false` retornou `operator_confirmation_required`, sem criar impressão.
- `crm_consultar_impressao_etiqueta` do job fictício #999999 falhava em `legacy_read_order_not_found` antes de tocar no broker. Correção agora adicionada à PR #12: somente #999999 pode pular leitura CRM na consulta, verificando ID do job; qualquer pedido real mantém validações.
- `crm_capacidades` passa a retornar `oauth_authorization.granted_scopes` do token REAL e contagem legada corrigida. O catálogo continua 33.
- `npm run printserver:smoke:read` é leitura autenticada do broker do job sintético, sem mudança de fila.

## Executar nesta ordem, sem loops
1. Verifique HEAD exato de PR #12, o diff contra a branch `main`, e o GitHub Actions `Validate MCP`/`MCP validation`; registre resultados. Se os checks atuais estiverem verdes, não repita suites globais desnecessariamente. Se falhar, leia o job/erro específico e corrija somente a causa.
2. Execute localmente **somente se precisar reproduzir falha**: `node --test test/live-gateway.test.mjs test/printserver-client.test.mjs`, `npm run check`. Nunca use tokens reais para testes locais.
3. Confirme que a PR #12 permanece isolada do Laravel, e que o PrintServer PR #1 não precisa de alteração para corrigir a consulta do job sintético.
4. Faça preflight READ-ONLY na VPS do serviço MCP: registrar `systemctl status`, build realmente executado, SHA do checkout e versão de rollback. Verifique os escopos pela ferramenta `crm_capacidades` **depois** do release, não pela simples lista `scopes_supported`; não copie tokens para logs.
5. Publicação é etapa separada: **somente com autorização expressa de deploy**, atualizar o gateway MCP para o SHA homologado, preservar ambiente/proxy/rollback; não tocar em `evydencia-crm` Laravel, `printserver` broker, Windows AnnaHelena, Z-API ou serviços financeiros.
6. Após deploy autorizado e refresh do conector ChatGPT: conferir 33/33, `oauth_authorization.operator_id=2`, `granted_scopes` contendo `print.jobs.write`; consultar o job sintético `95bab7dc-62e9-498f-afbd-68775f05e549` por `crm_consultar_impressao_etiqueta(order_id=999999, job_id=...)`. Esperar `synthetic_test=true` e estado verdadeiro (não inventar `spooled` se expirado).
7. Validar um lote por `crm_previa_malotes_retirada` (somente leitura), recusa de `confirmado_pelo_operador=false`, e confirmar nenhum POST de impressão no broker nem mensagem WhatsApp. Não usar `confirmado_pelo_operador=true` em clientes reais durante smoke.
8. Registrar em PR #12 um relatório curto de SHAs, testes, escopos, status do job, conclusão/limitação, prova de não-escrita e rollback. Não solicitar nova bateria de CI se o SHA não mudou.

## Critérios de GO
- CI verde no HEAD exato.
- ChatGPT apresenta 33 tools e operador #2 com `print.jobs.write` efetivo.
- Job sintético consultável no broker sem depender do CRM, com `job.order_id===999999`.
- Pedidos reais nunca burlam leitura CRM, status 10, financeiro zero ou confirmação.
- Sem alterações físicas no Windows, sem novas etiquetas, sem novas mensagens, sem alteração do CRM e sem PII ou segredos em logs.
- `spooled` é aceite pelo executável/spooler, **não prova de impressão física**.

**Se um gate falhar:** classifique causa, corrija só o ponto cirúrgico e documente o bloqueio; não faça deploy forçado nem retries cegos.
