# ANTIGRAVITY — P25.2: SOMENTE VALIDAR O HOTFIX LOCAL

IMPORTANTE: Esta seção SUBSTITUI as instruções antigas P25.1 de implementar ou alterar código abaixo. O ChatGPT já auditou o commit e5a5beba269b56ecee3ef0c17f17da9cc2c00855, aplicou correções na própria branch da PR #23 e documentou todos os achados em docs/META_AUDIENCE_P25_2_FORENSIC_REVIEW_20261029.md. Sua tarefa agora é VALIDAR O HEAD ATUAL em worktree isolado, não reimplementar tudo.

Repositório hypeneural/evydencia-crm-mcp, branch feat/meta-audience-crm-export-foundation-20261029, PR #23 permanece draft, base base/reprint-live-6abe039-20261029.

## Gate A — checklist automatizado único (sem GitHub Actions)

Em checkout/worktree limpo e isolado, conferir git status e HEAD, então executar em Git Bash ou WSL:

    bash scripts/antigravity/validate-meta-audience-p25-local.sh

Esse script executa node --check dos módulos, testes sintéticos focados, php -l nos bridges, npm run check e npm test completo. Antigravity deve registrar contagens, duração e SHA, sem PII. NÃO alterar banco, sem workflow, sem envio, sem Meta, sem VPS nessa execução.

Atenção: Antigravity alegou 330 PASS antes das correções. É obrigatório REPETIR toda a validação do HEAD novo. Se houver falha, reproduzir e reportar P0 exato com arquivo/linha e corrigir somente se necessário; executar testes afetados uma vez e repetir o gate. Não abrir ciclos indefinidos.

## Gate B — validação local SQL/Laravel em ambiente de testes

Usar apenas banco sintético/homologação autorizado, com 2026 e fontes seguintes:
- customers sem pedidos; customers históricos; duplicatas; dois cadastros com mesmo telefone; DDD 55 e números sem nono dígito;
- orders criados em 2026 com waiting_payment sem pagamento (não é comprador); payment_confirmed; pagamento real 2026 de pedido criado em 2025; payment_refunded; payment_chargeback; status desconhecido e pedido sem customer_id;
- proposal_flows Natal 2026, proposal_dispatches sem customer, scheduled com escopo exato, scheduled de campanha alheia e proposta recebida por cliente comprador;
- communication_suppressions com chave canônica diferente da proposals.hash_key, channel/all, marketing/global/season, revogação e opt-out; validar que apenas regras realmente aplicáveis bloqueiam;
- política jurídica não configurada: sem dados; apenas política nominal: sem dados; política documentada e dados sintéticos: consultar e dar contagens;
- snapshot REPEATABLE READ, SQL session READ ONLY e rollback comprovado; sem N+1 e com EXPLAIN read-only apenas se necessário.

Não alterar Laravel legado nem executar migration. Conferir nomes de colunas/índices com o preflight read-only. Se banco de homologação não existir, marcar Gate B UNKNOWN e retornar os fixtures necessários, em vez de tocar produção.

## Gate C — OAuth/MCP e contrato do gestor

Com servidor LOCAL sintético, comprovar:
1. Apenas crm.read: PREVIA sem PII e tentativa de EXPORTAR deve retornar HTTP 403 OAuth insufficient_scope pelo scopeChallenge; token sem grant ou operador fora da allowlist é bloqueado, inclusive depois de refresh.
2. OAuth crm.audience.export com allowlist + confirmação explícita + preview válido: CSV de clientes fictícios em diretório absoluto privado, arquivo 0600/dir 0700, mínimo de 100 números únicos 55+DDD+número.
3. Exportar sem snapshot_id, com snapshot alheio, expirado ou alterado: BLOCKED; comprador/opt-out que aparece entre preview e export exige nova prévia.
4. Retorno MCP deve conter apenas contagens agregadas, digest, arquivo_id e delivery_status=private_gateway_storage_only; não pode conter telefones, e-mails, nomes, tokens ou caminho de filesystem.
5. Verificar que arquivo_id não é um link de download: ainda falta contrato autenticado de entrega ao ChatGPT. Não prometer que já é possível clicar e baixar; registrar NO-GO desse subfluxo.
6. Conferir o janitor privado em reinício, symlinks, arquivos de outros serviços e TTL 1h. Não ativar cron global e não apagar outros arquivos.

