# ANTIGRAVITY — P25 (MCP Meta Audience) EXECUÇÃO CIRÚRGICA

**Objetivo:** tornar o Evydência MCP LIVE apto a GERAR arquivo privado CSV para Meta Ads **sob solicitação do operador**, sem tocar CRM Laravel legado, sem automação Meta, sem envio WhatsApp e sem alterar outros serviços. Base 100% verificável; evitar testes infinitos. **Leia este arquivo e os documentos citados, execute na ordem e pare nos gates.**

## Contexto imutável

- Repo: \`hypeneural/evydencia-crm-mcp\`. Branch de trabalho **\`feat/meta-audience-crm-export-foundation-20261029\`**, PR draft **#23**, base isolada \`base/reprint-live-6abe039-20261029\`, release inicial LIVE \`6abe03992549cee83732ea538e728377a3c989fe\`.
- NÃO fazer \`git reset --hard\`, \`git push --force\`, merge de \`main\` nem cherry-pick automático de PR #18, #20, #22. Repositório público: **ZERO dados reais** em commits/issues/logs.
- Referências canônicas dentro do PR:
  - \`docs/META_AUDIENCE_DATA_MODEL_FORENSIC_20261029.md\` — ER, índices, regras comerciais, colisões, OAuth.
  - \`docs/META_AUDIENCE_CRM_EXPORT_20261029.md\` — contrato geral.
  - \`src/meta-audience-csv.mjs\` — transformador **v2**, testado offline; importá-lo, não reescrevê-lo.
  - \`test/meta-audience-csv.test.mjs\` — 11 testes sintéticos (no sandbox do ChatGPT PASS).
  - \`scripts/crm-meta-audience-preflight-read.php\` — preflight somente schema/índices; incluído como ação \`meta.audience.schema.preflight\` no bridge, mas **NÃO registrado no MCP LIVE**.
- CRM \`hypeneural/evydencia-crm\` é **somente leitura de código**, incluindo:
  \`app/Services/Exports/CustomerWhatsappExportQuery.php\`, \`Reports/CurrentOrderStatusResolver.php\`, \`Reports/CommercialOrderStatusScope.php\`, \`Reports/NatalValidOrdersQuery.php\`, \`Natal/NatalCommercialConversionPolicy.php\`, \`CommunicationSuppression/CommunicationSuppressionFilter.php\`, \`CommunicationSuppression/CommunicationSuppressionEvaluator.php\`, \`Proposals/ResolveProposalCustomer.php\`, \`docs/meta-audience-export-analysis-2026-03-31.md\`.
- Sem mudanças de ambiente, token, permissões, banco, campanhas ou release antes de aprovação. NÃO ligar GitHub Actions.

## Passo 0 — Checkout isolado

\`\`\`bash
git fetch origin --prune
git status --short
git rev-parse HEAD
git show --no-patch --format='%H %s' origin/feat/meta-audience-crm-export-foundation-20261029
# Abrir worktree limpa para branch P25; não alterar checkout compartilhado de outros agentes.
git worktree add ../evyd-mcp-p25 origin/feat/meta-audience-crm-export-foundation-20261029
cd ../evyd-mcp-p25
\`\`\`

Se o worktree já existir, REUSAR somente se limpo/corresponder à branch; não sobrescrever. Confirmar \`git diff base/reprint-live-6abe039-20261029...HEAD --stat\` e integridade da base.

## Passo 1 — Gate sintético e schema (uma rodada)

\`\`\`bash
node --check src/meta-audience-csv.mjs
node --test test/meta-audience-csv.test.mjs
php -l scripts/crm-meta-audience-preflight-read.php
php -l scripts/crm-forensic-bridge.php
\`\`\`

Esperado **11/11 Node PASS**, lint PHP PASS. Testes reais de integração **ainda não realizados**. Se falhar, corrigir P0 e repetir somente teste afetado; nada de bateria total até existir adapter.

## Passo 2 — Schema REAL (apenas após autorização do operador)

A ação read-only \`meta.audience.schema.preflight\` está incluída em \`scripts/crm-forensic-bridge.php\`; **não está exposta na lista de ferramentas**. Executá-la via cliente de bridge local no host autorizado após confirmar \`EVYD_CRM_APP_PATH\` real e guardas, usando STDIN e corpo JSON pequeno:
\`\`\`json
{"action":"meta.audience.schema.preflight","year":2026}
\`\`\`
NÃO imprimir credenciais, output bruto de cliente ou paths privados no GitHub. Registrar somente \`tables[*].exists\`, \`missing_columns\`, \`index_checks\`, tempo e \`export_enabled=false\`; nunca supor que migrations do Git estão aplicadas em produção. Se schema divergir, **BLOCKED** com nome de tabela/coluna, sem migração.

## Passo 3 — Implementar backend read-only completo (no MCP)

1. Novo include \`scripts/crm-meta-audience-read.php\` acionado no existing \`crm-forensic-bridge.php\` por \`meta.audience.preview\` / \`meta.audience.export\` em rotas estritamente allowlisted. **Não alterar arquivos do Laravel CRM**.
2. Iniciar **uma única transação InnoDB read-only / REPEATABLE READ** para montar um snapshot consistente; \`SET SESSION TRANSACTION READ ONLY\` do bridge por si só não garante consistência entre SELECTs autocommit. Confirmar \`@@transaction_isolation=REPEATABLE-READ\`; se diferente, falhar em vez de alterar configuração global. Evitar locks/updates. Terminar transação antes de servir arquivo.
3. Fonte clientes: TODOS \`customers\`, inclusive 0 pedidos, por \`id\` ou \`lazyById\`. Campos mínimos \`id, uuid, name, email, whatsapp_e164, phone_e164\` e fallback original SOMENTE quando normalizado e comprovado; sem \`document\`, endereço, nascimento ou fotos.
4. Fonte Natal 2026: \`proposal_flows.slug=natal\` + \`proposal_dispatches\` do ano + \`campaign_scheduled_contacts\` legados vinculados ao fluxo/campanha/escopo 2026, e \`leads\`/ \`proposal_group_intents\` verificados quando aplicável. Separar \`asked_quote\`, \`proposal_sent\`, \`scheduled_only\` e \`unsolicited_campaign\` — **não chamar disparo de campanha de pedido de orçamento**. Nunca misturar 2025 ou 2027.
5. Compradores 2026 de **qualquer produto**: reutilizar \`CustomerWhatsappExportQuery::validOrdersBase()\` (resolve último status operacional e exclui reversos) + janela de 2026 (avaliar pedidos antigos pagos em 2026) + evidência forte (\`payment_confirmed\` ou status posterior OU \`payment_at\` com \`payment_total>0\` coerentes). \`waiting_payment\` isolado **NÃO prova compra**. Contrastar com \`NatalValidOrdersQuery\` para Natal, sem confundi-los. Qualquer inconsistente => \`purchase_check_status=unavailable\` e bloquear componente; jamais assumir falso.
6. Dedup: cliente ID + telefones E.164 COMPLETOS + email normalizado, herdando \`src/meta-audience-csv.mjs\` v2; colisão de mais de um \`customer_id\` => quarentena; destinatário com/sem nono dígito só em relação provada, **NUNCA last-8**. Telefone compartilhado com comprador => excluir todos os registros associados.
7. Supressões: \`CommunicationSuppressionFilter\`/ \`CommunicationSuppressionEvaluator\` em lote, \`marketing\`, temporada \`natal:2026\`, global e canais aplicáveis; NOTA: um bloqueio de WhatsApp não é automaticamente bloqueio de Meta, mas atender qualquer pedido de não publicidade conhecido. Nunca cruzar HMAC de \`proposals.hash_key\` com \`communication_suppression_hash_key\` sem provar equivalência. Sem índice/regra disponível -> fail closed.
8. Permissão LGPD/Meta Customer List: **não há coluna nativa comprovada \`marketing_consent\` em customers/leads**. Identificar fonte real de autorização para publicidade personalizada e registrar sua proveniência; requer aprovação documentada da base legal e opt-outs. Não definir boolean \`marketing_allowed=true\` para todas as linhas por conveniência. Se não verificável, \`marketing_permission_complete=false\` e **BLOQUEAR exportação**.
9. Contrato de \`coverage\` v2 deve informar \`source_counts.customers\`, \`source_counts.proposals\`, todos seis flags COMPLETE, \`snapshot_id\`, \`as_of\`, \`purchase_rule=ANY_VALID_PURCHASE_2026\` e \`target_year=2026\`. Todos os registros precisam conter flags e checks VERIFICADOS. Fonte de contagem deve ser obtida na mesma transação; \`buildMetaAudienceCsv()\` já barra divergência.
10. \`DB::enableQueryLog()\` pode acumular SQL/bindings privados na memória: desabilite para extração e use contador agregado de consultas/tempo; saída somente agregados. \`EXPLAIN\` (sem parâmetros privados) se varredura de \`proposal_dispatches\` ficar custosa. Não fazer migration de índices sem aprovação.

## Passo 4 — Ferramentas MCP + segurança (somente branch draft)

- \`crm_meta_publico_natal_previa\`: \`crm.read\` com operador verificado, sem PII, somente contagens/qualidade, endpoint read-only; retorno fornece \`snapshot_id\` de curta validade e sinaliza bloqueios.
- \`crm_meta_publico_natal_exportar\`: **novo escopo OAuth \`crm.audience.export\`**, confirmado explicitamente pelo operador e vinculado ao snapshot fresco; separação das duas permissões: ferramenta não é acionável só com \`crm.read\`.
- Inspecionar \`supportedGatewayScopes\`, \`eligibleScopesForOperator\`, \`computeGrantedScopes\`, authorize, refresh, DCR, \`ALL_WRITE_SCOPES\`, \`reg\` e \`safe\` em \`src/oauth-gateway.mjs\`/\`src/live-gateway.mjs\`. **SecuritySchemes e readOnlyHint são metadados, NÃO enforcement.** Teste obrigatório: usuário com \`crm.read\` sem \`crm.audience.export\` recebe 403; refresh e tokens antigos não ganham exportação por padrão.
- Export não envia à Meta nem cria público. Preferir arquivo temporário PRIVADO 0600, curta validade, recurso/autenticação por operador; nada de link público, token URL, logs ou resposta textual com milhares de PII. A experiência de download no ChatGPT precisa de **homologação real** de transporte MCP/arquivo; não prometer sem suporte.
- Analisar limites de timeout/STDOUT do \`legacy-api-read\`: gerar arquivo no servidor sem estourar tamanho de resposta MCP. Nunca servir páginas como SELECTs repetidos com dados mutando; snapshot único (criptografado se persistido).
- Atualizar inventário \`crm_capacidades\` somente quando tools realmente registradas; manter antigos intactos.

## Passo 5 — Testes focados com MySQL sintético + negativos

Simular no banco de homologação somente: cadastro sem pedido, cliente histórico, comprador Natal 2026, comprador 2026 de outro produto, pedido \`waiting_payment\`, pago com webhook atrasado, pagamento estornado, status sem histórico, proposta sem cadastro, \`lead\` recent/working/losted, campanha legada 2025, click em grupo, telefone duplicado, dois customer IDs no mesmo phone, 8 vs 9, email duplicado, bloqueio global/temporada e scope OAuth negado. Rodar \`node --test test/meta-audience-csv.test.mjs\` (11 casos sintéticos) e testes do adapter adicionados. Uma execução do \`npm run check\` e \`npm test\` após os testes dirigidos PASS; se falhar, corrigir somente a área implicada e repetir. Não disparar ações externas.

**Critérios:** identidade e cobertura verificadas, soma reconciliada \`input_groups=excluded+eligible\`, 0 compradores válidos 2026 e 0 opt-outs no CSV, formato \`email,phone,fn,ln,country\`, arquivo >=100 linhas só quando corpus suficiente, sem dados CRM extras, 401/403 negativos, sem logs de PII, sem distorção de contatos.

## Passo 6 — Preparar entrega, NÃO implantar sem aprovação

- Documentar SHA antes/depois, PR diff, provas sintéticas, comparativo dos endpoints com o CRM (apenas contagens), riscos em aberto, telemetria agregada, status do consentimento, duração, rollback somente MCP.
- Deixar PR #23 **Draft** até QA e autorização de implantar; não merge, não chamar GitHub Actions, não alterar CRM, não sincronizar listas Meta, não publicar campanha ou gastar.
- Se uma etapa P0 não puder ser provada, retornar \`BLOCKED_WITH_EXACT_REASON\` + uma próxima ação objetiva em vez de declarar pronto ou inventar dados.
- Após autorização explícita de deploy em turno separado, publicar apenas leaf MCP na VPS com canário e verificação \`crm_capacidades\`/OAuth, sem tocar PrintServer, Gameplay ou Z-API.

**Entrega final esperada:** resumo com PASS/FAIL/UNKNOWN de cada gate, lista de arquivos alterados, contagens sem PII, SHA e URL da PR, decisão GO/NO-GO e instrução de uso futura: "Gere a prévia do público Meta Natal 2026" e, sob confirmação, "Exporte CSV privado".
