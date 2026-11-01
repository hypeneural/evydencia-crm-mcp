# Auditoria forense ChatGPT LIVE — pós-corte reader, 28/10/2026

## Escopo e separação das evidências

- Recibo Antigravity: `docs/RECIBO_ANTIGRAVITY_ETAPA6_READER_CUT_20261027.md`.
  Informa que a Media VPS tem o `catalog-reader` no bundle Gameplay `dd9788e`,
  wrapper SmartDialer `6b2c572`, 200 health, 404 rotas públicas, 401 sem
  Bearer, 200 sintético autenticado, 409 quando URLs estão desabilitadas.
  IDs `catalog`/`gateway` inalterados e mounts `:ro` foram
  **relatados pelo Antigravity**, não inspecionados diretamente via SSH
  pelo ChatGPT nesta auditoria.
- ChatGPT executou consultas de leitura no **conector MCP LIVE autenticado**;
  os resultados abaixo são observações diretas de respostas, não mocks.
- Tentativa independente de abrir o edge público HTTPS pela ferramenta web
  não produziu resposta HTTP verificável. **Ainda falta prova externa**
  de bloqueio de `/internal/*` e de jogos no navegador.

## Resultados do conector LIVE no instante da auditoria

| Checagem | Resultado |
| --- | --- |
| `crm_capacidades(verificar_gameplay=true)` | build `e872fac`, branch release, modo LIVE sem mock |
| Ferramentas | 35 ativas / 37 catalogadas |
| PrintServer | prévia de malotes, solicitar e consultar etiqueta ativas; `crm_processar_malotes_retirada` indisponível |
| Gameplay private probe | `private_contract_ok`, `reachable=true`, `dataset_proven=false` |
| Pedidos válidos canônicos Natal 2026 | 104, 103 clientes, corte em 28/10/2026 aproximadamente 01:00 BRT |
| `crm_gameplay_auditoria(incluir_publicados=true,limite=50)` | 22 pedidos de status 10/12, paginação completa sem mais páginas |
| Sessões publicadas sem prova browser | 16 |
| Sem sessão / revogadas | 4 / 2 |
| Fotos no manifesto ativo | 525 |
| Variantes derivadas declaradas prontas | 1575 (3 por foto nos 16 registros ativos) |
| Galerias/hubs retornados em lote | 0 / 0, por política |
| URLs canônicas de pedido CRM | 22 / 22 |
| Entrega de link | 22 `not_verified` |
| Jogos individuais e navegador | nenhum verificado |

**Importante:** os 22 são só status 10 e 12. Não são todos os 104 pedidos válidos
do filtro comercial `NatalValidOrdersQuery::validNatalOrders()`.
Não usar 22 como denominador da dashboard de galerias.

## P1 comprovado — consulta individual falha no MCP LIVE

O ChatGPT consultou em `crm_gameplay_links(order_id=...)` três pedidos já
existentes no CRM, representando publicado, sem sessão e revogado.
Todos falharam com `gameplay_http_409` (error_category `UNAVAILABLE`),
enquanto as respectivas consultas `crm_pedidos_buscar` retornaram cada
pedido e URL administrativa canônica do CRM corretamente.

**Causa reproduzida na versão LIVE `e872fac`:**
`src/live-gateway.mjs` chama
`gameplay.lookup([uuid],{includeLinks:true})` mesmo com capability links
desabilitados. O reader responde 409
`CUSTOMER_LINKS_NOT_ENABLED`, comportamento de segurança correto,
mas o gateway LIVE propaga a exceção e **perde o status individual**.

**Código já corrigido na PR #14, ainda NÃO em produção:**
`src/gameplay-links.mjs::lookupGameplayWithCustomerLinks` reconhece 409,
consulta novamente `lookup-batch` sem URLs e retorna
`customer_links_status='unavailable_http_409'`, com estados e quantidades
preservados. Foi acrescentado o teste de regressão
`test/gameplay-links.test.mjs` usando o cliente HTTP real com servidor
simulado: 409 em single e 200 em batch, sem inventar URLs.

**NÃO liberar links, nem alterar `CATALOG_PRIVATE_CUSTOMER_LINKS_ENABLED`**
para contornar esse problema. A correção é publicar de forma isolada a PR #14
na **VPS MCP**, sem redeploy Gameplay ou SmartDialer.

## Estado CI e preservação

- Gameplay PR #43: GitHub CI verde no SHA `dd9788e196a549c955378ea6a3e45c88ae8f818a`.
- MCP PR #14: CI anterior verde no SHA `31f780617c26f3edad6657f68aa89dff24ec3028`.
  Novo teste de regressão altera o HEAD; exigir novos checks verdes.
- SmartDialer PR #39: job `stackctl-reader-guard` no SHA
  `6b2c57263ecb1587179b403afd71845cdf61c5a3` marcado FAILURE
  no GitHub. O conector de logs retornou BlobNotFound. O Antigravity
  reportou spending limit; essa causa não foi comprovada pelo ChatGPT.
  O wrapper já foi instalado, com evidência de corte seletivo, e deve
  ser mantido sob monitoramento/registro; não repetir deploy por CI.

## Próxima ação mínima

1. Aguardar verde dos checks PR #14 após teste de regressão e comparar
   inventário e release atual: 35 tools, PrintServer, Z-API, OAuth e rotas.
2. Usar **somente** o runbook oficial da VPS MCP para release isolada da PR
   #14; uma implantação e um rollback definido. Nada de `stackctl` na
   Media VPS para atualizar o MCP. Não habilitar publication/WhatsApp.
3. Depois do corte, ChatGPT valida: `crm_capacidades` novo build,
   `crm_gameplay_links` por um ID publicado/sem sessão/revogado,
   `crm_gameplay_auditoria` e `crm_estatisticas_natal`. Resultado
   individual esperado: 200 com status/fotos, **sem hub/gallery URL** e
   `unavailable_http_409`, nunca erro MCP.
4. O teste externo da borda HTTPS e dos jogos com mídia só poderá ser
   considerado validado após provas próprias; nenhum browser/cliente
   confirmado nesta etapa.

Referências oficiais:
- https://docs.docker.com/reference/cli/docker/compose/up/
- https://docs.docker.com/reference/cli/docker/compose/restart/
