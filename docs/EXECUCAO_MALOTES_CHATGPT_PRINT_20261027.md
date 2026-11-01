# Release cirúrgico — Fotos de malotes → status 10 → etiqueta Natal com QR

**Data:** 27/10/2026. **Repositórios:** CRM PR #432 / Issue #431, MCP PR #12 / Issue #10, PrintServer PR #1.
**Mudanças NÃO são produção automaticamente.** Conferir HEADs e saúde pelo comando real, nunca por dossiê copiado.

## API efetiva e semântica
Ação correta de chegada física do envelope é **status 10 / waiting_product_retrieve**. Status **12 / order_completed** significa conclusão/entrega posterior, NÃO baixar o envelope recebido.

- Laravel possui rota manager existente `POST /gestao/pedidos/{uuid}/progresso` com `{status:10}`, porém exige cookie de sessão e utiliza helper com risco financeiro/corrida. **Não usar do MCP.**
- CRM PR #432 acrescenta `POST /api/v1/extension/orders/{orderId}/ready-for-pickup`, `auth:sanctum`, ability exclusiva `extension:orders-ready-write`, rate limit existente e `EXTENSION_MALOTES_READY_WRITE_ENABLED=0` por padrão.
- Input: `{request_id:UUID,operator_id:int,expected_status_event_id:int,confirmed_by_operator:true}`. O ID do evento vem de `crm_previa_malotes_retirada`. O token do CRM **deve pertencer ao mesmo operador**.
- Verificação Laravel: `SELECT ... FOR UPDATE` no pedido e parcelas, estados 6/7/9 aceitos; demais estados/estágios/terminais rejeitados; pagamento integral por parcela, `payment_at` presente e centavos via `MoneyCents`; sem parcelas = bloqueio. Status 10 já registrado é no-op.
- Transação cria somente o evento status 10, sem fabricar etapas 7/8/9; observador `OrderStatusObserver::created` é delegado após commit e continua único dono do fluxo campanha/mensagem WhatsApp. Resultado **não certifica entrega WhatsApp**.
- MCP PR #12 acrescenta `crm.marcar` público como nome real **`crm_marcar_disponivel_retirada`**, protegido por OAuth `crm.orders.write` independente de `print.jobs.write`, baseado na ability do operador revalidada pelo gateway. NÃO reutiliza o token de leitura legada.
- Novo **`crm_processar_malotes_retirada`** por lote (máx. 20) quando ambos os escopos e flags de arte estão ativos; modos `so_baixa`, `so_imprime`, `baixa_e_imprime`. Em combinado, faz leitura fresca → baixa → releitura fresca → render PNG CRM → broker → resultado por pedido. Não há transação distribuída: falhas individuais exigem reconciliação sem reenvio cego.
- `crm_solicitar_impressao_etiqueta` mantém impressão isolada para pedido já em status10 quitado.

