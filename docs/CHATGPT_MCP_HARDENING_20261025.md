# ChatGPT MCP hardening - 25/10/2026

## Objetivo
Corrigir contratos, precisão financeira, latência e apresentação visual preservando o CRM canônico.

## Achados P0
- `scripts/crm-natal-bridge.php`: `goal_total_expanded_revenue_cents=40000000` diverge de `goal_total_expanded_revenue_reais=300000`; derive reais de centavos.
- `src/live-gateway.mjs`: outputSchema declara `sections_loaded`, resposta em produção usa `loaded_sections`. Corrigir contrato com teste.
- Resumo LIVE de Natal tem aproximadamente 47 KB; implementar projeção mínima opt-in, sem listas nominais.
- Erros `legacy_read_natal_stats_unavailable` devem preservar códigos internos seguros de timeout, limite e falha de contrato sem revelar PII.

## Gates
1. Não modificar nem gravar no Laravel/Redis/MySQL. Não publicar PII no Git.
2. Executar `npm ci`, `npm run validate:local`, benchmark sintético e testes de contrato.
3. Conferir `crm_capacidades` no ChatGPT e smoke LIVE read-only somente após revisão.
4. Não prometer que HEAD/WebP 200 implica que o avatar renderiza no ChatGPT; verificar CSP e UI separadamente.
5. Sem deploy automático sem evidências e rollback pronto.
