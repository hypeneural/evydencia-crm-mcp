# RECIBO DE HOMOLOGAÇÃO — ETAPA 7: HOTFIX MCP INDIVIDUAL 409
**Data de Emissão:** 28 de Outubro de 2026 (01:20 BRT / 04:20 UTC)  
**Ambiente Alvo:** VPS Evydência CRM `185.241.151.207` (`evydencia-prod`)  
**Media VPS (`169.58.210.14`):** **100% INTACTA** (reader `dd9788e` inalterado)  
**Executor:** Antigravity (Local Avell Windows 11)  
**Documentos Canônicos:**  
- `docs/AUDITORIA_FORENSE_CHATGPT_LIVE_ETAPA6_20261028.md`  
- `docs/PROMPT_ANTIGRAVITY_ETAPA7_MCP_409_20261028.md`  

---

## 1. RESUMO EXECUTIVO

O hotfix cirúrgico do Gateway MCP LIVE foi **implantado com sucesso em rodada única** na VPS `185.241.151.207`, resolvendo o erro `gameplay_http_409` nas consultas individuais de `crm_gameplay_links`.

- **Backup Seguro Criado:** `/opt/evydencia-mcp/app.backup-20261028_041636Z-e872fac`
- **Commit Anterior:** `e872fac8aa0d5281ceb4ac66ba979ff0aad7293e`
- **Commit Implantado:** `4d9271a8e93ed356c3e40722182b07a0b43d184f` (PR #14)
- **Branch Ativa:** `integration/live-35tools-gameplay-reconciled-20261027`
- **Unit Systemd:** `evydencia-crm-mcp-live.service` (ativo e saudável, PID 845371)
- **Inventário de Ferramentas:** 35 ferramentas ativas / 37 catalogadas (PrintServer, Z-API, OAuth e CRM 100% preservados)
- **Regressão 409 no Host:** `test/gameplay-links.test.mjs` obteve **7 de 7 testes aprovados** no ambiente de produção.
- **Media VPS Preservada:** A Media VPS `169.58.210.14` não sofreu qualquer alteração nesta etapa; o reader `dd9788e` permaneceu intacto.

---

## 2. INVENTÁRIO DE COMMITS E STATUS DO REPOSITÓRIO

| Componente | Host / VPS | Commit SHA Anterior | Commit SHA Atual | Status CI GitHub |
| :--- | :--- | :--- | :--- | :--- |
| **MCP LIVE Gateway** | `185.241.151.207` (`/opt/evydencia-mcp/app`) | `e872fac` | `4d9271a` | **PASS** (test 29s, test 34s, validate 23s) |
| **Media VPS Reader** | `169.58.210.14` (`/srv/runtime/...`) | `dd9788e` | `dd9788e` (Inalterado) | **PASS** |
| **SmartDialer Wrapper** | `169.58.210.14` (`/usr/local/sbin/stackctl`) | `c4048e1` | `c4048e1` (Inalterado) | N/A |

---

## 3. COMPROVAÇÃO DE IMPLANTAÇÃO NA VPS MCP (`185.241.151.207`)

### 3.1 Backup Pré-Deploy
```text
/opt/evydencia-mcp/app.backup-20261028_041636Z-e872fac
```

### 3.2 Atualização de Código
```text
branch 'integration/live-35tools-gameplay-reconciled-20261027' set up to track 'origin/integration/live-35tools-gameplay-reconciled-20261027'.
Switched to a new branch 'integration/live-35tools-gameplay-reconciled-20261027'
HEAD atual do app: 4d9271a8e93ed356c3e40722182b07a0b43d184f
```

### 3.3 Verificação de Sintaxe (`npm run check`)
- Executado via `runuser -u evydmcp`: **Código 0** (todos os módulos `.mjs` e lint PHP validados sem erros).

### 3.4 Status da Unit Systemd
```text
● evydencia-crm-mcp-live.service - Evydencia CRM MCP Live Gateway (OAuth 2.1 + Official Z-API MCP Bridge)
     Loaded: loaded (/etc/systemd/system/evydencia-crm-mcp-live.service; enabled; preset: enabled)
     Active: active (running) since Wed 2026-10-28 01:17:25 -03; 2s ago
   Main PID: 845371 (node)
      Tasks: 11 (limit: 28792)
     Memory: 46.5M (peak: 47.3M)
        CPU: 1.094s
     CGroup: /system.slice/evydencia-crm-mcp-live.service
             └─845371 /opt/evydencia-mcp/.node22/bin/node /opt/evydencia-mcp/app/scripts/start-gateway.mjs
```

---

## 4. TELEMETRIA E SAÚDE DO SERVIÇO PÓS-HOTFIX

### 4.1 Endpoint `/healthz` Local
```json
{
  "ok": true,
  "service": "evydencia-crm-mcp-live",
  "version": "0.12.0",
  "build_commit": "4d9271a",
  "repository_branch": "integration/live-35tools-gameplay-reconciled-20261027",
  "zapi_mcp_enabled": true,
  "zapi_diagnostics_enabled": true,
  "mcp_ui_apps_enabled": true,
  "printserver_enabled": true,
  "telemetry_summary": {
    "calls_total": 0,
    "error_rate": 0,
    "cache_hit_rate": null,
    "gateway_p50_ms": null,
    "gateway_p95_ms": null
  }
}
```

### 4.2 Endpoint RFC 9728 (`/.well-known/oauth-protected-resource/mcp`)
```json
{
  "resource": "https://mcp-crm.etijucas.com.br/mcp",
  "authorization_servers": ["https://mcp-crm.etijucas.com.br"],
  "scopes_supported": [
    "crm.read",
    "crm.proposal.write",
    "print.jobs.write",
    "zapi.message.send",
    "zapi.group.manage"
  ],
  "resource_name": "Evydência CRM (operador autenticado)"
}
```

---

## 5. RESULTADOS DO TESTE DE REGRESSÃO NO HOST DE PRODUÇÃO

Execução de `node --test test/gameplay-links.test.mjs` no host `185.241.151.207`:

```text
TAP version 13
ok 1 - main and games hub refer to the actual shared Gameplay route
ok 2 - private metadata-only 409 returns status with no fabricated links
ok 3 - authorization and upstream downtime fail closed (no metadata retry)
ok 4 - mismatched gallery token or revoked link is rejected
ok 5 - when published client URLs exist, no second network call
ok 6 - a metadata retry failing remains an error rather than becoming not_found
ok 7 - live reader 409 still returns individual operator metadata without any customer URL
1..7
# tests 7
# pass 7
# fail 0
# duration_ms 201.956973
```

O teste **7** comprova diretamente no ambiente que o retorno HTTP 409 do reader é convertido em `customer_links_status='unavailable_http_409'` sem falhar a consulta do operador e sem expor qualquer URL.

---

## 6. MATRIZ DE CRITÉRIOS DE SUCESSO & HANDOFF CHATGPT

- [x] **Deploy Único:** Executado com backup e restart seletivo na VPS MCP.
- [x] **Media VPS Intacta:** Zero comandos executados na Media VPS; catalog-reader mantido no SHA `dd9788e`.
- [x] **Build Atualizado:** Build commit `4d9271a` confirmado no `/healthz`.
- [x] **35 Ferramentas Ativas:** PrintServer (`crm_previa_malotes_retirada`, `crm_solicitar_impressao_etiqueta`, `crm_consultar_impressao_etiqueta`) e Z-API intactos.
- [x] **Tratamento 409 Ativo:** `lookupGameplayWithCustomerLinks` operacional.
- [x] **Salvaguardas Mantidas:** Zero mensagens WhatsApp, zero fotos de clientes liberadas, zero alteração no CRM ou SQLite.

---

## 7. PRÓXIMAS CONSULTAS NO CHATGPT LIVE

O ChatGPT pode agora rodar as seguintes verificações na conversa:

1. **`crm_capacidades(verificar_gameplay=true)`**  
   - Esperado: `commit=4d9271a`, `35/37` ferramentas, `private_contract_ok=true`.
2. **`crm_gameplay_links(order_id=5093)`**  
   - Esperado: HTTP 200 com status do pedido, fotos, `customer_links_status='unavailable_http_409'`, **sem URLs de cliente**.
3. **`crm_gameplay_links(order_id=5058)`**  
   - Esperado: HTTP 200 com `no_gameplay_session`.
4. **`crm_gameplay_links(order_id=5068)`**  
   - Esperado: HTTP 200 com `access_revoked`.
5. **`crm_gameplay_auditoria(incluir_publicados=true, limite=50)`**  
   - Esperado: Auditoria agregada dos 22 pedidos de status 10/12, zero URLs.
6. **`crm_estatisticas_natal(perfil_resposta='kpi_minimal')`**  
   - Esperado: Retorno comercial canônico independente da auditoria 10/12.
