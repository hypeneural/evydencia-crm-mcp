# PLANO CIRÚRGICO — ChatGPT LIVE MCP 0.10.1 → próxima release
Data: 2026-10-25. Escopo: MCP `hypeneural/evydencia-crm-mcp`; CRM `hypeneural/evydencia-crm` SOMENTE para leitura/referência. Este plano não comprova implantação.

## Identidade, fonte de verdade e segurança
- LIVE aferido no ChatGPT: version=0.10.1, build_commit=f7c7abf, mode=LIVE_OPERATOR_FULL_OAUTH, tools_active_count=17. Não usar MOCK como prova LIVE.
- Os dados comerciais canônicos vêm de `NatalValidOrdersQuery`/`NatalForensicStatisticsService`, não de agregações improvisadas no LLM. Excluir cancelados, chargebacks e estornados; evitar inferir venda pela linha bruta em `orders_items`.
- Token OAuth individual por operador, autorização Sanctum, read-only no bridge, sem credenciais compartilhadas, sem SQL genérico para o LLM, sem PII real em commits, logs ou testes.
- Jamais alterar regras canônicas de vendas, escrever no banco, enviar WhatsApp ou publicar automaticamente. Operações de envio permanecem confirmadas/idempotentes e isoladas.
- Valores monetários canônicos em centavos inteiros; usar pares `*_cents`/`*_reais` somente quando `Math.round(reais*100) === cents`. Ausente não equivale a zero.
- Por padrão, responder com `source`, `as_of` ISO8601 BRT, `scope`, `data_status`, `comparison_basis`, `sample_count`, `methodology` e `warnings` tipados. O modelo não preenche campos faltantes.

## Evidências reproduzidas
1. `crm_estatisticas_natal(nivel_detalhe=resumo)` devolveu ~47.000 caracteres, embora o README anuncie ~9KB; as seções e listas são sempre produzidas, mesmo para perguntas pequenas.
2. A chamada `financeiro_caixa` e `clientes_recompra_campanhas`, paralelas, falhou intermitentemente com `legacy_read_natal_stats_unavailable`. Medir falha real de subprocesso; não supor que seja exclusivamente timeout.
3. Em LIVE, meta ampliada: `goal_total_expanded_revenue_cents=40000000` versus `goal_total_expanded_revenue_reais=300000`; corrigido nesta branch para R$400.000.
4. O PHP publica `loaded_sections`, porém o output schema do Node esperava `sections_loaded`; schema agora aceita ambos, sem inventar preenchimento.
5. Financial: `getFinancialAgingData` registrou R$27.343 pagos, comparado a R$26.113 no rollup canônico: delta R$1.230. Investigar escopo/filtro, não subtrair automaticamente.
6. Permuta R$2.174 é pagamento não monetário mas possui categoria `Dinheiro`; Stone Débito aparece como crédito. Separar `method_name`, `gateway_category`, `economic_nature`, `cash_effect`.
7. A linha de `peak_days_top10` referente a 2026 trouxe 62 pedidos / R$31.035, diferente do KPI 102 / R$54.972; investigar período ou snapshot antes de atribuir erro de venda.
8. `crm_natal_participantes_estatisticas(ano=todos)` mostrou `population_reconciliation` principal de 2026 e histórico 2024-26. Acrescentar metadados de escopo para impedir apresentar esse total como união trienal.
9. Avatar #5127 retornou HTTP 200/WebP, mas o chat mostrou fallback LX no HTML. `asset_accessible` só comprova acesso no gateway, não o navegador/UI do ChatGPT. Verificar CSP, acesso à origem e evento onload/onerror do componente.

## ENTREGA A — CONTRATOS E P0
**Arquivos**: `scripts/crm-natal-bridge.php`, `src/live-gateway.mjs`, `src/legacy-api-read.mjs`, `test/forensic-crm-audit.test.mjs`.
1. Manter a correção de meta em centavos e teste que falha se 40000000 não corresponder a 400000.
2. Padronizar `loaded_sections` no PHP/gateway/testes/docs. Enquanto migrar, manter `sections_loaded` como alias tolerado em outputSchema; não emitir ambos sem motivo.
3. Expor erros tipados e seguros no bridge: timeout, maxBuffer, php_exit, invalid_json, unavailable, schema_invalid; incluir `request_id` e `duration_ms`, SEM stdout de erro, SQL, token ou dados de cliente. Registrar no stderr sanitizado. Erro explícito em vez de indisponibilidade genérica.
4. Reduzir a resposta padrão: criar perfil `kpi_minimal` como opt-in inicialmente, com objeto máximo ~5 KB, contendo somente indicadores solicitados e proveniência. Implementar `fields`/métricas whitelist; não remover campos existentes em `resumo` antes da migração e testes de paridade. Distinga redução do payload de redução real de consultas SQL.
5. No PHP, evitar montar `operational_stages_2026.waiting_product_retrieve_orders`, `orders_without_participants_2026.active_pending_orders` e séries históricas extensas para perfil minimal. A consulta deve usar agrupamentos SQL e filtros já canônicos. Medir SQL, tempo PHP e payload antes/depois.
6. Corrigir `selected_year` / `year_scope` de acordo com o escopo real; separar KPI principal 2026 das séries `historical_2024_2026`. `ano=todos` precisa indicar escopo agregado ou somente comparação multi-ano sem induzir erro.