## Gates de segurança antes do primeiro pedido
1. GATE HIGH CRM obrigatório (AGENTS.md, Issue #252 drift em produção): revisar base atual/ownership #332/#328, testar em banco MySQL isolado com duas conexões concorrentes, evento afterCommit, contratos financeiros e notificações; confirmar zero disparo Z-API em testes. O workflow GitHub de uma PR Draft pode não cobrir gate HIGH, então status `mergeable` NÃO é evidência de GO.
2. Na VPS, garantir `/var/www/evydencia/current` igual ao release canônico e gateway de release seguro. Se drift `active.json`/schema não reconciliado: **NO-GO deploy CRM**, sem alterá-lo manualmente.
3. Broker PrintServer PR #1 atualizado para a revisão aprovada com `PRINTSERVER_REQUIRE_CRM_ARTWORK=0`; preservar `jobs.json` e `seen_arrival_orders`, confirmar `/healthz`, polling agent Windows e prova física existente. Sem limpar tombstones.
4. Publicar CRM PR #432 (apenas após HIGH), ainda com `EXTENSION_MALOTES_READY_WRITE_ENABLED=0`. Publicar MCP PR #12 com `EVYD_MALOTES_READY_WRITE_ENABLED=0`, `EVYD_MALOTES_BATCH_ENABLED=0`, `EVYD_CRM_LABEL_RENDER_ENABLED=0`; confirmar health e 33 ferramentas legadas.
5. Testar script PHP CLI do CRM `OrderLabelService` com arquivo PNG sintético, validar QR e configuração real por produto; ativar `EVYD_CRM_LABEL_RENDER_ENABLED=1`, depois `PRINTSERVER_REQUIRE_CRM_ARTWORK=1`; evitar rótulo simples.
6. Com autorização operacional, ativar no CRM `EXTENSION_MALOTES_READY_WRITE_ENABLED=1` e `EXTENSION_MALOTES_ALLOWED_OPERATOR_IDS=2` (ou lista aprovada). Emitir **novo token de operador** com `php artisan extension:token:issue 2 chatgpt-mcp-malotes --orders-ready --ttl=30`. O token é mostrado UMA VEZ, deve ser tratado apenas no console seguro de operação; jamais colar no chat, issues, logs ou commits. Não revogar o token anterior antes de validar o novo.
7. Ativar no gateway `EVYD_MALOTES_READY_WRITE_ENABLED=1`; para combo, `EVYD_MALOTES_BATCH_ENABLED=1` junto com `EVYD_PRINTSERVER_ENABLED=1`, `EVYD_CRM_LABEL_RENDER_ENABLED=1`, OAuth `print.jobs.write` e operador permitido na allowlist. Atualizar/reautorizar o plugin no ChatGPT com o token do novo operador. Catálogo esperado: **35** ferramentas (33 anteriores + ferramenta baixa + ferramenta lote), quando tudo ativado.
8. Verificar `crm_capacidades` build/35 ferramentas, `oauth_authorization.orders_write_scope_granted=true`, `print_scope_granted=true`, operator_id=2. Prévia READ-ONLY para pedido autorizado: `status_event_id` numérico.
9. CANÁRIO COMERCIAL ÚNICO autorizado (somente pedido de teste efetivamente elegível e físico): apresentar preview, validar financeiro/snapshot e confirmar pedido/mode. Testar `crm_marcar_disponivel_retirada` e reconsultar status 10. Confirmar recibo de envio WhatsApp separado (Z-API/campanha) e botão de impressão via MCP com PNG canônico; consultar job até `spooled`, confirmar papel/QR com operador. Não usar #999999 em mutações CRM.
10. Liberar lotes 5–20 apenas após canário, sempre com verificação visual de IDs e nomes, saldo, status, `status_event_id` e confirmação expressa por lote.

## Rollback e prevenção de efeitos indesejados
- Para desativar novas operações: flags MCP batch/status write OFF e CRM write OFF; preservar código/filas para diagnósticos e impressões já enfileiradas.
- Não restaurar snapshot antigo de `jobs.json` por cima de trabalhos posteriores, não apagar tombstones.
- Não reimprimir se timeout/409/unknown; primeiro consultar job, origem e papel fisicamente.
- `spooled` NÃO equivale a impresso; `status10` NÃO comprova WhatsApp entregue.
- Reconciliar código/status/queue atual antes de qualquer rollback. Não fazer deploy CRM caso produção permaneça em drift.

## Validação cirúrgica sem loops
- CRM: `php artisan test --filter=MalotesReadyForPickupTest` com MySQL isolado, seguido gate HIGH Issue #431 (conforme `AGENTS.md` e runbook #252), revisão das notificações afterCommit e concorrência em duas conexões.
- MCP: `node --test test/malotes-ready-client.test.mjs test/malotes-batch.test.mjs test/live-gateway.test.mjs`, `npm run check`, CI dos SHAs.
- PrintServer: CI verde PR #1 no SHA ativo, agente Windows `LABEL`, `USB001`, `Etiqueta` e SumatraPDF 3.6.1, sem repetir impressão da fixture existente.
- Testes canônicos de falha: sem token/ability/consentimento, pagamento parcial, falta de `payment_at`, evento obsoleto, pedido em cancelado/terminal/seleção aberta, replay status10 e print 409/timeout.
