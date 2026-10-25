# VPS SmartDialer — plano auditado (25/10/2026)

**Estado:** o levantamento de 6 vCPU, 12 GB RAM e Ubuntu 24.04 veio de inventários anteriores. SSH público não autenticou; nenhuma medição atual nem implantação foram executadas.

## Mudanças corrigidas

- `scripts/start-mock.mjs` lê `.env`, portanto a imagem copia a fixture sintética para `/app/.env`.
- O validador aceita `CRM_READ_TOKEN=` vazio e `CRM_REQUEST_TIMEOUT_MS`, não `CRM_TOKEN`.
- Docker `COPY` aponta para `deploy/vps/entrypoint.sh`, que existe no contexto do build.
- Binário `tunnel-client` deve ser obtido separadamente na versão verificada com checksum, montado em somente leitura; sem baixar binário sem validação durante build.
- Rede Docker própria, usuário 1000, `read_only`, `cap_drop`, limite de 0.25 CPU e 256 MiB. Isso não garante egress-only: firewall precisa ser auditado.
- Saúde e compatibilidade do cliente de túnel devem ser confirmadas na versão exata. `/health?details=true` é usado pelo validador do repositório; verificar endpoints efetivos.

## Pré-voo offline

```sh
npm ci
npm run validate:local
npm run vps:preflight
```

## Pré-voo VPS autorizado, somente leitura

```sh
hostnamectl
uptime
free -h
df -h /
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
sudo docker network ls
sudo ss -lntup
sudo stackctl host status
sudo stackctl capacity
```

Parar o túnel concorrente no Windows antes de reutilizar `TUNNEL_ID`. Gerar perfil `local-stdio` usando a CLI oficial do cliente instalado; comando MCP deve ser `node --env-file=/app/.env scripts/start-mock.mjs`, no diretório `/app`. O perfil e segredos ficam fora do Git. Validar o bind do health: loopback **dentro** do container pode não ser acessível via publish Docker ao host.

## Gates de produção

**MOCK:** 17 ferramentas fictícias e processo sem token CRM. Nunca confundir aprovação local com uso de dados reais.

**LIVE (AINDA NÃO IMPLEMENTADO):** gateway MCP Streamable HTTP autenticado via OAuth por operador, escopo por ferramenta, JWT/validação ou introspecção com `iss/aud/exp`, revogação e `401/403`, isolamento de identidades, rate limits, logs sem PII, token upstream Sanctum estritamente read-only (`extension:bootstrap`, `extension:customer-read`, `extension:proposal-read`) e testes end-to-end com usuário autorizado. Não usar token legado `SingleAuthentication`. Verificar comportamento de `proposals/preview` antes de habilitar POST. Medir p50/p95, 4xx/5xx e interferência em VoIP/vídeo. Não expor Caddy ou portas antes da autenticação.

**SEND:** bloqueado por padrão; nenhum WhatsApp, Z-API, SMS, voz, agendamento ou cancelamento autorizado.

A reversão remove **somente** container da stack MCP, sem `docker system prune`, reinícios de Asterisk, SmartDialer, Caddy ou serviços de vídeo.

Referências: https://developers.openai.com/plugins/build/mcp-server ; https://developers.openai.com/plugins/build/auth ; https://developers.openai.com/api/docs/guides/secure-mcp-tunnels ; https://github.com/modelcontextprotocol/typescript-sdk/tree/main/packages/server