## Gate D — recibo final e stop

Entregar somente:
- SHA da branch, PASS/FAIL/UNKNOWN por Gate A–C, testes nativos Node/PHP/MySQL, contagens sintéticas, comparativo OAuth e status de entrega privada;
- divergências de regra financeira, jurídico, status dos pedidos ou esquema; indicação se bloqueiam a exportação real;
- comandos locais efetivamente usados e tempo (não inventar), nenhuma PII ou segredos;
- decisão técnica GO para QA (se todos os critérios locais passaram), mas LIVE EXPORT continua NO-GO até aprovação do gestor, prova de base legal, transporte de arquivo privado e canário controlado.

NÃO fazer merge, deploy, publicar GitHub Actions, chamar Meta Ads, criar público, exportar contatos reais, enviar mensagem, modificar CRM legado, PrintServer, Gameplay, Z-API ou DNS. Não pedir nova autorização apenas para testes 100% sintéticos; pedir autorização separada se necessidade REAL em VPS/CRM.

Fonte canônica: docs/META_AUDIENCE_P25_2_FORENSIC_REVIEW_20261029.md; docs/META_CUSTOMER_LIST_CSV_SPEC_20261029.md e docs/META_AUDIENCE_DATA_MODEL_FORENSIC_20261029.md.

---

# ANTIGRAVITY — AJUSTES P25.1 META CSV (EXECUTAR PRIMEIRO)

**ESTE BLOCO SUPERA QUALQUER REFERÊNCIA V2 ANTIGA ABAIXO.**
- PR draft #23, branch feat/meta-audience-crm-export-foundation-20261029, BASE build LIVE 6abe039; nunca usar main divergente ou sobrescrever PR #22.
- Ler a spec atualizada docs/META_CUSTOMER_LIST_CSV_SPEC_20261029.md e ambos src/meta-audience-csv.mjs (V3) e src/meta-audience-csv-validator.mjs.
- CSV final email,phone,fn,ln,country: phone OBRIGATÓRIO, DDI 55 + DDD + número, **somente dígitos, sem +**. Remover contatos sem telefone, números inválidos/sem DDD, celular antigo incompleto; se tiver telefone alternativo real e verificado, pode usá-lo, mantendo proveniência e nunca inferindo 9º dígito.
- Não incluir CPF, dados de crianças, qualquer coluna de valor ou ID interno. E-mail é opcional, mas telefone não. Names em minúsculas, country br, UTF-8 sem BOM/CRLF.
- O exportador v3 preserva E.164 (+55) somente para joins/dedup. A API manual de CSV emite 55 sem +; o upload pela Marketing API (futuro, fora do escopo) exige payload SHA256 específico.
- Confirmar que clientes de 2026 (qualquer produto válido), opt-outs, faltas de permissão e identidades duplicadas são retirados ANTES de escrever CSV, sem expor PII. Lista base todos os clientes cadastrados + destinatários Natal 2026 com evidência; não confundir disparo de marketing com pedido espontâneo de orçamento.
- O segundo validador é **obrigatório** e independente do formatador. Não aceitar arquivo criado apenas porque hash bate.

## ORDEM DE EXECUÇÃO P25.1 (sem ciclos infinitos)

Gate A — somente sintético (1 rodada no checkout isolado):

    git status --short
    git rev-parse HEAD
    node --check src/meta-audience-csv.mjs
    node --check src/meta-audience-csv-validator.mjs
    node --test test/meta-audience-csv.test.mjs
    php -l scripts/crm-forensic-bridge.php
    php -l scripts/crm-meta-audience-preflight-read.php

