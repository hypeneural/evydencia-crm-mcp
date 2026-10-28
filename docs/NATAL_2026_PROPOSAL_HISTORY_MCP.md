# CRM MCP — auditoria de propostas Natal 2026 (read-only)

## Escopo
Nova ferramenta `crm_propostas_natal_consultar_lote`, sob OAuth `crm.read` e ability de leitura de propostas, em LIVE Full CRM com bridge PHP. Não alterar schema, pagamentos, contatos, campanhas, filas, PrintServer, Gameplay nem serviços Z-API. Nenhum envio.

## Fonte canônica e cardinalidade
- `proposal_flows.slug=natal` -> `proposal_dispatches.proposal_flow_id` (1:N).
- `proposal_dispatches` -> `campaign_scheduleds` e `campaign_scheduled_contacts` (0..1 cada, pois bloqueios não geram agendamento).
- `campaign_scheduleds` -> `campaign_scheduled_contacts` (1:N) e `campaign_contact_stage_runs` (1:N por contato).
- `campaign_stage_action_deliveries` por contato/etapa -> `campaign_stage_action_delivery_items` (1:N, tentativas/reenvios).
- `provider_request_attempts` por item (1:N), `communication_events` por contato/item (1:N).
- `customers` separados do destinatário. Uma identidade de celular não implica um único cliente.
- `NatalValidOrdersQuery` identifica compras válidas em 2026; não usar simplesmente existência de pedidos nem status de último pedido.

## Semântica de entrega
`scheduled_at`: não enviado. `sent_at` sem recibo: tentativa não confirmada. `accepted_at` + `provider_message_id`: aceito pelo provedor. `delivered_at` e `read_at`: estados mais fortes, quando efetivamente persistidos. `communication_events` e tentativas HTTP são corroboradores; HTTP 200 sem vínculo não prova entrega. Aceite da etapa de follow-up não comprova aceite da mensagem inicial. Resultados incertos permanecem incertos. Nunca afirmar `nunca enviado` com cobertura parcial ou falta de logs.

## Identidade Brasil
Use DDD válido, E.164 `+55`, 9 dígitos atuais e 8 dígitos legados somente se prefixo móvel 6–9. Para atuais `9[6-9]xxxxxxx`, variante com o 9 removido é *candidata*, não identidade comprovada; fixos (2–5) são exatos. Rejeite busca pelo último bloco de oito dígitos. Preserve entrada original, variante e `match_strength`.

## Execução e limites
1–50 entradas por chamada; grupos canônicos deduplicados, preservando índices de entrada; até 25 eventos recentes por contato. `coverage=partial` quando houver truncamento, indisponibilidade de progresso ou compras. A leitura usa sessão MySQL read-only do bridge existente, executa queries em lote e não registra PII nos logs. Não armazenar dados privados nos testes ou Issues.

## Gates
- `node --test test/proposal-phone-variants.test.mjs`
- `php -l scripts/crm-proposal-history-phones.php`
- `php -l scripts/crm-proposal-history-evidence.php`
- `php -l scripts/crm-proposal-history-read.php`
- `php -l scripts/crm-forensic-bridge.php`
- `php test/proposal-phone-variants.php && php test/proposal-history-evidence.php`
- `node --check src/legacy-api-read.mjs && node --check src/live-gateway.mjs`
- `npm run validate:local` e `npm run gateway:test` em worktree própria
- **Gate obrigatório ainda não executado**: integração Laravel/MySQL sintética com campanhas 415/416, legados e callbacks; comparação de datas/eventos no CRM de homologação (sem envios).

## Rollout
Branch de feature isolada apontada a PR #15 (até que PR #14/15 sejam reconciliadas com LIVE). PR draft; sem merge, deploy ou ativação automática. Não substituir release LIVE por main. CI somente local, sem GitHub Actions.

## Auditoria P0 após PR #18 (28/10/2026)

