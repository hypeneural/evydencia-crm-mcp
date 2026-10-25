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

## Novo escopo auditado: Natal / Cliente 360 / pedidos (já publicado)
Leia docs/AUDITORIA_CRM_NATAL_360_PEDIDOS_20261024.md e a matriz de capacidades. Novas tools MOCK: crm_natal_indicadores_mock, crm_filtros_pedidos_mock, crm_pedidos_filtrar_mock, crm_pedido_detalhe_mock. Não invente rotas reais.
Rode .\\scripts\\go.ps1 e npm run conversation:smoke. Teste filtro {product_slug:natal,financial:open,status:[payment_confirmed]}, busque pedido fictício 5001 por ID e solicite modulo=financeiro.
Confirme: is_live=false, source=fixture, real_dispatch=false; saldo null não equivale a quitado; valores de catálogo são centavos, Customer360 real usa decimais em reais. A amostra contém 10 pedidos fictícios e os KPIs sintetizam 137 vendas fictícias, sem reconciliação entre ambos.
Se tudo passar, informe GO_LOCAL_MOCK, SHA e contagem real de testes. Não tocar o Laravel, API manager ou envio. Para próximos endpoints REAIS, use somente docs/PROPOSTA_EXTENSION_READ_APIS.md como proposta separada, não como contrato existente.
