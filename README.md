# Evydência CRM MCP — Gateway ChatGPT

Intermediário MCP independente entre ChatGPT e o Laravel Evydência CRM. Sem acesso SQL nem Z-API direta. **MVP com ferramentas read-only e mocks sintéticos; disparo real BLOQUEADO.**

## Início rápido Windows 11 com Antigravity Gemini 3.8 Flash

Pré-requisitos: Node.js >=22, npm, PowerShell, Git. No clone da hypeneural/evydencia-crm-mcp:

1. .\scripts\bootstrap-mock.ps1 — cria apenas .env local com NODE_ENV=development, EVYD_MOCK_MODE=1, EVYD_PRIVATE_TOOLS=0 e token vazio.
2. .\scripts\validate.ps1 — instalação + doctor + sintaxe + testes + smoke MCP + conversation smoke.
3. npm run conversation:smoke — teste determinístico de perguntas comuns e confirmação simulada.

Em modo MOCK nenhum request é feito ao CRM. Todos os dados sintéticos contêm mock:true e source:fixture; resultados de negócio simulados contêm real_dispatch:false.

## Capacidades

- LIVE_PUBLIC: saúde do CRM, campanhas e disponibilidade pública (GET).
- LIVE_EXTENSION (Sanctum de operador): bootstrap, contexto do cliente por telefone, Cliente 360, prévia da proposta de Natal (POST preview, não agenda).
- MOCK_ONLY: crm_natal_resumo, crm_agenda_hoje, crm_buscar_cliente_nome e crm_simular_agendamento_proposta_natal. A API live read-only desses três primeiros **ainda não existe na Extension API**.
- WRITE_GATED: envio real pelo CRM. Não há ferramenta de envio registrada no MCP.

Veja [Matriz de capacidades](docs/CAPABILITY_MATRIX.md) e [Playbook de conversas](docs/CONVERSATION_PLAYBOOK.md).

## Estrutura para agente menor e validações

- AGENTS.md: proibições e ciclo verificável.
- .agents/rules/security.md e flash-guardrails.md: frontmatter válido conforme documentação oficial Antigravity.
- .agents/hooks.json: SessionStart e PreToolUse. Scripts em scripts/session-start.mjs e scripts/antigravity-hook.mjs.
- src/AGENTS.md, test/AGENTS.md, fixtures/AGENTS.md: regras específicas por diretório.
- .agents/skills/*/SKILL.md: rotinas pequenas (capability audit, preflight, security, conversation, conexão ChatGPT, desenho de proposta).
- scripts/doctor.mjs: preflight, esquema de rules/hooks, fixtures e proibição de escrita.
- scripts/smoke.mjs: SDK MCP stdio tradicional.
- scripts/conversation-smoke.mjs: Client v2 moderno 2026-07-28, estatísticas, agenda, busca por nome e proposta simulada.
- .github/workflows/ci.yml: executa doctor + check + testes + ambos smokes.

**Lockfile pendente:** package-lock.json não está versionado. Gerar com npm install --package-lock-only --ignore-scripts e depois npm ci. Doctor adverte; doctor --strict-lock bloqueia. CI ainda usa npm install caso o arquivo não exista. Após commit do lockfile, remover fallback.

## Conexão com ChatGPT

Primeira integração: OpenAI Secure MCP Tunnel com stdio em modo MOCK, evitando HTTP aberto. Guia: [CHATGPT_TUNNEL_MOCK.md](docs/CHATGPT_TUNNEL_MOCK.md). Conexão efetiva com ChatGPT, permissões e suporte específico do modo de voz dependem de testes no usuário — CI não prova isso.

Referências de comparação: [BASE_REPOSITORIES_20261024.md](docs/BASE_REPOSITORIES_20261024.md). SDK oficial v2 permanece adotado; não migrar para mcp-use/Cloudflare sem necessidade comprovada.

## Segurança e limitações

Repositório atualmente **público**: não adicionar qualquer dado real de cliente, token ou domínio privado. .env está excluído do Git.

Ações reais (POST proposals/schedule e abort), reenvio e Z-API direta NÃO são implementadas. Para futuro envio: identidade OAuth por operador, restrições de ability Sanctum, confirmação humana independente, journal durável de UUID/idempotência, reconciliação de timeout e revisão de segurança.

As APIs internas do CRM protegidas por SingleAuthentication NÃO devem ser consumidas pelo MCP. Para estatísticas, agenda privada e busca nominal, propor endpoints read-only escopados no CRM em trabalho separado — não modificar Laravel a partir deste repositório.

Documentação detalhada: [ANTIGRAVITY_LOCAL.md](docs/ANTIGRAVITY_LOCAL.md), [CONTRATOS_CRM.md](docs/CONTRATOS_CRM.md), [OFFICIAL_DOCS_AUDIT.md](docs/OFFICIAL_DOCS_AUDIT.md).
