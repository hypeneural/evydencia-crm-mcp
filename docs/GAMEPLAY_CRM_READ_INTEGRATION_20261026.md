# CRM ↔ Gameplay — consulta administrativa segura (26/10/2026)

## Autoridades e escopo
- CRM é fonte canônica de identidade do pedido, status atual e classificação Natal 2026.
- Gameplay é fonte única de sessão/revisão/mídia e URLs capability; não duplicar persistência.
- Apenas os status atuais `waiting_product_retrieve` (10) e `order_completed` (12) entram na cobrança operacional. Outros pedidos podem ser consultados nominalmente, mas sem alerta de atraso.
- Nunca confundir `product_retrieve_confirmed` (11) com pedido concluído.
- `product.slug=natal` e recorte 2026 conferidos no CRM Live em 26/10/2026: 12 aguardando e 10 concluídos (snapshot; não constante de código).

## Configuração do gateway MCP (server-side)
- `EVYD_GAMEPLAY_READ_ENABLED=1`: opt-in. Inexistente ou 0: nenhuma ferramenta extra.
- `EVYD_GAMEPLAY_READ_ORIGIN=https://<host-privado>`: endpoint REST interno acessível pelo servidor MCP.
- `EVYD_GAMEPLAY_PUBLIC_ORIGIN=https://jogos.fotosdenatal.com`: origem dos URLs públicos, diferente da origem privada se estiver em Tailscale/rede interna.
- `EVYD_GAMEPLAY_READ_TOKEN=<segredo-unico-32+>`: nunca reutilizar Publisher/Server secret, nunca colocar em logs/commit/Browser.
- O gateway mantém OAuth do CRM com contexto individual de operador; a integração adicional nunca expõe o bearer de publicação.
- Erro de configuração do Gameplay é isolado; não derruba CRM/Z-API.
- Endpoint privado Gameplay tem de ser inacessível pela borda pública, mesmo com validação Bearer na aplicação.

## Contratos
`crm_gameplay_links`: aceitar exatamente um entre `order_id`, `order_uuid`, `nome_cliente`. Busca resumida no CRM, lista pedidos distintos em caso de homônimo e solicita link do Gameplay individualmente para até 10 pedidos; se houver mais, retorna `selection_required` para refinamento.

`crm_gameplay_auditoria`: `pagina=1`, `limite=20`, `incluir_publicados=false`. Usa 2 buscas CRM com status atual, páginas de 25, e 1 ou mais chamadas Gameplay em lotes de 50. Agrega `counts.pending_publication` e `counts.published_without_browser_proof`, retornando somente a página relevante, sem tokens ou URLs de clientes. O limite de varredura é explícito e falha em vez de devolver resultado incompleto.

`published_unverified`: sessão ACTIVE + revisão ACTIVE + manifesto consistente + blobs registrados READY; **não** comprova mídia servida ou jogos no navegador. Não rotular como 'completo' sem validação adicional. Respostas 503/timeouts do Gameplay são erro `gameplay_unavailable`, não `not_found`.

## Performance e segurança
- Para os 22 pedidos do snapshot: tipicamente 2 consultas de CRM resumidas + 1 POST batch de Gameplay (mais paginação se ultrapassar 25).
- Para link individual: 1 busca CRM resumida + 1 POST Gameplay; com múltiplos pedidos, chamadas individuais deliberadas.
- Limite de 50 UUIDs por lote, timeout de 5s, resposta máxima de 64 KiB, nenhum redirect.
- Nunca incluir tokens capability em logs, auditoria em lote, cache compartilhado nem frontend do painel.
- EvydFlow consome o mesmo contrato HTTP via adaptador FastAPI autenticado, não chama o MCP via OAuth do ChatGPT.

## Testes e rollout
1. `node scripts/validate-gameplay-read.mjs` — preflight sem rede.
2. `npm run gateway:test` e `npm test`.
3. `npm run validate:local` — conforme infraestrutura local disponível.
4. Comprovar que `crm_capacidades` lista as duas ferramentas somente quando habilitadas.
5. Conferir o SHA real do Gameplay implantado antes de configurar o gateway.
6. Testar `crm_gameplay_links` com pedido sintético autorizado e `crm_gameplay_auditoria` em read-only.
7. Desabilitar `EVYD_GAMEPLAY_READ_ENABLED` para rollback do gateway.

**NO GO produção** enquanto a PR Gameplay #43 e suas dependências de publicação não estiverem reconciliadas, o edge público não bloquear a API privada ou o Gameplay permanecer com flags de piloto proibitivas para fotos reais.

## Auditoria adicional — Avell / autorizacao / confiabilidade (26/10/2026)
- Ferramentas Gameplay so sao registradas quando `EVYD_ENABLE_OPERATOR_FULL_CRM=1`, o CRM interno por operador esta disponivel e o cliente Gameplay de leitura passou nas validacoes. OAuth `crm.read` continua obrigatorio. Teste sintetico de discovery em `test/live-gateway.test.mjs` garante ausencia da ferramenta fora desse modo.
- Antes de liberar URL por ID/UUID, verificar que o CRM realmente respeitou o filtro do pedido. Paginacao inconsistente ou sem `has_more` booleano e erro de contrato, nao busca completa.
- Gameplay verifica hash do token canônico mesmo nos lotes; `published_unverified` nao pode ocultar erro de derivacao de token.
- No Avell Windows, `scripts/antigravity/prepare-avell.mjs` nao chama `npm` como executavel binario no Windows: usa `cmd.exe` apenas para subcomandos npm em allowlist fixa, preservando o Node do sistema. Nunca executar `npm ci` no checkout MCP operacional.
- Leituras SQLite de auditoria nao escrevem, nao ativam e nao criam sessao. Nao preparar token real/segredo no computador Avell nem executar deploy do Gameplay a partir do computador da impressora.
- Runbook canonico: `docs/PROMPT_ANTIGRAVITY_FLASH_AVELL_20261026.md` e `docs/AVELL_ANTIGRAVITY_RUNBOOK_20261026.md`.
