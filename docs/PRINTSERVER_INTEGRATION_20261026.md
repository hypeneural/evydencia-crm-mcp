# Integração Evidência MCP → PrintServer independente

**Fase paralela sem alteração no Laravel.** Printserver remoto: https://github.com/hypeneural/printserver

O módulo printserver está protegido pela flag `EVYD_PRINTSERVER_ENABLED=1`; por padrão todas as 30 tools LIVE originais continuam idênticas. As tools novas só são expostas quando `EVYD_INTERNAL_READ_TOKEN`, `EVYD_ENABLE_OPERATOR_FULL_CRM=1`, a flag, URL e token privado estiverem configurados.

## Escopos, tools e responsabilidades
- OAuth `print.jobs.write`, separado de `crm.proposal.write` e de `crm.read`. O operador também precisa possuir ability válida `extension:proposal-write` na versão atual do token, permitindo isolar somente usuários operacionais já aprovados sem mudar o Laravel. Avaliar ability `print:write` independente em fase futura.
- `crm_previa_malotes_retirada({order_ids:[...]})`: **read-only**; até 20 IDs numéricos reconhecidos na imagem pelo ChatGPT, retorna status e saldo. Não marca status 10.
- `crm_solicitar_impressao_etiqueta({order_id,confirmado_pelo_operador:true,request_id?})`: lê status e financeiro atuais no CRM pelo bridge read-only, exige `waiting_product_retrieve` e `remaining_cents===0`, encaminha ao broker somente `order_id`, nome, nome do pacote, operador e UUID; não chama Z-API nem altera CRM. Resposta `queued` do broker significa trabalho em fila, não etiqueta física impressa.
- `crm_consultar_impressao_etiqueta({order_id,job_id})`: estado de fila por job, validado com pedido consultado. `spooled` não é prova física de impressão.

## Deploy separado
1. Instalar e testar PrintServer broker em host autorizado, com `PRINTSERVER_MCP_TOKEN` e `PRINTSERVER_AGENT_TOKEN` diferentes e dados persistentes protegidos em disco. Proxy TLS apenas para rotas do broker; não abrir porta do AnnaHelena. Executar teste sintético antes de produção.
2. No gateway Evidência MCP (VPS existente), acrescentar ao secrets environment:
```text
EVYD_PRINTSERVER_ENABLED=0
EVYD_PRINTSERVER_URL=https://printserver.example.com
EVYD_PRINTSERVER_MCP_TOKEN=<segredo_exclusivo_do_broker>
```
Manter flag `0` até passar todos os testes, calibrar térmica 100×40 e validar privacidade. Nunca enviar tokens ao ChatGPT.
3. Depois ativar a flag, renovar autorização OAuth do ChatGPT se necessário para receber `print.jobs.write`, validar `crm_capacidades` e testar o pedido sintético em impressora homologada.
4. Em notebook AnnaHelena, instalar SumatraPDF portátil oficial e registrar tarefa logon após configuração local, conforme README PrintServer.

## Bloqueio consciente
A API legada `PUT /api/orders/status` **não compartilha as guardas financeiras e de concorrência do painel** e não deve ser chamada pelo MCP. Portanto **baixa por foto ainda não está implementada**. Para cada pedido, enquanto esse endpoint não for corrigido, o operador deve fazer a baixa pelo modal Gestão/Malotes; quando status 10 estiver confirmado, o ChatGPT pode autorizar e solicitar a impressão.

A etiqueta deste MVP tem arte mínima 100×40 e **não é a mesma renderização da etiqueta oficial do CRM**. O layout pode evoluir sem modificar o fluxo comercial.

## Validação
```bash
node --check src/printserver-client.mjs
node --check src/oauth-gateway.mjs
node --check src/live-gateway.mjs
node --test test/printserver-client.test.mjs test/live-gateway.test.mjs
npm run validate:local
```
Sem env: testar que o catálogo atual de 30 tools não muda. Com env sintético e mocks HTTP: exigir confirmation e escopo, status diferente de 10 bloqueia, cliente não confirmado bloqueia, 409 é conflito e não faz retry. Nenhum pedido real, WhatsApp ou impressão real deve ser acionado no teste.

Documentação: https://modelcontextprotocol.io/specification/2025-06-18/server/tools ; https://www.sumatrapdfreader.org/docs/Printing ; https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/register-scheduledtask
