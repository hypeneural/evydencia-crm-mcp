# Evydência CRM MCP — instruções Antigravity Flash

## Prioridade para a PR #8 — reconciliar v0.12 LIVE (25/10/2026)
Se a tarefa envolve precisão, velocidade, UI do ChatGPT ou KPIs, LEIA PRIMEIRO `docs/AUDITORIA_OPENAI_CHATGPT_MCP_V012_20261025.md` e `docs/ANTIGRAVITY_CHATGPT_MCP_PERFORMANCE_20261025.md`.
A main LIVE evoluiu para v0.12.0 (29 ferramentas, commit 9896fc5). Esta branch nasceu em v0.10.1: ANTES DE MERGE/DEPLOY, integrar main com cuidado, preservar Z-API OAuth/diagnósticos/tool registry e executar CI. Nunca sobrescrever com `src/live-gateway.mjs` antigo. `perfil_resposta=kpi_minimal` é opt-in; preservar resposta original por padrão. Nada de dados reais no Git ou de envios de WhatsApp em smoke. Não declarar que HTTP/WebP validado = avatar renderizado no ChatGPT.

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

## Dados históricos legados de Natal (2021–2025)
- Fonte privada para auditoria: `hypeneural/fotosdenatal-dados/data/natal_historical_calendar_immutable.json`.
- Executar apenas `npm run history:import -- --source=CAMINHO_ABSOLUTO_PRIVADO --output=ARQUIVO_ABSOLUTO_PRIVADO --cutoff=MM-DD` em ambiente autorizado. Saída fora de TODOS os repositórios, com ACL privada.
- Nunca importar `data/natal_master_customers.json`, buyers, non-buyers ou `customer_last_participants.json` para o repo MCP: contêm dados pessoais.
- Histórico congelado é `LEGACY_UNVERIFIED`, não receita recebida ou vendas canônicas do CRM. Não comparar automaticamente com YTD 2026 sem paridade com `NatalValidOrdersQuery`.
- Leia `docs/FORENSE_LEGADO_NATAL_20261025.md` para invariantes, status e prioridade dinâmica. Não criar scripts/commits no repositório legado.

## API REAL — preparação local, não usar no Plugin anônimo
- Para tarefas sobre chave real leia `docs/API_REAL_LEITURA_GUIA_20261025.md`, rode `.\\scripts\\validate-crm-key.ps1` e não desenvolva endpoints novos.
- Use `.env.live.local` na raiz (gitignored), NÃO `.env` mock; nunca envie chaves no chat/log. Host exato `CRM_EXPECTED_HOST` e consentimento de rede obrigatórios.
- `extension` usa Sanctum; `legacy` usa token global com poderes de escrita em outras rotas e requer consentimento de risco. As consultas locais não tornam o token read-only no servidor Laravel.
- Contrato JSON real = somente estrutura de campos/tipos, sem valores pessoais no terminal. Preview exige consentimento extra por poder sondar worker.
- A interface do ChatGPT pode desenhar gráficos dos dados agregados autorizados; UI própria MCP Apps é opcional e só deve ser considerada depois de OAuth por operador. Não adicionar tool live no stdio anônimo.

## Diagnóstico API real read-only, SEM conectar Plugin anônimo
- Leia `docs/CRM_LIVE_API_INVENTORY_20261025.md`. O teste real isolado roda via `npm run live:read:check -- --mode=bootstrap` com `CRM_BASE_URL` e `CRM_READ_TOKEN` definidos SOMENTE no terminal/ambiente seguro do operador.
- `--mode=customer-context` e `--mode=customer-360` exigem `--phone=DDD...` para contato de teste autorizado. A ferramenta imprime só estado/contagens, NÃO dados pessoais.
- Nunca copiar token, payload, HTML de manager, dumps SQL ou JSON bruto ao Git. `proposals/preview` é POST de diagnóstico e requer opt-in separado. `proposals/schedule` NUNCA é invocado.
- O Plugin MOCK atual permanece 17 tools fictícias. Só habilitar LIVE em conexão separada autenticada por operador.
