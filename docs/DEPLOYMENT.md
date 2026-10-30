# Plano de implantação: ChatGPT ↔ MCP ↔ Evydência CRM
## Etapa 0 — desenvolvimento seguro (já implementada)
- MCP stdio com SDK oficial v2; cliente API Laravel com allowlist de rotas.
- Mocks de clientes, agenda e proposta, sem tráfego ao CRM.
- Testes unitários e smoke de transporte MCP no GitHub Actions.
- Sem credenciais reais, sem envio de WhatsApp.
## Etapa 1 — homologação da API existente
- Validar CRM_BASE_URL HTTPS e extensão habilitada no Laravel.
- Emitir token Sanctum mínimo e temporário para operador autorizado: extension:bootstrap, extension:customer-read, extension:proposal-read. Não usar extension:proposal-write.
- EVYD_PRIVATE_TOOLS=1, EVYD_MOCK_MODE=0; testar contra homologação, sem dados reais desnecessários.
- Confirmar paridade de schema, limites de resposta, status 401/403/409/422/429/503, throttle, disponibilidade e preview.
- Nunca executar propostas/schedule como smoke.
## Etapa 2 — conexão ChatGPT
- Em máquina local: stdio via túnel MCP seguro e autenticação do usuário. Verificar permissões e opções atuais do ChatGPT.
- Em hospedagem: Streamable HTTP, HTTPS, OAuth 2.1/OIDC com identidade individual, validação de audience, PKCE, rate limits e auditoria sem PII.
- Não publicar um HTTP sem autenticação ou com Bearer compartilhado para vários usuários.
- Implementar no próprio servidor MCP identidade e escopos por usuário; token Sanctum de serviço não substitui OAuth.
## Etapa 3 — envio com confirmação, apenas após aprovação
- Ferramenta de preparação/preview e ferramenta de confirmação separadas.
- Journal durável em banco do intermediário (não alterar banco CRM): intenção, operador, hash do conteúdo/telefone, TTL, estado e UUID.
- Confirmação explícita e vinculada a intenção, um único uso, não confiar em aprovação persistida de ferramentas no ChatGPT.
- POST /api/v1/extension/proposals/schedule com request_id e X-Idempotency-Key idênticos; resend_mode=normal.
- Em timeout, preservar UUID; reconciliar antes de qualquer nova tentativa. Não habilitar reenvio automático.
- 201/200 = agendado/replay, não entregue. O CRM continua dono de regras Gold Rule, supressões e worker.
## Riscos e GO/NO-GO
- O GitHub foi criado como PUBLIC: segredos/PII não entram no repositório; considerar torná-lo privado.
- Não colocar NODE_ENV=production junto com EVYD_MOCK_MODE=1: o servidor recusa iniciar.
- GO_LOCAL: CI verde + smoke + mocks; GO_CRM: homologação real; GO_CHATGPT: autenticação remota + testes; GO_SEND: journal + aprovação humana + ensaio controlado.
