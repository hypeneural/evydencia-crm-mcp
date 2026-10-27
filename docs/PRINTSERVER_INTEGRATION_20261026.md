# Integração Evidência MCP → PrintServer independente

**Fase paralela sem alteração no Laravel.** Repositório remoto: https://github.com/hypeneural/printserver  
**Status (26/10/2026):** **Homologado, Ativo e Operacional em Produção** sob a PR #12.

---

## 1. Escopos, Tools e Responsabilidades

O módulo printserver está protegido pela flag `EVYD_PRINTSERVER_ENABLED=1`. Quando a flag está desabilitada, o catálogo de 30 ferramentas LIVE originais permanece idêntico. Quando ativada para operadores autorizados em `EVYD_PRINT_ALLOWED_OPERATOR_IDS`, 3 ferramentas adicionais são expostas:

- **OAuth Scope:** `print.jobs.write`, isolado de `crm.proposal.write` e de `crm.read`. O operador necessita de identidade Sanctum válida, inclusão em `EVYD_ALLOWED_OPERATOR_IDS` e também em `EVYD_PRINT_ALLOWED_OPERATOR_IDS`.
- **`crm_previa_malotes_retirada({order_ids:[...]})`:** **Read-only**; processa até 20 IDs numéricos (extraídos visualmente por foto no ChatGPT), retorna status, saldo e aptidão para impressão. Não realiza alterações no banco.
- **`crm_solicitar_impressao_etiqueta({order_id,confirmado_pelo_operador:true,request_id?})`:** Lê status e dados financeiros no CRM via bridge somente leitura; exige obrigatoriamente `status === 10` (`waiting_product_retrieve`) e `remaining_cents === 0`. Envia ao broker apenas `order_id`, nome do cliente, nome do pacote, operador e UUID de requisição. Resposta `queued` indica enfileiramento no broker.
- **`crm_consultar_impressao_etiqueta({order_id,job_id})`:** Consulta o estado do trabalho de impressão (`queued`, `spooled`, `failed`) no broker. O estado `spooled` indica entrega com sucesso ao spooler do Windows.

---

## 2. Deploy Realizado em Produção

1. **Broker PrintServer (VPS `185.241.151.207`):**
   - Serviço systemd dedicado `evydencia-printserver.service` ouvindo em `127.0.0.1:8097`.
   - Fila persistente em `/var/lib/evydencia-printserver/jobs.json`.
   - Proxy reverso em Nginx sob `https://mcp-crm.etijucas.com.br/v1/` com certificado SSL oficial e HSTS.
2. **Ambiente do Gateway Live MCP (`/etc/evydencia-mcp/gateway.env`):**
   ```bash
   EVYD_PRINTSERVER_ENABLED=1
   EVYD_PRINT_ALLOWED_OPERATOR_IDS=2,7
   EVYD_PRINTSERVER_URL=https://mcp-crm.etijucas.com.br
   EVYD_PRINTSERVER_MCP_TOKEN=<token_exclusivo_do_broker>
   ```
3. **Agente Windows (`AnnaHelena`):**
   - SumatraPDF 3.6.1 portátil oficial instalado em `C:\Evydencia\printserver\SumatraPDF.exe`.
   - Segredo local armazenado em `C:\Evydencia\printserver\agent-token.txt` com ACL restrita via `icacls`.
   - Tarefa agendada Windows `Evydencia - PrintServer LABEL` ativa no logon, realizando polling a cada 5s sem portas de escuta locais.

---

## 3. Bloqueio Consciente do Legado

A API legada `PUT /api/orders/status` **não compartilha as guardas financeiras e de concorrência do painel** e permanece desativada no MCP. A baixa por foto continua não implementada diretamente: o operador deve efetuar a baixa pelo modal Gestão/Malotes do CRM web; quando o status 10 estiver confirmado e o saldo quitado, o ChatGPT pode solicitar e enfileirar a etiqueta na impressora térmica.

---

## 4. Validação Técnica
```bash
node --check src/printserver-client.mjs
node --check src/oauth-gateway.mjs
node --check src/live-gateway.mjs
node --test test/printserver-client.test.mjs
```
Todos os testes unitários do bridge, falha fechada sem credenciais, rejeição de status diferente de 10 e comportamento de conflito 409 estão validados e aprovados no CI.
