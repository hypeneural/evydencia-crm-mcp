# Antigravity Gemini Flash — apenas validação local da API real do Evydência CRM

**O código já está implementado na main do MCP.** Não reescreva core, servidores nem o Laravel. Objetivo: validar sem vazamento os JSONs REAIS das rotas Sanctum existentes, usando credencial de leitura fornecida pelo operador no terminal local.

## Faça exatamente nesta ordem
1. Pasta: `C:\Projetos\hypeneural\evydencia-crm-mcp`. `git status --short`; `git fetch origin`; atualize por `git pull --ff-only origin main` somente se não sobrescrever mudanças locais. Não reset/clean/stash automático.
2. Leia apenas `AGENTS.md` e `docs/CRM_LIVE_API_INVENTORY_20261025.md`. As rotas verdadeiras foram verificadas em `hypeneural/evydencia-crm` main; não tocar o CRM.
3. Rode `npm run validate:local` e `.\scripts\validate-mvp.ps1` (esta exige PHP 8.3+). Confirme os testes de `src/live-contracts.mjs` e `src/analytics-visual.mjs`, sem remover os testes anteriores.
4. **Não crie tokens:** o operador irá fornecer apenas localmente token Sanctum com `extension:bootstrap` e `extension:customer-read`, e opcional `extension:proposal-read`. Não registrar token no Git, no prompt, nas capturas ou em logs.
5. No PowerShell configure `CRM_BASE_URL` apontando para o HTTPS CRM real, `EVYD_MOCK_MODE=0` e `CRM_READ_TOKEN` inserido via `Read-Host`. Rode `npm run live:read:check -- --mode=bootstrap`. Se HTTP 401/403/503, reporte causa (token/ability/EXTENSION_API_ENABLED). Nunca tentar contornar o middleware.
6. Com número de teste autorizado, execute `npm run live:read:check -- --mode=customer-context --phone=DDDNUMERO` e `--mode=customer-360 --phone=DDDNUMERO`. Não imprimir JSON bruto nem nomes, telefones, valores, id de pedido ou dados de menores. Confirme lookup, contrato de paginação, campos current_order e isolamento de histórico. Teste matched/not_found/ambiguous somente com contatos autorizados; não inventar.
7. A prévia `--mode=proposal-preview` é opcional e pode iniciar sonda de worker; só após autorização, habilitar `EVYD_ALLOW_PREVIEW_DIAGNOSTIC=1`. Não chamar schedule, abort, Z-API nem API legada SingleAuthentication.
8. No final, `Remove-Item Env:\CRM_READ_TOKEN` e remova qualquer variável de diagnóstico de preview. Nunca ligar o servidor MCP anônimo MOCK com essa chave.
9. Consulta às telas estatísticas: inspecionar somente código `NatalStatisticsController`, `NatalForensicStatisticsService` e `NatalValidOrdersQuery`. Não acessar sessão de gestor pelo MCP. O exportador `tools/export-natal-digest.php` só deve rodar em ambiente autorizado após checar custo, sem alterar CRM.
10. Teste visual: `src/analytics-visual.mjs` transforma snapshot canônico 2022-26 em pontos chart-ready; não publicar dados reais no Plugin anônimo. Não construir widget HTML nem afirmar gráfico automático.

## Entregável resumido
HEAD, Node/PHP, testes CI/local, rota GET verificada, shape geral de cada JSON com nomes de CAMPOS e tipos (sem valores), HTTP status, quantas tools MOCK permaneceram, e quais dados não existem na API Sanctum (estatísticas Manager, busca por nome/pedidos geral). Classificar `GO_LOCAL_API_READ` somente se bootstrap e pelo menos uma consulta permitida de cliente tiverem respondido. `GO_CHATGPT_LIVE` permanece BLOQUEADO sem OAuth por operador. Envio real bloqueado.

## Diagnóstico opcional de GET legados (se já existir token distinto e autorizado)
- `src/legacy-api-read.mjs` e `scripts/verify-legacy-get.mjs` usam somente GET /api/orders/search e GET /api/orders/{uuid}/detail, com filtros fechados e resultado minimizado. Testes locais nunca tocam o CRM.
- **SingleAuthentication NÃO é Sanctum**: `EVYDENCIA_LEGACY_TOKEN` pode autorizar status e campanhas em OUTRAS rotas; nunca adicioná-lo ao Tunnel nem ao `.env` do Plugin.
- Em terminal privado do operador, somente se autorizado: `$env:EVYD_ALLOW_LEGACY_GET='1'`; inserir a chave legada via `Read-Host`; `npm run legacy:get:check -- --mode=search --product=natal --status=waiting_product_retrieve`. Remover as duas variáveis em seguida. A resposta no terminal mostra apenas quantidade amostrada e sucesso. NÃO interpretar amostra de pedidos como total canônico.
- O diagnóstico Sanctum usa `strictEnvelope=true` e exige `schema_version=1.0`, `generated_at` e `data`; rejeita tokens com `extension:proposal-write`. O comando Laravel `extension:token:issue` dá permissões de escrita por padrão e não deve servir como chave read-only.
- Nunca consultar dados reais com Plugin MOCK anônimo. Sem OAuth por operador em conexão separada, classificar `GO_CHATGPT_LIVE=BLOCKED`.
