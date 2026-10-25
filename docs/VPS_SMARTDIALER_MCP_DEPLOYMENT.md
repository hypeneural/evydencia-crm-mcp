# VPS SmartDialer — MCP MOCK (túnel) e Gateway LIVE somente leitura

**Estado (25/10/2026):** código e testes offline aprovados. VPS **não inspecionada nesta rodada**: o Tailscale do Windows de operação está deslogado e o SSH público recusa senha/chave. Capacidade abaixo vem de auditorias anteriores (ago/2026) e precisa ser reconfirmada antes do deploy.

## 1. Arquitetura

| Stack | Função | Exposição | Credenciais |
| --- | --- | --- | --- |
| `deploy/vps` (MOCK) | `tunnel-client` + MCP stdio com 17 ferramentas fictícias | Nenhuma porta pública; health só em `127.0.0.1:18090` | `TUNNEL_ID` + runtime key OpenAI em `/srv/secrets/evydencia-crm-mcp/tunnel.env` |
| `deploy/gateway` (LIVE) | MCP Streamable HTTP + OAuth 2.1, dados reais **somente leitura** | Somente via Caddy (`edge`), sem porta no host | `EVYD_GATEWAY_KEY` + allowlist de operadores em `/srv/secrets/evydencia-crm-mcp/gateway.env` |

Fluxo LIVE: ChatGPT → `https://mcp.<domínio>/mcp` (Caddy) → gateway → `https://evydencia.com/api/v1/extension/*` com o **token Sanctum do próprio operador**.

- **OAuth 2.1** (`src/oauth-gateway.mjs`): metadata RFC 9728/8414, DCR (RFC 7591), PKCE S256 obrigatório, `resource` (RFC 8707) ligado ao `aud`, `iss` na resposta (RFC 9207, habilita o redirect estável do ChatGPT). Redirects permitidos: `https://chatgpt.com/connector_platform_oauth_redirect` e `https://chatgpt.com/connector/oauth/*`.
- **Identidade do operador:** na tela de consentimento o operador informa o próprio token Sanctum de leitura. O gateway chama `bootstrap`, exige `extension:bootstrap` + `extension:customer-read`, **recusa qualquer ability de escrita** e confere `operator.id` contra `EVYD_ALLOWED_OPERATOR_IDS`.
- **Sem estado em disco:** client_id, code, access e refresh tokens são AES-256-GCM selados (HKDF a partir de `EVYD_GATEWAY_KEY`, AAD por tipo). Reiniciar o container não desconecta ninguém; trocar a chave revoga tudo.
- **Por requisição:** validação do bearer (expiração, `aud`, escopo `crm.read`), allowlist do operador, rate limit por operador; revalidação upstream do Sanctum a cada ≤5 min e em todo refresh. CRM 401 → `operator_token_revoked` e o próximo request recebe 401 (o ChatGPT reautentica).
- **Ferramentas LIVE (7):** `crm_capacidades`, `crm_status`, `crm_campanha_publica`, `crm_horarios_publicos`, `crm_conexao_privada`, `crm_cliente_resumo`, `crm_cliente_360`. **Sem** prévia, envio, agendamento, cancelamento ou mutação. Apenas GET upstream.
- **Logs:** JSON em stderr com evento, rota (sem query string), status, duração e tag HMAC do operador. Nunca tokens, códigos, telefones ou nomes.
- O servidor stdio continua recusando `EVYD_PRIVATE_TOOLS=1` (`crm_private_requires_authenticated_gateway`); o gateway é um entrypoint separado que recusa modo MOCK e qualquer token compartilhado (`CRM_READ_TOKEN`, legado, Z-API).

## 2. Validação offline

```sh
npm ci
npm run validate:local      # doctor, check, 120 testes, 3 smokes, vps:preflight
npm run gateway:test        # 12 testes de aceite LIVE com CRM falso
npm run gateway:bench       # latência/CPU/memória sobre HTTP real
```

## 3. Pré-requisitos bloqueantes do LIVE

1. **Token Sanctum somente leitura por operador**, abilities exatamente `extension:bootstrap`, `extension:customer-read` (opcional `extension:proposal-read`). O comando padrão de emissão do CRM inclui `extension:proposal-write` e será recusado.
2. **DNS** `mcp.<domínio>` → VPS e um bloco aditivo no Caddyfile (`deploy/gateway/Caddyfile.snippet`), aplicado com `caddy validate` + `caddy reload` em janela aprovada.
3. **Acesso administrativo à VPS** via Tailscale + `vpsops` (chave Ed25519) para inspeção e deploy.