Esperado: **18/18 testes Node PASS**, lint PASS. Nesta conversa os 18 testes foram executados em V8 isolado de compatibilidade com digest simulado: **18/18 PASS**. Isso não substitui os testes nativos Node/SHA256 do Antigravity. Se falhar, corrigir apenas o ponto P0 e repetir teste alvo, depois uma execução integral da suíte P25. Não chamar GitHub Actions.

Gate B — criar adapter/preview em PHP MCP com transação read-only consistente no Laravel e sem nenhuma mudança no CRM legado:
- Todos os customers (com e sem pedidos), mais todos os destinatários comprovados do fluxo Natal 2026 que sejam elegíveis e não duplicados.
- Reconciliar compras pagas/comercialmente comprovadas em QUALQUER produto 2026 (status atual + pagamentos, reversões e casos ambíguos).
- Resolver whatsapp_e164 e phone_e164: preferir WhatsApp válido; fallback telefone válido; **se ambos inválidos excluir**. Se optar por exportar ambos, uma linha por telefone distinto e marcar source_counts como registros expandidos; não fabricar email+telefone de outra pessoa.
- Checar todas as supressões aplicáveis e base legal da Meta Customer List. Ausência de opt-out NÃO prova permissão; abortar export se fundamento não verificável.
- Confirmar cobertura total, contagem, timestamp/snapshot (READ ONLY/REPEATABLE READ). Não usar relatório antigo de Natal "não comprou" nem matching pelos últimos oito dígitos.

Gate C — preparar ferramentas, mas NÃO ativar em produção:
- crm_meta_publico_natal_previa retorna apenas contagens e qualidade, sem PII.
- crm_meta_publico_natal_exportar exige OAuth real crm.audience.export, confirmação explícita de operador, snapshot íntegro e transporte privado; o ChatGPT não recebe milhares de telefones como texto.
- Executar assertMetaAudienceUploadReady() + validateMetaCustomerListCsv() em cada export real autorizado. A segunda deve retornar ready=true, rows>=100, unique_phones===rows, país br, phones somente dígitos 55, SHA256 do arquivo. Gerar apenas relatório agregado sem PII. Se qualquer gate falhar, NO_GO.
- Meta Business Ads Manager deve mapear manualmente cabeçalho e aceitar o CSV; nada de upload ou automação antes de aprovação de público/campanha.

Gate D — uma única bateria de homologação real SQL com dados sintéticos: compradores 2026 Natal e não Natal, waiting_payment, estorno, proposta sem cadastro, lead de campanha não solicitado, 8/9, DDD 55, fixo BR, telefone ausente, múltiplos números, CPF no phone, opt-out, base legal, colisões e 100 contatos. Não modificar CRM Laravel, Z-API, PrintServer, Gameplay, META ADS, DNS ou bancos.

Gate E — relatar: PASS/FAIL/UNKNOWN, lista de arquivos, SHA, tempo, contagens por motivo, 0 compradores/opt-outs conhecidos, export privado não exibido, NO_GO se um campo necessário estiver indisponível. PR continua draft, nenhuma publicação/deploy até aprovação explícita.

**Referências:** docs/META_CUSTOMER_LIST_CSV_SPEC_20261029.md; docs/META_AUDIENCE_DATA_MODEL_FORENSIC_20261029.md; Meta developer guide https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences/; MCP tools https://modelcontextprotocol.io/specification/2025-06-18/server/tools ; MCP OAuth https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization.

---

# ANTIGRAVITY — P25 (MCP Meta Audience) EXECUÇÃO CIRÚRGICA

**Objetivo:** tornar o Evydência MCP LIVE apto a GERAR arquivo privado CSV para Meta Ads **sob solicitação do operador**, sem tocar CRM Laravel legado, sem automação Meta, sem envio WhatsApp e sem alterar outros serviços. Base 100% verificável; evitar testes infinitos. **Leia este arquivo e os documentos citados, execute na ordem e pare nos gates.**

## Contexto imutável

