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

## Pós-conexão real ChatGPT (somente MOCK)
- O Tunnel já foi validado em chamada real do ChatGPT. Não recriar plugin, IDs ou perfis automaticamente.
- Verificar o serviço existente com `node scripts/tunnel-ready.mjs`; não reiniciar se estiver saudável.
- Stdio suporta apenas uma instância `tunnel-client` por Tunnel ID. Parar a antiga antes de qualquer restart.
- Manter dados sintéticos e ferramentas WRITE_GATED ausentes. A conexão sem autenticação individual NUNCA recebe dados reais.
- Consultar `docs/AUDITORIA_FORENSE_TUNNEL_CHATGPT_20261024.md` quando a tarefa for Tunnel/ChatGPT.

## Novo gate de produção, estritamente offline (25/10)
- Quando a tarefa mencionar Natal REAL, comparar 2026/2025, status para retirada ou exportador PHP, leia **somente** `docs/MVP_AGREGADOS_EXECUCAO_20261025.md` e rode `.\\scripts\\validate-mvp.ps1`.
- O exportador `tools/export-natal-digest.php` e o leitor `src/natal-digest-snapshot.mjs` **não** são ferramentas MCP públicas. O Plugin MOCK anônimo deve continuar com 17 tools fictícias.
- Proibido rodar exportador contra CRM de produção ou criar usuário MySQL durante validação local; precisa de autorização operacional explícita e teste de carga.
- Regras do negócio: comparação YTD somente janelas 01/08 equivalentes; `data_status_2025=UNCONFIRMED` não autoriza delta certificado; RECORDED_GROSS não equivale a caixa líquido; status 10 é aguardando retirar, 11 é entregue.
