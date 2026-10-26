# Auditoria ponta a ponta do ChatGPT — PrintServer LIVE (26/10/2026)

**Escopo:** somente operações de leitura, configuração/autorização e recusas fail-closed. Sem baixa de pedidos, WhatsApp, novo job ou impressão física.  
**Base de produção no momento da auditoria:** MCP LIVE v0.12.0, `build_commit=4c85f82`.  
**Dependência:** `hypeneural/printserver` PR #1, documentação de impressão sintética.

## Evidência direta observada usando as ferramentas realmente invocáveis do ChatGPT
1. A sessão do conector passou a expor **33 ferramentas invocáveis**, conferidas pelo registro local; `crm_capacidades` confirmou `tools_total_catalog=33`, `tools_active_count=33` e as 3 ferramentas de PrintServer como `LIVE_ACTIVE`.
2. `crm_conexao_privada`: operador `#2`, credencial CRM válida; **Sanctum abilities não são os scopes OAuth MCP**. A versão anterior de `crm_capacidades` não retornava scopes efetivos.
3. `crm_previa_malotes_retirada` em dois pedidos reais retornou `status_key=session_schedule`, `remaining_cents>0`, `print_eligible=false`, `changes_applied=false`; sem escrita.
4. `crm_solicitar_impressao_etiqueta` com `confirmado_pelo_operador=false` retornou `operator_confirmation_required`; nenhuma impressão. Este erro, vindo do código após a checagem de escopo, **é evidência indireta de que a autorização de impressão passou**; o novo campo OAuth elimina a ambiguidade.
5. `crm_consultar_impressao_etiqueta` para job de teste `95bab7dc-62e9-498f-afbd-68775f05e549`, pedido fictício `999999`, falhou com `legacy_read_order_not_found`. Causa exata: o gateway consulta CRM antes do broker, mas o pedido é sintético e só existe em `PrintServer/jobs.json`. Não comprova quebra do broker.
6. `crm_status` do CRM retornou `ok`; não atesta fila física nem spooler.

## Correções implementadas na PR #12
- `crm_consultar_impressao_etiqueta`: **somente** `order_id===999999` pode consultar o broker sem ler o CRM; em todos os demais IDs, mantém CRM check anterior e valida se `job.order_id` retornado é igual ao solicitado. Exige OAuth `print.jobs.write` e allowlist em ambos os caminhos. Consulta é GET, sem impressão.
- `crm_capacidades`: `oauth_authorization` retorna `operator_id`, `granted_scopes` efetivamente recebidos pelo token, `print_scope_granted` e `print_tool_enabled`. Nunca retorna bearer tokens/chaves nem altera a política OAuth.
- `legacy_v012_tools_preserved_count`: contabiliza **29 ferramentas legadas**, excluindo card visual e as 3 novas ferramentas de PrintServer; total mantém **33**.
- `scripts/verify-printserver-smoke.mjs`: somente leitura do job sintético no broker via HTTPS e token do ambiente do processo. Nunca executar em ChatGPT, no notebook ou sem segredo autorizado; executar na VPS somente sob contexto do serviço, sem exibir token.
- Teste de integração em `test/live-gateway.test.mjs` com broker HTTP simulado: status sintético `spooled`, pedido real ausente bloqueado sem consultar broker, escopos efetivos e recusas sem confirmação.

## Distinção dos estados
- `tools_active_count=33`: enumeração do MCP (não disponibilidade física da impressora).
- `print_scope_granted=true`: autorização OAuth de impressão para a sessão, não aprovação automática de cada job.
- `queued`: trabalho persistido; `claimed`: agente recebeu; `spooled`: Sumatra/Windows aceitou o envio; **nunca significa papel impresso**.
- `physical_print_verified` continua `false` até verificação humana do resultado.
- Broker valida token e payload; consulta financeira/status **é feita pelo MCP**; proteger o token do broker é essencial.
- Só o CRM é dono de status/WhatsApp; a API legada de status continua bloqueada no MCP.

## Release/rollback cirúrgicos — com autorização explícita de publicação
**Antes:** PR #12 e PR #1 foram relatadas como implantadas a partir de branches, mas permaneciam `OPEN/DRAFT` e `main` não incluía os commits dessas PRs. **Não considerar merge de main como prova de publicação**, nem dar deploy de HEAD diferente sem comparar artefatos. Registrar SHAs reais de serviço + snapshots e backout.

1. Validar CI no HEAD exato da PR #12; se verde, não repetir testes globais. Conferir `npm run check` e `node --test test/live-gateway.test.mjs test/printserver-client.test.mjs` apenas quando ambiente/CI exigirem.
2. Verificar versões e status `systemctl status evydencia-crm-mcp-live` e `evydencia-printserver` sem divulgar segredos; confirmar no código qual branch/commit foi implantado. Fazer snapshot/rollback da versão existente conforme runbook já autorizado. Não editar CRM Laravel.
3. Sob autorização de deploy, publicar **somente o gateway MCP** com correção da PR #12. Não é necessário atualizar o PrintServer broker para este defeito do job sintético. Não reiniciar serviço da impressora Windows.
4. Reautorizar/atualizar conector ChatGPT se o catálogo/escopos mudarem; aqui o catálogo segue com **33**, portanto atualização de schema pode exigir refresh da conexão.
5. Executar `crm_capacidades` em uma nova sessão e confirmar `oauth_authorization.operator_id=2`, `granted_scopes` com `crm.read` e `print.jobs.write`, `print_tool_enabled=true`. Esses valores precisam vir do token real da sessão, não do manifesto.
6. Chamar `crm_consultar_impressao_etiqueta(999999, "95bab7dc-62e9-498f-afbd-68775f05e549")` apenas como leitura. Esperar `print_state=spooled`, `synthetic_test=true`, `printed_physically=false`. Caso o job tenha expirado/retido ou broker esteja inacessível, **reportar o estado real**, sem simular sucesso.
7. Repetir prévia read-only com pedidos autorizados e um bloqueio `confirmado_pelo_operador=false`, sem POST de impressão. Não habilitar `true`, não criar print novo.
8. Monitorar erros de gateway/filas após release. Em erro de schema/autorização/HTTP, restaurar SHA anterior do gateway e revalidar 30/33 catálogo sem mexer no broker nem Windows.

### Smoke isolado na VPS (alternativo, não substitui tool LIVE)
```bash
# Execute com o environment já carregado no processo autorizado,
# nunca grave nem imprima tokens no terminal/log.
npm run printserver:smoke:read
```
O resultado `spooled` atesta apenas a fila, não a saída física da etiqueta.

## Links e fontes
- Código: `src/live-gateway.mjs`, `src/oauth-gateway.mjs`, `src/printserver-client.mjs`
- [Especificação oficial de ferramentas MCP](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [OpenAI Plugins — autenticação por ferramenta](https://developers.openai.com/plugins/build/auth)
- [MCP Authorization/Scopes](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
