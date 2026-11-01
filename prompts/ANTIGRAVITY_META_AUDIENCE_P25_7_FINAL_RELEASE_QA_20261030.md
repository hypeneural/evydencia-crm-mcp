# ANTIGRAVITY — P25.7 | Handoff único de QA, release MCP e reconciliação de merge

Repo `hypeneural/evydencia-crm-mcp`; branch
`feat/meta-audience-crm-export-foundation-20261029`, PR #23 (DRAFT).
Leia ANTES `docs/META_AUDIENCE_P25_7_FINAL_FORENSIC_AUDIT_20261030.md`.
O ChatGPT já aplicou P25.7: overlap de supressão/compra, métricas por origem,
índices SQL de parcela/status e regressões determinísticas. NÃO reimplementar.
Sem git reset, force push, nova exportação real, criação automática de público,
anúncio, modificação de outros serviços ou migrations.

## A. Validar novo HEAD no checkout local limpo — uma rodada completa

```bash
git fetch origin --prune
git switch feat/meta-audience-crm-export-foundation-20261029
git pull --ff-only
git status --short
git rev-parse HEAD
bash scripts/antigravity/validate-meta-audience-p25-local.sh
```

Registrar SHA, Node/PHP, total de testes e duração REAIS.
O recibo 363/363 P25.6 só prova o SHA 7adbd4b, não os commits P25.7.
Corrigir apenas defeito reprodutível, repetir teste afetado e uma passada global.
Não criar ciclos infinitos.

### Testes obrigatórios novos
- `identity_groups_with_suppression=1` mesmo se
  `excluded_suppressed=0` porque há comprador+opt-out no mesmo grupo;
- `identity_groups_buyer_and_suppressed` contado sem mudar o CSV;
- um contato de e-mail distinto permanece elegível (fixture não deve
  compartilhar e-mail com comprador);
- 32 permutações determinísticas da população sintética geram exatamente o
  mesmo CSV/SHA, contadores, telefone e atribuição de email;
- `customer_source_rows` distinto de `unique_customers` e
  `buyer_customer_ids` vindo do leitor PHP;
- preflight index_check novo para `orders_status(order_id)` e
  `orders_installments(payment_at)`, `orders_installments(order_id)`.
  Nenhuma criação/alteração de índice no CRM.

## B. Diagnóstico agregados / política de supressão

Ao validar código, não exportar nova lista.
Confirmar, apenas em preview de operador autorizado e SEM PII:
`source_quality.unique_customers`, `customer_source_rows`,
`proposal_source_rows`, `buyer_customer_ids`,
`suppression_rules_examined`, `suppression_scope`,
`counts.identity_groups_with_suppression`,
`counts.identity_groups_buyer_and_suppressed`.

**Atenção:** a consulta PHP cobre apenas marketing no canal WhatsApp/ALL e
temporada Natal ou global; não alegar que todas as preferências de todos os
canais foram checadas. `excluded_suppressed=0` não prova ausência de opt-outs
em grupos excluídos antes por compra.

**Hotfix pequeno de UX ainda pendente, sem refatorar gateway:** atualizar
somente a frase de resumo da ferramenta
`crm_meta_publico_natal_previa` em `src/live-gateway.mjs`, hoje
`supressoes=excluded_suppressed`. Deixar explícitos no texto os grupos com
regras de marketing WhatsApp/geral e a sobreposição com compradores.
Preservar `structuredContent`, filtros, scopes e tool names.
Adicionar teste estático/textual se útil. Se o gateway não permitir
edição segura, registrar pendência e não bloquear outras funções.

## C. Validar segurança e canário P25.6 sem reextrair

- MCP LIVE anteriormente confirmou `build_commit=7adbd4b` e 41 tools;
  verificar novamente `crm_capacidades` / `healthz` READ ONLY.
- Confirmar autenticação OAuth e autorização dedicada
  `crm.audience.export` sem presumir que o ChatGPT desta sessão recebeu
  esse scope. Preview permanece agregada sob `crm.read`.
- Conferir valor `eligible_people=2330` vs `export_rows=2331`.
- Dados do recibo anterior: 3010 registros, 219 grupos compradores, 51
  grupos conflitantes, 8 ambíguos, 324 sem telefone, 16 duplicados colapsados,
  2250 linhas com e-mail. Não usar contagens de grupos como número de
  pessoas identificadas pela Meta.
- Verificar janitor real: `dry-run` prova não deleção, não prova existência
  de timer persistente após restart. Inspecionar somente as units relacionadas
  ao MCP; nunca alterar cron/units de outros serviços sem autorização.
- Se CSV SFTP anterior ainda existir no computador, conferir SHA com o
  validador privado já versionado; não copiar CSV, PII ou caminho pessoal
  para GitHub/ChatGPT.
- NÃO solicitar novo CSV nem usar `crm_meta_publico_natal_exportar` de novo
  só para testar contadores agregados.

## D. Reconciliar base da PR antes do MERGE

O GitHub comparou:
- `main` vs feature P25.6: **370 commits à frente**, com múltiplos
  subsistemas além do público Meta.
- `base/reprint-live-6abe039-20261029` vs feature P25.6:
  **113 commits à frente** e 42 arquivos da feature (antes P25.7).

`mergeable=true` NÃO autoriza unir 370 commits a main. **NÃO DAR MERGE NA
MAIN** nesta execução. Preparar uma proposta de integração seletiva baseada
na release operacional atualmente em produção, preservando todas as mudanças
de PrintServer, Z-API, Gameplay, OAuth e CRM já publicadas. Demonstrar
`compare_commits` antes/depois para garantir que não haverá regressões.
Não atualizar a PR base sem validação do gestor.

## E. Preparar release cirúrgico P25.7

Só após Gate A nativo PASS, com procedimento conhecido e autorização
operacional, preparar release EXCLUSIVO do MCP, sem banco/migration e sem
novo CSV. Antes, backup do build LIVE, verificar uso de memória, performance,
método de rollback. Depois, confirmar /healthz, RFC 9728, capacidades 41 tools,
respostas de CRM, PrintServer, Gameplay e Z-API. Falha => rollback apenas MCP.

O upload MANUAL do CSV existente no Audience Manager requer ação do gestor.
Confirmar mapeamento de `email,phone,fn,ln,country`, estado de processamento,
número correspondido e erro de importação, mas não ativar campanhas/orçamentos.
Reimportação futura da base com compradores excluídos exige operação
replace/remove na UI, não apenas add.

## F. Recibo final

Postar um único comentário sucinto na PR #23, sem PII, contendo HEAD testado,
sha LIVE, 0 regressões verificadas, números de testes atuais, contadores novos,
status de índices, janitor, caminho de merge seguro, rollback e Meta upload
(NOT_DONE se não houve prova). Não repetir recibos antigos.

Parecer permitido:
- `P25_7_LOCAL_QA_GO` se suite local inteira passar;
- `LIVE_RELEASE_GO` só depois da publicação e smoke real;
- `MERGE_MAIN_NO_GO` até reconciliação do histórico;
- `META_UPLOAD_NOT_VERIFIED` até aceite real na Meta.
