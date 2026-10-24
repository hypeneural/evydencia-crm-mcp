# Auditoria comparativa de projetos GitHub — 24/10/2026
## Estratégia
Não clonar um monorepositório inteiro. Preservar nosso cliente HTTP e incorporar seletivamente práticas de projetos reconhecidos.
| Projeto | Aproveitamento | Atenção |
|---|---|---|
| modelcontextprotocol/typescript-sdk | Base adotada @modelcontextprotocol/server v2.4.0, stdio + futuro Streamable HTTP, schemas, testes | Necessita OAuth ao expor HTTP |
| mcp-use/mcp-use | scaffolding, inspector, auth adapters, MCP Apps, exemplos e organização | versão 2.11.2 Node >=22.22.2: atualizar máquina antes de migrar |
| cloudflare/agents | createMcpHandler, cloud workers, padrão stateless | cloud é opcional, custos e identidade sob sua responsabilidade |
| cloudflare/workers-oauth-provider | OAuth 2.1, tokens e autorização, separar resource/auth server | exemplos antigos com usuário demo não servem em produção; estudar documentação atual |
| vitemcp/server | framework edge/stateless e OpenAPI | Node >=24, custo migratório adicional |
| modelcontextprotocol/inspector | testar ferramentas MCP com respostas mockadas | nunca apontar escrita para produção em teste |
| openai/mcp-extensions | futuro formulário visual e confirmação rica no ChatGPT | evitar MCP App antes de autenticação e journal |
| harsha-iiiv/openapi-mcp-generator | conversão OpenAPI → ferramentas, pesquisa apenas | NÃO converter endpoints legados amplos ou métodos de escrita automaticamente |
## Decisão
Adotar SDK oficial e importar padrões, não copiar projetos completos. Manter transport stdio para desenvolvimento, planear HTTP+OAuth remoto ao conectar conta ChatGPT. Primeiro release exclusivamente consultas e prévia. Segundo release, confirmação com journal e escopos individuais, sem reenvio.
## Riscos
1. O repositório remoto foi criado público: não incluir dados comerciais.
2. Instalação npm e transporte MCP remoto não foram executados neste ambiente.
3. Sonda técnica do worker disparada por preview, embora sem agendar destinatário.
4. Cliente interno manager e `/api/pdv` estão fora do escopo por problemas de autorização e amplitude de dados.
5. A contagem financeira do CRM não equivale necessariamente a receita: respeitar definições oficiais.
