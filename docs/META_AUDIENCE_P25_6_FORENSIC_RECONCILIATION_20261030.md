# P25.6 — Auditoria independente do canário LIVE e contrato de atualização Meta
Data: 30/10/2026 BRT. Repo `hypeneural/evydencia-crm-mcp`; PR #23 DRAFT.
Nenhuma extração nova de contatos, upload Meta, deploy, merge, mutação MySQL,
mudança de ambiente ou anúncio foi feita por esta auditoria.

## Prova e limites das evidências

- GitHub: commit do release `3968dbcd87de9ae5f67bc1a1e6117d2678c50868`,
  commit documental `f2152b9ffc16f6f4e1ce2b6a1bb8213d2b8f00d8` e recibo #6514553912 conferidos.
- MCP LIVE (crm_capacidades somente leitura) respondeu build `3968dbc`,
  versão `0.12.0`, modo LIVE e **41 ferramentas ativas**. Esta conexão possui
  `crm.read`, mas NÃO recebeu `crm.audience.export` para esta sessão.
- Antigravity relatou 356 testes Node e 13 PHP PASS, preflight real MySQL,
  2.331 telefones únicos e SHA-256 pós-SFTP idêntico ao hash do gateway.
  Esta auditoria NÃO teve acesso direto ao arquivo no computador do operador
  nem ao systemd/journal VPS. Hash idêntico é evidência reportada, não rechecagem independente.
- Nenhuma comprovação de upload no Audience Manager nem tamanho correspondido à Meta.

## Reconciliação exata das contagens do canário

| Indicador | Fonte estruturada | Interpretação correta |
| --- | ---: | --- |
| Registros de origem | 3010 | 2911 registros de customer + 99 proposal_dispatches; NÃO necessariamente pessoas únicas |
| Grupos excluídos por comprador | 219 | `counts.excluded_2026_buyer` conta grupos de identidade; NÃO provar 219 customer IDs sem `origin_quality.buyer_customer_ids` |
| Grupos de customer IDs conflitantes | 51 | `excluded_conflicting_customer_ids` |
| Grupos ambíguos/desconhecidos | 8 | `excluded_ambiguous_or_unknown` |
| Grupos sem telefone exportável | 324 | `excluded_no_valid_phone`; NÃO igual a `input_missing_phone=343` |
| Telefones duplicados colapsados | 16 | `duplicate_phone_rows_collapsed` |
| Telefones/linhas válidas exportadas | **2331** | `counts.export_rows = unique_phones` |
| Grupos de identidade elegíveis | **2330** | `counts.eligible_people`; um grupo possui dois telefones |
| Linhas com e-mail | 2250 | 2250/2331 = 96,5% (arredondado) |
| Suppressions excluídas | **0** | Não é prova de que a base não tem opt-outs; verificar `origin_quality.suppression_rules_examined` e a efetividade do filtro antes da próxima atualização |

Contagens de exclusão são por grupos e podem se sobrepor aos registros de
entrada; não subtrair todas as categorias como se fossem uma partição.
Também não declarar que 2330/2331 usuários foram encontrados pela Meta.
O gate de 100 identidades é uma restrição interna do projeto; o tamanho mínimo
de público *correspondido* depende das regras e do processamento da Meta.

## Achado P1 confirmado no código e corrigido

`src/meta-audience-csv.mjs` resolvia duas observações com o MESMO telefone,
mesmo score e e-mails diferentes escolhendo a primeira ocorrência. O backend
podia devolver as linhas em outra ordem no novo snapshot (sem alteração real
de elegibilidade) e produzir SHA distinto, rejeitando falsamente a exportação
com `snapshot_changed_review_again`.

Correção: desempate canônico estável (email normalizado + nome + origem +
source_id), sem misturar telefone e e-mail de linhas diferentes.
`test/meta-audience-csv.test.mjs` cobre permutações de linhas, exclusões de
comprador/opt-out por grupo e a diferença 2331 telefones versus 2330 pessoas.

## Arquivo já baixado — prova independente na máquina do gestor

Novos arquivos:
- `src/meta-audience-csv-audit.mjs`: valida o CSV efetivamente transferido
  contra SHA e contagens do recibo, sem imprimir ou devolver linhas/telefones.
- `scripts/antigravity/verify-meta-audience-download.mjs`: CLI offline,
  recebe parâmetros `--file`, `--sha256`, `--rows`, `--people` e `--emails`;
  retorna apenas contagens e PASS/FAIL, nunca nomes ou path.
