# P25 — Exportação de público personalizado Meta a partir do CRM (29/10/2026)

> **STATUS HISTÓRICO / NÃO USAR COMO RUNBOOK:** este documento registra uma fase anterior. O MCP Meta Audience já foi implantado em P25.8 (`2f7755d`); a atualização P25.9 está em validação na PR #23. Para operar ou homologar agora, use o [manual operacional P25.9](./META_AUDIENCE_P25_9_MANUAL_OPERACIONAL_20261030.md). Os passos de implementação inicial abaixo são preservados apenas como histórico.


## Auditoria de código ampliada (29/10)

**LEITURA OBRIGATÓRIA ANTES DE IMPLEMENTAR:** [META_AUDIENCE_DATA_MODEL_FORENSIC_20261029.md](./META_AUDIENCE_DATA_MODEL_FORENSIC_20261029.md) descreve ER real, classes e predicates de compra, discrepâncias do legado, OAuth e snapshot InnoDB. O código agora usa `evyd-meta-audience-export-v2`: `identity_crosscheck_complete`, `source_counts` obrigatórios, isolamento de dois Customer IDs que compartilham telefone/e-mail, pares de identificadores observados e limite 20 MB. O helper PHP `scripts/crm-meta-audience-preflight-read.php` verifica tabelas/índices no contexto do bridge, sem retornar dados pessoais, mas **não está publicado como ferramenta MCP**. Os 11 testes Node e lint isolado PHP passaram no sandbox de homologação local, e precisam ser reexecutados na branch por Antigravity. O código da importação global e o OAuth de exportação ainda não foram implementados.

**Status:** BASE OFFLINE IMPLEMENTADA; **API/MCP GLOBAL LIVE AINDA NÃO IMPLEMENTADA**. Esta branch deriva do commit **LIVE real 6abe03992549cee83732ea538e728377a3c989fe**, não de `main` divergente. Nenhuma alteração em CRM Laravel, banco, VPS, Meta Ads, Z-API, PrintServer ou Gameplay.

## Objetivo comercial exato

Um arquivo privado CSV para **Meta Customer List** criado pela união de:
- **A**: todos os cadastros elegíveis da tabela `customers` do CRM, incluindo históricos (se decisão comercial determinar apenas clientes com pedidos passados, introduzir opção separada com prova de compras);
- **B**: destinatários **verificados** do fluxo de proposta Natal 2026, incluindo leads SEM cadastro `customers`, a partir de `proposal_dispatches` e de `campaign_scheduled_contacts` legados que sejam comprovadamente do fluxo/escopo `natal:2026`.

Excluir do conjunto A∪B:
- qualquer cliente com **compra comercial válida em 2026, de qualquer produto** (`ANY_VALID_PURCHASE_2026`) — opção mais rigorosa solicitada; NÃO confundir com `NATAL_VALID_2026`; compras canceladas/estornadas exigem regra canônica; em falha/estado ambíguo **bloquear exportação**;
- telefones e e-mails vinculados a comprador (inclusive compartilhados entre dois cadastros); bloquear identidades conflituosas, variantes de 8/9 dígitos não comprovadas e candidatos associados a compradores; **nunca corresponder pelo último bloco de oito dígitos**;
- bloqueios de marketing globais/temporada/campanha do CRM e pessoas que exerceram opt-out de publicidade pertinente; não derivar automaticamente consentimento de existir no CRM. Se a base legal de Meta Customer List não estiver validada, não incluir;
- entradas sem um telefone/e-mail válido ou cujo status de compra, supressão ou identidade esteja indisponível.

Não exportar CPF, data de nascimento, nomes de crianças, pedidos, receita, observações, IDs de CRM, cadastro completo ou hash de supressão para a Meta. Colunas mínimas **email, phone, fn, ln, country**, DDI 55 e `br`; sem valor de cliente (não é lookalike baseada em valor).

## Código existente auditado

