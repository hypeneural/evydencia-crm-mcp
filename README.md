## Integração de leitura real — diagnóstico protegido (novo)

O repositório inclui `scripts/verify-live-read.mjs`, `src/live-contracts.mjs` e testes de envelope da API Sanctum. A chave é configurada somente no computador do operador. O diagnóstico nunca imprime respostas brutas. **O Plugin ChatGPT atual continua MOCK anônimo**, não deve receber esta chave. [Inventário e plano local](docs/CRM_LIVE_API_INVENTORY_20261025.md).

---

# Evydência CRM MCP

**Estado:** Plugin ChatGPT demonstrativo com 17 ferramentas MOCK. Novo adaptador OFFLINE do digest Natal canônico preparado, sem alterar o Laravel e sem expor dados reais pelo túnel anônimo.

**Antigravity no Windows 11:** `.\scripts\validate-mvp.ps1` (Node e PHP CLI instalados). [Roteiro final](docs/MVP_AGREGADOS_EXECUCAO_20261025.md) · [Prompt Flash](PROMPT_ANTIGRAVITY_MVP_REAL_SEM_ALTERAR_CRM.md) · [Auditoria segurança/proveniência](docs/MVP_PRODUCAO_SEM_ALTERAR_CRM_20261025.md).

**Histórico 2021–2025:** o importador novo valida agregados de calendários legados privados, congela a fonte por SHA-256 e NÃO os apresenta como números certificados. Veja [auditoria do legado](docs/FORENSE_LEGADO_NATAL_20261025.md) e [prompt pronto](PROMPT_ANTIGRAVITY_LEGADO_NATAL_20261025.md). Importação opcional: `npm run history:import`, apenas com fonte/destino privados.

**API real — diagnóstico com chave local:** `.\\scripts\\validate-crm-key.ps1` + `.env.live.local` (consultas explícitas e schemas sem valores pessoais). [Instruções completas](docs/API_REAL_LEITURA_GUIA_20261025.md) e [prompt Antigravity](PROMPT_ANTIGRAVITY_VALIDAR_API_REAL_20261025.md). O programa não adiciona as consultas ao Plugin anônimo.

**Produção comercial:** não habilitada. Snapshots agregados só podem ser exportados no ambiente Laravel autorizado, após avaliar custo e credenciais; dados privados exigem OAuth 2.1 individual em conexão separada do Plugin MOCK. O envio WhatsApp permanece WRITE_GATED.

---
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

**Lockfile versionado:** package-lock.json é gerado em Node 22 e mantido no Git. Instalação de CI e scripts Windows usam exclusivamente npm ci; doctor --strict-lock exige o arquivo rastreado.

## Conexão com ChatGPT

Primeira integração: OpenAI Secure MCP Tunnel com stdio em modo MOCK, evitando HTTP aberto. Guia: [CHATGPT_TUNNEL_MOCK.md](docs/CHATGPT_TUNNEL_MOCK.md). Conexão efetiva com ChatGPT, permissões e suporte específico do modo de voz dependem de testes no usuário — CI não prova isso.

Referências de comparação: [BASE_REPOSITORIES_20261024.md](docs/BASE_REPOSITORIES_20261024.md). SDK oficial v2 permanece adotado; não migrar para mcp-use/Cloudflare sem necessidade comprovada.

## Segurança e limitações

Repositório atualmente **público**: não adicionar qualquer dado real de cliente, token ou domínio privado. .env está excluído do Git.

Ações reais (POST proposals/schedule e abort), reenvio e Z-API direta NÃO são implementadas. Para futuro envio: identidade OAuth por operador, restrições de ability Sanctum, confirmação humana independente, journal durável de UUID/idempotência, reconciliação de timeout e revisão de segurança.

As APIs internas do CRM protegidas por SingleAuthentication NÃO devem ser consumidas pelo MCP. Para estatísticas, priorizar o exportador canônico e os históricos privados já preparados neste MCP. A busca nominal e a agenda privada podem ser diagnosticadas pela API legada apenas no terminal autorizado, mas seu token amplo não deve chegar ao Plugin anônimo. Uma conexão LIVE exige OAuth por operador; não modificar o Laravel a partir deste repositório.

Documentação detalhada: [ANTIGRAVITY_LOCAL.md](docs/ANTIGRAVITY_LOCAL.md), [CONTRATOS_CRM.md](docs/CONTRATOS_CRM.md), [OFFICIAL_DOCS_AUDIT.md](docs/OFFICIAL_DOCS_AUDIT.md).

## Nova auditoria de estatísticas e pedidos
Consultas MOCK de Natal forense, filtros de pedido (13 status, financeiro, sessões), detalhe por ID/UUID e campos seguros do Cliente 360. Documentação: [auditoria do CRM](docs/AUDITORIA_CRM_NATAL_360_PEDIDOS_20261024.md), [API read-only futura](docs/PROPOSTA_EXTENSION_READ_APIS.md) e [playbook](docs/CONVERSATION_PLAYBOOK.md). Os 10 pedidos da fixture são somente uma amostra; estatísticas de 137 vendas também são fictícias. Nenhuma rota Manager é chamada.
