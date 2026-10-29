# P25 — Auditoria forense do domínio, relacionamentos e gates (29/10/2026)

**Origem:** inspeção dos repositórios \`hypeneural/evydencia-crm-mcp\` (baseline LIVE \`6abe03992549cee83732ea538e728377a3c989fe\`) e \`hypeneural/evydencia-crm\` (consulta somente leitura da árvore de código). O repositório MCP é **público no GitHub**; PROIBIDO comitar qualquer telefone, cliente, dump, planilha, hash de telefone, token ou recibo. A análise do schema é **código/migrations**, não prova de migrações executadas no MySQL LIVE. Confirmar com \`scripts/crm-meta-audience-preflight-read.php\` no contexto de homologação, ainda NÃO conectado ao gateway.

## Regra de negócio pedida, sem ambiguidades

\`AUDIENCE = (ALL_CUSTOMERS ∪ NATAL_2026_VERIFIED_PROPOSAL_CONTACTS) − ALL_VALID_2026_BUYERS − MARKETING_SUPPRESSION − UNAUTHORIZED − AMBIGUOUS_IDENTITIES\`.

- \`ALL_CUSTOMERS\`: todas as pessoas cadastradas em \`customers\`, inclusive quem possui zero pedidos. **Não limitar a compradores históricos de Natal.**
- \`NATAL_2026_VERIFIED_PROPOSAL_CONTACTS\`: contatos de \`leads\`, \`proposal_dispatches\`, \`campaign_scheduled_contacts\` e intenções correlacionadas cuja origem/ano/fluxo Natal 2026 foi provado; \`lead recent/working\` não equivale automaticamente a uma solicitação espontânea de orçamento; \`scheduled\` também não. Se desejar **somente quem pediu orçamento**, exigir evidência de pedido (ex.: evento de ajuda, click/proposta, origem de orçamento do CRM), não presumir pelo agendamento.
- \`ALL_VALID_2026_BUYERS\`: compradores comerciais comprovados **de qualquer produto** com evento comercial efetivo em 2026, conforme política de produto aprovada; isso NÃO é igual a \`NatalValidOrdersQuery\`. Cancelado/reembolsado/chargeback/sem status gera decisão revisável; falta de evidência não deve virar \`bought_2026=false\` automaticamente. Conservar snapshot comercial uniforme.
- \`MARKETING_SUPPRESSION\`: exclusões de \`communication_suppressions\` e outros registros de opt-out/limitação de publicidade, segundo regras aplicáveis ao anúncio e base legal válida da LGPD. **Não existe campo nativo \`marketing_consent\` comprovado em \`customers\` ou \`leads\` nas migrations inspecionadas.** Não inventar \`marketing_allowed=true\`.

## Mapa relacional validado em modelos e migrations

\`\`\`mermaid
flowchart TB
  C["customers (id, uuid, email, whatsapp_e164, phone_e164)"]
  O["orders (id, customer_id, created_at)"]
  OS["orders_status (order_id, status, id, created_at)"]
  I["orders_installments (order_id, payment_at, payment_total)"]
  OI["orders_items (order_id, product_id)"]
  P["products (id, slug)"]
  L["leads (id, whatsapp, status)"]
  CS["campaign_scheduleds (id, campaign_id, suppression_scope_key)"]
  CC["campaign_scheduled_contacts (id, campaign_scheduled_id, lead_id, whatsapp)"]
  F["proposal_flows (id, slug=natal)"]
  D["proposal_dispatches (proposal_flow_id, resolved_customer_id, campaign_scheduled_contact_id, phone_lookup_hash)"]
  G["proposal_group_intents (proposal_flow_id, customer_id, action, state, phone_lookup_hash)"]
  S["communication_suppressions (customer_id, phone_lookup_hash, scope_type, scope_key)"]
  C -->|"1:N customer_id"| O
  O -->|"1:N"| OS
  O -->|"1:N"| I
  O -->|"1:N"| OI
  OI -->|"N:1 product_id"| P
  L -->|"1:N lead_id"| CC
  CS -->|"1:N campaign_scheduled_id"| CC
  F -->|"1:N"| D
  F -->|"1:N"| G
  C -.->|"0..1 resolved_customer_id"| D
  C -.->|"0..1 customer_id"| G
  CC -.->|"0..1"| D
  C -.->|"0..1 customer_id"| S
\`\`\`

**Importante:** não há FK de \`leads\` direto para \`customers\`. A ligação é por \`campaign_scheduled_contacts.lead_id\` e correlação telefônica verificada; não transformar mesmo DDD ou últimos oito dígitos em identidade. Os \`phone_lookup_hash\` de \`proposal_dispatches\`, \`proposal_group_intents\` e \`communication_suppressions\` podem usar chaves/contextos HMAC diferentes: **não fazer JOIN por igualdade de hash entre domínios sem provar chave/canonicalização iguais.** Resolver via E.164 canônico e serviço específico do domínio.

### Tabelas, índices e uso

| Tabela | Chaves/relações verificadas no código | Critério para exportar |
|---|---|---|
| \`customers\` | \`id\`, \`uuid\`, \`name\`, \`email\`, \`whatsapp\`, \`phone\`; migração de 13/07 adiciona \`whatsapp_e164\`, \`phone_e164\` e índices | origem completa de cadastro; cada telefone/e-mail selecionado precisa ser do titular |
| \`orders\` | \`id\`, \`customer_id\`, \`created_at\`; \`Customer::orders()\` | comprador candidato de qualquer produto 2026; nunca aplicar só \`product.slug=natal\` |
| \`orders_status\` | \`order_id\` 1:N, última linha por ID operacional; método de status analítico também suporta corte por timestamp | excluir abortados/estornados; exigir evidência comercial positiva |
| \`orders_installments\` | \`order_id\` 1:N, \`payment_at\`, \`payment_total\` | pagamentos reais ajudam a provar compra mesmo com status atrasado |
| \`orders_items\` / \`products\` | \`order_id\`, \`product_id\`, \`slug\` | apenas para auditoria do produto; filtro ANY_PRODUCT nunca restringe \`natal\` |
| \`leads\` | \`id\`, \`whatsapp\`, \`status\` em recent/working/converted/losted | perfil comercial, não prova de pedido de orçamento isolado |
| \`campaign_scheduleds\` | \`campaign_id\`, \`suppression_scope_key\`, \`communication_class\`, snapshot JSON | confirmar contexto Natal 2026 e prevenir campanhas legadas fora da temporada |
| \`campaign_scheduled_contacts\` | \`campaign_scheduled_id\`, \`lead_id\`, \`whatsapp\` | fonte legado de destinatários; também pode existir sem cadastro |
| \`proposal_flows\` / \`proposal_dispatches\` | flow slug \`natal\`, \`resolved_customer_id\` opcional, \`phone_lookup_hash\`, datas e índices | fonte oficial de despachos; status scheduled/aceito/enviado não é solicitação do cliente |
| \`proposal_group_intents\` | \`phone_e164_encrypted\`, \`action\`, \`state\`, \`customer_id\`, \`proposal_flow_id\` | forte candidato a intenção explícita, confirmar ações e provedor autenticado |
| \`communication_suppressions\` | \`phone_lookup_hash\`, HMAC, \`channel\`, \`communication_class\`, \`scope_type\`, \`scope_key\`, \`revoked_at\`, \`ends_at\` | avaliar regras ativas de marketing, inclusive global / natal:2026, respeitando opt-out |

Índices confirmados por migrations: \`customers_whatsapp_e164_idx\`, \`customers_phone_e164_idx\`, \`pd_flow_phone_time_idx\` (= flow + phone hash + created_at), \`cs_lookup_active_idx\` (= phone hash + revocation/timestamps), \`pgi_phone_flow_idx\`. **A consulta global \`proposal_dispatches\` por flow+created_at não está necessariamente coberta eficientemente pelo índice flow+phone+created_at**; medir EXPLAIN read-only na homologação antes de sugerir migração. Não criar índices no CRM nesta PR.


**Anomalia histórica de migrations:** `database/migrations/2021_08_10_123400_create_products_table.php` originalmente declara `products.uuid` como PK, mas `OrderItem`/queries atuais usam `products.id` e `orders_items.product_id`. Isso evidencia evolução de schema: **não deduzir estrutura LIVE de uma única migration antiga**. O preflight verifica `products.id` sem alterar a base, e bloqueia se faltar. A validação do caminho e de índices deve consultar também migrations posteriores e esquema efetivamente aplicado.

## Análise cirúrgica dos arquivos e falhas

1. \`src/live-gateway.mjs\`: OAuth/escopos + registro de ferramenta \`reg(...)\`. Os metadados \`securitySchemes\` descrevem escopos, **mas são as verificações de runtime em \`grantedScopes\` e autorização do operador que garantem enforcement.** O export deve ter \`crm.audience.export\` específico e opt-in, não ser autorizado apenas por \`crm.read\`. O cálculo atual de scopes elegíveis pode conceder padrões automaticamente: auditar DCR, authorize, refresh e tokens antigos antes de adicionar novo escopo.
2. \`src/legacy-api-read.mjs\`: \`runForensicBridge\` invoca \`scripts/crm-forensic-bridge.php\` em PHP com input STDIN e timeouts (mínimo 15 s). **Não transformar o retorno de milhares de linhas em \`OUT_GENERIC\` ou em logs \`structuredContent\` sem controle de egress.**
3. \`scripts/crm-forensic-bridge.php\`: carrega Laravel, usa \`SET SESSION TRANSACTION READ ONLY\` e \`beforeExecuting\` para comandos de leitura. Isso **não cria sozinho um snapshot InnoDB consistente** entre SELECTs no autocommit. Para a extração, dentro de uma única execução, usar transação \`REPEATABLE READ\` + read-only, snapshot desde primeiro SELECT, \`finally\` rollback/commit. Não executar \`DB::enableQueryLog\` indiscriminadamente para export PII massivo: o Query Log acumula SQL/bindings em memória; medir somente tempos/contagens sem conteúdo.
4. \`src/meta-audience-csv.mjs\` agora v2: checagem de cobertura e source_counts, consolidação por identificadores EXATOS, exclusão transitiva de comprador e opt-out, bloqueio de colisão de 2 customer IDs, preservação de pares telefone/e-mail efetivamente presentes no CRM, limite 20 MB, anti formula injection e CSV restrito a email/phone/fn/ln/country. **Não é verificador SQL de compra nem de permissão**; o adapter deve produzir evidência.
5. \`crm_relatorio_clientes_natal\` chama API LEGADA com \`CustomersWithoutChristmasOrdersService\` (filtro \`product.slug=natal\` e data \`>= julho\`; apenas status order_aborted), recebe amostra mascarada. **2703 não é total elegível.**
6. \`CustomerWhatsappExportQuery::validOrdersBase()\` e \`CurrentOrderStatusResolver\` já evitam joins multiplicadores, mas \`CommercialOrderStatusScope\` deixa entrar \`waiting_payment\`, \`order_created\`. Para \`bought_2026\` é necessário status convertido comprovado (payment_confirmed e posteriores) OU pagamento \`payment_total>0\` / \`payment_at\` coerentes, com status atual não reverso; caso inconsistente **quarentena**. Não usar \`sum(order_items.total)\` como prova de pagamento.
7. \`NatalValidOrdersQuery::validNatalOrders()\` é regra canônica **somente para Natal**. \`NatalCommercialConversionPolicy\` também classifica por temporada/produto. Não usá-los sozinhos para \`ANY_VALID_PURCHASE_2026\`.
8. \`LeadService::markLeadAsConvertedByOrder()\` em caminho não-Natal usa comparação dos **últimos oito dígitos** após DDD. Esse método serve lógica legada de leads e é expressamente **proibido como vínculo de identidade Meta**. Criar join rigoroso independente no novo adapter, sem mexer no fluxo de campanhas.
9. \`proposal_group_intents\` tem \`phone_e164_encrypted\`: seu \`action\` pode distinguir sinais, mas precisa prova de evento do usuário autenticado e do contexto/tempo; hashes e conteúdo cifrado não são CSV.
10. \`CommunicationSuppressionEvaluator\` distingue canal, classe, escopo e prioridade; bloqueio de WhatsApp pode ser diferente de proibição de publicidade Meta. Política conservadora: exclua todos os opt-outs comerciais conhecidos do escopo que abrangem Meta e exija base legal/termos; não marque \`marketing_allowed=true\` por ausência de supressão.

## Algoritmo de elegibilidade por lote: desenho pronto para Antigravity

\`\`\`text
begin single read-only InnoDB repeatable-read transaction
  assert schema/index fingerprint; buyer policy version; legal-basis policy
  customers = SELECT id,uuid,name,email,whatsapp_e164,phone_e164 ... ALL (incl. zero orders)
  proposals = SELECT DISTINCT verified recipient E164 from natal flow 2026,
              incl. legacy scheduled contacts scoped to natal:2026 and explicit intents
  candidate graph = exact customer_id + exact full normalized phone/email
  buyer ledger = ALL order candidates with created_at in 2026 (+ paid in 2026
                for old orders, conservative policy to be approved)
                per ALL products, current status and payment evidence
  purchase uncertainty = block linked graph
  suppression ledger = active global/season/campaign marketing blocks
  permission ledger = lawfully authorized customer-list processing (source evidence)
  reconcile all phone/email/customer identities (no last-eight-digit match)
  assert complete counts, referential integrity and no missing source pages
  produce one confidential snapshot, immutable until exported
end transaction
strict formatter v2 (already implemented)
preview aggregates ONLY -> operator explicit confirmation
authorized export PRIVATE CSV -> user upload manually Meta
\`\`\`

**Commercial predicate P0:** \`CustomerWhatsappExportQuery::validOrdersBase()\` yields non-reversed operational orders, but is NOT sufficient for bought. Build \`ANY_VALID_PURCHASE_2026\` from that query with 2026 date window and \`status IN [payment_confirmed,session_schedule,session_schedule_confirmed,selection_schedule,selection_schedule_confirmed,waiting_product_retrieve,product_retrieve_confirmed,order_completed]\` OR **coherent payment evidence**. Review cancellation-after-payment and partial refunds. Cross-check \`NatalCommercialConversionPolicy\` for Natal parity on sample data. Unknown status, missing order_status, stale/out-of-order records => do not classify as nonbuyer without review. The business must confirm whether a 2025 order paid in 2026 counts as 'comprou em 2026'; default to exclude conservatively pending decision.

**Lead predicate P0:** Include verified proposed recipients only from \`proposal_flows.slug=natal\` linked to 2026 dispatch OR precisely scoped campaigns; combine \`leads\` and \`proposal_group_intents\` where relevance demonstrated. **Never infer \`requested_quote\` solely from marketing blasts or schedule.** Present source counts separately in preview: historical customer, lead from proposal, unsolicited campaign contact, explicit quote requester.

**Consent/permission P0:** evaluate active opt-outs globally, by season and relevant channel, and review legal basis for Meta matching under LGPD. Inspect retention/data notices, absence of native marketing consent in schema. Provenance required even if business accepts legitimate-interest assessment. Do not upload customers to Meta without the required permission. A signed/recorded authorized operator attestation cannot erase documented opt-out.

**Snapshot/read consistency:** MySQL InnoDB \`REPEATABLE READ\` one transaction in one PHP bridge process. Existing \`SET SESSION TRANSACTION READ ONLY\` controls writes but each autocommit SELECT can observe a different point. Pagination across ChatGPT tool invocations requires a durable immutable encrypted snapshot per operator, not repeated live queries. Do not start long global transactions indefinitely; read once, derive in memory, close transaction, then serve short-lived snapshot.

**Auth/egress:** proposal preview (\`crm.read\`) returns non-identifying aggregates. Export requires separate OAuth \`crm.audience.export\` actually granted to current client, operator allowlist, explicit confirmation, short TTL, non-public retrieval, no shell args with tokens, no DB writes. **Tool annotations READ are not authorization.** Report SHA/row counts only to logs; private CSV gets filesystem 0600 (Windows private ACL) and expires. Do not promise ChatGPT file download until a real attachment/secured-resource transport is tested end to end.

## Gates para promoção, em ordem

- Gate 0: branch P25 isolada da base LIVE \`6abe039\`; comparar com \`main\`, PR #18 de propostas e PR #22 de reimpressão; não sobrescrever nem cherry-pick cego. Check source path and operator permissions.
- Gate 1 offline: \`node --check src/meta-audience-csv.mjs\`, \`node --test test/meta-audience-csv.test.mjs\`, \`php -l scripts/crm-meta-audience-preflight-read.php\`. Executados em sandbox ChatGPT: **11 testes Node PASS + PHP lint PASS** com conteúdo equivalente; reexecutar no checkout GitHub local e verificar hashes. Não representam integração MySQL/LIVE.
- Gate 2 MySQL sintético: DB relacional real com customers, leads, propostas, 2026 orders de qualquer produto, casos waiting_payment, pago e refund, opt-outs, telefones duplicados, nona casa, permissão, e-mail e snapshot consistente. Controle negativo de scope e PII.
- Gate 3 leitura LIVE mínima, após autorização: schema preflight agregada, conferência de contagem de clientes (observado 2910 às 29/10), contagem de propostas, compras ANY 2026 e supressões. Nenhum telefone exibido.
- Gate 4 export autorizado: prévia -> confirmação explícita -> arquivo privado, verificar n>=100 conforme assistente Meta e comparar 0 compradores conhecidos e 0 opt-outs na amostra retida privada; upload manual na Meta.
- Gate 5 release somente MCP, healthz e \`crm_capacidades\` confirmando build/new scopes; rollback isolado. **Proibido modificar CRM legado/Meta, enviar mensagens ou tocar serviços vizinhos.**

## Referências técnicas auditáveis

- Legado já tinha análise do mesmo tema: \`evydencia-crm/docs/meta-audience-export-analysis-2026-03-31.md\` e \`app/Services/Exports/CustomerWhatsappExportQuery.php\`; esta PR P25 muda o local da implementação (MCP) sem alterar Laravel.
- Laravel 10 \`chunkById\` / \`lazyById\`: https://laravel.com/docs/10.x/eloquent
- MySQL 8.4 \`REPEATABLE READ\` e snapshot: https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html
- MySQL 8.4 \`START TRANSACTION ... READ ONLY\`: https://dev.mysql.com/doc/refman/8.4/en/commit.html
- MCP tools e auth metadata: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- Meta Customer List: usar CSV template do próprio Ads Manager e confirmar termos com documentação autenticada no Business Help: https://www.facebook.com/business/help/ ; padrões: https://transparency.meta.com/policies/ad-standards/
