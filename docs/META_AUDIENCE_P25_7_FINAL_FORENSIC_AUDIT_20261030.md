# P25.7 — Auditoria forense final do canário LIVE e bloqueio de merge amplo

Referência: 30/10/2026 (BRT). Repo `hypeneural/evydencia-crm-mcp`, PR #23 DRAFT.
Auditoria SOMENTE leitura do CRM LIVE; GitHub recebeu apenas hotfixes P25.7. Não houve
novo CSV de clientes, acesso shell à VPS, merge, deploy, alteração de banco, cron,
campanha, público ou orçamento da Meta nesta rodada.

## Evidência independente

- `crm_capacidades` LIVE confirmou `build_commit=7adbd4b`,
  versão 0.12.0, 41 ferramentas, `meta_audience_enabled=true`.
  O OAuth desta conexão NÃO inclui `crm.audience.export`; não usar esta conexão
  para tentar extração real ou inferir que o escopo já esteja concedido.
- GH PR #23: HEAD P25.6 `7adbd4b0fe7754466bca9b6be27223ca7b995232`,
  DRAFT, mergeable; recibo `6514828955` com 363/363 Node, 13/13 PHP, e
  verificação local SHA-256 do CSV anterior. Os testes são evidência do
  ANTIGRAVITY, não nova execução independente Node/PHP pelo ChatGPT.
- LIVE não disponibilizou nesta sessão journalctl/systemd/SSH; afirmações de
  integridade de PrintServer/Z-API/Gameplay dependem do recibo Antigravity.
- Meta Business Help e Developers exigiram login ou retornaram HTTP 429.
  Não foi possível certificar por fonte oficial pública acessível que o upload
  foi aceito; NÃO confundir formatador interno com correspondência Meta.

## Principal risco de merge: MAIN vs branch operacional

Comparação GitHub:
- `main` => PR branch: 370 commits à frente, zero atrás, com mudanças
  em outros subsistemas, arquivos de documentação, workflows e código legado.
- `base/reprint-live-6abe039-20261029` => PR branch: 113 commits à frente,
  42 arquivos alterados antes desta rodada (maioria específica de Meta).
- O PR aponta para BASE OPERACIONAL, não main. GitHub relatar `mergeable=true`
  significa ausência de conflito textual com a BASE, NÃO comprova aprovação
  de merge para main, nem garante que uma release futura de main preservará
  a operação LIVE.
- Parecer: **NÃO MESCLAR A PR #23 DIRETAMENTE À MAIN** sem reconciliar a
  cadeia de releases primeiro. Preferir preparar PR de integração a partir do
  HEAD oficial da release em produção, com mudanças estritamente de Meta;
  manter outras features inalteradas e usar compare_commits antes de merge.
- Não rebase, force-push, alterar base ou clicar merge automaticamente.

## Erros e melhorias P25.7 já versionadas

### 1. Métrica de supressões mascarada pela precedência

O formatter `src/meta-audience-csv.mjs` examinava grupos na ordem:
comprador => supressão => permissão => identidade => telefone.
Portanto `excluded_suppressed=0` NÃO prova ausência de contatos com opt-out,
pois um grupo comprado-e-suprimido é contabilizado apenas como comprador.

Novos contadores **sem PII**:
- `identity_groups_with_buyer`
- `identity_groups_with_suppression`
- `identity_groups_buyer_and_suppressed`

O código de exclusão e o CSV não mudaram. Testes sintéticos verificam
sobreposição comprador+opt-out, opt-out independente e grupo ainda elegível.
O conjunto de 61 regras informado pelo Antigravity é filtrado no Laravel
somente por marketing dos canais `whatsapp` ou `all`, escopo global
ou temporada natal:2026. Não proclamar que todas as políticas de outros
canais foram examinadas. O novo contador não expõe nomes ou telefones.

### 2. Clientes distintos vs linhas do CRM

`scripts/crm-meta-audience-read.php` agora retorna em `origin_quality`:
- `unique_customers`: IDs únicos de clientes efetivamente varridos.
- `customer_source_rows`: linhas fonte, uma por telefone reconhecido,
  podendo incluir a mesma pessoa duas vezes.
