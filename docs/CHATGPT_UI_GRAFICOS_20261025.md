# UI do ChatGPT e componentes para o Evydência CRM
Fonte: https://developers.openai.com/plugins/build/chatgpt-ui e /build/mcp-server, docs atualizados em 25/10/2026.

## Decisão de arquitetura
Começar headless: ferramentas com `structuredContent` e campos (source, as_of, data_status, values, currency). O modelo pode resumir, desenhar tabelas e gráficos nativos quando cabível. Não prometer visualização automática, nem construir iframe só para exibir um número.

`src/chart-ready.mjs` produz três datasets tipados: `ytd_orders`, `finance_brl_cents` e `historical_legacy_unverified`. O gráfico legado sempre fica independente dos dois anos canônicos. Não incluir resposta raw do CRM ou dados de crianças.

## Quando uma UI personalizada passa a fazer sentido
Somente quando o usuário quiser cruzar dezenas de anos/mês, filtrar status, comparar pacotes ou confirmar ações no mesmo painel. A rota oficial é MCP Apps com `_meta.ui.resourceUri`, `resources/read` do documento e comunicação por `postMessage` através do bridge MCP Apps (ui/*). Não é preciso framework React para um primeiro gráfico, mas nenhuma UI deve vir antes do gateway LIVE com OAuth individual.

## Layout sugerido quando autorizado
Visão Geral: KPIs vendidos, contrato, recebimento, saldo e metas.
Evolução: barras 2025 × 2026 por datas equivalentes, com label CONFIANÇA quando dados históricos OK.
Operação: sessões sem prova de conclusão, pedidos aguardando retirada (status 10) e entregas concluídas (11). `order_completed` por si só não prova retirada.
Cliente 360: status e histórico resumido por pedido, sem nome de criança/dados financeiros excessivos.
Proposta: PREVIEW separado de SEND com confirmação visual e UUID durável.

Usar fonte e instante da leitura em cada bloco. Nunca misturar `LEGACY_UNVERIFIED` com `LIVE_MYSQL` numa série presumidamente homogênea.
