# PROMPT EXECUTAR AGORA — Antigravity Gemini Flash (MVP Natal 2026)

**Repositório EXCLUSIVO para trabalho:** `C:\Projetos\hypeneural\evydencia-crm-mcp`.
**CRM Laravel:** hypeneural/evydencia-crm é REFERÊNCIA SOMENTE LEITURA. Não editar Laravel, banco, VPS, Z-API, GitHub Issues ou deploy.

A fase de implementação offline está **CONCLUÍDA** na main do MCP: `src/natal-digest-snapshot.mjs`, `tools/export-natal-digest.php`, `src/order-readiness.mjs`, `scripts/validate-mvp.ps1` e testes de contrato. NÃO os reescreva.

## EXECUTE EM ORDEM, SEM PLANEJAMENTO NOVO

1. Abrir PowerShell na pasta MCP e rodar `git status --short`, `git rev-parse HEAD`. O arquivo `scripts/go.ps1` pode ter alteração local preexistente; **PRESERVAR**. Faça `git fetch origin` e `git pull --ff-only origin main` SOMENTE se não sobrescrever alterações. Se conflito, PARE com BLOCKED; não use reset/clean/stash automático.
2. Ler `AGENTS.md` e `docs/MVP_AGREGADOS_EXECUCAO_20261025.md`. Use a skill `crm-mcp-natal-live-preflight`. Não ler repositório inteiro.
3. Validar as dependências já instaladas (Node >=22, PHP >=8.3): `node --version` e `php --version`.
4. Rodar **UM comando**: `.\scripts\validate-mvp.ps1`. Ele executa doctor, lint Node, testes unitários, smoke stdio, teste conversacional, inicialização protegida e `php -l tools/export-natal-digest.php`. Resultado esperado `GO_MVP_OFFLINE`.
5. Conferir `node scripts/tunnel-ready.mjs` apenas se o Tunnel MOCK estiver ativo. Se saudável, não iniciar segundo daemon. O Plugin anônimo atual deve CONTINUAR com 17 ferramentas MOCK; nunca ativar CRM_READ_TOKEN ou EVYD_PRIVATE_TOOLS nele.
6. Confirmar que o PHP CLI exportador exige `--crm-root=...` e `--output=...` absolutos FORA de Git/CRM e que `--help` funciona. **NÃO executar exportação real nesta passagem**. Ela exige consentimento operacional explícito, ambiente Laravel instalado e benchmark da query.
7. Testar casos do módulo puro: 2026 versus 2025 em janela comparável; status histórico UNCONFIRMED; snapshot envelhecido; PII extra; crédito/saldo; Cliente 360 com 'waiting_product_retrieve' e 'product_retrieve_confirmed'; nome ambíguo.
8. Não tentar conectar SQL/replicar Laravel nem implementar OAuth nesta validação; esses são próximos gates com infraestrutura autorizada. Não expor Snapshot comercial no Plugin anônimo. Não realizar envio WhatsApp nem simular 'enviado de verdade'.
9. **Se houver falha:** identificar primeiro erro, abrir apenas os arquivos relevantes, corrigir UMA causa com teste, rodar `npm run validate:local` e lint PHP. Nunca remover teste de segurança para obter PASS.

## Entregar somente:
- SHA Git atual e `git status` (sem segredos), Node/npm/PHP.
- Resultado `validate-mvp.ps1`, quantidade de testes, doctor e três smokes.
- PHP `-l` e help; snapshot REAL = NÃO EXECUTADO.
- Plugin MOCK e Tunnel status pontual; ausência de ferramenta de envio real.
- Nenhuma alteração Laravel/VPS/SQL; classificação `GO_MVP_OFFLINE` ou `BLOCKED`.
- Identificar somente próximo gate **GO_LIVE_SNAPSHOT_READ**, que requer credencial/ambiente aprovado, benchmarking e autenticação separada antes de qualquer dado em ChatGPT.

**Comece pelo Git. Esta não é uma tarefa de desenvolver, mas HOMOLOGAR O CÓDIGO PUBLICADO.**
