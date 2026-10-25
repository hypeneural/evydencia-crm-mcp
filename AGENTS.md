# Evydência CRM MCP — instruções Antigravity Flash

## Começo rápido
1. Confira `git status --short`; preserve alterações locais.
2. Abra `docs/ONE_COMMAND.md`.
3. Execute `.\scripts\go.ps1`.
4. Registre o resultado de doctor, test, smoke e conversation smoke.
5. Se houver erro, corrija uma causa por vez e reexecute `npm run validate:local`.

## Escopo
Somente o repositório MCP. CRM Laravel é referência de leitura, nunca modifique o CRM. Não executar mensagens reais, Z-API, /proposals/schedule nem /abort. Nada de segredos ou dados reais em fixtures (o GitHub está público). Nunca confundir mock:true com dados da produção.

## Fonte de verdade
- `docs/CAPABILITY_MATRIX.md` separa ferramentas reais, mock e bloqueadas.
- `docs/CONTRATOS_CRM.md` registra rotas verificadas.
- `docs/CONVERSATION_PLAYBOOK.md` contém perguntas simuladas.
- `docs/OPENAI_PLUGIN_DEPLOYMENT.md` explica o ChatGPT e o Tunnel.

## Limites do modelo
Evite planos largos e novas bibliotecas. Execute os validadores como caixas pretas. Um bug, um patch, um teste. Só declare GO_LOCAL_MOCK quando os gates passarem; GO_CHATGPT_MOCK exige ferramenta chamada de fato no ChatGPT. Hooks são barreira adicional, não sandbox. Consulte skills específicas conforme necessário.

## Auditoria de contratos de pedidos — regra nova
Leia docs/AUDITORIA_CRM_NATAL_360_PEDIDOS_20261024.md apenas quando a tarefa envolver filtros, vendas, status, financeiro ou Cliente 360. As ferramentas crm_pedidos_filtrar_mock, crm_pedido_detalhe_mock, crm_natal_indicadores_mock e crm_filtros_pedidos_mock são SOMENTE mock. Never infer live from the order manager API. O painel CustomerDashboardDTO::mock não é fonte de compras reais.
