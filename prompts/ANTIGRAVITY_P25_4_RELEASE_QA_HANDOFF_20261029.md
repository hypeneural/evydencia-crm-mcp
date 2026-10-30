# ANTIGRAVITY — P25.4: VALIDAR O NOVO HEAD, PREPARAR CANÁRIO OFF, NÃO FAZER DEPLOY

**REPOSITÓRIO:** hypeneural/evydencia-crm-mcp. **PR:** #23 DRAFT. **BRANCH:** feat/meta-audience-crm-export-foundation-20261029. Base base/reprint-live-6abe039-20261029.

O ChatGPT já leu a PR, os commits P25.3 e o recibo 6513548206, auditou código Laravel/MCP, corrigiu o SDK scopeChallenge, os flags de habilitação, o limite do leitor e preparou scripts de release. Tudo foi aplicado DIRETAMENTE NA BRANCH. NÃO REIMPLEMENTE, NÃO REESCREVA COMITS, NÃO FAÇA RESET, NÃO FORCE PUSH.

Leia INTEGRALMENTE:
- docs/META_AUDIENCE_P25_4_PRODUCTION_RUNBOOK_20261029.md
- docs/META_AUDIENCE_P25_3_FORENSIC_AUDIT_20261029.md
- docs/META_CUSTOMER_LIST_CSV_SPEC_20261029.md

## A. Checkout e validação LOCAL ÚNICA

Em worktree ISOLADO e limpo:

    git fetch origin --prune
    git checkout feat/meta-audience-crm-export-foundation-20261029
    git pull --ff-only
    git rev-parse HEAD
    git status --short
    bash scripts/antigravity/validate-meta-audience-p25-local.sh

O script roda:
- JS syntax nos módulos da audiência, gateway, OAuth e CLI operacionais.
- Node SDK MCP 2.4.0 OAuth HTTP 403 e prévia/export usando apenas dados sintéticos.
- PHP lint e 13 casos de classificação pura para comprador/estorno/chargeback.
- Validação CSV, janitor dry-run, preflight flags e npm check/test geral.

Os 348/348 PASS do Antigravity valem SÓ para o commit 58b0660, NÃO para o novo HEAD. Registre o total e a duração reais desta execução. Se houver falha corrija cirurgicamente somente o P0 demonstrado, repita o teste afetado e uma única rodada completa; nunca ciclos infinitos.

## B. Testar as mudanças críticas

1. scopeChallenge agora retorna objeto canônico {scopes:[...requiredScopes],errorDescription:'...'}, não array híbrido. Testar 403 real (sem crm.audience.export) e 200 somente após grant válido, operador allowlisted e confirmação.
2. EVYD_AUDIENCE_EXPORT_ENABLED=1 com EVYD_META_AUDIENCE_ENABLED=0 NÃO pode registrar nem habilitar ferramenta. Feature OFF é comportamento padrão.
3. Leitor completo Meta tem teto isolado 24 MiB e timeout 45s; outros bridges continuam 8 MiB e tempo anterior. Estouro falha fechado, sem dados parciais nem PII nos logs.
4. Janitor privado simula por padrão, preserva arquivos quando dryRun; somente --apply apaga arquivos próprios expirados. CLI não revela paths, telefones ou CSV.
5. Preflight offline sem segredos deve reportar FEATURE_DISABLED para flags desligados; com export ativo e master desligado => BLOCKED_CONFIG; sem política jurídica ou diretório privado => BLOCKED_CONFIG.
6. CSV exige 100 grupos de pessoas elegíveis + 100 telefones válidos (DDI 55, DDD, somente dígitos), sem CPF, IDs e duplicados.
7. Fonte SQL em preview deve explicar excluídos, ambiguous, dispatched, scheduled_only_not_exported e sql_count/sql_ms agregados sem SQL bruto/bindings.
8. Sem download no ChatGPT: retorno arquivo_id ainda é armazenamento no host, não link. NÃO enviar PII no chat como atalho.

## C. SQL de homologação (somente se estiver disponível e autorizado)

Se já houver banco Laravel/MySQL de homologação SEPARADO e sintético, use ação meta.audience.schema.preflight com year=2026 em bridge READ ONLY. Confirme migrations/status/índices, campos dos dispatches, suppression hasher, joins, REPEATABLE READ, rollback e compatibilidade de dados; benchmark de volume. NENHUMA migração, alteração de CRM, ou leitura de dados pessoais de produção.

Se não houver banco staging, GATE SQL=UNKNOWN. NÃO tentar na VPS de produção e não inventar que foi validado.

## D. Preparar a implantação em duas fases, sem executar

Fase 1: release do MCP COM feature desligada e rollback documentado. Preservar CRM, Z-API, PrintServer, Gameplay, OAuth, outros processos e units. Flags OFF:
- EVYD_META_AUDIENCE_ENABLED=0
- EVYD_AUDIENCE_EXPORT_ENABLED=0

Fase 2: somente após parecer LGPD, teste de banco e aprovação de operador, ligar preview; exportação exige autorização separada, escopo crm.audience.export, allowlist própria e pasta 0700 fora do checkout; nenhuma lista real enviada para Meta automaticamente.

Identificar na VPS o nome REAL da unit, mecanismo real de release e caminho de secrets SEM publicar valores ou caminhos privados na PR. Se essa descoberta necessitar acesso LIVE, obter aprovação explícita antes. Não adivinhar host.

O arquivo CSV atualmente NÃO pode ser baixado diretamente do ChatGPT; registrar pendência como bloqueio de experiência completa. Sem canal autenticado de retirada, exportação permanece NO-GO.

## E. Recibo único na PR

Se todos os testes locais passarem, atualizar a PR #23 com um único recibo, sem duplicações:
- HEAD SHA exato, comandos, versões, contagens PASS/FAIL e duração.
- File list de hotfixes e diferença com base, indicadores de reversibilidade.
- Nenhuma PII, nomes de clientes, telefones, segredos, SQL com parâmetros ou paths privados.
- STATUS obrigatório: LOCAL_QA_GO ou LOCAL_QA_NO_GO; SQL_STAGING_PASS/FAIL/UNKNOWN; LEGAL_PENDING; DOWNLOAD_PENDING; LIVE_EXPORT_NO_GO; META_UPLOAD_NO_GO.
- Não publicar, habilitar, gastar Meta Ads, enviar mensagens, subir CSV, tocar CRM/DB ou GitHub Actions.

**TERMINE AQUI:** só homologação local e plano de canário OFF. Deploy e alterações de variáveis de ambiente LIVE são ações separadas sob autorização formal do gestor.


## Adendo de auditoria de diretório (P25.4.1)

Confirmar o novo teste MCP de bloqueio de arquivo dentro do checkout (inclusive symlink de diretório); pasta de teste fica em tmpdir e é removida ao final. O preflight de release só considera pronto diretório absoluto, restrito 0700, FORA do Git checkout. Não criar arquivo real de clientes durante a validação. Execução nativa do HEAD atual continua obrigatória.


## P25.4.2 — Gate SQL crítico

O ChatGPT também otimizou a query de orders_status para JOIN de MAX(id) por order_id em lotes de 1.000, e a recuperação de pedidos anteriores pagos em 2026 por lotes de 1.000. Validar via php -l e, se houver STAGING isolado, comparar IDs/status contra CurrentOrderStatusResolver e verificar EXPLAIN, integridade e performance; sem SQL em produção e sem criar índice/migration. O script de teste estático de regressão já está incluído.
