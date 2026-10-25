# Auditoria forense — Natal, Cliente 360, pedidos e filtros
Data de referência: 24/10/2026 (Tijucas). Repositório CRM main 9749cc09f06104103e08abef8576d8c7c2dc1fab. Comparação direta com MCP, sem chamadas ao banco ou endpoints reais.

## Estatísticas Natal 2026
Fontes: app/Http/Controllers/Manager/NatalStatisticsController.php, app/Services/Reports/NatalForensicStatisticsService.php, NatalAnalyticsContext.php.
A saída gerencial inclui kpis_2026, financial_situation, schedule_analytics, packages_matrix, participants, forensic_summary, lead_times, occupancy e aging.
KPIs confirmados: total_orders, total_customers, new_customers, recurring_customers, scheduled_sessions, unscheduled_sessions, contracted_cents, paid_cents, balance_due_cents, ticket_medio_order e ticket_medio_customer.
Regra BR-01: venda efetivada por evidência de pagamento OU sessão agendada; NÃO equivaler pedidos brutos, agendamentos ou parcelas ao total vendido. Excluir abortados, chargebacks e estornos. Separar contratado, recebido e saldo.
Proveniência: source, is_live, as_of, generated_at, served_at, cache_age_seconds, canonical_rule, population_scope. Estático fallback do serviço só em não-produção com flag específica.
Controller transactions: filtros year, search, status, type, limit <=500, offset; non-buyers sort natal_spend/natal_orders/total_spend/total_orders, search/limit/offset; loyal sort recent_natal_spend/total_all_spend/total_all_orders/total_natal_spend, search/limit.
ATENÇÃO: rotas são Manager; não estão em routes/extension-api.php. O MCP só pode SIMULAR os relatórios sem endpoint Sanctum autorizado.

## Cliente 360 — API REAL (por telefone)
Fontes: app/Services/Extension/Customer360Query.php; CustomerHistoryQuery.php; CustomerContextQuery.php; tests/Feature/Extension/Customer360Test.php.
GET /api/v1/extension/customer-360?phone=DDD&per_page=5&page=1 (Sanctum extension:customer-read). Lookup pode ser matched, ambiguous, not_found.
KPIs: orders_count, completed_sessions_count, lifetime_value, average_ticket, years_attended, lifecycle_stage. Lifetime value é valor RECEBIDO de compras elegíveis a partir de 2021, valor em REAIS (decimal), NÃO contratado ou contagem de pedidos históricos.
history.total = todos os pedidos paginados (inclusive outras situações), PODE DIVERGIR de kpis.orders_count, que usa condição comercial.
natal_2026: purchased, mode, loyalty_level, years_attended, recommended_action, active_order_uuid.
current_order: uuid, status.code/label/stage, package_name, session_at, created_at, balance_pending, participants_count e gallery_available.
orders: uuid, campaign_key, title, package_name, status, status_label, total_amount, balance_pending, payment_status, session_date, created_at, items e participantes.
payment_status: unknown, pending, partial, paid, refunded, cancelled. Saldo null significa desconhecido, NÃO quitado.
Na API Laravel os participantes incluem nome, nascimento e relação familiar: a projeção MCP SEMPRE os remove e publica somente participants_count.

## Pesquisa e detalhe de pedidos — NÃO API Extension
Manager: app/Http/Requests/Manager/OrderListRequest.php + app/Services/Order/Queries/OrderListFilters.php. Filtros buscar, cliente, product_slug, participants(all/with/without), financial(all/open), avatar(all/with/without), status (até 13 valores), data-tipo(emissao/sessao), data-inicio, data-fim, obs, sort(created_desc/schedule_asc/updated_desc), limit(10/20/30), page.
API integração legada: app/Http/Requests/Api/OrderSearchRequest.php aceita order.id/uuid, datas de emissão/sessão/seleção, order.status, produto e cliente, com campos sensíveis. NÃO é a API Extension.
Detalhes do OrderResource incluem dados de cliente, participantes, childs_data, itens, parcelas, cupom e finanças. NÃO consumir via manager/SingleAuthentication.
NatalCustomerDashboardController utiliza CustomerDashboardDTO::mock() para visualização; a apresentação de dados não comprova que a dashboard é Cliente 360 real.

## O que foi alterado APENAS no MCP
- fixtures/order-catalog.mock.json: 10 pedidos sintéticos (AMOSTRA) independentes das 137 vendas sintéticas de Natal; estados reais do enum e valores em centavos.
- src/mock-orders.mjs: busca mock por nome/ID/status/financeiro/pacote/participantes/datas; detalhe por UUID ou ID fictício; indicadores Natal com provenance STATIC_FIXTURE_TEST; catálogo de filtros Manager, API legada e Extension.
- src/server.mjs: 4 ferramentas novas somente dentro do bloco mock; nenhuma rota real adicionada, nenhum disparo.
- src/capabilities.mjs: capacidades MOCK_ONLY no modo real; WRITE_GATED permanece bloqueado.
- src/core.mjs: ampliação segura da projeção de Customer360 com status, campanha, título, data, loyalty_level e pedido atual, sem nomes/nascimentos de participantes.
- Tests: privacidade, status anulados/desconhecidos, agregados e catálogo separados, filtros inválidos, paginação e valores em centavos.

## Próximos passos sem alucinação
As funcionalidades gerenciais só podem ser LIVE depois de contrato read-only Sanctum aprovado com autorização INDIVIDUAL e testes no CRM. Não alterar Laravel neste projeto. O MCP foi e permanece de demonstração para estes cenários.
Nenhuma resposta MOCK deve ser interpretada como venda, saldo ou agenda de produção. Não inventar valores reais. Envio de proposta permanece WRITE_GATED até journal durável, OAuth por operador e confirmação humana real.
