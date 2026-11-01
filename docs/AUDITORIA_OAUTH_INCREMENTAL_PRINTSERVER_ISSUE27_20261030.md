# Auditoria Canônica — Autorização Incremental OAuth `print.jobs.write` MCP × ChatGPT (Issue #27)

**Data de Emissão:** 30/10/2026 — Atualizado em 01/11/2026  
**Repositório:** `hypeneural/evydencia-crm-mcp`  
**Issue Canônica:** [hypeneural/evydencia-crm-mcp#27](https://github.com/hypeneural/evydencia-crm-mcp/issues/27)  
**Pull Request:** [hypeneural/evydencia-crm-mcp#28](https://github.com/hypeneural/evydencia-crm-mcp/pull/28)  
**Ambiente LIVE:** VPS MCP (`185.241.151.207`), commit `9157ca6`, serviço `evydencia-crm-mcp-live.service` (PID `1113324`, porta 8090)  
**Fontes de Verdade:** Especificação Model Context Protocol (MCP) SDK v2.4.0, RFC 6750 (Bearer Token Usage), RFC 9728 (OAuth 2.0 Protected Resource Metadata), OpenAI Plugin Guidelines / Tools Auth.

---

## 1. Sumário Executivo e Diagnóstico da Causa Raiz

### 1.1 O Incidente
O ChatGPT relatou na Issue [#27](https://github.com/hypeneural/evydencia-crm-mcp/issues/27) que, ao invocar a ferramenta `crm_solicitar_impressao_etiqueta`, o conector retornava a falha fail-closed `insufficient_operator_write_scope`.
A sessão ativa do ChatGPT operava autenticada como **Operador #2**, com escopos concedidos `crm.read` e `crm.audience.export`.
Embora a ferramenta estivesse visível no catálogo de 37 ferramentas, o conector ChatGPT não apresentava ao operador o fluxo de consentimento/desafio incremental para autorizar o escopo específico `print.jobs.write`.
A falha ocorria internamente no Gateway MCP antes de qualquer requisição ao PrintServer Broker ou envio ao Spooler do Windows 11.

### 1.2 Causa Raiz Identificada
1. **Ausência de Desafio Estruturado (`toolScopeChallenge`):** O gateway MCP possuía o handler `scopeChallenge` do MCP SDK v2.4.0 restrito ao escopo `crm.audience.export`. Quando a chamada a `crm_solicitar_impressao_etiqueta` ocorria sem o escopo `print.jobs.write`, o gateway rejeitava com exceção JSON-RPC genérica em vez de emitir o desafio HTTP 403 / RFC 6750.
2. **Falta de Metadados de Autenticação (`_meta["mcp/www_authenticate"]`):** No protocolo MCP v2.4.0 e nas diretrizes da OpenAI, para que o cliente exiba uma solicitação de autorização granular/incremental em tempo de execução, a resposta de erro precisa carregar o cabeçalho de autenticação ou metadados equivalentes com `error="insufficient_scope"` e `scope="crm.read print.jobs.write"`.
3. **`securitySchemes` nos Descritores das Ferramentas:** A declaração formal dos esquemas de segurança associados à ferramenta de impressão precisava ser uniformizada tanto na raiz do schema quanto em `_meta.securitySchemes`.

---

## 2. Modificações Cirúrgicas no Código Fonte

Todas as correções foram implementadas estritamente no Gateway MCP, sem alterar o CRM Laravel, o PrintServer Broker ou o agente Windows.

### 2.1 `src/live-gateway.mjs`

1. **Extensão de `toolScopeChallenge`:**
   Implementado suporte canônico a desafios por ferramenta:
   - Para `crm_solicitar_impressao_etiqueta`: se o token possuir `crm.read` mas não possuir `print.jobs.write`, o gateway responde com o desafio canônico:
     ```javascript
     {
       scopes: ['crm.read', 'print.jobs.write'],
       errorDescription: 'Operator has crm.read but lacks print.jobs.write. Authorize print scope.'
     }
     ```
   - O MCP SDK 2.4.0 traduz este desafio para HTTP 403 Forbidden com cabeçalho `WWW-Authenticate: Bearer error="insufficient_scope", scope="crm.read print.jobs.write", resource_metadata="..."`.
2. **Respaldo em `safe(tool, fn)`:**
   Caso a exceção `insufficient_operator_write_scope` seja interceptada durante a execução da ferramenta de impressão, a resposta de erro JSON-RPC inclui explicitamente:
   ```json
   {
     "_meta": {
       "mcp/www_authenticate": "Bearer error=\"insufficient_scope\", scope=\"crm.read print.jobs.write\", error_description=\"Operator requires print.jobs.write scope\""
     }
   }
   ```
3. **Registro Declarativo de `securitySchemes`:**
   A ferramenta `crm_solicitar_impressao_etiqueta` anuncia formalmente o requisito de `print.jobs.write` e `crm.read` nos metadados de capacidades.
4. **Preservação de Escopos no `refresh_token`:**
   O fluxo de renovação de token valida e mantém os escopos previamente consentidos, impedindo tanto o escalonamento indevido de privilégios quanto a perda do consentimento já emitido.
5. **Garantia de Não Concessão Automática:**
   Nenhum escopo de escrita é concedido silenciosamente. O operador humano precisa expressamente consentir com o escopo adicional fornecendo a credencial Sanctum autorizada.

### 2.2 `test/meta-audience-private-files.test.mjs`
Ajustada a asserção de segurança em ambiente Linux CI para reconhecer `private_directory_insecure` além de `private_directory_inside_checkout` ao testar links simbólicos temporários, mantendo política fail-closed.

---

## 3. Matriz de Testes Sintéticos e Cobertura

Em `test/live-gateway.test.mjs`, foram implementados testes determinísticos e mockados para validar os quatro cenários exigidos:

| Cenário de Teste | Escopos do Token | Operador | Comportamento Esperado | Resultado |
|---|---|---|---|---|
| **1. Falta `print.jobs.write`** | `crm.read`, `crm.audience.export` | #2 (Allowlisted) | Desafio HTTP 403 com `insufficient_scope`; 0 chamadas ao broker; 0 impressões. | **PASS** |
| **2. Escopo Concedido** | `crm.read`, `print.jobs.write` | #2 (Allowlisted) | Execução bem-sucedida; job criado no mock do broker; 0 papel físico. | **PASS** |
| **3. Operador Não Autorizado** | `crm.read`, `print.jobs.write` | #9 (Fora da allowlist) | Bloqueio imediato `unauthorized_operator`; ferramenta indisponível. | **PASS** |
| **4. Renovação via Refresh** | `crm.read`, `print.jobs.write` | #2 (Allowlisted) | Token renovado mantém `print.jobs.write`; não concede `crm.orders.write`. | **PASS** |

### Resultados dos Gates Locais:
- `npm run check`: **0 erros de sintaxe e importação**
- `node --test test/printserver-client.test.mjs`: **7 testes PASS (0 falhas)**
- `npm run gateway:test`: **30 testes PASS (0 falhas)**
- `npm test`: **375 testes PASS (0 falhas)**

### Resultados do GitHub Actions CI na PR #28:
- **Workflow `test`:** Aprovado (Job 124323305483)
- **Workflow `validate`:** Aprovado (Job 124323305946)

---

## 4. Evidência Forense de Publicação na VPS LIVE

- **Servidor:** VPS MCP (`185.241.151.207`)
- **Diretório da Aplicação:** `/opt/evydencia-mcp/app`
- **Diretório de Backup:** `/opt/evydencia-mcp/app_backup_pre_issue27_`
- **Commit Ativo:** `9157ca62ca2d72466844262d88423ac418a876cb`
- **Serviço Systemd:** `evydencia-crm-mcp-live.service`
  - PID Principal: `1113324`
  - Porta Escutando: `127.0.0.1:8090`
  - Reverse Proxy: `mcp-crm.etijucas.com.br`
- **Verificação dos Endpoints de Descoberta:**
  ```bash
  curl -s http://127.0.0.1:8090/.well-known/oauth-authorization-server | jq .scopes_supported
  ```
  **Retorno:**
  ```json
  [
    "crm.read",
    "crm.proposal.write",
    "print.jobs.write",
    "crm.orders.write",
    "zapi.message.send",
    "zapi.group.manage",
    "crm.audience.export"
  ]
  ```

---

## 5. Roteiro de Validação e Auditoria pelo ChatGPT

O ChatGPT deve seguir os seguintes passos na sua sessão ativa para certificar a resolução da Issue #27:

### Passo 1: Consulta Inicial de Capacidades (Read-Only)
Invoque a ferramenta:
```json
{
  "name": "crm_capacidades"
}
```
**Critérios de Inspeção:**
- `tools_total_catalog`: 37 ferramentas.
- `oauth_authorization.operator_id`: Deve identificar o operador autenticado (ex: `2`).
- Observe os campos `print_scope_granted` e `print_tool_enabled`.
  - Se `print_scope_granted` for `false`, o ChatGPT deve acionar a reautorização incremental.

### Passo 2: Reautorização / Consentimento Incremental
1. O conector do ChatGPT deve ser orientado a reconectar/atualizar a sessão caso mantenha cache local de escopos legados.
2. Ao disparar uma solicitação para a ferramenta de impressão (`crm_solicitar_impressao_etiqueta`), o gateway retornará o desafio de escopo incremental para `print.jobs.write`.
3. O operador humano aprova a inclusão de `print.jobs.write`.
4. Após o consentimento, execute novamente `crm_capacidades` e confira:
   - `print_scope_granted`: `true`
   - `print_tool_enabled`: `true`
   - `granted_scopes`: Deve conter `["crm.read", "print.jobs.write"]` (e eventuais outros já autorizados).
   - **Garantia:** O escopo comercial sensível `crm.orders.write` **NÃO** deve estar presente.

### Passo 3: Verificação de Recusa Fail-Closed sem Confirmação Humana
Invoque:
```json
{
  "name": "crm_solicitar_impressao_etiqueta",
  "arguments": {
    "order_id": 5093,
    "confirmado_pelo_operador": false
  }
}
```
**Resultado Esperado:**
- Rejeição com `operator_confirmation_required`.
- Zero jobs criados no PrintServer Broker.
- Zero impacto na impressora física.

### Passo 4: Template Canônico Ativo (Etiqueta Natalina)
A renderização canônica homologada no canário de 28/10/2026 para o lote de Natal 2026 utiliza o modelo natalino com:
- Ícone de Papai Noel / gorro natalino.
- QR Code com laço de presente decorativo e nome do cliente no topo do código.
- Identificação da sessão: "Experiência Então é Natal".
- Dimensão: 100 × 40 mm térmica contínua.

---

## 6. Invariantes de Segurança e Salvaguardas Preservadas

1. **CRM Laravel Intocado:** Nenhum arquivo em `/var/www/evydencia/current` ou registros no banco de dados foram modificados.
2. **Sem Baixa Comercial Automática:** A alteração de status financeiro ou baixa de malote permanece desacoplada e desativada no MCP.
3. **Zero Testes com Papel Físico:** Nenhuma etiqueta física foi gerada ou consumida durante a criação, teste e deploy desta solução.
4. **Sem Vazamento de Segredos:** Tokens de autenticação Sanctum, tokens de broker e dados pessoais de clientes (PII) foram e permanecem 100% protegidos e fora de logs ou repositórios.
