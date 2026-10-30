# Implantação do Gateway MCP LIVE (`mcp-crm.etijucas.com.br`) e Descontinuação de `api.evydencia.com.br`

**Estado (25/10/2026):** Gateway OAuth 2.1 + Streamable HTTP validado contra a API real do Evydência CRM (`https://evydencia.com`, `185.241.151.207`) e pronto para produção em `https://mcp-crm.etijucas.com.br/mcp`, eliminando 100% da dependência do intermediário legado `api.evydencia.com.br` (`186.209.113.134`).

## 1. Arquitetura e Integração Direta com o CRM (`evydencia.com`)

| Stack / Modo | Função | Exposição | Credenciais |
| --- | --- | --- | --- |
| `deploy/vps` (MOCK) | `tunnel-client` + MCP stdio com 17 ferramentas fictícias | Nenhuma porta pública; health só em `127.0.0.1:18090` | `TUNNEL_ID` + runtime key OpenAI em `/srv/secrets/evydencia-crm-mcp/tunnel.env` |
| `deploy/gateway` (LIVE) | MCP Streamable HTTP + OAuth 2.1, dados reais **somente leitura** direto no CRM | HTTPS via `https://mcp-crm.etijucas.com.br/mcp` (Nginx na VPS CRM `185.241.151.207` ou Caddy na VPS `169.58.210.14`) | `EVYD_GATEWAY_KEY` + allowlist de operadores (`EVYD_ALLOWED_OPERATOR_IDS`) + token Sanctum individual no OAuth |

Fluxo LIVE:
`ChatGPT → https://mcp-crm.etijucas.com.br/mcp → Gateway MCP (127.0.0.1:8090) → https://evydencia.com` (sem passar por `api.evydencia.com.br`).

- **OAuth 2.1 (`src/oauth-gateway.mjs`)**: metadata RFC 9728/8414, DCR (RFC 7591), PKCE `S256` obrigatório, `resource` (RFC 8707) ligado ao `aud`, `iss` na resposta (RFC 9207). Redirects permitidos: `https://chatgpt.com/connector_platform_oauth_redirect` e `https://chatgpt.com/connector/oauth/*`.
- **Identidade do operador (`assertOperatorAbilities`)**: na tela de consentimento (`/authorize`), o operador informa seu próprio token Sanctum do CRM (`ExtensionAbilities::operator()`, ex.: `id=2`). O gateway valida o token em `GET /api/v1/extension/bootstrap`, exige `extension:bootstrap` + `extension:customer-read`, bloqueia tokens curinga (`*`) e valida `operator.id` contra `EVYD_ALLOWED_OPERATOR_IDS`. (Se `EVYD_STRICT_READONLY_TOKEN=1` for definido, recusa também tokens que possuam abilities `*-write`).
- **Substituição completa de `api.evydencia.com.br` (`src/legacy-api-read.mjs`)**: além das **7 ferramentas Sanctum/públicas** (`crm_capacidades`, `crm_status`, `crm_campanha_publica`, `crm_horarios_publicos`, `crm_conexao_privada`, `crm_cliente_resumo`, `crm_cliente_360`), quando `EVYD_INTERNAL_READ_TOKEN` está configurado no gateway, o operador autenticado via OAuth recebe também as **5 ferramentas diretas de leitura do CRM** (`crm_pedidos_buscar`, `crm_pedido_detalhe`, `crm_relatorio_itens_vendidos`, `crm_relatorio_natal_sem_participantes`, `crm_relatorio_clientes_natal`), consultando diretamente `/api/orders/*` e `/api/reports/*` em `https://evydencia.com` via `GET` com sanitização de PII.
- **Sem estado em disco**: `client_id`, `code`, `access_token` e `refresh_token` são cifrados com `AES-256-GCM` (chaves derivadas por `HKDF-SHA256` de `EVYD_GATEWAY_KEY`, `AAD` vinculado ao tipo).

## 2. Comparativo das VPSs Inspecionadas

| Host | IP Público | Recursos Livres | Status SSH | Adequação para `mcp-crm.etijucas.com.br` |
| --- | --- | --- | --- | --- |
| **VPS Evydência CRM (`evydencia-prod`)** | `185.241.151.207` | **8 vCPU AMD EPYC**, **21 GiB RAM livres** (de 23 GiB), **143 GiB SSD livres**, load `0.17` | **Acesso `root` ativo e validado** | **Recomendada (Opção Principal)**: co-localizada com o CRM (`< 1 ms` de latência), Nginx + Certbot nativos, zero interferência com VoIP/Asterisk/WebRTC. |
| **VPS SmartDialer (`vmi3522513`)** | `169.58.210.14` | 6 vCPU AMD EPYC (3 vCPUs reservadas ao worker de vídeo), ~9 GiB RAM livres | `sshd` endurecido em 20/08/2026 (`PasswordAuthentication no`, `PermitRootLogin no`; requer chave Ed25519 de `vpsops` ou console VNC Contabo) | **Alternativa via Caddy (`deploy/gateway/`)**: requer liberar a chave SSH do novo PC no `/home/vpsops/.ssh/authorized_keys` e `root` via console Contabo para editar o Caddyfile. |
| **Hospedagem Compartilhada (`api.evydencia.com.br`)** | `186.209.113.134` | Ambiente chroot Plesk ValueHost | Acesso SSH chroot validado | **Descontinuado para o MCP**: toda a leitura de pedidos e relatórios agora fala direto com `https://evydencia.com` (`185.241.151.207`). |

## 3. Operação na VPS Evydência CRM (`185.241.151.207`)

O serviço `evydencia-crm-mcp-live.service` roda isolado em `127.0.0.1:8090` com runtime Node 22 dedicado em `/opt/evydencia-mcp` (sem alterar `/usr/bin/node` do sistema) e vhost Nginx dedicado em `/etc/nginx/sites-available/mcp-crm.etijucas.com.br`.

```sh
# Verificar saúde local do gateway e do timer de TLS automático
systemctl status evydencia-crm-mcp-live.service
curl -fsS http://127.0.0.1:8090/healthz
curl -fsS -H "Host: mcp-crm.etijucas.com.br" http://127.0.0.1:8090/.well-known/oauth-protected-resource/mcp

# Rollback imediato (se necessário)
systemctl stop evydencia-crm-mcp-live.service
rm -f /etc/nginx/sites-enabled/mcp-crm.etijucas.com.br && nginx -t && systemctl reload nginx
```
