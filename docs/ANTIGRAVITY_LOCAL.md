# Guia local: Windows 11 + Antigravity Gemini 3.8 Flash

## Etapa 1 — diagnóstico sem mudanças
Execute PowerShell no clone: git status --short; git rev-parse HEAD; node --version; npm --version; node scripts/doctor.mjs.
Leia AGENTS.md, docs/CAPABILITY_MATRIX.md e docs/CONVERSATION_PLAYBOOK.md. Inspecione /hooks no Antigravity e confirme .agents/hooks.json ativo.

## Etapa 2 — bootstrap MOCK
Execute .\scripts\bootstrap-mock.ps1 (cria .env somente se ausente).
Variáveis: NODE_ENV=development, EVYD_MOCK_MODE=1, EVYD_PRIVATE_TOOLS=0, CRM_READ_TOKEN vazio.
Execute .\scripts\validate.ps1. Em seguida npm run conversation:smoke. Para Inspector, use npm start (entrypoint com validação de ambiente) em processo próprio; não digite comandos no stdout do servidor.

## Gate P0 do lockfile — CONCLUÍDO NO GITHUB
package-lock.json já é versionado. Execute npm ci --ignore-scripts --no-audit --no-fund e node scripts/doctor.mjs --strict-lock.
Nunca regenere lockfile para 'consertar' erro sem auditar package.json, Node, npm e o diff. Execute npm audit --omit=dev e avalie vulnerabilidades de forma focada.

## Ciclos para modelo menor
Um problema/teste/patch por vez. Nunca inventar rota a partir de serviço Laravel. Se falta API Sanctum read-only, classificar MOCK_ONLY e documentar gap. Não relaxar assertions para obter verde.

## Gates
GO_LOCAL_MOCK = doctor+check+tests+smoke+conversation smoke aprovados.
GO_CHATGPT_MOCK = primeira conexão real pelo ChatGPT/Tunnel, com ferramentas MOCK e nenhuma escrita.
GO_HOMOLOG = Extension API com Sanctum mínimo, testes separados, sem mandar proposta.
GO_SEND = ainda BLOQUEADO até OAuth, journal durável, confirmação humana, replay/idempotência, revisão independente.
