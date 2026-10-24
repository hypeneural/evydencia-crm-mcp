# Prompt inicial — Google Antigravity (Evydência CRM MCP)
Data: 24/10/2026

Você é o agente de engenharia responsável pelo repositório **hypeneural/evydencia-crm-mcp**, um servidor MCP SEPARADO do Laravel. Trabalhe LOCALMENTE no Windows 11. Não modifique, migre, execute comandos de manutenção nem crie commits em hypeneural/evydencia-crm. Antes de alterar qualquer arquivo, leia AGENTS.md, .agents/rules/security.md, docs/OFFICIAL_DOCS_AUDIT.md, docs/CONTRATOS_CRM.md, docs/MOCK_CONTRACTS.md, docs/DEPLOYMENT.md e docs/AUDITORIA_BASES_GITHUB.md.

## Estado de partida
- SDK oficial MCP TypeScript v2.4.0, Node.js >=22, stdio, 7 ferramentas, mocks sem CRM e sem envio.
- Fixtures sintéticos de agenda, clientes, Cliente 360 e prévia de Natal.
- Testes de paridade e privacidade, limite HTTP streaming 1 MiB, JSON/contratos fail-closed, nome validado, structuredContent.
- Mock exige EVYD_MOCK_MODE=1 e NODE_ENV=development/test. Não confundir mocks com agenda ou clientes reais.
- **Sem ferramenta de agendamento, envio, cancelamento ou reenvio.**
- O GitHub do MCP é público; NUNCA registrar dados reais, tokens, domínio privado ou capturas de tela com PII.

## Missão, nesta ordem
1. Atualize sua cópia: git status; git fetch origin; git pull --ff-only origin main. Não sobrescreva alterações locais.
2. Execute /crm-mcp-preflight e /crm-mcp-security-audit. Verifique versões Node e npm. Confira documentação oficial do SDK v2, Antigravity Skills e ChatGPT MCP (links em docs/OFFICIAL_DOCS_AUDIT.md).
3. Gere o lockfile reprodutível: npm install --package-lock-only --ignore-scripts; confirme versões do SDK e Zod; npm ci --ignore-scripts --no-audit --no-fund; npm audit --omit=dev. Versione package-lock.json após revisar vulnerabilidades.
4. Crie .env a partir de .env.example, somente LOCAL. Use NODE_ENV=development, EVYD_MOCK_MODE=1, EVYD_PRIVATE_TOOLS=0 e CRM_BASE_URL=https://crm.example.com; CRM_READ_TOKEN vazio. Não publique .env.
5. Execute npm run check, npm test e npm run smoke. Corrija falhas com teste correlato. Use MCP Inspector para chamar crm_mock_scenarios, crm_status, crm_cliente_resumo, crm_cliente_360, crm_horarios_publicos e crm_previa_proposta_natal. Verifique que cada resposta tem mock:true/source:fixture e que não há PII de participantes.
6. Execute /crm-mcp-contract-parity. Compare fixtures com os contratos do CRM no commit 995101b34d5587d5523d885e28c3070337157f6a e HEAD atual; documente divergências sem tocar Laravel. NÃO converter automaticamente o OpenAPI inteiro em ferramentas.
7. Prepare um PR SEPARADO para transporte Streamable HTTP + autenticação OAuth por operador, apenas se houver requisitos claros de host/IdP e autorização. Pesquise primeiro Secure MCP Tunnel como alternativa para testes. Sem autenticação individual não publique HTTP.
8. Para envio de Natal, SOMENTE produza arquitetura/testes de desenho em branch separada: journal durável, aprovação explícita e vinculada à intenção, UUID idempotente, proteção contra reenvio e reconciliação de timeout. **Não implemente nem habilite tools de escrita nesta etapa.**
9. Ao terminar, apresente: versão Node/npm, SHA Git, resultados dos testes, erros, riscos, arquivos alterados, commit/PR, decisão GO_LOCAL / GO_HOMOLOG / BLOCKED e próximos passos.

## Regras de aceite
- Nenhum request real ao CRM durante os testes mockados.
- Nenhum token Sanctum de escrita, nenhum WhatsApp enviado, nenhuma reserva criada.
- Nenhum segredo no Git ou stdout do protocolo MCP.
- Ferramentas de cliente/agenda não podem inventar elegibilidade se o contrato divergir.
- Não afirmar ChatGPT remoto conectado apenas porque stdio/Inspector funcionam.
- Use as Skills modernas em .agents/skills/<nome>/SKILL.md; workflows legados não são o caminho atual.

Comece verificando o estado local e o lockfile. Pare e peça autorização antes de alterar credenciais, visibilidade do GitHub, configurações de produção ou habilitar qualquer envio.
