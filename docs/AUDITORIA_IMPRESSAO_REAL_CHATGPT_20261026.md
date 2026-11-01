# Auditoria E2E de impressão REAL pelo ChatGPT — 26/10/2026

## Resultado comprovado por tools LIVE
- Catalog `crm_capacidades` expôs 33 ferramentas e build `f6f93b5`; OAuth efetivo para operador #2 contém `print.jobs.write`.
- Usuário autorizou **impressão real de teste** e o ChatGPT selecionou um pedido do conjunto anteriormente conferido, após consultar status atual `waiting_product_retrieve`, financeiro `remaining_cents=0` e `print_eligible=true`.
- Exatamente UM `crm_solicitar_impressao_etiqueta({order_id:<real>,confirmado_pelo_operador:true})` retornou `queued`, `replay=false`; consulta posterior `crm_consultar_impressao_etiqueta` retornou `spooled`.
- O MCP confirmou `crm_status_updated=false`, `whatsapp_sent=false`, `printed_physically=false`. Nenhum envio do mesmo job deve ser repetido para checagem, pois ele já foi aceito.
- Não publicar identificadores de clientes, job IDs, dados financeiros ou nomes de clientes no repositório público: evidência privada na conversa e no CRM.

## Stack verificada
- OAuth MCP v0.12.0: `crm.read` + `print.jobs.write` reais; allowlist por operador; write tool de impressão exige `confirmado_pelo_operador===true`, status 10 e saldo zero; anotação de ação física potencialmente irreversível.
- VPS Node 22: broker autônomo PrintServer, persistência `jobs.json`, tokens segregados. Agente Windows PowerShell 5.1 outbound HTTPS consulta a cada ~5 segundos apenas enquanto a impressora está pronta. Print PDF pelo SumatraPDF portátil e spooler Windows.
- `spooled` não equivale a comprovação de papel. Confirmar visualmente que a etiqueta saiu, sem efetuar segunda solicitação.
- O broker não altera o CRM e não dispara WhatsApp; status 10 continua sob API/painel canônico do Laravel.

## Melhorias na branch, não deployadas automaticamente
- No PrintServer, `src/broker.mjs`: `flush:true` no arquivo temporário, persistência fail-closed de expiração e `GET /v1/agent/status` ADMIN-ONLY; presença do agente é inferida exclusivamente de polling autenticado recente e pode ser `false` após restart.
- `src/printserver-client.mjs`: método `agentStatus()` READ-ONLY, que chama `GET /v1/agent/status`.
- `scripts/verify-printserver-smoke.mjs`: inclui status de agente de forma opcional. O smoke nunca gera impressão ou envia WhatsApp. Com broker antigo, exibe `agent_online:null`, sem marcar indisponibilidade falsamente.
- **Limite atual:** `crm_consultar_impressao_etiqueta` ainda não retorna `agent_online` neste commit. Não dizer que a presença do Windows é exposta no ChatGPT até o gateway implementar isso e o conector atualizar o catálogo. Não adicionar nova ferramenta só para esse status sem justificativa.

## Protocolo para fechar 100%
1. Antigravity confirma PRs vs `main`, SHAs live e CI. Gate PrintServer e MCP devem estar `SUCCESS` nos HEADs atuais.
2. Realiza preflight read-only de agente Windows, spooler, fila LABEL, papel 100×40 e task ao logon. Não reiniciar/desinstalar nada sem necessidade.
3. Em broker antigo, só publicar revisão nova depois de snapshot e reconciliação de fila/tombstones, sem jobs em estado claimed. Não misturar alteração de broker com mudança do CRM.
4. Executa `npm run printserver:smoke:read` sob contexto seguro da VPS, sem exibir secrets. Se novo broker ativo, deve mostrar `agent_online=true` somente se houve polling autenticado há ≤30 segundos.
5. Confirmar com operador alinhamento físico da **etiqueta já solicitada**. Não solicitar novo trabalho ao broker para o mesmo pedido.
6. Para escrever chegada de malote pelo ChatGPT: requer futuro endpoint canônico de transição de status/financeiro/outbox no Laravel. A rota legada `PUT /api/orders/status` não deve ser usada.

## OpenAI oficial
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/plugin-guidelines
- https://developers.openai.com/plugins/build/auth