- Repo: `hypeneural/evydencia-crm-mcp`. Branch de trabalho **`feat/meta-audience-crm-export-foundation-20261029`**, PR draft **#23**, base isolada `base/reprint-live-6abe039-20261029`, release inicial LIVE `6abe03992549cee83732ea538e728377a3c989fe`.
- NÃO fazer `git reset --hard`, `git push --force`, merge de `main` nem cherry-pick automático de PR #18, #20, #22. Repositório público: **ZERO dados reais** em commits/issues/logs.
- Referências canônicas dentro do PR:
  - `docs/META_AUDIENCE_DATA_MODEL_FORENSIC_20261029.md` — ER, índices, regras comerciais, colisões, OAuth.
  - `docs/META_AUDIENCE_CRM_EXPORT_20261029.md` — contrato geral.
  - `src/meta-audience-csv.mjs` — transformador **v3**, testado offline; importá-lo, não reescrevê-lo.
  - `test/meta-audience-csv.test.mjs` — 11 testes sintéticos (no sandbox do ChatGPT PASS).
  - `scripts/crm-meta-audience-preflight-read.php` — preflight somente schema/índices; incluído como ação `meta.audience.schema.preflight` no bridge, mas **NÃO registrado no MCP LIVE**.
- CRM `hypeneural/evydencia-crm` é **somente leitura de código**, incluindo:
  `app/Services/Exports/CustomerWhatsappExportQuery.php`, `Reports/CurrentOrderStatusResolver.php`, `Reports/CommercialOrderStatusScope.php`, `Reports/NatalValidOrdersQuery.php`, `Natal/NatalCommercialConversionPolicy.php`, `CommunicationSuppression/CommunicationSuppressionFilter.php`, `CommunicationSuppression/CommunicationSuppressionEvaluator.php`, `Proposals/ResolveProposalCustomer.php`, `docs/meta-audience-export-analysis-2026-03-31.md`.
- Sem mudanças de ambiente, token, permissões, banco, campanhas ou release antes de aprovação. NÃO ligar GitHub Actions.

## Passo 0 — Checkout isolado

```bash
git fetch origin --prune
git status --short
git rev-parse HEAD
git show --no-patch --format='%H %s' origin/feat/meta-audience-crm-export-foundation-20261029
# Abrir worktree limpa para branch P25; não alterar checkout compartilhado de outros agentes.
git worktree add ../evyd-mcp-p25 origin/feat/meta-audience-crm-export-foundation-20261029
cd ../evyd-mcp-p25
```

Se o worktree já existir, REUSAR somente se limpo/corresponder à branch; não sobrescrever. Confirmar `git diff base/reprint-live-6abe039-20261029...HEAD --stat` e integridade da base.

## Passo 1 — Gate sintético e schema (uma rodada)

```bash
node --check src/meta-audience-csv.mjs
node --test test/meta-audience-csv.test.mjs
php -l scripts/crm-meta-audience-preflight-read.php
php -l scripts/crm-forensic-bridge.php
```

Esperado **18/18 Node PASS**, lint PHP PASS. Testes reais de integração **ainda não realizados**. Se falhar, corrigir P0 e repetir somente teste afetado; nada de bateria total até existir adapter.

## Passo 2 — Schema REAL (apenas após autorização do operador)

A ação read-only `meta.audience.schema.preflight` está incluída em `scripts/crm-forensic-bridge.php`; **não está exposta na lista de ferramentas**. Executá-la via cliente de bridge local no host autorizado após confirmar `EVYD_CRM_APP_PATH` real e guardas, usando STDIN e corpo JSON pequeno:
```json
{"action":"meta.audience.schema.preflight","year":2026}
```
NÃO imprimir credenciais, output bruto de cliente ou paths privados no GitHub. Registrar somente `tables[*].exists`, `missing_columns`, `index_checks`, tempo e `export_enabled=false`; nunca supor que migrations do Git estão aplicadas em produção. Se schema divergir, **BLOCKED** com nome de tabela/coluna, sem migração.

## Passo 3 — Implementar backend read-only completo (no MCP)

