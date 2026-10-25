# PROMPT READY — Antigravity Gemini Flash: MVP REAL, SEM ALTERAR O CRM

Você está trabalhando no clone `C:\Projetos\hypeneural\evydencia-crm-mcp` e vai preparar o **MVP de consultas reais do ChatGPT** sem editar NENHUM arquivo do repositório `hypeneural/evydencia-crm`. NÃO é pedido para realizar envio real nesta execução.

## Estado já conhecido
- Plugin ChatGPT MOCK com 17 ferramentas e Secure MCP Tunnel já validado; não recriar.
- A conexão atual não autentica o usuário individual do ChatGPT. **Nunca colocar token de cliente ou SQL real nela.**
- O SDK MCP v2.4.0 e o server mock estão aprovados. A versão da main exige bloqueio de live/private no stdio sem OAuth.
- O CRM tem Sanctum extension customer-context, customer-360 e proposals/preview/schedule; estatísticas no Manager e serviço Laravel; API legada /orders/search usa SingleAuthentication com token que também autoriza ações de escrita. NÃO utilizar.
- Estatísticas canônicas reutilizáveis: `App\Services\Reports\NatalValidOrdersQuery::getSeasonDigestMetrics()` com comparação `sales_2026_orders` versus `sales_2025_orders` e proveniência/status do ano; `NatalForensicStatisticsService::getOverviewData()` para os módulos detalhados.

## Execute exatamente nesta sequência

1. `git status --short`; `git fetch origin`; só faça `git pull --ff-only origin main` se alterações locais não forem sobrescritas. Não usar git reset/clean. Registre HEAD. Leia `AGENTS.md` e `docs/MVP_PRODUCAO_SEM_ALTERAR_CRM_20261025.md`.
2. `npm run validate:local`. Deve seguir com MOCK aprovado, sem nenhum token comercial. Verifique `node scripts/tunnel-ready.mjs` apenas para conferir conexão existente. NÃO reiniciar daemon se saudável.
3. Em modo SOMENTE LEITURA do GitHub, rastreie estes arquivos da main CRM: `routes/extension-api.php`, `app/Services/Extension/CustomerContextQuery.php`, `app/Services/Extension/Customer360Query.php`, `app/Services/Reports/NatalValidOrdersQuery.php`, `app/Services/Reports/NatalForensicStatisticsService.php`, `app/Services/Natal/CurrentNatalOrderResolver.php`, `app/Http/Requests/Api/Extension/ProposalScheduleRequest.php`, `app/Services/Proposals/ScheduleProposal.php`. Nunca modificá-los.
4. Criar no MCP em branch separada um ADAPTADOR DE SNAPSHOT **somente local** para um JSON sanitizado com dados REAIS agregados do serviço Laravel existente (não usar fixtures em produção). Validar schema, source, as_of, ano, confiança histórica, limites e ausência de PII; excluir campos de nomes, pedidos, telefones e arrays não autorizados. Falhar fechado se snapshot inexistente, expirado ou proveniência desconhecida. Nenhuma chamada externa na suíte unitária. Inclua testes de null, ano, valores em centavos e corte comparativo. O importador deve ficar desligado do Plugin anônimo.
5. Preparar investigação de execução do Laravel existente como processo de exportação isolado/CLI na infraestrutura já autorizada: antes de executar, verificar o ambiente, `php artisan list` e se Tinker está instalado; medir custo da query em homologação. Não copiar cookies manager, tokens Laravel nem modificar arquivos do CRM. Se não houver permissão, entregar só o contrato de exportação. Não executar consulta pesada em produção sem aprovação.
6. Para consultas de clientes e pedidos, priorizar a API Sanctum existente por telefone. Para nomes/agenda, elaborar apenas um plano de usuário MySQL **somente SELECT** restrito a views/tabelas necessárias, via conexão PRIVADA e TLS/SSH, sem abrir a porta 3306 pública. Não criar usuário nem conceder privilégios nesta etapa. Projete comandos SQL estáticos parametrizados sem execute_sql genérico; comparação com Customer360 para status/financeiro.
7. Projetar autenticação real do gateway MCP com provedor OAuth 2.1 existente (não programar OAuth em Laravel). Validar issuer, audience, expiry, scopes e identidade por tool. **Sem OAuth comprovado nenhuma ferramenta de clientes reais ou estatísticas confidenciais deve ficar invocável no ChatGPT.** Preserve o Plugin MOCK anônimo; usar conexão SEPARADA autenticada para LIVE.
8. Para futuro envio, SOMENTE plano do fluxo preview → confirmação visual da ação, telefone mascarado, journal persistente e request_id UUID → /proposals/schedule com `name` presente, `resend_mode=normal` e X-Idempotency-Key igual a request_id. Respeitar 201 criado vs 200 replay, timeout com UUID estável, conflito 409 e gold rule. Não expor tool SEND ainda; não executar envio real.
9. Testes: unitários e smoke MOCK continuam verdes. Elaborar testes de contrato offline para produção e plano de homologação sobre registros autorizados — sem dados reais nos logs ou no Git. Não repetir npm ci sem alteração de dependências.
10. Entregar em 1 página: arquivos alterados no MCP, diff, HEAD/branch/PR, status MOCK, segurança/auth, status snapshots, fontes para YTD 2026/2025, limitação por nome, desenho de prova para 'fotos prontas para retirar', bloqueios e GO/NO_GO.

## Respostas que o futuro gateway deve conseguir
- "Quanto vendemos de Natal este ano e na mesma data de 2025?" → digest canônico, datas, diferença e confiabilidade de 2025; NUNCA usar mock como real.
- "Qual o total contratado, recebido e saldo de Natal?" → campos em centavos com source/as_of.
- "Como está o pedido mais recente deste cliente?" → cliente inequivocamente resolvido; `current_order` do Natal ativo versus `orders[0]` histórico explicitados.
- "As fotos estão prontas para retirada?" → apenas status `waiting_product_retrieve` no pedido confirmado; `product_retrieve_confirmed` significa já entregue; demais status não afirmar prontas.
- "Envie proposta Natal por WhatsApp para [telefone]" → nesta etapa **BLOQUEADO** sem autenticação, UI de confirmação, journal/idempotência e revisão.

**Critério central:** nenhuma mudança no Laravel e nenhum acesso direto do Plugin ao banco. O gateway MCP é o único lugar de implementação, com mínimos privilégios, fontes verificadas e dados pessoais somente após autenticação individual.
