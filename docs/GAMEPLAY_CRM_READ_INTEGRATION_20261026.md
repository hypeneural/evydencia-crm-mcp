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

## Auditoria posterior ao walkthrough Avell — paginação Laravel real

- O resultado original `CRM_CANONICAL_SEARCH=unavailable` foi observado **no Avell**, onde o Laravel não está instalado. Não é prova de indisponibilidade no MCP de produção.
- `app/Services/Api/OrderService.php` do CRM Laravel utiliza `$query->paginate(200)` em `GET /api/orders/search`.
- A PR MCP #11 agora aproveita paginação **no servidor** quando não encontra a ponte PHP privada, conferindo `meta.current_page`, `meta.per_page`, `meta.total`, `meta.last_page` e a quantidade efetiva de linhas. O retorno inconsistente causa `legacy_read_canonical_pagination_unavailable`.
- O caminho preferido continua `scripts/crm-forensic-bridge.php` (até 25 linhas por página). A API remota não pode ser tratada como equivalente sem validação de conexão/autorização e de resposta real (limite 1 MiB).
- O `OrderResource` do Laravel retorna `status: {id,name}`; o fallback converte somente IDs canônicos 10/11/12 em chaves de status. O status 11 permanece **inelegível** à cobrança desta integração.
- `findOrders` reconcilia contagens totais, returned_count, números de páginas e UUIDs únicos; se houver drift durante a varredura, retorna erro, não um inventário parcial.
- Um probe seguro, `node scripts/antigravity/inspect-canonical-bridge.mjs --json`, identifica exclusivamente arquivos locais necessários para o bridge PHP. **Não atesta** chamadas reais nem coleta credenciais; executá-lo no Avell pode produzir `false`, como esperado.
- Não repetir 179 testes como evidência da implementação nova: CI recente registrou 183/183 e deve ser acompanhada por SHA.


## Relationship and photo quantity fields (additive response)
- CRM order ID is a human identifier. Join ONLY by `order_uuid` -> Gameplay `photo_sessions.crm_order_uuid`; never by customer name or phone.
- Each `orders[]` entry in `crm_gameplay_links` and `crm_gameplay_auditoria` includes `order_id`, `crm_order_uuid`, `status_id`, `status_key`, `package_name`, `gameplay` and an `operational` projection.
- `operational.publication_required_by_crm` is true only for **current** status 10 (`waiting_product_retrieve`) or 12 (`order_completed`) of a CRM-filtered Christmas 2026 order.
- `operational.digital_experience_status` is one of `no_gameplay_session`, `album_in_preparation`, `album_not_published`, `preparation_invalid`, `publication_incomplete`, `access_revoked`, `album_published_runtime_unverified`.
- `operational.published_photo_count`: number of photo entries in an ACTIVE, fully ready manifest, **not the total photographed in camera or stored in Drive**. An incomplete active revision can carry a separate `active_revision_manifest_photo_count` but counts as **0 published**.
- `operational.preparing_photo_count`: number in the latest staged manifest, or `null` when none/not known. Do not add staging and active totals because a new revision may replace existing photos.
- `operational.individual_games_verified=false` and `browser_runtime_verified=false`: Gameplay does not store a per-game success receipt; one published hub does not prove that every game works.
- `counts.published_photo_count` and `counts.preparing_photo_count` are sums of separate reported populations across eligible orders; avoid using them as counts of original camera files.
- The default audit returns pending rows; request `incluir_publicados=true` to see all states. Batch does not include family capability URLs.
- The direct LIVE MCP currently has **no Gameplay tools deployed**; this PR is draft. Do not invent real Gameplay status from CRM-only counts.
