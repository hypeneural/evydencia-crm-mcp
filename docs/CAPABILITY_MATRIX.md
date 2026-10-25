# Matriz de capacidades — fonte de verdade
Toda resposta MOCK é sintética: mock:true, source:fixture. NÃO inferir live por nome de função.

| Pergunta | Ferramenta | MOCK | LIVE | Origem |
|---|---|---|---|---|
| CRM está de pé? | crm_status | ativo | LIVE_PUBLIC | GET /health/live |
| Pacotes e horários públicos? | crm_campanha_publica, crm_horarios_publicos | ativo | LIVE_PUBLIC | Agenda pública |
| Quem é o operador? | crm_conexao_privada | ativo | LIVE_EXTENSION | GET /api/v1/extension/bootstrap |
| Cliente pelo telefone? | crm_cliente_resumo | ativo | LIVE_EXTENSION | GET /customer-context |
| Histórico do cliente? | crm_cliente_360 | ativo | LIVE_EXTENSION | GET /customer-360 |
| Prévia da proposta? | crm_previa_proposta_natal | ativo | LIVE_EXTENSION | POST /proposals/preview (pode sondar worker) |
| Quantos ensaios Natal vendidos? | crm_natal_resumo | ativo | MOCK_ONLY | Futura API Sanctum de estatísticas |
| Agenda privada do dia? | crm_agenda_hoje | ativo | MOCK_ONLY | Futura API Sanctum de agenda |
| Cliente pelo nome? | crm_buscar_cliente_nome | ativo | MOCK_ONLY | Futura API Sanctum de busca |
| KPI Natal detalhado: contratado vs recebido, agenda e pacote? | crm_natal_indicadores_mock | ativo | MOCK_ONLY | NatalForensicStatisticsService; dados fictícios |
| Filtrar pedidos por situação/pacote/data/financeiro? | crm_pedidos_filtrar_mock | ativo | MOCK_ONLY | OrderListRequest gerencial; 10 pedidos fictícios |
| Detalhar um pedido por ID/UUID? | crm_pedido_detalhe_mock | ativo | MOCK_ONLY | OrderResource é sensível; apenas resumo fictício |
| Quais filtros de pedido e Natal existem? | crm_filtros_pedidos_mock | ativo | MOCK_ONLY | Metadados de manager, API legado e Extension |
| Simular envio de proposta? | crm_simular_agendamento_proposta_natal | ativo | MOCK_ONLY | Nenhum envio real |
| Disparar proposta REAL? | crm_agendar_proposta_natal | AUSENTE | WRITE_GATED | POST /proposals/schedule proibido até OAuth+journal+aprovação |

Estados: LIVE_PUBLIC público, LIVE_EXTENSION Sanctum por operador, MOCK_ACTIVE fixture, MOCK_ONLY não existe API live, WRITE_GATED operação real bloqueada, BLOCKED_AUTH sem credencial/opt-in.

Nunca usar /api/orders/search ou SingleAuthentication, SQL, Z-API direta, APIs de painel. Serviços NatalForensicStatisticsService e NatalStatisticsController NÃO implicam uma rota stateless autorizada. CRM referência: hypeneural/evydencia-crm HEAD auditada 995101b34d5587d5523d885e28c3070337157f6a. Revalidar HEAD antes de homologar.

**Nova auditoria:** [CRM Natal, Cliente 360 e pedidos](AUDITORIA_CRM_NATAL_360_PEDIDOS_20261024.md). O CRM HEAD foi revisto em 9749cc09f061, mas os filtros Manager não viram API Extension automaticamente. A amostra de 10 pedidos NÃO explica nem soma os 137 contratos sintéticos do cenário agregado.