- `proposal_source_rows`: linhas de propostas qualificadas.
- `buyer_customer_ids`: compradores distintos resolvidos pelo PHP.
- `suppression_scope`: rótulo exato do filtro de blacklist executado.

O recibo anterior `customer_records=2911` NÃO prova 2911 pessoas únicas;
compare com `origin_quality.unique_customers` da nova prévia para demonstrar.
Ainda `eligible_people=2330` são GRUPOS de identidade resolvidos, não
2.330 pessoas encontradas pela Meta; `export_rows=2331` são linhas/telefones.

### 3. Preflight de índices mais fiel à SQL de compras

`scripts/crm-meta-audience-preflight-read.php` passou a auditar também:
- `orders_status(order_id)` — join/agrupamento MAX(id) por pedido;
- `orders_installments(payment_at)` e `orders_installments(order_id)` —
  filtros de pagamentos de 2026 e reconciliação com pedidos.

As verificações são diagnósticas, **não executam CREATE INDEX, ALTER ou DDL**.
Índice ausente => documentar `index_checks` e EXPLAIN, não criar sem projeto
de DBA ou interromper serviço produtivo desnecessariamente.

### 4. Testes robustos e correção de fixture

Novos casos verificam opt-out/comprador sobrepostos e um lote com 32
permutações reprodutíveis. Na primeira execução isolada, dois testes falharam
por um erro DO TESTE: usavam o mesmo e-mail `first@example.com` em clientes
que deveriam ser independentes. O union-find os vinculou corretamente e
excluiu ambos. Testes corrigidos com e-mails distintos, sem enfraquecer a lógica.

**Resultado verificado desta auditoria:** 30/30 testes CSV/auditor offline em
V8 isolado PASS com função hash SIMULADA determinística. Não é execução
criptográfica Node nativa; Antigravity precisa repetir `npm test` e
`php -l` no HEAD novo. O P25.6 teve 363/363 PASS historicamente.

## Documentação Meta / atualização recorrente

- https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences/
- https://www.facebook.com/business/help/170456843145568
- https://www.facebook.com/legal/terms/customaudience
- Docs oficiais não totalmente acessíveis nesta auditoria (login/429).
  O formato manual esperado usa `email,phone,fn,ln,country`, DDI 55 e dígitos;
  confirmar os campos na UI da conta Meta antes do primeiro upload.
- Hash/identificadores da API não substituem CSV manual. O mínimo de 100 pessoas
  é GATE DE SEGURANÇA DO EXPORTADOR, não prova de 100 contas encontradas.
- Primeira criação de público: upload manual do arquivo existente já baixado.
- Atualizações posteriores da lista: substituir/recriar lista completa ou
  remover participantes obsoletos (conforme operação real disponível na conta);
  adicionar apenas novas linhas pode manter compradores já excluídos no CRM.
- Não ativar anúncios, públicos em campanha, gastos ou uploads automáticos.

## Pendências remanescentes verificáveis

1. Rerun **nativo** Node/PHP em P25.7, com SHA exato.
2. Prévia agregada com contadores novos de opt-outs e contagens distintas,
   sem nova exportação real e sem PII (com conexão com escopo crm.read).
3. Verificar se há limpeza automática de arquivo PRIVADO após restart: o
   recibo só comprovou `dry_run`, não serviço/timer instalado.
4. Health e OAuth de todos os módulos já existentes após implantar a correção,
   com rollback isolado do MCP.
5. Corrigir texto resumido da prévia, atualmente ainda usa
   `supressoes=excluded_suppressed` sem explicar sobreposição. Este ajuste
   no arquivo `src/live-gateway.mjs` não pôde ser gravado nesta rodada;
   Antigravity deve realizar alteração minúscula, com teste focado.
6. Meta upload/matched audience: NÃO EXECUTADO nesta auditoria.
7. Reconciliação da PR com main antes de qualquer merge.

**Decisão:** RELEASE_LIVE_P25_6_CONFIRMED / P25_7_SOURCE_IMPROVED /
V8_30_OF_30_PASS / NATIVE_QA_PENDING / MERGE_MAIN_NO_GO /
MANUAL_META_UPLOAD_NOT_VERIFIED. O PR permanece DRAFT.