- `test/meta-audience-csv-audit.test.mjs`: adulteração de email com
  telefone válido, mismatch de contagens, limite de identidades e SHA.

Comando para conferir novamente um download privado (NA máquina do gestor,
com caminho do arquivo fornecido pelo operador, sem copiar CSV no chat):

```bash
node scripts/antigravity/verify-meta-audience-download.mjs \
  --file "<CAMINHO_LOCAL_PRIVADO>" \
  --sha256 449df83ded42bfcbc29ef69a8a6c4ba9f1cbb2e8c4d4c8bc69960de290fdccfa \
  --rows 2331 --people 2330 --emails 2250
```

## Testes efetivamente executados nesta auditoria

- Auditoria no GitHub de leitor Laravel, SQL, formatter, validador,
  armazenamento, OAuth, preflight e recibos de release;
  consulta SOMENTE de leitura a `crm_capacidades` LIVE.
- **27/27 testes sintéticos em V8** dos módulos CSV e auditor de download
  (SHA substituto determinístico). NÃO são `node --test` nativo ou SHA-256 criptográfico.
- Atualizado `scripts/antigravity/validate-meta-audience-p25-local.sh` para
  executar as novas suítes no checkout Node do Antigravity.
- **PENDENTE:** Node nativo `npm test`, `npm run check` e script P25.6 no
  novo HEAD; confirmação do arquivo local pelo CLI SHA-256 real e revisão
  dos logs do canário no host. Os resultados 356/356 são do HEAD anterior.

## Documentação Meta e atualização da lista

- Fonte oficial (pode exigir login): https://www.facebook.com/business/help/170456843145568
- Marketing API Custom Audiences: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences/
- Termos Meta Custom Audience: https://www.facebook.com/legal/terms/customaudience
- As páginas diretas Developers/Business Help não foram totalmente acessíveis
  nesta auditoria (HTTP 429 e redirecionamento para login).
- O padrão do CSV MANUAL do projeto usa `email,phone,fn,ln,country`;
  `phone` é `55` + DDD + número, somente dígitos e sem pré-hash.
  Validar mapeamento no Ads Manager da própria conta.
- **Atualizar sem compradores atuais:** para o PRIMEIRO upload, criar público
  NOVO; nas atualizações, usar a opção de substituir/recriar a lista,
  **não apenas acrescentar** registros. Caso contrário clientes que compraram
  entre exportações podem continuar no público anterior.
- Criar/importar a lista NÃO liga campanha nem garante correspondência.
  Não ativar anúncios, orçamento ou disparos neste fluxo.
- Direitos sobre dados e supressões permanecem aplicáveis; a aprovação
  de finalidade na VPS é única por implantação, sem formulário por CSV.
- Manter `crm.audience.export` separado de `crm.read` e cada exportação
  vinculada à confirmação do gestor.

## Itens ainda a validar operacionalmente

1. Confirmar `origin_quality.suppression_rules_examined` com agregados na
   prévia e explicar por que `excluded_suppressed=0` no canário; sem
   consultar/imprimir telefones.
2. Confrontar `origin_quality.buyer_customer_ids` com os 219 grupos
   excluídos; não chamar grupos de clientes distintos sem essa checagem.
3. Investigar se as 99 propostas elegíveis cobrem leads reais que pediram
   orçamento ou apenas despachos agendados; não inventar estados entregue/lido.
4. Confirmar `index_checks` do preflight: 12 tabelas/colunas OK não implica
   que todos os índices de performance foram encontrados.
5. Janitor `dry_run PASS` não comprova timer/cron periódico após restart;
   verificar a unidade/agenda específica do MCP, sem mexer em serviços vizinhos.
6. No GitHub, PR #23 continua DRAFT enquanto build LIVE já roda código da
   branch; proteger futuras publicações de `main` que poderiam reverter
   a funcionalidade e preparar reconciliação da base sem merge forçado.
7. Download direto no ChatGPT Web continua não implementado. SFTP já foi
   reportado como funcional; arquivo CSV NÃO deve ser anexado ao GitHub.

**Parecer:** CANARY_LIVE_REPORTED_PASS / CURRENT_LIVE_BUILD_CONFIRMED /
CSV_DETERMINISM_FIXED_IN_PR_ONLY / NEW_HEAD_NATIVE_QA_PENDING /
META_UPLOAD_NOT_PROVEN / CAMPAIGN_ACTIVATION_NOT_REQUESTED.
