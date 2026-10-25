# Integração Oficial Z-API MCP no Evydência CRM MCP Live (`v0.11.0`)

**Data da descoberta e integração:** 2026-10-25  
**Repositório:** `hypeneural/evydencia-crm-mcp` (gateway LIVE isolado; zero alterações em `hypeneural/evydencia-crm`)  
**Gateway público:** `https://mcp-crm.etijucas.com.br/mcp`  
**Servidor upstream oficial:** `https://mcp.z-api.io/mcp`

---

## 1. Descoberta Real do Servidor Oficial `https://mcp.z-api.io` (FASE 1 — Evidências Sanitizadas)

### 1.1 Transporte MCP sem token (`initialize` / `tools/list`)
- `POST https://mcp.z-api.io/mcp` e `GET https://mcp.z-api.io/mcp` sem cabeçalho `Authorization` retornam:
  - Status HTTP: `401 Unauthorized`
  - Cabeçalho `WWW-Authenticate`: `Bearer error="invalid_token", error_description="Missing Authorization header"`
  - Corpo JSON: `{"error":"invalid_token","error_description":"Missing Authorization header"}`
- **Classificação pré-autorização:** `AUTH_REQUIRED`. Nenhum schema foi falsificado a partir de tabelas da documentação; o gateway descobre os identificadores JSON-RPC e `inputSchema`/`outputSchema` reais diretamente via `tools/list` (`@modelcontextprotocol/client` `2.4.0` sobre `StreamableHTTPClientTransport`) assim que o operador conclui o OAuth oficial da Z-API.

### 1.2 Metadados OAuth 2.1 (RFC 8414 / RFC 9728 / RFC 7591)
- `GET https://mcp.z-api.io/.well-known/oauth-protected-resource` e `/.well-known/oauth-protected-resource/mcp`: `HTTP 401` (não expostos publicamente; descoberta recai sobre a origem do servidor de autorização conforme especificação MCP `2025-11-25`).
- `GET https://mcp.z-api.io/.well-known/openid-configuration`: `HTTP 401`.
- `GET https://mcp.z-api.io/.well-known/oauth-authorization-server`: **`HTTP 200 OK`**:
  ```json
  {
    "issuer": "https://mcp.z-api.io",
    "authorization_endpoint": "https://mcp.z-api.io/authorize",
    "token_endpoint": "https://mcp.z-api.io/token",
    "registration_endpoint": "https://mcp.z-api.io/register",
    "response_types_supported": ["code"],
    "response_modes_supported": ["query"],
    "grant_types_supported": ["authorization_code", "refresh_token"],
    "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic", "none"],
    "registration_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic", "none"],
    "code_challenge_methods_supported": ["S256"]
  }
  ```
- **Dynamic Client Registration (`POST https://mcp.z-api.io/register`):** **`HTTP 200 OK`**, emitindo `client_id` e `client_secret` (persistidos somente cifrados em disco privado `0600` fora do Git, vinculados a `issuer` + `redirect_uri`).
- **Endpoint de Autorização (`GET https://mcp.z-api.io/authorize`):** **`HTTP 302`** redirecionando para `https://app.z-api.io/app/authorize` com `response_type=code`, `code_challenge_method=S256`, `redirect_uri=https://mcp-crm.etijucas.com.br/zapi/oauth/callback` e `state` selado por operador, onde o operador seleciona explicitamente **uma única instância WhatsApp** da Z-API.

---

## 2. Arquitetura de Segurança e Isolamento (FASE 2–5)

1. **Duas identidades independentes (`operador autenticado → autorização Z-API → instância selecionada`):**
   - O OAuth do CRM (`crm.read`) identifica o operador do Evydência CRM via token Sanctum pessoal.
   - O OAuth da Z-API autoriza a instância WhatsApp escolhida exclusivamente para aquele `operatorId`.
   - Zero compartilhamento de tokens entre operadores: cada registro em `EVYD_ZAPI_STORE_PATH` (`/var/lib/evydencia-mcp/zapi-oauth.enc.json`, permissão `0600`, diretório `0700`) é cifrado com AES-256-GCM usando subchave HKDF dedicada (`zapi-store-v1`) e AAD vinculado ao operador (`zapi-op-v1:<operatorId>`).
2. **Fluxo navegador seguro (`/zapi/connect` -> `/zapi/oauth/callback` / `/zapi/disconnect`):**
   - `zapi_status_conexao` emite um link curto assinado (`zlk`, 15 min) vinculado ao `operatorId` já autenticado no ChatGPT (sem exigir redigitação do Sanctum a cada envio).
   - `GET /zapi/connect?ticket=...` exibe página de confirmação imune a bots de *link preview*; somente `POST /zapi/connect` consome/inicia PKCE `S256` + `state` anti-replay (`zst`) e redireciona à Z-API.
   - `POST /zapi/disconnect` remove os tokens cifrados do operador, encerra a sessão MCP upstream em cache e notifica `tools/list_changed`.
3. **Pool de Sessões MCP Upstream e Proteção Técnica:**
   - `@modelcontextprotocol/client@2.4.0` (`Client` + `StreamableHTTPClientTransport`) mantém sessão conectada reutilizável por `operatorId` com TTL de ociosidade e renovação automática de `refresh_token`.
   - Apenas as **9 capacidades oficiais documentadas da Z-API** (`send_text`, `send_image`, `send_video`, `group_create`, `group_add_participant`, `group_remove_participant`, `group_add_admin`, `group_remove_admin`, `group_metadata`) são mapeadas para nomes estáveis prefixados (`zapi_*`) com `inputSchema` oficial preservado via `fromJsonSchema`. Qualquer ferramenta futura não homologada é registrada como ignorada, nunca exposta silenciosamente.
   - Sem cotas comerciais artificiais nem janelas de espera comerciais; apenas deduplicação técnica de curta duração contra duplo disparo acidental em voo / repetição imediata e **proibição estrita de reenvio automático** após timeout ou queda ambígua de rede.
   - Estados distintos de autorização (`authorized`, `authorization_required`, `expired`, `revoked`, `unavailable`) separados da conectividade real do WhatsApp (`not_verifiable_via_official_mcp` salvo adaptador REST opcional configurado no servidor).

---

## 3. Catálogo Real Descoberto Pós-OAuth (`tools/list`)

> Inicialmente `AUTH_REQUIRED` antes do vínculo OAuth em produção; atualizado na homologação real (FASE 7/8) com os nomes JSON-RPC exatos retornados pelo servidor oficial `https://mcp.z-api.io/mcp`.