1. Novo include `scripts/crm-meta-audience-read.php` acionado no existing `crm-forensic-bridge.php` por `meta.audience.preview` / `meta.audience.export` em rotas estritamente allowlisted. **Não alterar arquivos do Laravel CRM**.
2. Iniciar **uma única transação InnoDB read-only / REPEATABLE READ** para montar um snapshot consistente; `SET SESSION TRANSACTION READ ONLY` do bridge por si só não garante consistência entre SELECTs autocommit. Confirmar `@@transaction_isolation=REPEATABLE-READ`; se diferente, falhar em vez de alterar configuração global. Evitar locks/updates. Terminar transação antes de servir arquivo.
3. Fonte clientes: TODOS `customers`, inclusive 0 pedidos, por `id` ou `lazyById`. Campos mínimos `id, uuid, name, email, whatsapp_e164, phone_e164` e fallback original SOMENTE quando normalizado e comprovado; sem `document`, endereço, nascimento ou fotos.
4. Fonte Natal 2026: `proposal_flows.slug=natal` + `proposal_dispatches` do ano + `campaign_scheduled_contacts` legados vinculados ao fluxo/campanha/escopo 2026, e `leads`/ `proposal_group_intents` verificados quando aplicável. Separar `asked_quote`, `proposal_sent`, `scheduled_only` e `unsolicited_campaign` — **não chamar disparo de campanha de pedido de orçamento**. Nunca misturar 2025 ou 2027.
5. Compradores 2026 de **qualquer produto**: reutilizar `CustomerWhatsappExportQuery::validOrdersBase()` (resolve último status operacional e exclui reversos) + janela de 2026 (avaliar pedidos antigos pagos em 2026) + evidência forte (`payment_confirmed` ou status posterior OU `payment_at` com `payment_total>0` coerentes). `waiting_payment` isolado **NÃO prova compra**. Contrastar com `NatalValidOrdersQuery` para Natal, sem confundi-los. Qualquer inconsistente => `purchase_check_status=unavailable` e bloquear componente; jamais assumir falso.
6. Dedup: cliente ID + telefones E.164 COMPLETOS + email normalizado, herdando `src/meta-audience-csv.mjs` v3; colisão de mais de um `customer_id` => quarentena; destinatário com/sem nono dígito só em relação provada, **NUNCA last-8**. Telefone compartilhado com comprador => excluir todos os registros associados.
7. Supressões: `CommunicationSuppressionFilter`/ `CommunicationSuppressionEvaluator` em lote, `marketing`, temporada `natal:2026`, global e canais aplicáveis; NOTA: um bloqueio de WhatsApp não é automaticamente bloqueio de Meta, mas atender qualquer pedido de não publicidade conhecido. Nunca cruzar HMAC de `proposals.hash_key` com `communication_suppression_hash_key` sem provar equivalência. Sem índice/regra disponível -> fail closed.
8. Permissão LGPD/Meta Customer List: **não há coluna nativa comprovada `marketing_consent` em customers/leads**. Identificar fonte real de autorização para publicidade personalizada e registrar sua proveniência; requer aprovação documentada da base legal e opt-outs. Não definir boolean `marketing_allowed=true` para todas as linhas por conveniência. Se não verificável, `marketing_permission_complete=false` e **BLOQUEAR exportação**.
9. Contrato de `coverage` v3 deve informar `source_counts.customers`, `source_counts.proposals`, todos seis flags COMPLETE, `snapshot_id`, `as_of`, `purchase_rule=ANY_VALID_PURCHASE_2026` e `target_year=2026`. Todos os registros precisam conter flags e checks VERIFICADOS. Fonte de contagem deve ser obtida na mesma transação; `buildMetaAudienceCsv()` já barra divergência.
10. `DB::enableQueryLog()` pode acumular SQL/bindings privados na memória: desabilite para extração e use contador agregado de consultas/tempo; saída somente agregados. `EXPLAIN` (sem parâmetros privados) se varredura de `proposal_dispatches` ficar custosa. Não fazer migration de índices sem aprovação.

## Passo 4 — Ferramentas MCP + segurança (somente branch draft)

