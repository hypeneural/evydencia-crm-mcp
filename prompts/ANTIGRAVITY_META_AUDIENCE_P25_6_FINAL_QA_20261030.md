# ANTIGRAVITY — P25.6 | QA FORENSE FINAL, ESTABILIDADE CSV E PUBLICAÇÃO CIRÚRGICA

**Repositório:** hypeneural/evydencia-crm-mcp
**Branch:** feat/meta-audience-crm-export-foundation-20261029
**PR:** #23 (DRAFT)
**Release LIVE confirmado no ChatGPT:** 3968dbc, versão 0.12.0 e 41 tools.
**Relatório canônico:** docs/META_AUDIENCE_P25_6_FORENSIC_RECONCILIATION_20261030.md

O ChatGPT auditou o recibo do Antigravity #6514553912, o código fonte, o preflight SQL, o classificador, a formatação do CSV, o hash, o OAuth, as políticas de supressão e os documentos Meta disponíveis. Já aplicou as alterações P25.6 DIRETAMENTE na mesma branch. **Não reimplementar.** Não sobrescrever commits, não executar reset/force-push e não criar GitHub Actions.

## Gate A — QA local novo HEAD (única rodada completa)

No checkout/worktree isolado:

```bash
git fetch origin --prune
git switch feat/meta-audience-crm-export-foundation-20261029
git pull --ff-only
git status --short
git rev-parse HEAD
bash scripts/antigravity/validate-meta-audience-p25-local.sh
```

O script já inclui as novas suítes `test/meta-audience-csv-audit.test.mjs` e `test/meta-audience-csv.test.mjs`, além de Node, PHP, OAuth, janitor e `npm test`.
Registrar **SHA novo**, duração e contagens REAIS. Não reaproveitar o recibo 356/356 do commit 3968dbc. Se falhar, corrigir somente o defeito reproduzido e repetir teste focal + uma rodada completa, sem testes infinitos.

### Regressões críticas
1. Dois `proposal_dispatches` com o mesmo telefone, mesmo score e e-mails diferentes, em ordem inversa, devem produzir CSV e SHA idênticos (desempate determinístico).
2. Grupo com dois telefones = 1 pessoa elegível e 2 linhas; identificar corretamente `eligible_people` vs `export_rows`.
3. Comprador 2026 e opt-out em qualquer linha vinculada por telefone/email/ID devem excluir o grupo inteiro, independente da ordem.
4. Hash do CSV adulterado deve falhar mesmo quando o telefone permanece válido.
5. `crm.read` sem `crm.audience.export` continua HTTP 403; confirmação de operador exigida. Revisar LGPD uma única vez na implantação, sem novos formulários a cada CSV.
6. Mecanismo de arquivo 0600 fora do checkout Git, SFTP por canal autenticado, janitor restrito e sem caminhos de PII em logs.

## Gate B — revisão agregada do canário sem reexportar dados

O recibo P25.5 informa:
- `input=3010` (2911 registros customer + 99 dispatches);
- `excluded_2026_buyer=219` **grupos de identidade**, não provar que são 219 customer IDs sem contador equivalente;
- `excluded_suppressed=0`: explicar com `origin_quality.suppression_rules_examined` (agregado) e confirmar se houve regras ativas elegíveis;
- `excluded_conflicting_customer_ids=51`, `excluded_ambiguous_or_unknown=8`;
- `input_missing_phone=343`, mas `excluded_no_valid_phone=324` (métricas em etapas distintas);
- `eligible_people=2330`, `export_rows=2331`, `unique_phones=2331`, `rows_with_email=2250`.

**Nunca chamar as 2.331 linhas de 2.331 pessoas distintas.** Não somar subtrações de grupos como se fossem contagens homogêneas.

Conferir `index_checks` reais do preflight; 12 tabelas OK não prova índices necessários. Comparar o número de compradores do relatório `buyer_customer_ids` do PHP com os 219 grupos do formatador. Conferir se as 99 propostas qualificadas foram realmente SOLICITADAS pelo cliente ou apenas agendadas; não inventar status entregue/lido.

