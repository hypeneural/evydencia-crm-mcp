# FASE REAL — CRM × Gameplay × ChatGPT, 26/10/2026

## Leitura deste documento
Este é o ponto de entrada forense após a homologação do Antigravity no Avell. Preservar PR MCP #11 (`feat/gameplay-read-client-20261026`) e Gameplay #43 (`feat/gameplay-status-read-api-20261026`). Não criar branches, não reconstruir o sistema, não adicionar backend duplicado.

## O que já foi verificado DIRETAMENTE com dados reais
O conector autenticado `Evydencia_CRM_Live` disponível nesta conversa foi consultado de novo em 26/10/2026: versão 0.12.0, build `f6f93b5`, 33 ferramentas ativas, nenhuma Gameplay. Chamadas:
- `crm_pedidos_buscar(order_status="waiting_product_retrieve", product_slug="natal", created_start="2026-01-01", created_end="2026-12-31", nivel_detalhe="resumo", pagina=1, limite=25)`: 11 correspondências; status atual 10; 11 UUIDs válidos, distintos.
- Mesmo filtro com `order_status="order_completed"`: 11 correspondências; status atual 12; 11 UUIDs válidos, distintos.
- A origem declarada nas duas respostas foi `CRM_FORENSIC_READ_ONLY_BRIDGE`, com `returned_count=total_matching_orders=11` e `has_more=false`. Esses resultados são um snapshot, jamais uma constante do código.

Nenhuma foto de cliente foi consultada. Ainda não foi feita consulta à API privada do Gameplay nem ao banco SQLite realmente implantado. **É incorreto reportar que existem 22 jogos ausentes.** Só existem 22 pedidos que requerem verificação.

## Auditória do contrato implementado
- CRM `order_id` + `order_uuid` com status atual e filtro Natal 2026.
- Gameplay `photo_sessions.crm_order_uuid` é chave de junção; NÃO usar nome, telefone, ID numérico diretamente ou pastas.
- `POST /internal/v1/sessions/lookup-batch` aceita até 50 `crm_order_uuids`, bearer privado; a resposta nunca deve trazer `hub_url`/`gallery_url`.
- `POST /internal/v1/sessions/lookup` aceita `crm_order_uuid`; link só com `include_links=true`, após autorização MCP OAuth por operador.
- O `GameplayStatusLookup` agora confere IDs exatos dos blobs thumb/card/game em STAGED e em ACTIVE; contar 3 registros de outra revisão não é evidência de fotos válidas.
- O auditor standalone `scripts/forensic/audit-real-catalog-readonly.mjs` abre o SQLite via `DatabaseSync({readOnly:true})`, ativa `query_only`, e usa `BEGIN DEFERRED`/ROLLBACK para ler um snapshot consistente sob concorrência.
- `src/gameplay-real-audit.mjs` só entrega agregados; adicionou a marca `gameplay_dataset_provenance_verified=false` e `media_bytes_verified=false` para não confundir resposta API ou contagem de blobs com implantação/base real comprovada. `browser_runtime_verified=false` até testes físicos.

## Evidências e bloqueios independentes
| Etapa | Evidência necessária | Situação |
|---|---|---|
| CRM vivo | Fonte canônica + UUID/status/paginação | VERIFICADO em 26/10/2026 |
| Código MCP | CI do HEAD da PR #11 | Revalidar SHA no momento do handoff |
| Código Gameplay | CI do HEAD da PR #43 (incluindo E2E) | Revalidar SHA no handoff |
| Gameplay SQLite real | Origem exata do DB, leitura snapshot, quantidade de sessões/fotos | NÃO VERIFICADO |
| Endpoint privado | Rota acessível SOMENTE a serviço autorizado, token de leitura único | NÃO VERIFICADO |
| CRUD/Publisher real | Não executar no read-only smoke; requer outra homologação | FORA DO ESCOPO |
| Cruzamento CRM↔Gameplay | UUIDs reais enviados somente dentro da rede privada autorizada; contagens reconciliadas | NÃO VERIFICADO |
| ChatGPT MCP OAuth | `crm_capacidades` mostra `crm_gameplay_links` e `crm_gameplay_auditoria` em LIVE, e ambos retornam structuredContent correto | NÃO VERIFICADO |
| Jogos em celulares | Metadados, mídia HTTP, decodificação, Phaser e navegação em Android/iOS sob piloto aprovado | NÃO VERIFICADO |

