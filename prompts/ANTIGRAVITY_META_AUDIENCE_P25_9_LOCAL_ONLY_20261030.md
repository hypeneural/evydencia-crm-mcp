# ANTIGRAVITY — P25.9 | APENAS VALIDACAO LOCAL (NÃO FAZER DEPLOY)

Repositorio: hypeneural/evydencia-crm-mcp
Branch: feat/meta-audience-crm-export-foundation-20261029
PR: #23, DRAFT. Base: base/reprint-live-6abe039-20261029.
MCP LIVE anteriormente confirmado: 2f7755d / 41 ferramentas.
LEITURA obrigatoria: docs/META_AUDIENCE_P25_9_MANUAL_OPERACIONAL_20261030.md

O ChatGPT JA IMPLEMENTOU os hotfixes P25.9 na mesma branch. NÃO reimplementar, refatorar gateways ou editar CRM. O objetivo aqui e validar o novo HEAD em ambiente local, dar um recibo pequeno e TERMINAR. A release atual nao deve ser reiniciada ou alterada.

## 1. Checkout atualizado, isolado e limpo

    git fetch origin --prune
    git switch feat/meta-audience-crm-export-foundation-20261029
    git pull --ff-only
    git status --short
    git rev-parse HEAD
    node --version
    php -v

Se houver arquivos locais alterados, preservá-los e utilizar um worktree ISOLADO. Proibido reset, force-push ou sobrescrever trabalhos do operador.

## 2. Rodar UMA unica rodada de testes nativos

    bash scripts/antigravity/validate-meta-audience-p25-local.sh

Esse script executa node --check, testes especializados Node (inclusive MCP/OAuth, CSV e janitor), PHP lint/classificador, npm run check e npm test completo.

Os 374/374 PASS do P25.8 referem-se a HEADs anteriores. Exigir SHA exato, contagem e duração do P25.9. Se falhar, corrigir APENAS a causa-raiz comprovada; rodar teste focal + UMA rodada completa adicional, sem ciclos infinitos.

## 3. Regressões obrigatorias do novo P25.9

- Preview sem CSV, email, telefone ou nome no cache; conservar apenas snapshot_id, as_of, purchase_rule, SHA-256 e contadores.
- Segunda previa nao-forcada em menos de 45s reutiliza resultado; forcar_atualizacao=true chama CRM novamente (massas SINTETICAS).
- Snapshot com SHA de CSV IGUAL, mas counts de opt-out/compradores alterados, BLOQUEIA export e exige nova previa.
- Snapshot com contagens e source_counts identicos continua exportavel.
- Gravar CSV privado com abertura exclusiva wx, mode 0600, fsync, close.
- Se write/sync falhar, apagar o arquivo PARCIAL e emitir codigo redigido, sem caminho ou PII.
- Se arquivo ja existia (EEXIST), NUNCA o apagar nem sobrescrever.
- Export no MCP continua exigindo crm.read + crm.audience.export realmente concedidos, operador na allowlist, confirmacao explicita e snapshot valido. crm.read sozinho deve receber 403.
- Anotacao MCP de export correta: escrita local, nao read-only nem automaticamente idempotente; sem enviar a Meta.
- Nenhuma regressao em CSV phone 55/DDD/numeros, email/country, identidade transitiva, 2 numeros para 1 pessoa, exclusoes.
- Janitor P25.8 preservado: boot, a cada 15min, TTL de 1h, symlinks bloqueados, arquivos alheios intactos, desligamento limpo, sem cron e sem gerar CSV real.
- Inventario das 41 ferramentas existentes e OAuth preservados nos testes.

## 4. Revisar SQL e docs APENAS estaticamente

Sem conexao de banco real, conferir scripts/crm-meta-audience-read.php, purchase-classifier e preflight:
- todos os customers, mesmo sem compras; despacho de proposta Natal 2026 qualificado;
- excluir qualquer comprador em 2026, inclusive pedido anterior pago em 2026;
- status atual MAX(id), lotes de 1000; suppression hasher canonico;
- identidades ambiguas em quarentena e contatos sem numero fora do CSV;
- nenhum SQL mutavel, migration, DDL ou logs com contatos.

Os leads sao os DESPACHOS qualificados, e nao todas as conversas do WhatsApp ou agendamentos; nao ampliar fonte nesta rodada.

O CSV MANUAL usa email,phone,fn,ln,country, telefone 55+DDD so digitos, country br. Nao incluir CPF, endereco, historico financeiro ou dados de criancas. O gate de 100 pessoas e INTERNO ao sistema; nao e taxa de match confirmada pela Meta.

Documentacao MCP oficial: https://modelcontextprotocol.io/specification/2026-07-28/server/tools
Documentacao Meta: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences/
As telas Meta podem exigir login. Nao declarar importacao/match PASS sem acesso e prova.

## 5. Conferir GitHub Actions do MESMO commit e redigir recibo

Consultar o workflow MCP validation no HEAD P25.9; registrar URL/ID, SHA e PASS/FAIL.
Se o runner falhar, ler logs, nao suprimir falha nem afrouxar verificacoes.

Escrever UM comentario curto na PR #23, SEM PII:
- HEAD testado, Node/PHP e versoes;
- testes locais PASS/TOTAL, duracao, eventual causa-raiz;
- GitHub Actions mesmo HEAD PASS/FAIL/UNKNOWN;
- cache de preview sem PII, drift com mesmo SHA e writer fail-closed PASS/FAIL;
- OAuth, CSV, janitor, PHP/suite geral PASS/FAIL;
- LIVE permaneceu em 2f7755d se nao houver nova release verificada;
- upload Meta NAO REALIZADO e sem promessas sobre match;
- PR DRAFT, merge na main NO_GO.

## 6. INTERDICOES E FIM DA TAREFA

Nao executar deploy, SSH para VPS, systemctl, migrations, SQL em producao, exportacao real de contatos, SFTP de clientes, publicacao ou upload na Meta, alteracao de campanhas, orcamento, cron, outros servicos, merge na main, force-push ou refatoracao adicional nao solicitada.

TERMINAR apos validacao LOCAL e recibo. Se PASS, indicar P25_9_LOCAL_QA_GO e READY_FOR_SEPARATE_RELEASE_APPROVAL. Codigo nao publicado automaticamente.
