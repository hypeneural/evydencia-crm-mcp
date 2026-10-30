# ANTIGRAVITY — EXECUTE A VALIDAÇÃO LOCAL DA API REAL E DOS JSONs (SEM PROGRAMAR)

O MCP já foi auditado e atualizado no GitHub. NÃO refaça código, não modifique `hypeneural/evydencia-crm` e não crie PR no Laravel.

Trabalhe no clone `C:\Projetos\hypeneural\evydencia-crm-mcp`, Gemini Flash.

1. `git status --short` → `git fetch origin` → `git pull --ff-only origin main` SE seguro. Preserve diferenças preexistentes, especialmente scripts/go.ps1.
2. Leia `AGENTS.md` e `docs/API_REAL_LEITURA_GUIA_20261025.md`. Ative a skill `crm-mcp-live-contract-check`. NÃO procurar centenas de arquivos.
3. Execute `.\scripts\validate-crm-key.ps1`; ele testa a suíte MCP e mostra contratos JSON OFFLINE.  **Se não houver `.env.live.local`, não acesse rede.**
4. Se o arquivo ainda não existir: `Copy-Item config\live-read.env.example .env.live.local`; instrua o operador a preencher a chave DIRETAMENTE no arquivo local; jamais mostrá-la no chat. Insira `CRM_EXPECTED_HOST` exato.
5. Primeira operação com token Sanctum: selecionar `CRM_PROBE_FAMILY=extension`, `CRM_PROBE_ACTION=bootstrap`, `CRM_LIVE_NETWORK_CONSENT=1`. Rodar `.\scripts\validate-crm-key.ps1`. Registrar SOMENTE campos/tipos, HTTP status e sinalização de token com capacidade write.
6. Com autorização do operador e telefone de teste que ele tem direito de consultar: definir `CRM_LIVE_CUSTOMER_CONSENT=1`, `CRM_TEST_PHONE`, `CRM_PROBE_ACTION=customer`; validar. Repetir com `history`, se necessário. Nenhum nome/telefone da resposta bruta pode ir ao terminal/chat.
7. Prévia de Natal tem efeito técnico no worker: NÃO chamar por padrão. Executar `preview` somente se houver autorização explícita e `CRM_LIVE_PREVIEW_PROBE_CONSENT=1`. Nunca chamar `schedule`, `abort` ou Z-API.
8. Se a chave fornecida for legada, avaliar com operador o risco da credencial global. Somente após `EVYD_ACK_LEGACY_WRITE_POWER=1`, `CRM_PROBE_FAMILY=legacy` e `CRM_PROBE_ACTION=orders`. Verificar formato e `meta` sem usar número resultante como KPI canônico. O adaptador só chama GET e só imprime schema. `detail` exige UUID de pedido autorizado.
9. Os dados históricos 2021–2025, `src/chart-ready.mjs` e o exportador 2026 já estão implementados; apenas conferir testes/contratos. Não importar dados pessoais, não executar SQL ou Laravel em produção sem autorização de operação.
10. Verifique que as 17 ferramentas atuais do Plugin continuam mockadas. Nenhuma chave deve ser colocada na conexão Tunnel anônima. Para dados reais via ChatGPT ainda será necessária conexão separada com OAuth 2.1 por operador.

**Entrega final:** SHA, resultado do script, quantidade de testes, schema de cada endpoint realmente consultado, HTTP 200/401/403/503, tipo de credencial (sem valor), permissões detectadas, ausência de dados pessoais nos logs e próximos bloqueios. Se falhar, corrija UMA causa local; sem migrar framework, sem alterar Laravel e sem abrir issue.