Fazer somente consultas agregadas/read-only, sem telefone, nome, email, CPF, linha de CSV ou segredo nos logs e comentários.

## Gate C — SHA-256 real do arquivo já baixado

O operador já recebeu o arquivo por SFTP. NÃO pedir novo CSV nem baixá-lo novamente se ainda estiver no computador.

Na máquina local com checkout atualizado, executar:

```bash
node scripts/antigravity/verify-meta-audience-download.mjs \
  --file "<CAMINHO_PRIVADO_DO_CSV_NO_COMPUTADOR>" \
  --sha256 449df83ded42bfcbc29ef69a8a6c4ba9f1cbb2e8c4d4c8bc69960de290fdccfa \
  --rows 2331 --people 2330 --emails 2250
```

Só retornar `status`, contagens e `sha256_verified`. NÃO subir o CSV para GitHub/PR, nem colar registros em mensagens. Se arquivo já foi apagado, registrar UNKNOWN e não simular PASS.

## Gate D — conformidade Meta no momento do upload

Consultar, se possível com acesso autenticado do operador, o template de `Customer list` no próprio Ads Manager. Meta Business Help/Developers podem exigir autenticação/limitar requisições; não declarar páginas não vistas como verificadas.

- O CSV manual utiliza `email,phone,fn,ln,country`, com DDI 55 e só dígitos; sem CPF, identificador interno ou pré-hash da API.
- O gate de 100 pessoas do MCP é **interno**; número de contas correspondidas à Meta só é conhecido após processamento.
- Criar público personalizado NOVO para o primeiro teste, com nome apropriado; upload manual do gestor.
- Na atualização, **substituir/recriar** a lista, NÃO simplesmente acrescentar, pois compradores 2026 que saíram do novo CSV podem permanecer no público antigo.
- Confirmar termos de uso e direito de inclusão dos contatos, além dos opt-outs.
- Nenhuma criação/ativação automática de anúncio, nenhum orçamento nem campanha.

## Gate E — estabilidade e release

Confirmar a VPS ainda reporta `3968dbc` ou outro build realmente implantado; HEAD da branch após P25.6 é diferente do LIVE. Fazer backup e registrar rollback restrito ao MCP.

Antes de publicar os hotfixes P25.6:
1. Gate A PASS e ausência de P0 sem solução;
2. Smoke das 41 ferramentas existentes, login OAuth e recursos de CRM, PrintServer, Z-API, Gameplay;
3. Confirmar que nenhuma migration/DDL, cron compartilhado ou outro serviço foi alterado;
4. Publicar exclusivamente o novo código MCP pelo mecanismo oficial **com autorização operacional já concedida**; caso não exista autorização válida ou procedimento conhecido, parar e apresentar comandos para aprovação, sem improvisar;
5. Conferir `crm_capacidades` devolvendo build correto, 41 ferramentas ou contagem explicada e `/healthz` saudável;
6. Rollback imediato se houver 500 em OAuth, truncamento CSV, discrepância de compradores/opt-outs ou falha nos demais serviços.

Não reexecutar exportação real automaticamente só para testar o hotfix de ordenação; pode ser validado com corpus sintético. Somente uma exportação real nova com pedido explícito do gestor.

## Gate F — recibo e handoff final

Atualizar PR #23 sem repetir comentários históricos e sem PII. Entregar:
- SHA atualizado e build LIVE independente;
- testes Node/PHP PASS/FAIL, SHA auditoria offline PASS/UNKNOWN;
- reconciliar linhas 2331, pessoas 2330, e-mails 2250;
- informação agregada sobre opt-outs e comprador/grupo;
- preflight índices e posição de `janitor` (dry-run não prova timer persistente);
- status do upload manual Meta (NOT_DONE até existir prova);
- resultado de todos os smoke/rollback; nenhum anúncio ativado;
- alerta de PR DRAFT em produção: futuro deploy main pode remover o recurso — propor merge/reconciliação SEM force-push.

**Parecer alvo:** `P25_6_LOCAL_QA_GO` só com testes nativos completos; `LIVE_CANARY_PREVIOUSLY_REPORTED_PASS` e `META_UPLOAD_PENDING` até receber evidência real.