## ENTREGA B — MÉTRICAS DETERMINÍSTICAS
Preferir **uma** ferramenta read-only `crm_natal_kpi` com enum estrito `metric`, `year`, `cutoff`, `filters` conforme matriz abaixo. Não construir um interpretador de SQL ou mais 20 ferramentas.
- `sales_receipts`: quantidade distinta de contratos válidos, contratado, recebido, saldo, caixa monetário vs permuta, cancelados excluídos.
- `ytd_comparison`: anos com MESMA janela `01/08→cutoff` e mesma regra de efetivação. Não comparar fechamento anual com YTD.
- `top_weeks`: janela móvel de sete dias x semana calendárica, explicitadas e diferenciadas; não usar snapshot de pico como total atual.
- `children_at_or_under_3`: idade até 3 anos completos (< 4 anos), data de referência na sessão; distinção de menores de 3 anos.
- `families_2plus_children`: critério de parentesco Filho(a) separado de contagem de menores de 18 anos e denominação de famílias com registro.
- `packages_for_babies`: filtros <1 ano vs <3 anos; retornar denominador, ranking, zero/sem dado.
- `repurchase_cohort`: mesmos clientes de Natal no ano anterior e alvo, distintos; regra de supressão canônica.
- `purchase_timing`: evento de fechamento comercial no fuso BRT; volume por dia/hora; **não** chamar de ROAS, melhor hora do anúncio ou conversão atribuída sem gasto/impressões.
- `open_installments` / `paid_methods`: caixa registrado no CRM, não conciliação bancária.
- `data_quality`: anomalias com identidade do pedido, contagem, causas e paginação; nenhum auto-fix de nascimento.
Retorno: esquema discriminado `{metric, source, as_of, scope, status, data, methodology, integrity_checks, warnings}`. Ausente retorna `status: unavailable` e causa explícita; nunca números sintéticos nem inferências silenciosas.
Fixtures sintéticas representam a estrutura, não dados reais; os números atuais só entram no roteiro de smoke privado.

## ENTREGA C — UI interativa e avatar
- Priorizar UI nativa do ChatGPT para respostas simples, tabelas e gráficos; não forçar dashboard iframe para um único KPI. MCP retorna typed datasets, eixo/unidade, sinal de confiança e links oficiais.
- Para perfil de pedido/cliente, avaliar MCP Apps com `_meta.ui.resourceUri` e resource `ui://` registrado na mesma autenticação OAuth; HTML isolado, CSP restritivo e recursos de origem allowlisted, sem JavaScript arbitrário vindo do CRM.
- Verificar suporte da versão atual do SDK antes de implementar; NÃO inventar APIs do SDK. Referência de implementação oficial: https://developers.openai.com/apps-sdk/ e https://modelcontextprotocol.io/.
- `avatar.has_avatar`, `asset_accessible` e `render_status` são estados diferentes. Uma URL que abre no navegador não garante a foto no chat. `onload` confirma sucesso do componente; `onerror` registra motivo redigido e fallback LX sem alegar foto exibida.
- Alternativa: UI sem iframe usando link seguro e `customer_initials`. Nunca criar proxy público de imagem com PII sem auth/signed URL curta e revisão de cache/CSP. Não incluir links de PII em logs.
- Visualizações: KPIs 2–4 cartões, gráfico temporal só se séries auditadas, tabela detalhada só sob demanda. Mostrar status (LIVE/MOCK), corte e origem; jamais atribuir aos gráficos dados sem fonte.
- A UI deve ser funcional em mobile e desktop, legível e acessível, sem esconder a explicação textual ou o link canônico.

## ENTREGA D — PERFORMANCE / GATES
1. `npm ci && npm run validate:local`; testes PHP `php -l` nos dois bridges no ambiente adequado.
2. Benchmark existente: `npm run gateway:bench -- --calls=200 --concurrency=4`, com CRM sintético e sem dados reais; complementar p50/p95/p99 do subprocesso PHP e consultas SQL em leitura LIVE autorizada.
3. Metas (propostas, não medição): KPI payload <=5KB, p95 <=3s na condição homologada, erro de schema 0; perfis completos sem regressão.
4. Matriz 12 perguntas: vendas/recebidos; YTD; melhores semanas; até 3 anos; 2+ filhos; bebê/pacote; recompra; dia/hora; parcelas/métodos; pedido #5127 + avatar; auditoria histórica; capacidades. Caso de dado faltante deve retornar unavailable e caso anômalo deve bloquear resposta excessivamente confiante.
5. LIVE smoke read-only com 1–2 perguntas por classe, isoladas, conservando `version/build_commit` antes/depois. Capturar somente métricas e identificadores opacos, nunca PII.
6. Abrir PR com evidência de CI. Não fazer deploy sem review, plano de rollback e prova de invariantes. Em produção `crm_capacidades.build_commit` deve coincidir com `git rev-parse --short HEAD` do host. Confirmar UI do ChatGPT visualmente (avatar) após deploy.

## CONTRA-ALUCINAÇÃO (OBRIGATÓRIO)
- Se uma métrica está ausente, contraditória, `UNCONFIRMED` ou desatualizada: retornar explícita ressalva; NÃO completar com aritmética por hipótese ou de outras fontes.
- Dados derivados têm `formula`, `denominator` e `provenance`; os totais com centavos devem fechar. Não confundir `valid_orders` com `package_units`.
- Logs/provas têm IDs correlacionados e horários, não conteúdo de cliente.
- Não reportar GO para produção ou avatar renderizado apenas porque o código compila ou a sonda HTTP passou.

## Roteiro Windows Antigravity
```powershell
git status --short
git fetch origin
git switch codex/chatgpt-mcp-hardening-20261025
npm ci
npm run validate:local
npm run gateway:bench -- --calls=200 --concurrency=4
```
Se houver alterações locais, preservar e não resetar. Confirmar PHP disponível antes de `php -l`; rodar testes de integração LIVE somente com operador autorizado, sem envio. Documentar primeiro erro real, corrigir uma causa, reexecutar apenas o subconjunto afetado e depois gates finais. Gerar evidências sintéticas e checklist de rollback para PR.
