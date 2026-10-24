# Evydência CRM MCP
Servidor MCP independente do Laravel para conectar o ChatGPT às APIs já existentes do [Evydência CRM](https://github.com/hypeneural/evydencia-crm). **MVP somente leitura e prévia de propostas; nenhum disparo habilitado.**
## Ferramentas
Públicas: `crm_status`, `crm_campanha_publica`, `crm_horarios_publicos`.
Privadas (somente após EVYD_PRIVATE_TOOLS=1 e token Sanctum): `crm_conexao_privada`, `crm_cliente_resumo`, `crm_cliente_360`, `crm_previa_proposta_natal`.
## Windows 11
Requisitos: Node.js >=22, Git, PowerShell. Copie `.env.example` para `.env`, configure CRM_BASE_URL com HTTPS e mantenha EVYD_PRIVATE_TOOLS=0 inicialmente.
```powershell
Copy-Item .env.example .env
npm install
npm run check
npm test
npm start
```
O transporte inicial é MCP stdio. Nunca trate `npm start` sozinho como integração ChatGPT concluída: conecte via Inspector e solução de túnel autenticado compatível.
## Fonte de verdade
`docs/CONTRATOS_CRM.md` e `docs/AUDITORIA_BASES_GITHUB.md`. Revalidar o HEAD do CRM antes de liberar operações reais.
## Segurança
Código e configurações de exemplo somente; token nunca entra no Git. Repositório remoto criado como **public**, então obtenha visibilidade privada manualmente se este código for futuramente incluir material interno.
## Próximas etapas
1. Homologar npm install + MCP Inspector; baixar package-lock.json no PR.
2. Conectar túnel privado; autenticação individual com OAuth.
3. Implementar journal durável, confirmação vinculada à intenção, ferramenta de envio em branch separada e flag OFF.

## Teste totalmente mockado (sem CRM e sem token)
```powershell
Copy-Item .env.example .env
# Edite .env: EVYD_MOCK_MODE=1
npm install
npm test
npm run smoke
npm start
```
Em modo mock, `crm_mock_scenarios` explica os números fictícios. As respostas vêm com `mock:true` e `source:'fixture'`, sem qualquer acesso ao CRM. Não use dados reais nos fixtures. `NODE_ENV=production` impede o modo mock.

## Contratos reais
A projeção de disponibilidade lê `data.slotsByDate`, `data.googleCalendar` e `data.pagination` conforme os exemplos Scribe do Laravel. O cliente 360 omite nomes, datas de nascimento e relações de participantes. O preview pode sondar o worker do CRM, portanto não é anotado como estritamente read-only no protocolo MCP.
