# P25.4 — Runbook de produção (preparado, NÃO executado)

Data de referência: 29/10/2026 BRT. Repositório hypeneural/evydencia-crm-mcp; PR #23 DRAFT, sem merge/deploy. Nenhum banco CRM, campanha Meta ou serviço VPS adjacente foi alterado.

## Evidências do Antigravity

Commit de handoff 58b066077d06f5320aeee960a7b09ed5cc7a729f, comentário GitHub 6513548206, Node v24.22.1, PHP 8.3.36. Antigravity relatou 41/41 testes focados Node, 13/13 PHP puro, 348/348 npm test, node --check e php -l PASS. São resultados LOCAIS do commit pré-P25.4. Não valem automaticamente para os novos commits.

O commit 48f3720 usou scopeChallenge híbrido Object.assign([...],{scopes:[...]}). O contrato oficial do MCP SDK v2 é um objeto com scopes: string[], corrigido nesta branch; teste estático atualizado. Fontes oficiais:
- https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/scopeChallenge.html
- https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools

A documentação Meta Customer Audiences exige revisar formato e permissão do uso da base:
- https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences/
- https://www.facebook.com/business/help/
A documentação Business Help pode exigir login. Formato previsto do upload MANUAL: email,phone,fn,ln,country, telefone 55+DDD+número, somente dígitos. Não afirmar aceite sem testar na conta do operador.

## Alterações P25.4 no repositório

- OAuth scopeChallenge: objeto canônico com scopes e errorDescription; evita artifício array híbrido e HTTP 500.
- Feature OFF por padrão: EVYD_META_AUDIENCE_ENABLED=1 é requisito para habilitar a função; EVYD_AUDIENCE_EXPORT_ENABLED=1 nunca liga o master sozinho. Precisam de ambos para exportar.
- Bridge Node/PHP leitor Meta: timeout específico 45s e teto stdout 24 MiB, sem ampliar o limite padrão de outros leitores (8 MiB). Falhas de timeout/volume abortam, jamais CSV truncado.
- Janitor privado: modo dryRun não apaga, CLI scripts/antigravity/purge-meta-audience-private.mjs exige --apply explícito.
- Auditoria de configuração: scripts/antigravity/meta-audience-release-preflight.mjs imprime somente indicadores agregados, sem segredo, paths ou PII.
- Testes: proteção dos dois flags de habilitação, formato oficial ScopeChallenge e operação dry-run. O script de QA local agora inclui scripts novos.

## GATE 0 — QA sem produção

No HEAD atualizado, em worktree isolada/limpa:

    git status --short
    git rev-parse HEAD
    bash scripts/antigravity/validate-meta-audience-p25-local.sh

Esperado Node >=22, PHP 8.3, testes Node, integração OAuth fictícia, php -l, 13 casos PHP de classificação financeira e suíte npm global. Não reutilizar 348/348 antigos como resultado do HEAD P25.4. Registrar SHA e PASS/FAIL sem PII.

## GATE 1 — SQL Laravel/MySQL de homologação

Obrigatório executar em ambiente de homologação isolado e autorizado, dados SINTÉTICOS, schema equivalente, nunca produção ou réplica compartilhada sem consentimento. Usar a ação read-only meta.audience.schema.preflight com year=2026 pelo bridge e validar:
- Tabelas customers, orders, orders_status, orders_installments, proposal_flows, proposal_dispatches, campaign_scheduleds, campaign_scheduled_contacts e communication_suppressions.
- Status payment_confirmed, waiting_payment, payment_refunded, payment_chargeback, pedido criado em 2025 pago em 2026, clientes com histórico incerto e identidade compartilhada.
- Dispatches scheduled elegíveis do flow Natal, sem duplicates; contatos somente agendados NÃO representam pedido de orçamento; contar separadamente.
- HMAC hash real de suppressions e opt-outs, inclusive chave instalada diferente de proposals.hash_key.
- REPEATABLE READ, SELECT sem escrita, rollback antes de saída, contagens, índices e EXPLAIN sem alterar banco, tempo/memória de lote semelhante ao real.
- O bridge leitor Meta tem teto de 24 MiB/45s; exceder é NO-GO até solução de streaming/paginação. Não aumentar limites de outras ferramentas nem migrar tabelas.

## GATE 2 — LGPD e política específica da Meta

Aprovação documentada do responsável pelo tratamento de dados para listas personalizadas, transparência/opt-out, direito de exclusão e finalidade publicitária. Ter recebido campanha ou agendamento NÃO equivale automaticamente a consentimento/expectativa de remarketing. Sem política documentada, NÃO configurar EVYD_META_AUDIENCE_LGPD_APPROVED=1 nem EVYD_META_AUDIENCE_LGPD_POLICY_REF. Um flag não substitui avaliação jurídica por tipo de titular. Não versionar política privada ou dados reais no GitHub.

