# P25.3 — Auditoria forense do retorno Antigravity, hotfixes e gates

Data de referência: 29/10/2026, BRT. Repositório hypeneural/evydencia-crm-mcp, PR #23 DRAFT, base base/reprint-live-6abe039-20261029. Sem merge, deploy, GitHub Actions, alterações Laravel/MySQL ou upload Meta.

## 1. Evidência Git e recibo

- Antigravity alterou somente test/meta-audience-mcp.test.mjs no commit 01aec393f349703cd3179dd7897141a984ccf400 para suprir o snapshot_id obrigatório de um teste negativo. Correção válida: a validação Zod antes recusava o input e o teste nem entrava no handler.
- O recibo publicado na PR é issuecomment-6513047270. O agente reportou 35/35 testes focados, 342/342 npm test, node --check e php -l PASS, todos NO checkout dele antes desta auditoria P25.3.
- O HEAD completo informado no walkthrough, afcfa78c85ae6c1f1737e6da7a6faef9fe4bc0f0, não resolveu na API GitHub. A PR antes da auditoria apontava para afcfa7884853c14538b840cba8d31f319b135976. Não afirmar que uma SHA inválida foi testada. O commit real de código testado no recibo foi 01aec393.
- Todos os resultados anteriores de 342 testes NÃO demonstram SQL Laravel/MySQL real, direitos de publicidade, matching aceito pela Meta ou download ChatGPT.

## 2. Novos achados críticos e correções P25.3

| Prioridade | Achado confirmado | Ajuste implementado |
| --- | --- | --- |
| P0 | scopeChallenge do SDK MCP retornava objeto com scopes, mas a documentação oficial exige a lista completa string[]; testes anteriores não validavam precisamente esse contrato | Agora retorna [...requiredScopes], mantém verificação do handler e 403 OAuth |
| P0 | Todos os campaign_scheduled_contacts agendados eram exportados como se tivessem solicitado ou recebido proposta | Somente dispatches reais com status scheduled, eligibility_status allowed/eligible, sem duplicidade/aborto entram na população; agendamentos isolados viram contagem de diagnóstico, não contatos |
| P0 | proposal_dispatches abrangia falhos, bloqueados e abortados por padrão | Filtro explícito por status, eligibility e duplicate_of_id; atribuição de origem não prova entrega/leitura, relatada separadamente |
| P0 | Chave HMAC errada/rotacionada podia deixar blacklist vazia de matches sem sinalizar falha | Cada regra ativa de marketing selecionada agora valida hash armazenado contra o hasher canônico; divergência bloqueia export e retorna erro sanitizado |
| P0 | 100 números de telefone podem pertencer a apenas 50 pessoas | CSV ready exige pelo menos 100 grupos elegíveis distintos E 100 telefones válidos; ainda NÃO prova 100 pessoas correspondidas pela Meta |
| P1 | As regras de comprador eram intercaladas com SQL e só testes estáticos verificavam enums | Função PHP pura crm-meta-audience-purchase-classifier.php + 13 casos de teste PHP nativos para status, compra antiga paga em 2026, estorno, chargeback e incerteza |
| P1 | Preview sempre reconsultava CRM e ignorava forcar_atualizacao, mantendo PII de cada snapshot em cache | Reuso de até 45 s somente na prévia comum, forçar atualização faz consulta; export SEMPRE reconsulta, cache por operador expira em 5 min e limita 12 snapshots |
| P1 | Query log estava desativado para proteger PII, mas sql_count=0 podia parecer execução sem SQL | Listener agregado SQL count + tempo sem SQL bruto/bindings, métricas de origem e logs de status apenas agregados |
| P1 | Erros de qualidade e mudança de snapshot apareciam sem instrução clara para o gestor | Códigos allowlisted, categorias e orientações em português sem telefone, nome, segredo ou caminho |
| P1 | Preflight não verificava todas as colunas novas efetivamente lidas | Checagem inclui status, eligibility_status, duplicate_of_id, campaign_scheduled_contact_id, customer_id e phone_e164 de supressão |
| P1 | QA anterior não tinha isolamento reprodutível da regra financeira em PHP | Script scripts/antigravity/validate-meta-audience-p25-local.sh executa os testes PHP sintéticos, node --check, npm check/test e bloqueia worktree suja |

## 3. Relacionamentos auditados (sem acesso a banco real)