| Fonte | Contrato/limitação real |
|---|---|
| `crm_clientes_buscar` → `scripts/crm-forensic-bridge.php` `customers.search` | Página até 25, com e-mail/telefone completos quando operador autenticado; 2.910 cadastros observados em 29/10, ou >116 chamadas para extrair tudo, impraticável no chat. |
| `crm_relatorio_clientes_natal(comprou_natal=false)` | `src/legacy-api-read.mjs` busca `/api/reports/customers-without-christmas-orders`, retorna amostra de até 50 com telefone **mascarado**. Legado usa SQL do service `CustomersWithoutChristmasOrdersService`: julho–ano vigente, `product.slug=natal`, exclui `order_aborted`; **NÃO** exclui todos compradores 2026 e NÃO usa `NatalValidOrdersQuery`. 2.703 resultados observados: **não é base auditada Meta**. |
| `crm_propostas_natal_consultar_lote` | 1–50 telefones **conhecidos**; não enumera todos os destinatários. Bridge `scripts/crm-proposal-history-read.php` prova fonte `proposal_flows.slug=natal` e a temporada `2026`; fornece base de normalização/proveniência, mas não export global. |
| `NatalValidOrdersQuery` do CRM | `getValidCustomerIds` e `validNatalOrders` úteis para **Natal somente**, não resolvem todos os produtos de 2026. `NatalCommercialConversionPolicy::decisionsForCustomers` é outra política de temporada; usar coerentemente, sem misturar definições. |
| `CommunicationSuppressionFilter` e `CommunicationSuppressionEvaluator` | Resolução em lotes por HMAC-SHA256 da chave do CRM; reutilizar somente leitura, sem alterar flags ou realizar disparos. Separar bloqueio para SMS/WhatsApp operacional de autorização para publicidade Meta; política comercial conservadora. |

### Implementação disponível nesta branch
- `src/meta-audience-csv.mjs`: transformador **puro**, sem rede/banco/arquivos; exige cobertura integral, decisões verificadas, dedup e exclusões conservadoras; retorna CSV em memória mais contadores e SHA-256, sem informações de CRM no CSV.
- `test/meta-audience-csv.test.mjs`: testes sintéticos de compradores, opt-out, duplicidade/compartilhamento de telefone, ambiguidade, normalização brasileira, cobertura parcial, ausência de identificadores e prevenção de vazamento de campos internos.
- **O adapter SQL e os tools MCP ainda não estão conectados. NÃO anunciar a exportação como funcional no ChatGPT até implementar, testar e implantar.**

## Contrato sugerido para tools futuros (não publicados)

1. `crm_meta_publico_natal_previa` — `crm.read` e allowlist de operador. Retorna SOMENTE contagens e qualidade: total de clientes, destinatários de proposta, exclusões de compradores, supressões, ambiguidades, deduplicações, elegíveis, cobertura, versão de regra, timestamp, sem PII.
2. `crm_meta_publico_natal_exportar` — escopo OAuth **`crm.audience.export`** (novo, concedido explicitamente), `confirmado_pelo_operador=true` e operador autorizado. Exporta somente quando snapshot fresco/íntegro com cobertura COMPLETE. Resultado em páginas de até ~250 registros, com cursor vinculado a operador/snapshot e prazo curto; o ChatGPT monta um CSV de download apenas na memória/arquivo da conversa. Alternativa: arquivo privado temporário no MCP com entrega autenticada, sem link público nem bearer em query string. O único artefato com PII deve ser privado e ter retenção curta. **Nunca devolver milhares de telefones como texto da resposta.**
3. No Antigravity, comando local supervisionado produz CSV em pasta privada **fora dos repos** e log apenas de contagens/hash; nenhum envio Meta. CSV inválido ou parcial não pode ser disponibilizado.

### SQL/source adapter a construir SEM modificar o CRM Laravel

Implementar uma action específica em `scripts/crm-forensic-bridge.php` que inclua `scripts/crm-meta-audience-read.php`. Reutilizar inicialização Laravel existente, `SET SESSION TRANSACTION READ ONLY`, `DB::beforeExecuting` bloqueando DML, token Sanctum do operador, consulta por `customer.id`/índices, limite de tempo/linha e sem log de PII. Evitar `OFFSET` para grandes volumes; usar paginação por ID/cursor e **snapshot consistente** em uma execução (sem recomputar inclusão/exclusão durante páginas). Se o snapshot falhar/regras de compra mudarem, invalidar, reexecutar.

