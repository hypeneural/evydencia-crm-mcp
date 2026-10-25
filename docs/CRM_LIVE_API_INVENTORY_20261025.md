# Conexão de leitura REAL — inventário executável, 25/10/2026
**CRM** hypeneural/evydencia-crm main 9749cc09f06104103e08abef8576d8c7c2dc1fab (Laravel 10/PHP 8.3/MySQL/Sanctum). **MCP** servidor stdio atual é somente MOCK, sem OAuth de operador. Esse modo NÃO pode receber chave real. Código do CRM não foi modificado.

## APIs já prontas no Laravel
| Recurso | Método + caminho | Token/ability | JSON e efeitos |
|---|---|---|---|
| Identificação operador | GET /api/v1/extension/bootstrap | extension:bootstrap | data.operator, data.server, data.features, data.token.abilities, expires_at |
| Cliente resumo | GET /api/v1/extension/customer-context?phone=... | extension:customer-read | data.lookup.status, data.customer, data.history, data.natal_2026, data.current_order.status; not_found/ambiguous são resultados normais |
| Histórico Cliente 360 | GET /api/v1/extension/customer-360?phone=...&page=1&per_page=5 | extension:customer-read | data.kpis, data.orders paginados, data.history, data.current_order; participantes e datas de nascimento vêm no upstream, mas são OMITIDOS pelo MCP |
| Prévia proposta | POST /api/v1/extension/proposals/preview | extension:proposal-read | data.ready, delivery_scope, message_preview; **pode acionar diagnóstico técnico de worker**; off no preflight normal |
| Agendar proposta | POST /api/v1/extension/proposals/schedule | extension:proposal-write | alteração REAL, bloqueada no MCP |
| Abortar | POST /api/v1/extension/proposals/{uuid}/abort | extension:proposal-write | alteração REAL, bloqueada no MCP |
| Campanhas e horários públicos | GET /api/public/v1/agenda/campaigns/{slug} e /availability | sem token | Dados públicos, sem reservas |

As rotas GET /api/orders/search e /api/orders/{uuid}/detail existem, mas usam **SingleAuthentication**, um token interno que também permite PUT status e disparo de campanha. **NÃO usar com a chave Sanitizada/Extension.** Não alegar compatibilidade desse token com Sanctum.

## Estatísticas do painel Laravel existentes, mas NÃO Sanctum
Em `app/Http/Controllers/Manager/NatalStatisticsController.php` (autenticado por sessão Manager):
- `overview`: `kpis_2026`, `financial_situation`, `schedule_analytics`, `evolution`, `ytd_comparison`, `packages_matrix`, `provenance`.
- `nonBuyers`, `loyal`, `transactions`, `simulator` e `exportTransactionsCsv`. Alguns retornam dados individuais: NÃO copiar via sessão/cookie.
- `clearCache` faz mutação de cache: NÃO executar.
A API Sanctum NÃO expõe estatísticas agregadas; fornecer um token read-only não fará esses endpoints funcionarem. Para Natal 2026, o MCP já tem `tools/export-natal-digest.php`, que reaproveita `NatalValidOrdersQuery::getSeasonDigestMetrics()` em CLI com Laravel existente, sem PR no CRM. Falta executar com credenciais autorizadas e comparar com o painel.

## Modo de diagnóstico com chave (local, fora do ChatGPT)
**Atenção:** `php artisan extension:token:issue` emite `ExtensionAbilities::operator()`, que também inclui `extension:proposal-write`. NÃO reutilize a credencial padrão no diagnóstico de leitura. Um administrador precisa provisionar um token Sanctum limitado usando as capacidades já existentes do Laravel, com TTL e abilities mínimas; isso não requer PR no CRM. O diagnóstico consulta `/bootstrap` e rejeita abilities não permitidas, antes de acessar clientes.

Crie um token Sanctum exclusivo de **leitura**, com abilities `extension:bootstrap`, `extension:customer-read` e, SOMENTE se necessário, `extension:proposal-read`. O ambiente Laravel precisa de `EXTENSION_API_ENABLED=1`. Provisione token pela administração do CRM e nunca cole no chat/Git.