- `crm_meta_publico_natal_previa`: `crm.read` com operador verificado, sem PII, somente contagens/qualidade, endpoint read-only; retorno fornece `snapshot_id` de curta validade e sinaliza bloqueios.
- `crm_meta_publico_natal_exportar`: **novo escopo OAuth `crm.audience.export`**, confirmado explicitamente pelo operador e vinculado ao snapshot fresco; separação das duas permissões: ferramenta não é acionável só com `crm.read`.
- Inspecionar `supportedGatewayScopes`, `eligibleScopesForOperator`, `computeGrantedScopes`, authorize, refresh, DCR, `ALL_WRITE_SCOPES`, `reg` e `safe` em `src/oauth-gateway.mjs`/`src/live-gateway.mjs`. **SecuritySchemes e readOnlyHint são metadados, NÃO enforcement.** Teste obrigatório: usuário com `crm.read` sem `crm.audience.export` recebe 403; refresh e tokens antigos não ganham exportação por padrão.
- Export não envia à Meta nem cria público. Preferir arquivo temporário PRIVADO 0600, curta validade, recurso/autenticação por operador; nada de link público, token URL, logs ou resposta textual com milhares de PII. A experiência de download no ChatGPT precisa de **homologação real** de transporte MCP/arquivo; não prometer sem suporte.
- Analisar limites de timeout/STDOUT do `legacy-api-read`: gerar arquivo no servidor sem estourar tamanho de resposta MCP. Nunca servir páginas como SELECTs repetidos com dados mutando; snapshot único (criptografado se persistido).
- Atualizar inventário `crm_capacidades` somente quando tools realmente registradas; manter antigos intactos.

## Passo 5 — Testes focados com MySQL sintético + negativos

Simular no banco de homologação somente: cadastro sem pedido, cliente histórico, comprador Natal 2026, comprador 2026 de outro produto, pedido `waiting_payment`, pago com webhook atrasado, pagamento estornado, status sem histórico, proposta sem cadastro, `lead` recent/working/losted, campanha legada 2025, click em grupo, telefone duplicado, dois customer IDs no mesmo phone, 8 vs 9, email duplicado, bloqueio global/temporada e scope OAuth negado. Rodar `node --test test/meta-audience-csv.test.mjs` (11 casos sintéticos) e testes do adapter adicionados. Uma execução do `npm run check` e `npm test` após os testes dirigidos PASS; se falhar, corrigir somente a área implicada e repetir. Não disparar ações externas.

**Critérios:** identidade e cobertura verificadas, soma reconciliada `input_groups=excluded+eligible`, 0 compradores válidos 2026 e 0 opt-outs no CSV, formato `email,phone,fn,ln,country`, arquivo >=100 linhas só quando corpus suficiente, sem dados CRM extras, 401/403 negativos, sem logs de PII, sem distorção de contatos.

## Passo 6 — Preparar entrega, NÃO implantar sem aprovação

- Documentar SHA antes/depois, PR diff, provas sintéticas, comparativo dos endpoints com o CRM (apenas contagens), riscos em aberto, telemetria agregada, status do consentimento, duração, rollback somente MCP.
- Deixar PR #23 **Draft** até QA e autorização de implantar; não merge, não chamar GitHub Actions, não alterar CRM, não sincronizar listas Meta, não publicar campanha ou gastar.
- Se uma etapa P0 não puder ser provada, retornar `BLOCKED_WITH_EXACT_REASON` + uma próxima ação objetiva em vez de declarar pronto ou inventar dados.
- Após autorização explícita de deploy em turno separado, publicar apenas leaf MCP na VPS com canário e verificação `crm_capacidades`/OAuth, sem tocar PrintServer, Gameplay ou Z-API.

**Entrega final esperada:** resumo com PASS/FAIL/UNKNOWN de cada gate, lista de arquivos alterados, contagens sem PII, SHA e URL da PR, decisão GO/NO-GO e instrução de uso futura: "Gere a prévia do público Meta Natal 2026" e, sob confirmação, "Exporte CSV privado".
