# Evydência CRM MCP — instruções para Antigravity
Este repositório é um **intermediário** entre ChatGPT e `hypeneural/evydencia-crm`. Não modificar o CRM Laravel.
## Invariantes obrigatórios
- Rota do CRM somente de allowlist; HTTPS; sem token em logs, commits ou respostas.
- Não utilizar API legada gerencial nem Z-API diretamente; reutilizar a Extension API Sanctum do CRM.
- O servidor é **somente leitura** nesta fase. `POST proposals/preview` é uma prévia de negócios, mas pode enfileirar sonda técnica de saúde; sem agendar destinatário.
- NUNCA adicionar `proposals/schedule` a uma ferramenta pública ou ao cliente sem armazenamento durável, confirmação humana por intenção e autenticação individual. Reenvio fica proibido na primeira versão.
- Bloqueios do CRM prevalecem: operador, Gold Rule, contato ambíguo, supressões, saúde do fluxo e limites.
- Respostas de Cliente 360 sem dados individuais de crianças, CPF ou contato bruto.
- Desenvolvimento local: verificar Node.js, gerar package-lock.json (pendente), depois `npm ci`, `npm run check`, `npm test` e `npm run smoke`. Não afirmar conectividade real sem evidência.
## Fluxo do agente
1. Ler `docs/AUDITORIA_BASES_GITHUB.md` e `docs/CONTRATOS_CRM.md`.
2. Executar `/crm-mcp-preflight`, `/crm-mcp-security-audit` e `/crm-mcp-contract-parity`; usar `/crm-mcp-proposal-design` somente para planejamento de envio futuro.
3. Fazer patch focal com teste correlato e rever superfície de ferramentas.
4. Classificar GO_LOCAL, GO_PROD ou BLOCKED com evidências.

## Mocks e testes de integração
- Executar `npm run smoke` com `EVYD_MOCK_MODE=1` internamente; o teste inicia um cliente MCP stdio e invoca ferramentas reais.
- Não conectar mocks ao ChatGPT de produção: respostas sintéticas têm `mock:true` e `source:'fixture'`.
- Dados de fixtures são fictícios e não representam pessoas reais.

## Fonte oficial e continuidade
- Leia `docs/OFFICIAL_DOCS_AUDIT.md` e `PROMPT_ANTIGRAVITY_START.md` antes de modificar transporte, autenticação ou contratos.
- Não publicar HTTP sem OAuth/validação de audiência e autorização individual; Sanctum de serviço não autentica o usuário ChatGPT.
- O mock exige NODE_ENV=development/test; não desativar a proteção. Nunca registrar payload de clientes.
- Sempre versionar testes negativos de contrato, erros HTTP e proteção de PII junto com o patch.
