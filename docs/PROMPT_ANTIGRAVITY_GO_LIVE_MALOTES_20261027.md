# ANTIGRAVITY — GO-LIVE ÚNICO (sem loop) | Foto → status 10 → etiqueta QR Natal
**Data:** 2026-10-27. **Execução obrigatória em uma passada**, preservando rollback. Não repita auditorias antigas. **Fonte de verdade:** HEAD real das PRs, VPS e Windows no momento da execução.

## Trabalho de engenharia JÁ entregue no GitHub
- CRM `hypeneural/evydencia-crm` **Issue #431 / PR #432** (branch `codex/N-431-mcp-malotes-status10-20261027`): endpoint Sanctum opt-in `POST /api/v1/extension/orders/{orderId}/ready-for-pickup`, ability dedicada `extension:orders-ready-write`, `expected_status_event_id`, bloqueio financeiro cent-first, `lockForUpdate`, replay idempotente, observer existente após commit. **Não** mudar status 10 para 12; status 12 é entrega/finalização.
- MCP `hypeneural/evydencia-crm-mcp` **Issue #10 / PR #12**: `crm_previa_malotes_retirada` agora traz ID do último status; `crm_marcar_disponivel_retirada` chama rota CRM com token próprio do operador e `crm.orders.write`; `crm_processar_malotes_retirada` faz 1–20 pedidos, modos `so_baixa`, `so_imprime`, `baixa_e_imprime`, com estado por pedido, sem retry cego; `crm_solicitar_impressao_etiqueta` continua atendendo somente impressão já status10 e quitado.
- PrintServer `hypeneural/printserver` **PR #1**, broker + agente Windows PowerShell 5.1 + SumatraPDF. Preserva imagem PNG canônica que `OrderLabelService` renderiza (fundo, nome/pacote, data, WhatsApp, QR) e gera PDF 100×40mm. PDF até 5MiB; jobs persistentes, tombstones, sem reimpressão automática.
- A sessão ChatGPT anterior ainda indicava LIVE `f6f93b5` e 33 ferramentas; **não** afirmar que as novas estão publicadas antes do teste pós-deploy. Quando tudo habilitado corretamente, 35 ferramentas são esperadas (33+baixa+lote).

## Etapa 0 — Um preflight real: STOP/GO binário
1. `git fetch origin` no **worktree owned** de cada repositório; confira HEAD exato de PR #432, #12 e #1, `main` viva e conflitos de ownership conforme `AGENTS.md`.
2. CRM #432: execute **uma vez** testes Laravel/MySQL **isolado** `php artisan test --filter=MalotesReadyForPickupTest`, testes negativos de parcelas, 401/403, confirmação literal, status terminal e dupla requisição em conexões distintas. Verifique `OrderStatusObserver::created` **exatamente uma vez após commit** com notificações fake, nenhuma mensagem real. Se houver erro, corrigir APENAS causa comprovada; registrar receipt no HEAD novo e recertificar.
3. Faça gate HIGH canônico `python scripts/local-ci.py --issue 431 --risk-level HIGH`, sem substituir pelo CI QUICK. Verifique conflitos com CRM Issues #328/#332 e **produção drift Issue #252**. Se `active.json`, schema ou checkout atual divergir do release verificado, **NO-GO**, não mexer manualmente no servidor e não prometer deploy.
4. MCP: verifique 2/2 CI verdes no SHA exato; testes `test/malotes-ready-client.test.mjs`, `test/malotes-batch.test.mjs`, `test/live-gateway.test.mjs` aprovados. PrintServer: CI Windows parser+Node verde no SHA exato. Sem instalar PHP/Laravel no AnnaHelena.

