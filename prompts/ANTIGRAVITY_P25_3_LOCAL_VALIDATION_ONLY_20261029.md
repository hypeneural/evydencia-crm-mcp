# ANTIGRAVITY — P25.3 SOMENTE VALIDAÇÃO LOCAL DO HEAD

Você NÃO precisa implementar novamente a feature. O ChatGPT auditou o retorno Antigravity da PR #23, revisou a stack e migrations reais do CRM, encontrou novos gaps, corrigiu diretamente na mesma branch e documentou tudo em docs/META_AUDIENCE_P25_3_FORENSIC_AUDIT_20261029.md.

## Repositório e limite

- Repositório: hypeneural/evydencia-crm-mcp.
- Branch: feat/meta-audience-crm-export-foundation-20261029.
- PR: #23, mantenha DRAFT.
- Base imutável: base/reprint-live-6abe039-20261029.
- Não mexer em main ou PRs paralelas; não reset/force-push, merge, deploy, GitHub Actions, Meta Ads, CRM legado, PrintServer, Z-API, Gameplay ou bancos de produção.
- Não coletar, comitar, imprimir em log ou postar no GitHub nomes, telefones, e-mails, hash HMAC, tokens e paths de diretório privado.
- Testes precisam usar SOMENTE dados sintéticos. Se banco de homologação sintético não existir, marque esse gate UNKNOWN, sem usar produção.

## Gate A — teste único e completo no checkout isolado

    git fetch origin --prune
    git status --short
    git rev-parse HEAD
    bash scripts/antigravity/validate-meta-audience-p25-local.sh

O comando exige worktree limpa e ancestralidade do commit Antigravity 01aec393f349703cd3179dd7897141a984ccf400. Ele roda checagem sintática Node, 4 suítes focadas MCP/CSV/contrato, PHP lint, **13 testes de classificação comercial PHP nativos**, npm run check e npm test.

O recibo antigo de 342 testes não vale para os novos commits P25.3. Não presumir número exato atual; registrar o relatório real de testes e SHA do HEAD. Em caso de falha corrigir SOMENTE o defeito comprovado, repetir teste afetado e uma rodada consolidada. Evitar testes infinitos.

## Gate B — validar lógica financeira com fixtures SQL/Laravel locais (sem banco real)

Revisar e exercer a função pura scripts/crm-meta-audience-purchase-classifier.php, incorporada ao leitor:
- Pedido 2026 waiting_payment sem pagamento -> não comprova compra;
- payment_confirmed / sessão concluída -> comprador excluído;
- Pedido criado 2025 com parcela paga 2026 -> comprador excluído;
- payment_refunded/payment_chargeback com pagamento -> quarentena;
- pedido sem status -> quarentena;
- status desconhecido -> quarentena;
- vários pedidos da mesma pessoa, inclusive comprador+incerto -> ninguém chega ao CSV sem integridade.

Checar também:
- DB read-only/REPEATABLE READ, rollback antes de emitForensicJson;
- query count/timing agregado via DB::listen sem SQL ou bindings nos logs;
- preflight real de todas colunas, mas executar apenas no banco SINTÉTICO.
- bancos e migrations de produção intocados.

## Gate C — propostas/leads e supressões

Verificar que a origem proposta 2026 NÃO importa agendados de campanhas indiscriminadamente:
- proposal_dispatches: somente status scheduled, eligibility_status allowed/eligible, duplicate_of_id NULL e flow natal;
- contatos apenas em campaign_scheduled_contacts são apenas métrica scheduled_only_not_exported; NÃO se tornam "orçamento pedido" ou "proposta enviada" automaticamente;
- dispatch scheduled comprova agendamento, NÃO prova accepted/delivered/read; não inventar status de entrega;
- 2026 compradores em customers excluem telefones correspondentes por E.164 completo e e-mails normalizados, sem últimos 8 dígitos;
- comparador de HMAC verifica o hash de suppressionRows.phone_e164 usando o serviço Laravel canônico. Chave incompatível -> reason meta_audience_suppression_hash_mismatch e zero dados/CSV.
- restrições ativas respeitam classe marketing e scope global/season natal:2026; nenhuma supressão de outro tipo vira opt-out global automaticamente.

