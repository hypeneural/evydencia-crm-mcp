# Evydência CRM MCP — instruções para Antigravity
Este repositório é um **intermediário** entre ChatGPT e `hypeneural/evydencia-crm`. Não modificar o CRM Laravel.
## Invariantes obrigatórios
- Rota do CRM somente de allowlist; HTTPS; sem token em logs, commits ou respostas.
- Não utilizar API legada gerencial nem Z-API diretamente; reutilizar a Extension API Sanctum do CRM.
- O servidor é **somente leitura** nesta fase. `POST proposals/preview` é uma prévia de negócios, mas pode enfileirar sonda técnica de saúde; sem agendar destinatário.
- NUNCA adicionar `proposals/schedule` a uma ferramenta pública ou ao cliente sem armazenamento durável, confirmação humana por intenção e autenticação individual. Reenvio fica proibido na primeira versão.
- Bloqueios do CRM prevalecem: operador, Gold Rule, contato ambíguo, supressões, saúde do fluxo e limites.
- Respostas de Cliente 360 sem dados individuais de crianças, CPF ou contato bruto.
- Desenvolvimento local: verificar Node.js, `npm ci`, `npm run check` e `npm test`. Não afirmar conectividade real sem evidência.
## Fluxo do agente
1. Ler `docs/AUDITORIA_BASES_GITHUB.md` e `docs/CONTRATOS_CRM.md`.
2. Executar a skill `/crm-mcp-preflight` e então `/crm-mcp-proposal-design` quando autorizado.
3. Fazer patch focal com teste correlato e rever superfície de ferramentas.
4. Classificar GO_LOCAL, GO_PROD ou BLOCKED com evidências.
