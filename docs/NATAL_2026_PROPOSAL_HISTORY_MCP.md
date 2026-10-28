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