## Gate D — OAuth/UX/CSV

Teste com cliente MCP sintético:
1. crm.read pode consultar prévia agregada, mas SEM crm.audience.export export deve resultar HTTP 403 insufficient_scope via scopeChallenge, cujo contrato OFICIAL é retornar array string[] de escopos completos.
2. Operador fora da allowlist, token antigo/refresh sem grant e confirmação=false são bloqueados.
3. Preview comum é reutilizada no máximo 45s, forcar_atualizacao=true renova. Cache PII limitado a 12 snapshots globais, 5min TTL, cada snapshot amarrado ao operador. Export sempre relê fonte CRM (não usa o snapshot antigo cegamente).
4. Comprador/opt-out surgido após preview impede export e pede nova prévia; arquivo não é criado no bloqueio.
5. Gate mínimo: pelo menos 100 pessoas distintas elegíveis E 100 telefones distintos e válidos. O CSV utiliza email,phone,fn,ln,country, telefone com 55/DDD só dígitos, sem CPF ou IDs.
6. Retorno de export contém apenas arquivo_id opaco, SHA256, contagens e delivery_status=private_gateway_storage_only. Nenhum link/path interno; NÃO prometer download do ChatGPT (não existe entrega autenticada).
7. Caminhos privados no servidor, 0700/0600, exclusividade wx, expiração/limpeza sem apagar outros arquivos.

## Gate E — verificar logs com atenção

- Log do MCP não deve conter dados pessoais, SQL text, bindings, secrets, caminhos absolutos privados nem CSV;
- Métricas agregadas origin_quality: unique_customers, buyer_customer_ids, ambiguous_customer_ids, installments_paid_in_2026, proposal_dispatch_rows e scheduled_only_not_exported;
- audience_query_telemetry contém sql_count/sql_ms reais, ao contrário de bridge_telemetry genérico que pode registrar 0 porque DB::disableQueryLog() está ativo;
- Erros conhecidos geram códigos/ações úteis para gestor, como snapshot_changed_review_again e suppression_hash_mismatch, sem citar contato;
- Não copiar mensagens de erro raw do Laravel ou stack trace para comentários PR.

## Gate F — documentação e entrega

Leia docs/META_AUDIENCE_P25_3_FORENSIC_AUDIT_20261029.md e atualize SOMENTE um recibo técnico agregado na PR #23 (sem duplicar comentário se já existir recibo para o novo SHA). Registre:
- SHA/branch, testes locais PASS/FAIL/UNKNOWN, Node/PHP versões, comando exato, duração verificada;
- confirmação de schema sintético e diferença entre gate estático e integração real;
- todas as rotas/outros serviços preservados;
- riscos remanescentes: política LGPD/DPO, SQL homologação, ChatGPT download e Meta Ads upload;
- parecer objetivo: LOCAL_QA_GO ou LOCAL_QA_NO_GO; LIVE_EXPORT_NO_GO até aprovação explícita do gestor.

Não executar alterações em servidor, banco de produção, campanhas ou públicos. Gate2/publicação Meta continua somente com aprovação por campanha e orçamento.


## Addendum P25.3.1 — proteção e UX já comitadas

- Não reimplementar; verificar o HEAD mais novo antes de executar. O ChatGPT introduziu quarentena por identidade: purchase_check_status unavailable é tolerado pelo transformador SOMENTE se identity_status ambiguous/unknown, que exclui o grupo; suppressions/marketing permission unavailable CONTINUAM bloqueando todo o arquivo. Verificar que comprador/lead ambíguo nunca aparece no CSV.
- Testar dispatch de proposta com resolved_customer_id apontando para comprador com compra ambígua; com matched_customer_count > 1; com campaign_id divergente; com status aborted; com eligibility_status suppressed. Todos fora da lista, mas sem impedir outros clientes elegíveis.
- Checar que 100 linhas com apenas 50 clientes distintos não liberam o gate de upload.
- Conferir na prévia source_quality e next_action em português; na exportação download_available_in_chat=false. Não confundir status arquivo privado com entrega ao gestor.
- Não tomar o número histórico 342/342 como contagem esperada: os testes cresceram nesta branch. Registrar total real de cada suite e o SHA em que rodou.
