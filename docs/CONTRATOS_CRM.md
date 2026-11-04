# Contratos reais verificados no Evydência CRM
Fonte: `hypeneural/evydencia-crm` branch main, inspecionada em 24/10/2026.
## API da extensão — Sanctum
Middleware `extension.correlation`, `extension.nocache`, `auth:sanctum`, `extension.enabled`, `abilities:...`, throttle.
- GET `/api/v1/extension/bootstrap`: `extension:bootstrap`
- GET `/api/v1/extension/customer-context?phone=...`: `extension:customer-read`
- GET `/api/v1/extension/customer-360?phone=...&page=1&per_page=5`: `extension:customer-read`
- POST `/api/v1/extension/proposals/preview`: `extension:proposal-read` — prévia, não agendamento; pode iniciar prova técnica worker.
- POST `/api/v1/extension/proposals/schedule`: `extension:proposal-write` — escrita REAL com request_id e X-Idempotency-Key iguais, modalidade explícita e journal privado; apenas modo normal na folha #24.
- GET `/api/v1/extension/proposals/requests/{requestId}`: `extension:proposal-read` — conciliação somente leitura do próprio operador; confirmed/rejected/inconclusive, sem cache e sem novo agendamento.
- POST `/api/v1/extension/proposals/{uuid}/abort`: `extension:proposal-write` — escrita REAL. NÃO implementado.
`EXTENSION_API_ENABLED` é false por padrão; validar configuração real no CRM antes do teste.
## Agendamento futuro
Corpo: `{request_id:"uuid",phone:"48999990000",name:"Maria"|"null",resend_mode:"normal"}` onde name deve estar presente e valor `null` (JSON) ou string; cabeçalho `X-Idempotency-Key` deve corresponder ao UUID.
Status 201 novo agendamento, 200 replay. Ambos são **scheduled**, não mensagens entregues.
Gold Rule proíbe propostas a quem já adquiriu Natal 2026, cadastros ambíguos são bloqueados, e a identidade do operador deve ter `can_send_proposals`.

Propostas #24 preservam delivery_scope=full_cadence/initial_whatsapp_only; ausência ou valor
desconhecido bloqueiam envio. allow_initial_only=false por padrão; true exige autorização
explícita de contingência. HTTP 409 PROPOSAL_INITIAL_ONLY_CONFIRMATION_REQUIRED e
PROPOSAL_DELIVERY_SCOPE_CHANGED não repetem POST. Veja PROPOSAL_SCOPE_P0_20261030.md.
## APIs públicas
GET `/health/live`; GET `/api/public/v1/agenda/campaigns/{slug}`; GET `/api/public/v1/agenda/campaigns/{slug}/availability?package=slug&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`.
Não afirmar reserva concluída a partir de disponibilidade pública.
