# src — fronteira de código
- core.mjs é a única fachada de HTTP CRM e deve manter allowlist + HTTPS + projeção.
- mock.mjs espelha respostas de rotas existentes; mock-business.mjs simula apenas FUTURAS capacidades.
- Ferramentas BUSINESS_MOCK nunca chamam fetch ou recebem CRM_READ_TOKEN.
- Não adicionar POST de schedule/abort ou API interna ao cliente.
- Registro de tools em server.mjs: nomes específicos e descrições que expliquem estado MOCK, LIVE ou gated.