## Etapa 1 — Publicação coordenada e conservadora, APENAS após G0 GO
1. Registrar SHA/serviço/release anterior, backup/rollback genuíno de CRM MySQL+assets e snapshot privado do `printserver/jobs.json`, sem expor PII/tokens. Uma fila em estado `claimed` proíbe reinício do broker sem reconciliar.
2. **PrintServer**: garantir broker atualizado para o PR #1 e Windows agent atualizado no caminho que a tarefa `Evydencia - PrintServer LABEL` realmente executa; `PRINTSERVER_REQUIRE_CRM_ARTWORK=0` inicialmente. Validar `LABEL` USB001, SumatraPDF 3.6.1, `Etiqueta` 100×40, tarefa/polling HTTPS, sem portas inbound Windows.
3. **CRM**: publicar PR #432 com seu mecanismo de release HIGH aprovado, feature `EXTENSION_MALOTES_READY_WRITE_ENABLED=0`. Validar `/health/live`, `/health/ready`, login e api extensão. Sem mudar a API legado.
4. **MCP**: publicar PR #12 em versão homologada com `EVYD_MALOTES_READY_WRITE_ENABLED=0`, `EVYD_MALOTES_BATCH_ENABLED=0`, `EVYD_CRM_LABEL_RENDER_ENABLED=0`; confirmar `/healthz`, OAuth e catálogo anterior 33. Não reiniciar mais do que necessário.
5. Validar PHP CLI/CRM `OrderLabelService` por teste sintético; ativar `EVYD_CRM_LABEL_RENDER_ENABLED=1` no gateway e então `PRINTSERVER_REQUIRE_CRM_ARTWORK=1` no broker. Certifique-se que nenhuma impressão sem arte natalina é aceita. `spooled`≠impresso; não repetir a etiqueta #999999 já homologada.
6. **Ativar escrita** somente após G0 completo: no CRM `EXTENSION_MALOTES_READY_WRITE_ENABLED=1`, `EXTENSION_MALOTES_ALLOWED_OPERATOR_IDS=2` (confirmar operador efetivo) e criar um token NOVO via console seguro `php artisan extension:token:issue 2 chatgpt-mcp-malotes --orders-ready --ttl=30`. **NUNCA** publicar token em logs, chat, issues ou prompts; instalar credencial via fluxo normal da conexão OAuth; não revogar token anterior sem validar o novo.
7. Gateway: `EVYD_MALOTES_READY_WRITE_ENABLED=1` e `EVYD_MALOTES_BATCH_ENABLED=1`, mantendo operadores/print escopados. Atualize/reautorize conexão ChatGPT se necessário. `crm_capacidades` deve mostrar build implantado, operador #2, `crm.orders.write`, `print.jobs.write` e **35 ferramentas** disponíveis.

## Etapa 2 — UM CANÁRIO COMERCIAL, não 15 de uma vez
1. Um pedido autorizado pela operação, com envelope físico presente, nome/ID conferidos, status6/7/9, todas parcelas pagas e registro de `status_event_id` atual. Nunca usar `order_id=999999` para mutação real.
2. Pelo ChatGPT/MCP: chamar `crm_previa_malotes_retirada`; usuário confirma exatamente aquele pedido e modo `baixa_e_imprime`; chamar `crm_processar_malotes_retirada` uma única vez.
3. Reconsultar o CRM: **status 10 e um único evento**, sem status fictício/duplicado; conferir observer e recibos de campanha/WhatsApp do CRM separadamente. Se status mudou e impressão falhou, **não desfazer baixa nem imprimir cegamente**. Consultar broker job e papel, reconciliar manualmente.
4. Conferir job em `queued/claimed/spooled`, QR físico escaneável em smartphone, PNG correto para o produto, margens/corte 100×40. Nunca relatar `printed_physically=true` sem atesto humano.
5. Se canário verde e apenas ele, liberar primeiros lotes 5–15 pelo modo escolhido; cada item recebe resultado independente e confirmação por ID/cliente/saldo antes do envio.

## NO-GO e rollback, sem improvisos
- Se gate HIGH CRM falhar ou drift continuar: habilite somente impressão de pedido já 10, NÃO expose baixa no ChatGPT.
- Se OAuth nega, saldo não confirmado, status_event_id mudou, 409, timeout ou job unknown: **não repetir writes, não forçar status, não reenviar o papel**. Apresentar estado e próxima ação manual.
- Rollback rápido preferencial: desligar flags novas no MCP e CRM, preservando jobs, tombstones, status e notificações já disparadas. Para rollback de código verificar SHA last-known-good REAL em produção, não SHA antigo copiado de relatório. Nunca restaurar `jobs.json` antigo sobre jobs posteriores.
- Nenhum deploy direto `main` ou `git checkout` de SHA contra worktree ativo violando `AGENTS.md`. Usar release tooling aprovado do CRM.

## Evidência final obrigatória (uma única resposta)
`CRM PR#432 / SHA / HIGH result / production drift gate` | `MCP PR#12 / SHA / CI` | `PrintServer PR#1 / SHA / CI` | `Windows queue/polling` | `CRM/MCP/broker production SHAs` | `OAuth 35 tools` | `one canary status10 / WhatsApp receipt / job / physical QR` | GO/NO-GO.
Não refazer pesquisa, design ou dezenas de suítes; apenas validações listadas e o rollout se todos gates passarem.