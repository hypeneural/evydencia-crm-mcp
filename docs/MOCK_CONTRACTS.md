# Mocks do CRM: contrato e limites
Data da auditoria: 24/10/2026. Fonte: `hypeneural/evydencia-crm` HEAD `995101b34d5587d5523d885e28c3070337157f6a`.
Arquivos JSON sintéticos em `fixtures/`, alinhados às estruturas da API Sanctum Extension e aos exemplos Scribe públicos.
- `campaign.json` segue `.scribe/examples/public-agenda/campaign-show-success.json`.
- `availability.json` segue `.scribe/examples/public-agenda/availability-index-success.json`, inclusive `data.slotsByDate`, `data.googleCalendar`, `data.pagination` e `meta`.
- `customer-context.json` segue `CustomerContextQuery::execute`: lookup, customer, history, natal_2026, current_order, capabilities.
- `customer-360.json` segue `Customer360Query::execute`: kpis, pedidos, participantes. **Os dados de participantes são propositalmente descartados** na projeção MCP.
- `proposal-preview.json` segue `ProposalPreviewController::preview`: status, readiness, delivery_scope, customer, selection, summary, existing_proposal, message_preview.
Os números são apenas chaves de cenários fictícios: 48999990001 matched, 48999990002 not_found, 48999990003 ambiguous, 48999990004 purchased.
## Executar
```bash
npm install
npm test
npm run smoke
```
`npm run smoke` inicia um processo MCP stdio real em `EVYD_MOCK_MODE=1` e executa tools pelo SDK cliente. Nenhuma chamada HTTP ao CRM é feita.
## Segurança
`EVYD_MOCK_MODE=1` exige configuração explícita, marca toda resposta com `mock:true` e `source:'fixture'`, e é bloqueado quando `NODE_ENV=production`. Não serve como substituto de testes de homologação contra o CRM real. Nenhuma ferramenta de agendamento foi implementada.
