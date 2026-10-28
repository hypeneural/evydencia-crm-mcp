# Antigravity — Etapa 8: links de TODAS as famílias no ChatGPT

**Objetivo solicitado pelo gestor:** ao pedir "traga todos os links disponíveis", o MCP precisa devolver uma tabela paginada com ID do pedido, nome, pacote, quantidade de fotos e links do **hub de jogos** e **galeria**, abrangendo pedidos Natal 2026 de TODOS os status comerciais (incluindo `order_aborted`) que possuam sessão Gameplay ACTIVE, revisão ACTIVE e os blobs READY. Não envia mensagens nem altera pedidos.

**Não confundir:** estar publicado no SQLite `published_unverified` NÃO prova navegabilidade. Os links são credenciais de acesso por posse; jamais expor API de inventário publicamente ou colocar os tokens em logs. O usuário está operando a partir de OAuth CRM no ChatGPT.

## Código já preparado

- MCP PR #15 — `feat/gameplay-all-families-links-20261028` sobre a PR #14: acrescenta `crm_gameplay_galerias_disponiveis({pagina,por_pagina,incluir_links})`.
  * Consulta **todos os pedidos CRM de produto natal criados em 2026**, sem `order.status` e sem filtrar cancelados; pagina completamente via CRM.
  * Consulta o Gameplay em lotes de no máximo 50 UUIDs sem devolver tokens.
  * Seleciona `published_unverified` mesmo com `order_aborted`; exclui revogados, não publicados ou com contrato parcial.
  * Páginas de até 50; para as linhas retornadas consulta capability individual com máximo 5 requisições concorrentes.
  * Se o reader retorna 409, preserva metadados, devolve `unavailable_http_409` e campos URL nulos, sem inventar URL.
  * Testes do helper provam pedidos abortados incluídos, paginação, exclusão de revogados e fail-closed de drift.
- Gameplay PR #47 — `feat/gameplay-public-session-read-20261028` sobre PR #43:
  * Ativa SOMENTE mediante `CATALOG_PUBLIC_SESSION_READ_ENABLED=1` e flags de aprovação;
  * A página pública exige sessão token ACTIVE no SQLite, nunca usa apenas nome/status CRM nem arquivo de demo; retorna HTML com OG genérico, sem fotos de cliente em metadados.
  * `/s/:token/data` e `/s/:token/media/.../variant` continuam sob autorização do repositório de publicação já existente; validar o binário e rede reais antes de ativar.
  * Reader privado preserva HTTP 404 para rotas públicas; `CATALOG_PRIVATE_CUSTOMER_LINKS_ENABLED` somente permite gerar links individuais após aprovação, **não** altera o lookup em lote.

## Gates de implantação — nunca inventar links

1. Revisar e obter CI PASS dos novos HEADs das PRs #15 e #47. Não repetir testes completos dos HEADs antigos sem alteração.
2. Testar **um único canário autorizado pelo operador**, pedido #5121 (30 fotos) independentemente do status comercial `order_aborted`: confirmar token ACTIVE, blob readiness e arquivos realmente acessíveis. Não mudar o status do pedido no CRM.
3. Antes de ativar links, fazer o corte seletivo e reversível do **catálogo público** com o código PR #47. O `stackctl deploy christmas-games` global está bloqueado; usar um plano isolado que preserve `gateway`, banco e demais containers; atualizar o código do serviço `catalog` somente pelo caminho homologado. Confirmar a versão do frontend montado no gateway: não servir JS antigo incompatível com a sessão.
4. Validar via host público real e navegador:
   - `GET /s/<token>` => 200 HTML, `GET /s/<token>/fotos` => 200 HTML;
   - `GET /s/<token>/data` => 200 JSON com photos e URLs de variantes para MESMO token;
   - foto thumb/card/game via `GET /s/<token>/media/...` => WebP/asset real e autorização válida;
   - token sintético/desconhecido/revogado => 404; crawler não mostra fotografia privada em OG;
   - `https://jogos.fotosdenatal.com/internal/*` => bloqueado na BORDA, não basta 401 no loopback;
   - demo público `/` e `/demo/fotos` preservados.
5. Somente após comprovar a etapa 4, habilitar flags no **reader privado**:
   `CATALOG_PRIVATE_CUSTOMER_LINKS_ENABLED=1`,
   `CATALOG_LINKS_OPERATOR_APPROVED=1`,
   `CATALOG_PUBLIC_CUSTOMER_ROUTES_VERIFIED=1`,
   `CATALOG_CUSTOMER_DATA_ALLOWED=1`.
   O reader permanece read-only e indisponível na interface pública. Aplicar via `reader-plan/reader-deploy` exclusivo, não `stackctl deploy` global.
6. Implantar a nova ferramenta MCP PR #15 em sua VPS própria, preservando as outras 35 ferramentas, OAuth, Z-API, PrintServer e CRM. Novo inventário esperado 36 ferramentas ativas / 38 catalogadas (ou o resultado real se o catálogo sofrer mudança legítima). Não confundir CI PASS com serviço implantado.
7. Testar pelo conector na conversa:
   `crm_gameplay_galerias_disponiveis({pagina:1,por_pagina:50,incluir_links:true})`.
   Se `has_more=true`, continuar 2, 3 etc. Exibir tabela **pedido, nome, fotos, jogos, galeria** com valores retornados, nunca URL sintetizada.
   Confirmar que #5121 aparece mesmo com `order_aborted`, e que não aparecem sessões `revoked`, `partial` ou `not_found`.
8. Não inserir URLs capability ou segredos em GitHub Actions, documentos, logs de acesso, recibos, tickets, screenshots ou links de monitoramento. URL somente no resultado do ChatGPT autenticado e uso comercial autorizado; mensagens WhatsApp não fazem parte desta tarefa.

## Parada objetiva
Se o catálogo público ainda responde 404 ou mídia falha, mantenha `CATALOG_PRIVATE_CUSTOMER_LINKS_ENABLED=0`; retorne `BLOCKED_PUBLIC_ROUTE` ou `BLOCKED_MEDIA` com evidência sanitizada. Não habilitar o reader só para conseguir strings 200/JSON que apontam para 404.

Se os links estiverem ativos, retornar apenas: SHAs de 3 releases, contagem de publicações, smoke de canário + falha de token inválido, inventário MCP, e `GO_CHATGPT_BULK_LINKS` — **sem imprimir tokens nem nomes em log operacional**.

## Referências
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- Gameplay public routes PR #47; Gameplay reader PR #43
- MCP PR #15 (fonte da tabela) e PR #14 (fallback 409)
