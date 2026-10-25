# PROMPT — Antigravity Gemini 3.8 Flash — Evydência CRM MCP

Você está no Windows 11, no clone hypeneural/evydencia-crm-mcp. A implementação anterior já publicou SDK MCP v2, hooks Antigravity, matrizes, fixtures e smokes. **Não começar reescrevendo.** Trabalhe em passos pequenos e verificáveis.

## 0. Verificar HEAD sem descartar mudanças locais
Execute exatamente:
git status --short
git rev-parse HEAD
git fetch origin
git pull --ff-only origin main
node --version
npm --version

Se houver mudanças locais, NÃO faça pull sobrescrevendo-as: preserve e explique.

## 1. Leitura obrigatória e skills
Leia na ordem:
AGENTS.md
docs/CAPABILITY_MATRIX.md
docs/ANTIGRAVITY_LOCAL.md
docs/CONVERSATION_PLAYBOOK.md
docs/CHATGPT_TUNNEL_MOCK.md
docs/CONTRATOS_CRM.md
docs/BASE_REPOSITORIES_20261024.md

Depois invoque /crm-mcp-preflight e /crm-mcp-conversation-harness. Confirme que .agents/hooks.json está carregado em /hooks (ou Customizations > Hooks no IDE). Nunca desative security.md nem hooks para contornar bloqueios.

## 2. Instalar e validar MOCK
PowerShell:
.\scripts\bootstrap-mock.ps1
.\scripts\validate.ps1

Não editar .env se já existir sem revisão; o bootstrap preserva. Exigir:
NODE_ENV=development
EVYD_MOCK_MODE=1
EVYD_PRIVATE_TOOLS=0
CRM_READ_TOKEN vazio

Execute individualmente os gates:
node scripts/doctor.mjs
npm run check
npm test
npm run smoke
npm run conversation:smoke

É obrigatório que negotiation MCP seja modern, fixtures tenham mock:true/source:fixture e que a tool real de envio NÃO exista.

## 3. Lockfile reprodutível (P0)
Se package-lock.json não existir, faça:
npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts --no-audit --no-fund
node scripts/doctor.mjs --strict-lock
npm audit --omit=dev

Revisar versões e findings, versionar package-lock.json em commit separado. Depois propor que CI remova fallback npm install e exija npm ci. Não mexer em dependências sem avaliar changelog/documentação.

## 4. Validar conversas
Use docs/CONVERSATION_PLAYBOOK.md. Simule perguntas:
- Quantos ensaios de Natal vendemos?
- Qual o faturamento sintético recebido?
- Como está a agenda de 24/10/2026?
- A Marina Exemplo comprou?
- Prepare uma proposta fictícia para 48999990001.
- Pode simular envio?
- O que você NÃO consegue fazer de verdade?

Verifique os campos exatos usando tools MCP no Inspector. Nunca reportar 137 ensaios ou 6 sessões como dados reais. real_dispatch=false e scheduled=false sempre.

## 5. Conexão ChatGPT depois de GO_LOCAL
Leia docs/CHATGPT_TUNNEL_MOCK.md. Use apenas o OpenAI Secure MCP Tunnel oficial em stdio, caso workspace/tunnel_id autorizados estejam disponíveis. Não invente credenciais, túnel, plugin ou conexão. Nunca abrir HTTP sem OAuth. Testar primeiro crm_capacidades.

## 6. Guardrails permanentes
NÃO alterar hypeneural/evydencia-crm, suas configurações, VPS ou banco.
NÃO implementar POST /proposals/schedule, abort, Z-API direta, API manager SingleAuthentication ou SQL.
NÃO habilitar CRM_READ_TOKEN no mock nem copiar PII para fixtures.
Não transformar estatísticas/agenda/busca por nome em ferramentas LIVE até provar API Sanctum read-only.
Não assumir suporte de tools no modo de voz sem teste do ChatGPT.
Qualquer envio real requer confirmação de operador fora de prompt, OAuth, journal, idempotência, reconciliação e aprovação separada.

## 7. Entrega final exigida
Informe SHA HEAD, status git, Node/npm, package-lock presente SIM/NÃO, doctor, check, contagem de testes, smoke, conversation smoke, getProtocolEra, hooks carregados, arquivos alterados, PR/commit, gaps de API, classificação GO_LOCAL_MOCK/GO_CHATGPT_MOCK/BLOCKED. Nunca dizer '100%' sem evidência real.

**Comece com o diagnóstico e não execute mudanças fora do repositório.**
