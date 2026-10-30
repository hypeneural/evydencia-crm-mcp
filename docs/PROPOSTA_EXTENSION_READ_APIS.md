# CONTRATOS FUTUROS (proposta; NENHUMA rota existe ainda)
Não adicionar estes paths ao src/core.mjs. Eles são requisitos para um futuro trabalho autorizado no Laravel CRM.

1. GET /api/v1/extension/natal/summary?year=2026 — escopo novo analytics:read com autorização de gestor. Projeção agregada com total_orders, total_customers, scheduled_sessions, unscheduled_sessions, contracted_cents, paid_cents, balance_due_cents e provenance {source,is_live,as_of}. Nunca confundir valor contratado com recebido.
2. GET /api/v1/extension/orders — escopo orders:read, filtros limitados de status[], produto, data e financeiro; limite 20; campos mínimos permitidos; sem CPF ou nome de crianças.
3. GET /api/v1/extension/orders/{uuid} — resumo seguro de pedido por UUID, status, pacote, finanças e contagem de participantes. Não devolver OrderResource completo.
4. GET /api/v1/extension/customers/search?name=... — busca nominal mínima, com bloqueio de ambiguidades e política por operador.
5. GET /api/v1/extension/agenda?date=... — agenda privada, com política por função.

Todos exigem OAuth individual na fronteira ChatGPT, Sanctum mínimo no upstream, registro de acesso sem PII e testes de autorização. Não usar sessão do Manager ou SingleAuthentication genérico.