- Enumerar **todos** os `customers`, não apenas os com pedidos de Natal; buscar campos indispensáveis do CRM.
- Descobrir destinatários exclusivamente da proposta Natal 2026 com proveniência de `proposal_flows`/`proposal_dispatches` e legados `campaign_scheduled_contacts` com `suppression_scope_key=natal:2026` ou data 2026 e campanha/fluxo comprovados. Não incluir campanha 2025/2027 nem qualquer chat genérico presumido de proposta.
- Não exigir que a proposta tenha sido lida para integrar um lead válido, mas distinguir `dispatched`, `scheduled`, `asked_quote` (este último **não é inferível apenas de dispatch**; exige evento explícito de interesse).
- Relacionar por customer_id estável e índices de telefone completos, sem `last-8`. Variantes com/sem nono dígito apenas quando verificadas; em dúvida bloquear.
- Compras 2026: usar o **contrato comercial de conversão para qualquer produto**; `NatalValidOrdersQuery` atende Natal, mas compra de outro produto precisa regra própria, compatível com histórico de status, recebimentos, cancelamentos e reembolsos. Auditar antes de SQL final.
- Supressões: carregar em lotes, avaliar `marketing` e escopo `natal:2026` com HMAC do CRM e data de referência; se regra indisponível, FAIL CLOSED.
- Regra de cópia comercial: sem marketing autorizado para Meta → fora da lista, mesmo quando o WhatsApp operacional é permitido.
- Conferir `source_count`, `eligible_count`, `excluded_count` e consistência, sem divulgar contas individuais em logs.

### Segurança e gate
- Adicionar o escopo de exportação em `src/oauth-gateway.mjs` e `src/live-gateway.mjs` somente após revisão de impactos no OAuth 2.1. **`crm.read` por si só não deve habilitar extração maciça de 2.910 contatos.**
- Confirmação explícita de exportação de dados pessoais pelo operador, não por um cron/prompt. Preflight com contagens pode ser automático, exportação não.
- Anti-CSRF e vinculação ao operador no endpoint; cookies/tokens/CPF jamais escritos em arquivo de log, Git ou comentário.
- Testes com banco sintético MySQL/Laravel e casos negativos (comprador de outros produtos 2026, Natal válido, cancelado e reativado, telefone compartilhado, opt-out, lead sem customer, campanha legada, temporada incorreta, arquivo corrompido, dados desatualizados, operador sem scope, mudança de snapshot).
- Não instalar GitHub Actions; não tocar legado; não publicar nem sincronizar com Meta. Após teste local dirigido, promover leaf sobre SHA LIVE homologado com rollback isolado e confirmar `crm_capacidades` antes de oferecer o comando no ChatGPT.

## Uso futuro desejado

> "Evydência MCP, prepare o público Meta Natal 2026: clientes do CRM + leads da proposta, exclua quem comprou em 2026, compradores vinculados, bloqueios e opt-out. Mostre a prévia e gere o CSV privado para download."

Após deploy e autorização do escopo, sequência: **prévia sem PII → decisão do gestor → exportação CSV privada → download no ChatGPT → upload manual na Meta**. Sem publicidade automática. Controle de atualização posterior por **substituição da lista completa**, não por acrescentar somente recém-chegados (evita manter compradores que deveriam sair). Preservar audiência antiga `nao comprou` ID 120250508220610388 até implantação validada.

### Referências
- Meta Customer List, usar o template da interface em Públicos → Criar público → Lista de clientes; consultar termos atuais em https://www.facebook.com/business/help/
- Meta Advertising Standards: https://transparency.meta.com/policies/ad-standards/
- CRM: `docs/architecture/communication-suppression.md`, `app/Services/Reports/NatalValidOrdersQuery.php`, `app/Services/Natal/NatalCommercialConversionPolicy.php`.