## GATE 3 — Código implantado INERTE, autorização separada

Somente após QA/revisão e autorização do operador que administra a VPS:
- EVYD_META_AUDIENCE_ENABLED=0
- EVYD_AUDIENCE_EXPORT_ENABLED=0

Implantar exclusivamente a unit/stack MCP existente, segundo mecanismo de release já conhecido; não inventar nomes de units, IP, paths ou modificar outros projetos. Confirmar CRM, Z-API, PrintServer, Gameplay e OAuth anteriores intactos. Se houver regressão, rollback do MCP ao release anterior, preservando banco e outros serviços.

## GATE 4 — Prévia apenas, com autorização

Após Gates 1–3 e autorização de finalidade:
- EVYD_META_AUDIENCE_ENABLED=1
- EVYD_AUDIENCE_EXPORT_ENABLED=0

Reiniciar somente MCP autorizado. Com operador OAuth crm.read, a ferramenta crm_meta_publico_natal_previa devolve agregados/qualidade e nenhuma PII. Confirmar que export não funciona. O preflight offline de flags é:

    node scripts/antigravity/meta-audience-release-preflight.mjs

Sem env master/reader configurado, o script reportará bloqueios; não passar credenciais por argumentos de comando ou comentários GitHub.

## GATE 5 — Exportação privada, autorização separada do gestor

Após validação SQL, jurídico e aceite do gestor:
- EVYD_META_AUDIENCE_ENABLED=1 E EVYD_AUDIENCE_EXPORT_ENABLED=1;
- EVYD_AUDIENCE_ALLOWED_OPERATOR_IDS somente para autorizados;
- META_PRIVATE_CSV_DIR diretório absoluto privado exclusivo da unit MCP, criado 0700 fora do checkout público e sem backup compartilhado;
- OAuth crm.audience.export concedido EFETIVAMENTE à conexão, escopo crm.read sozinho deve receber HTTP 403.
- Confirmar snapshot_id válido, revalidar compras/opt-out imediatamente antes de escrever arquivo, exigir 100 pessoas distintas e 100 telefones válidos, validação dupla CSV.
- CSV 0600 salvo no host; ferramenta responde arquivo_id opaco + SHA256 e contagens. NÃO existe download autenticado integrado ao ChatGPT Web. Não criar URL pública, token de download em texto ou enviar CSV por issue/chat.
- Para extração operacional enquanto o download MCP não existe, operador autenticado pode recuperar arquivo por canal administrativo privado (SFTP/SSH) com controles apropriados; sem automatizar esse acesso até aprovação.
- Não fazer upload Meta ou ativar orçamento sem uma autorização específica.

## GATE 6 — Retenção, limpeza e rollback

Dry-run seguro:

    node scripts/antigravity/purge-meta-audience-private.mjs

Depois de aprovação explícita, um job periódico EXCLUSIVO da unit MCP pode usar o mesmo comando com --apply para expirar arquivos próprios após 1h; registrar apenas contagens, nunca nome/caminho/contato. Sem job periódico, um processo parado pode manter arquivos expirados até a próxima execução. Nunca modificar cron global do CRM, Z-API, PrintServer ou Gameplay.

Rollback funcional: desligar primeiro EVYD_AUDIENCE_EXPORT_ENABLED=0, depois master=0 caso necessário, revogar permissões problemáticas e reiniciar SOMENTE a unit MCP aprovada. Nenhum delete de histórico da Meta/CRM. Não executar mudanças de configuração, merge ou deploy automaticamente.

## Critério final

- CODE_PREPARED: fontes, documentação, scripts e flags com guardas já na PR.
- LOCAL_QA: requer nova execução no HEAD P25.4.
- STAGING_MYSQL: UNKNOWN até testes SQL autorizados.
- LEGAL_APPROVAL: pendente.
- CHATGPT_DOWNLOAD: pendente; arquivo_id não é link.
- LIVE_EXPORT e META_UPLOAD: NO-GO sem autorização específica, mesmo que código passe nos testes.


## Reforço de armazenamento P25.4.1

CSV de clientes NUNCA pode ficar dentro do diretório do checkout Git, mesmo ignorado por .gitignore. O gateway valida caminhos canônicos com realpath/relative depois de criar o diretório e antes de qualquer escrita; symlinks intermediários não permitem desviar o bloqueio. Os testes MCP usam diretório sintético em tmpdir, e um teste adicional confirma rejeição de tentativa de export para diretório dentro do checkout. O preflight operacional também marca diretórios dentro do checkout como NOT_READY.

O plano de recuperação do arquivo via SFTP/SSH é uma opção administrativa temporária para o operador com acesso legítimo; NÃO constitui download diretamente no ChatGPT. Não criar URLs públicas nem publicar caminhos reais.