### Segurança/Caddy
- Não basta obter 401 do serviço. A rota `/internal/*` deve ser **inacessível pela borda pública**. Comprovar regras de Caddy e comportamento da entrada pública e da origem privada; não confiar apenas em headers `X-Forwarded-For` não autenticados. Ver docs Caddy `remote_ip` / `client_ip`.
- Em staging-demo, `deploy/readiness.json` ainda define `pilotReady=false`, `customerDataAllowed=false` e `automaticDeliveryAllowed=false`; NÃO subir fotos de clientes para staging, habilitar esses flags ou fazer deploy sem gate.
- Para SQLite WAL, backup e restauração são uma etapa SEPARADA. Uma leitura read-only consistente não substitui a SQLite Online Backup API nem ensaio de restore.
- Não imprimir UUIDs, nomes, telefone, links capability, segredos, caminho do banco ou payloads reais em logs e pull requests.

## Sequência operacional cirúrgica
1. **Avell**: atualizar worktrees limpas por `prepare-avell.mjs --workspace <path> --refresh`; executar somente `node --test test/gameplay-real-audit.test.mjs test/gameplay-order-status.test.mjs test/smoke-gameplay-readonly.test.mjs`. Gameplay validado por CI GitHub Node24 + pnpm11, sem dependências globais na impressora.
2. **CRM Live no ChatGPT**: já foram feitas leituras reais. Se houver mudança de datas/status, consultar novamente `crm_capacidades` e 2 chamadas `crm_pedidos_buscar`, reportando só totais.
3. **Gameplay host privado**: com usuário read-only autorizado, PR código já disponível no host sem sobrescrever o deploy, origem de SQLite confirmada e ambiente previamente provisionado, executar `node scripts/forensic/audit-real-catalog-readonly.mjs`. Sem acesso = `not_verified`.
4. **MCP host autorizado**: `node scripts/antigravity/audit-real-crm-gameplay.mjs --crm-only`; depois, somente se API privada e autorização de UUID reais forem comprovadas, `--cross-check`. Se gateway de teste não tem CRM grant legítimo, não forçar `EVYD_REAL_AUDIT_OPERATOR_ACCESS_ATTESTED` para inventar autorização.
5. **ChatGPT**: após rollout aprovado do gateway e consulta privada, com `EVYD_ENABLE_OPERATOR_FULL_CRM=1`, `EVYD_GAMEPLAY_READ_ENABLED=1`, origem e bearer privados e operador OAuth elegível, `crm_capacidades` deve listar ambas ferramentas; fazer primeiro `crm_gameplay_auditoria` sem URLs; depois `crm_gameplay_links` por ID de pedido expressamente autorizado. Se ausente, não reivindicar implantação.
6. **NÃO liberar clientes** até `pilotReady` formalmente aprovado, isolamento Caddy, backup/restauração WAL, grant privado de mídia e testes físicos dos jogos no Android/iOS.

## Referências oficiais consultadas
- Laravel 10.x API Resources, paginação: https://laravel.com/docs/10.x/eloquent-resources#pagination
- MCP Tools `outputSchema` + `structuredContent`: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- Node.js SQLite API `DatabaseSync`: https://nodejs.org/api/sqlite.html
- SQLite Online Backup: https://www.sqlite.org/backup.html
- Caddy request matchers e trusted proxies: https://caddyserver.com/docs/caddyfile/matchers e https://caddyserver.com/docs/caddyfile/options