No PowerShell do Windows, apenas depois de autorizar o uso de dados reais:
```powershell
cd C:\Projetos\hypeneural\evydencia-crm-mcp
$env:CRM_BASE_URL = 'https://SEU_HOST_CRM'
$env:CRM_READ_TOKEN = Read-Host 'Cole o token somente aqui'
$env:EVYD_MOCK_MODE = '0'
npm run live:read:check -- --mode=bootstrap
npm run live:read:check -- --mode=customer-context --phone=NUMERO_AUTORIZADO
npm run live:read:check -- --mode=customer-360 --phone=NUMERO_AUTORIZADO
Remove-Item Env:\CRM_READ_TOKEN
```
Só imprime `LIVE_READ_CHECK_PASS` e metadados como status do lookup/quantidade na página; nunca nome, telefone, valores ou resposta JSON. **Não execute num prompt/gravação de terminal compartilhados.** Para preview, somente com autorização técnica explícita: `$env:EVYD_ALLOW_PREVIEW_DIAGNOSTIC='1'`; `npm run live:read:check -- --mode=proposal-preview --phone=NUMERO_AUTORIZADO`. Preview não envia, mas pode executar sonda de worker.

`src/live-contracts.mjs` inclui verificador JSON puro (e leitor de arquivos privados) para auditoria offline dos envelopes `schema_version`, `generated_at`, `data`, tipos de lookup e paginação. O diagnóstico live usa `crmClient` que valida e projeta os campos permitidos, e nunca persiste resposta bruta.

## UI visual no ChatGPT
A documentação oficial Plugins/OpenAI distingue `structuredContent` (modelo + UI), `content` e `_meta` (componente). O Plugin atual já devolve `structuredContent`, adequado para o ChatGPT apresentar números e organizar respostas em tabelas/gráficos quando a interface suporta. **Isso NÃO garante um gráfico automático.**
Se precisarmos de dashboard interativo controlado, o padrão é MCP Apps (recurso `ui://` com `text/html;profile=mcp-app`, bridge de estado e toolOutput) e metadados `_meta['openai/ui']`. Não inventar widgets nem empacotar UI agora; primeiro homologar autenticação e números reais. Para visualizações: evoluções mensais/diárias, comparativo anual, funil por status. Não enviar nomes/celulares como `structuredContent` de métricas.

## Próximas dependências antes da conexão LIVE ao ChatGPT
1. OAuth 2.1 autenticado por operador, por tool, com verificação JWT issuer/audience/expiry/scopes; usar conexão separada da anônima MOCK.
2. Validar snapshot canônico 2026 com operador autorizado, status histórico 2025 e comparação com o Laravel.
3. Para pedidos/nome/entregas sem telefone, considerar adaptador SQL privado `SELECT` estrito ou outro serviço existente (não token SingleAuthentication amplo).
4. `proposals/schedule` apenas depois de UI confirmação humana e journal de UUID idempotente; NÃO acrescentado.
Referências: https://developers.openai.com/plugins/build/auth ; https://developers.openai.com/plugins/reference ; https://developers.openai.com/plugins/build/mcp-server

## Diagnóstico opcional da API LEGADA GET (chave diferente de Sanctum)
O repositório contém `src/legacy-api-read.mjs` (sem integração ao Plugin) e `scripts/verify-legacy-get.mjs`. São rotas existentes **GET /api/orders/search** e **GET /api/orders/{uuid}/detail** protegidas por `SingleAuthentication`. O token `EVYDENCIA_LEGACY_TOKEN` é DIFERENTE de `CRM_READ_TOKEN` e tem potencial de executar operações de escrita em outras rotas; por isso requer opt-in explícito e não pode ser usado no Plugin anônimo nem distribuído.
Somente após autorização do operador em terminal privado:
```powershell
$env:EVYD_ALLOW_LEGACY_GET = '1'
$env:EVYDENCIA_LEGACY_TOKEN = Read-Host 'Token legado de integração'
npm run legacy:get:check -- --mode=search --product=natal --status=waiting_product_retrieve
Remove-Item Env:\EVYDENCIA_LEGACY_TOKEN
Remove-Item Env:\EVYD_ALLOW_LEGACY_GET
```
O comando apresenta apenas status, fonte, contagem da amostra e has_more. Não imprime clientes ou payload. A busca suporta nome, produto, status, data de criação e UUID para detalhe (sempre com filtros predefinidos). Contagens da lista limitada NÃO são estatísticas canônicas. A chave não é exposta por HTTP ao ChatGPT nem gravada em `.env`.

Para diagnóstico de estruturas, o retorno de `OrderResource` contém `id`, `uuid`, `customer`, `status`, `items`, `participants`, `installments`, `summary`, `schedule_1`. A projeção no intermediador mantém apenas identificadores do pedido, nome resumido de cliente, status, data, montantes em centavos e contagem de participantes; CPF, e-mail, WhatsApp, nascimento e nomes individuais de participantes são omitidos.