## 4. Implantação LIVE (após aprovação)

```sh
# Somente leitura primeiro
hostnamectl; uptime; free -h; df -h /
sudo stackctl host status; sudo stackctl capacity
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
sudo ss -lntup

# Código e segredos
sudo git -C /srv/apps/evydencia-crm-mcp/repo fetch && sudo git -C /srv/apps/evydencia-crm-mcp/repo checkout <SHA_APROVADO>
sudo install -d -m 0700 /srv/secrets/evydencia-crm-mcp
sudo install -m 0400 -o 1000 -g 1000 deploy/gateway/gateway.env.example /srv/secrets/evydencia-crm-mcp/gateway.env
sudo sh -c 'k=$(openssl rand -base64 32); sed -i "s|__GENERATE_ON_HOST__|$k|" /srv/secrets/evydencia-crm-mcp/gateway.env'
# editar EVYD_PUBLIC_URL e EVYD_ALLOWED_OPERATOR_IDS sem exibir o arquivo em logs

# Stack isolada
sudo install -d /srv/platform/stacks/evydencia-crm-mcp-gateway
sudo cp deploy/gateway/{compose.yaml,stack.yaml} /srv/platform/stacks/evydencia-crm-mcp-gateway/
sudo stackctl validate evydencia-crm-mcp-gateway && sudo stackctl plan evydencia-crm-mcp-gateway
sudo stackctl deploy evydencia-crm-mcp-gateway --commit <SHA_APROVADO>

# Caddy: anexar o snippet, validar e recarregar (sem restart)
sudo docker exec <caddy> caddy validate --config /etc/caddy/Caddyfile
sudo docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile

# Verificação
curl -fsS https://mcp.<domínio>/healthz
curl -fsS https://mcp.<domínio>/.well-known/oauth-protected-resource/mcp
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://mcp.<domínio>/mcp   # esperado 401
sudo stackctl telephony status; sudo stackctl doctor whatsapp-video-call; sudo stackctl doctor smartdialer
```

ChatGPT: Plugins → Add custom MCP server → URL `https://mcp.<domínio>/mcp`, autenticação OAuth. Concluir o consentimento com o token de leitura do operador.

## 5. Rollback

1. Remover o bloco `mcp.<domínio>` do Caddyfile → `caddy validate` → `caddy reload`.
2. `cd /srv/platform/stacks/evydencia-crm-mcp-gateway && sudo docker compose down` (somente esta stack; nunca `down -v`, `system prune` ou restart de Asterisk/SmartDialer/vídeo).
3. Revogação imediata de todos os tokens OAuth: trocar `EVYD_GATEWAY_KEY`. Revogação de um operador: removê-lo da allowlist ou revogar o token Sanctum no CRM.

## 6. Critérios GO/NO-GO para `GO_CHATGPT_LIVE`

GO somente com **todas** as evidências:

- [ ] `npm run validate:local` verde no SHA implantado.
- [ ] VPS inspecionada via SSH autenticado; sem regressão em Asterisk, vídeo, SmartDialer, Evolution e Caddy após o deploy.
- [ ] `POST /mcp` sem token → 401 com `resource_metadata`; token adulterado → 401; operador fora da allowlist → 403.
- [ ] Token Sanctum com escrita recusado na tela de consentimento (teste real com o CRM).
- [ ] ChatGPT conectado via OAuth; `crm_capacidades` retorna `LIVE_READ_ONLY_OAUTH` e apenas as 7 ferramentas.
- [ ] Uma consulta `crm_cliente_resumo` com telefone de teste autorizado retorna dados reais do operador autenticado.
- [ ] Isolamento: um segundo operador conectado só vê o que o seu token permite (ou 403, se fora da allowlist).
- [ ] Logs do gateway revisados: zero tokens, telefones ou nomes.
- [ ] p95 de ferramenta < 1,5 s e nenhum impacto mensurável em CPU/RSS das stacks de voz/vídeo.

NO-GO automático: qualquer chamada não-GET upstream, vazamento em logs, token de escrita aceito, ou impacto em chamadas de voz/vídeo.

**SEND permanece BLOCKED:** nenhum WhatsApp, Z-API, SMS, voz, agendamento ou cancelamento.

Referências: https://developers.openai.com/apps-sdk/build/auth ; https://developers.openai.com/api/docs/guides/secure-mcp-tunnels ; https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization ; https://github.com/modelcontextprotocol/typescript-sdk
