# P25.2 — Parecer forense independente do Antigravity e5a5beb

Data de referência: 29/10/2026. PR #23 segue DRAFT. Auditoria de código em hypeneural/evydencia-crm-mcp e consulta aos serviços do Laravel CRM, sem acesso ao MySQL LIVE, sem deploy, merge, export real, GitHub Actions ou mudança de anúncio Meta.

## Resultado

O Antigravity relatou 330 testes nativos PASS no commit e5a5beba269b56ecee3ef0c17f17da9cc2c00855. Esse conjunto de testes usa leitor sintético injetado para a extração MCP; NÃO comprova equivalência ao SQL, estado de compras, supressão com chave real, base legal ou download pelo ChatGPT. A PR original não estava pronta para produção. Os P0 abaixo foram corrigidos nesta mesma branch, sem modificar outros repositórios.

## Defeitos encontrados e hotfixes aplicados

| Gravidade | Comportamento anterior | Correção na PR |
| --- | --- | --- |
| P0 | Reversões referidas como chargeback/refunded, divergem do enum Laravel | Estados canônicos payment_chargeback, payment_refunded, order_aborted e classificação prudente de pagamento positivo versus estado incerto |
| P0 | Pedido 2025 pago em 2026 desaparecia de missingOrderIds por diferença de conjuntos calculada tarde | Recuperação de customer_id antes de inserir pedidos pagos no mapa, com guarda de integridade |
| P0 | Consulta de blacklist com proposals.hash_key, que pode divergir da chave real | Serviço oficial CommunicationSuppressionHasher + CommunicationSuppressionEvaluator, com filtro de regras compatíveis de marketing/temporada |
| P0 | A seleção de uma string legal_basis_policy bastava para liberar todos os contatos | Configuração de atestação jurídica no host do bridge; sem aprovação de política documentada, retorno sem dados e exportação bloqueada |
| P0 | SET SESSION TRANSACTION ISOLATION LEVEL era bloqueado pelo guard do bridge | Consulta de isolamento @@transaction_isolation; aborta fora de REPEATABLE-READ; transação READ ONLY existente |
| P0 | JSON era emitido com exit ainda dentro da transação | Rollback no finally, JSON emitido somente após terminar transação |
| P0 | OR entre campanha e escopo selecionava destinatários de outros fluxos | Exige campanha vinculada ao fluxo e escopo natal:2026, com erro se flow esperado ausente |
| P0 | Export gerava snapshot novo silenciosamente se preview expirasse | Exige snapshot_id de prévia, cache compartilhado entre chamadas MCP, vinculado ao operador e upstream grant, TTL 5 minutos |
| P0 | Novos compradores e opt-outs entre prévia e export poderiam ficar na lista | Reconsulta CRM no instante do export e compara digest; qualquer diferença exige prévia nova |
| P0 | OAuth de audiência habilitado por padrão e herdava allowlist geral | Habilitação explícita, allowlist de exportação separada, scopeChallenge HTTP 403 e verificação interna |
| P1 | Diretório lido do process.env, fallback no repo, possível sobrescrita/path leak | Diretório absoluto privado injetado pelo gatewayConfig, arquivo exclusivo wx 0600 e arquivo_id opaco (sem path público) |
| P1 | CSV temporário poderia ficar órfão após reinício | Janitor por nome próprio e idade, symlink-safe, executado na próxima exportação + timer no processo |
| P1 | Fallback E.164 inválido ocultava telefone raw válido; provenance de leads pouco clara | Fallback de campo validado + origin_quality (clientes distintos, propostas despachadas, contatos apenas agendados) |
| P1 | Suíte de testes não cobria negativas críticas | Casos específicos de snapshot ausente, troca de comprador, política jurídica bloqueada, operador sem permissão, diretório e retenção |

## Modelo relacional verificado no código

- customers.id -> orders.customer_id -> orders_status.order_id (último evento operacional); orders_installments.order_id fornece pagamento real, orders_items e products não restringem exclusão a Natal.
- proposal_flows.slug=natal -> proposal_dispatches.proposal_flow_id, resolved_customer_id opcional, e campaign_scheduled_contacts via campaign_scheduleds com campaign_id E scope natal:2026. Um envio/agendamento de campanha não prova pedido espontâneo de orçamento; o relatório preserva essa diferença.
- communication_suppressions usa serviço CommunicationSuppressionHasher, com chave potencialmente diferente de proposals.hash_key, e CommunicationSuppressionEvaluator interpreta classe, canal e escopo. Sem autorização legal demonstrável, não exportar mesmo sem regra de blacklist.
- DDD/phone: E.164 internamente, somente dígitos 55+DDD+telefone na lista manual Meta; CPF e outros dados internos não são exportados; registro sem telefone válido não é incluído. Links por últimos 8 dígitos não são permitidos.

## Documentação oficial e limites

- Meta Customer Lists: usar modelo CSV no próprio Gerenciador de Públicos para confirmar cabeçalhos, mapeamento e aceite manual. Documentação developer: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences/ e Business Help https://www.facebook.com/business/help/ (conteúdo externo pode exigir login e rate limits).
- MCP Tools: https://modelcontextprotocol.io/specification/2025-11-25/server/tools; autenticação: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization; per-tool scopeChallenge: https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization
- A especificação MCP pede schema/structuredContent coerentes e garantia de escopo real pelo servidor. Anotações como readOnlyHint e securitySchemes NÃO concedem autorização.
- NÃO afirmar que a Meta aceitou o CSV até homologar upload manual com operador.

## Validação feita nesta sessão

- Leitura do HEAD original e dos arquivos completos de gateway, bridge, SQL, OAuth, formatter, validator e testes no GitHub.
- Teste sintético do formatter V3 com V8 isolado e digest simulado: 18/18 PASS. Não substitui Node.js nativo/SHA real.
- Parse sintático V8 dos módulos JavaScript alterados: PASS após retirar diretivas import/export apenas para parser. Não equivale a node --check ou execução MCP.
- Antigravity relatou 330 testes PASS no commit original e5a5beb. Não reexecutei a suíte Node/PHP completa dos hotfixes porque não há checkout Node/MySQL do host acessível aqui.

## Bloqueios que não devem ser ocultados

1. SQL/MySQL REAL: falta homologar status, joins, schema LIVE, transação, índices e comportamento de rollback usando fixtures sintéticas em Laravel.
2. O flag EVYD_META_AUDIENCE_LGPD_APPROVED e referência de política são somente controles de aprovação: não demonstram automaticamente consentimento ou base legal de cada titular. Operador deve aprovar tratamento de dados Meta e validar opt-out.
3. File delivery: arquivo salvo no gateway privado e devolve arquivo_id, mas NÃO existe um endpoint/download MCP autenticado e verificado para entregar diretamente no ChatGPT. Não prometer download em chat.
4. Arquivos órfãos: timer e limpeza na próxima exportação; ainda precisa de rotina local periódica se exigir expiração garantida quando a VPS ficar sem novas exportações.
5. SDK scopeChallenge: validar no Node real do checkout que ausência de crm.audience.export resulta em HTTP 403, inclusive após refresh e em conexão existente.
6. Política de compra 2026 de produto não Natal deve ser confirmada com financeiro, incluindo pedidos antigos pagos no ano e reembolsos.

Conclusão: HOTFIXES DE CÓDIGO APLICADOS / LOCAL QA PENDENTE / LIVE EXPORT NO-GO / META UPLOAD NO-GO. PR #23 deve permanecer draft até testes nativos, QA MySQL e autorização explícita.