- customers.id -> orders.customer_id; orders_status.order_id (último status operacional por id); orders_installments.order_id, payment_at e payment_total; orders_items/products para escopo qualquer produto.
- Enum confirmado na migration 2021_10_04_134056_alter_order_status_table_change_status.php e app/Enums/OrderStatus.php; estados de reversão válidos: order_aborted, payment_chargeback, payment_refunded.
- proposal_flows.slug natal -> proposal_dispatches.proposal_flow_id; status scheduled, eligibility_status allowed/eligible e duplicate_of_id NULL são exigidos. A entidade ProposalDispatch permanece scheduled após agendamento; isso prova registro de agenda e NÃO prova provider_accepted/delivered/read. Métricas documentam a limitação.
- campaign_scheduled_contacts, campaign_scheduleds e leads sem dispatch de proposta não são incluídos como quote-requested apenas pelo agendamento, ainda que o fluxo/campanha seja Natal 2026.
- communication_suppressions utiliza CommunicationSuppressionHasher, CommunicationSuppressionEvaluator e canal/classe/escopo. O telefone normaliza internamente em E.164 +55; no CSV manual é 55+DDD+número só dígitos.
- CPF, documento, idade, dados de crianças, valor e ID interno não aparecem no arquivo.

## 4. Logs e qualidade de dados

O bridge desabilita DB query log para evitar acumular SQL/bindings sensíveis na memória. Listener mantém apenas sql_count/sql_ms para a leitura do público. A prévia passa a devolver source_quality agregado: unique_customers, candidate_orders_created_2026, installments_paid_in_2026, buyer_customer_ids, ambiguous_customer_ids, proposal_dispatch_rows, scheduled_only_not_exported e suppression_rules_examined. O gateway registra apenas contagens e status, não hashes de telefones/PII.

Um código de falha de hash HMAC ou relação comercial é seguro para auditoria, mas detalhes SQL, parâmetros, nomes e telefones nunca entram em logs GitHub ou em mensagens MCP.

## 5. Especificações e limites

- Documentação oficial MCP v2, per-tool scope challenge: https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization — retorna lista string[] completa ou undefined, não objeto.
- Spec MCP Authorization: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- Spec MCP Tools: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MySQL REPEATABLE READ: https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html. Consistência entre SELECTs exige mesma transação InnoDB, não autocommit avulso.
- Meta Custom Audiences: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences/; Business Help https://www.facebook.com/business/help/170456843145568. A consulta externa à página Developers retornou HTTP 429 e a Central de Ajuda exigiu login. Revalidar modelo CSV no Ads Manager da própria conta antes de qualquer upload real, SEM assumir aprovação.
- Padrão de CSV de uso MANUAL: email,phone,fn,ln,country; phone obrigatório 55+DDD+número, somente dígitos; e-mail e nome opcionais. Não preparar hashes de API como texto do CSV manual.

## 6. O que foi efetivamente testado nesta auditoria

- Fetch de arquivos/commits/PR/comments via conector GitHub, cruzamento de código do CRM Laravel, migrations e documentação oficial pública.
- Parse V8 isolado dos módulos JavaScript alterados: PASS. Não equivale a Node 22 nativo.
- Formatter em V8 sintético com SHA fake: 19/19 casos PASS. Não equivale a SHA real nem a integração backend.
- Os 342/342 relatados pelo Antigravity são historicamente válidos SOMENTE para o checkout de 01aec393 antes destes commits.
- Novos testes PHP de 13 casos e novos cenários do MCP foram COMITADOS, mas requerem execução nativa pelo Antigravity. Não declarar que passaram sem rodá-los.

## 7. GATES ainda bloqueantes

- Gate A: rodar Node 22, npm test, php -l e testes reais PHP no HEAD novo local, registrar SHA e contagem. FAIL -> hotfix preciso.
- Gate B: MySQL 8/Laravel em homologação com dados sintéticos e esquema real; conferir queries, índices, semântica de proposta, opt-out real com chave diferente e consistência de snapshot. Não migrar tabelas.
- Gate C: avaliar formalmente a base legal/opt-out de Meta Customer List e documentar a política de publicidade personalizada; variável servidor-side sozinha não comprova autorização individual.
- Gate D: entrega privada do CSV ao ChatGPT Web AINDA não implementada. arquivo_id não é link nem download; desenhar transporte autenticado sem expor PII.
- Gate E: upload manual e mapeamento no Gerenciador Meta com aprovação separada, sem publicar anúncios ou alterar orçamentos automaticamente.
- Gate F: limpeza garantida de arquivos CSV ociosos em VPS exige job local específico; timer em processo + limpeza na próxima export não garante deleção após restart sem nova exportação.

Decisão: P25.3_SOURCE_FIXES_APPLIED / NODE_AND_PHP_LOCAL_QA_PENDING / SQL_HOMOLOGATION_UNKNOWN / CHATGPT_DOWNLOAD_NOT_READY / LIVE_EXPORT_NO_GO / META_UPLOAD_NO_GO. A PR #23 permanece DRAFT.