### Segurança da identidade real do destinatário

O registro `campaign_scheduled_contacts.whatsapp` **não** garante que
`campaign_stage_action_delivery_items.provider_recipient` tenha sido o mesmo.
O leitor agora classifica cada evidência de canais telefônicos:
- `recipient_match=exact`: o provedor registrou o telefone pesquisado;
- `recipient_match=legacy_variant`: variante candidata com/sem nono dígito;
- `recipient_match=mismatch`: telefone divergente (NÃO atribuir o comprovante);
- `recipient_match=not_recorded`: provedor não persistiu o destino; evento de campanha existe, mas telefone não verificado;
- `recipient_match=unverifiable`: o destinatário não pôde ser interpretado; não atribuir o comprovante ao número;
- `recipient_match=not_phone_channel`: e-mail/outro canal, sem prova de destino telefônico.

O resumo de cada grupo inclui `phone_recipient_exact_accepted`,
`phone_recipient_legacy_candidate_accepted`, `phone_recipient_unverified` e
`phone_recipient_mismatch_detected`. O campo preexistente
`any_campaign_message_accepted` descreve o **contato da campanha** e não deve
ser apresentado como confirmação de envio ao telefone exato. Não inferir que
toda mensagem aceita é a proposta inicial: exigir a etapa e a associação do
comprovante.

### Temporada e cobertura

- Despachos exigem `proposal_flow_id` e `created_at` no ano 2026.
- Execuções legadas exigem `suppression_scope_key=natal:2026` ou marcador
  ausente com `campaign_scheduleds.created_at` em 2026, além do vínculo
  com fluxo/campanha. Não reutilizar eventos de 2025 ou 2027.
- `coverage=partial` também quando a janela por contato de mensagens ou
  eventos foi cortada. Ausência de item com cobertura parcial não prova que
  a proposta jamais foi enviada.
- Dados `source_intent` de grupo são unidos pelo UUID de origem + hash do
  telefone + fluxo, nunca pelo telefone de outro cliente.

### Gates para promoção da release (ainda pendentes)

1. Rodar `php test/proposal-history-scenarios.php` com
   `EVYD_CRM_APP_PATH` apontando para clone do CRM Laravel com `vendor/`
   instalado. O teste usa **serviços simulados** para progresso e compras;
   não equivale a execução da política comercial real nem do MySQL 8.
2. Integrar com MySQL de homologação contendo schema real e dados sintéticos,
   exercitando `GetProposalExecutionProgress` e `NatalValidOrdersQuery`
   genuínos, sem substituição por mocks. Negativos obrigatórios: recipient
   diferente, destinatário vazio, temporada 2025, ausência de mensagens,
   callbacks fora de ordem, 50 telefones, entradas inválidas, truncamento.
3. Comparar **somente leitura** na VPS com 1–3 números previamente escolhidos
   pelo operador, confrontando IDs/horários com a tela de atividades do CRM.
   Não registrar CPF, telefone completo, nome ou token em Issues/logs.
4. Conferir build/branch em `crm_capacidades`, escopos OAuth e efetiva
   publicação em `tools/list`. O LIVE anterior (build `564ae0b`) tinha
   36 ferramentas e **não** continha a consulta histórica.
5. Não implantar o HEAD inteiro da PR #18 sem revalidar a herança da PR #15:
   ela permanece Draft com gates Gameplay próprios. Preferir integrar os
   arquivos da leaf de propostas sobre o SHA LIVE reconciliado, sem forçar
   merge da PR #14, #15 ou #16.

### Fundamentação externa

- Laravel Query Builder: https://laravel.com/docs/12.x/queries (bindings parametrizados).
- MySQL 8.4 SET SESSION TRANSACTION READ ONLY:
  https://dev.mysql.com/doc/refman/8.4/en/set-transaction.html
- MCP Tool annotations: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
  (`readOnlyHint` é indicação, não mecanismo de autorização).
