# PROMPT READY — Google Antigravity, Gemini Flash

Abra o clone do `hypeneural/evydencia-crm-mcp` no Windows 11. Trabalhe só com simulações.

1. Execute `git status --short`. Se estiver limpo, `git pull --ff-only origin main`; se houver alterações, preserve-as. Anote `git rev-parse HEAD`.
2. Leia `AGENTS.md`, `docs/ONE_COMMAND.md` e `docs/CAPABILITY_MATRIX.md`. Nada de ler todos os documentos sem necessidade.
3. Confira os hooks no Antigravity. Execute no PowerShell: `.\scripts\go.ps1`.
4. O script verifica .env mock, instala npm ci, executa doctor, testes, smoke stdio e 10 cenários MCP. Se falhar, corrija apenas a causa comprovada e execute `npm run validate:local`.
5. Verifique `docs/CONVERSATION_PLAYBOOK.md`: vendas, agenda, cliente e prévia são fictícios; envio real indisponível.
6. Após GO_LOCAL_MOCK, leia `docs/OPENAI_PLUGIN_DEPLOYMENT.md`. Conexão ChatGPT via Tunnel exige ID e permissões reais; não invente ou exponha serviços. Voz ainda precisa de teste.
7. Não modificar CRM Laravel, não enviar propostas, não executar API manager nem Z-API.

Relate objetivamente: SHA, Node/npm, testes aprovados, resultados dos dois smokes, configuração segura, estado do Tunnel e classificação GO_LOCAL_MOCK / GO_CHATGPT_MOCK / BLOCKED. Comece pelo git status.
