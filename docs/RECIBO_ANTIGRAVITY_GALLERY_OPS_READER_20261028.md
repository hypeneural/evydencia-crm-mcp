# Recibo de Homologação em VPS — Leitor Canônico Gallery Ops Natal 2026

**Data:** 28/10/2026  
**Status:** **GO (Operacional em Produção)**  
**Escopo:** `hypeneural/evydencia-crm-mcp`, PR #16, branch `feat/gallery-ops-canonical-reader-20261028`  
**Host:** VPS MCP (`185.241.151.207`)

---

## 1. Topologia e Serviços Implantados

- **Worktree Dedicado:** `/opt/evydencia-mcp/gallery-ops` (branch `feat/gallery-ops-canonical-reader-20261028` no commit `fef258dc59b1f25966903329422278debf05d4fc`).
- **Serviço Systemd Isolado:** `/etc/systemd/system/evydencia-gallery-ops-reader.service`
  - Usuário: `evydmcp`
  - Escuta: `127.0.0.1:4196` (estritamente loopback privado).
  - Executável: `/opt/evydencia-mcp/.node22/bin/node scripts/start-gallery-ops-reader.mjs`.
  - Arquivo de Ambiente: `/etc/evydencia-mcp/gallery-ops.env` (permissão `0600`).
- **Bridge Canônico CRM:** `scripts/crm-natal-bridge.php` em modo `gallery.ops.valid_orders`.
  - Executa `NatalValidOrdersQuery::validNatalOrders()` canônica.
  - Subprocesso STDIN/STDOUT isolado, sem injeção de shell.
  - Conexão MySQL e Redis sob restrições estritas de **Read-Only**.
  - O gateway principal `evydencia-crm-mcp-live.service`, o PrintServer e o Z-API permanecem intactos.

---

## 2. Túnel Privado Seguro

- **Serviço:** `/etc/systemd/system/evydencia-gameplay-tunnel.service`
- **Configuração:** Encaminhamento reverso `-R 172.18.0.1:4196:127.0.0.1:4196` para a bridge interna do Docker na VPS Gameplay (`169.58.210.14`).
- **Segurança:** Porta 4196 não exposta na internet pública (apenas interfaces internas e filtrada por firewall UFW).

---

## 3. Evidências de Paridade Comercial Canônica

Confronto executado no timestamp `as_of: 2026-10-28 02:55:04`:

- **Consulta direta no Laravel CRM (`NatalValidOrdersQuery::validNatalOrders`):** 104 pedidos válidos.
- **Resposta do Leitor Canônico (`POST /internal/v1/gallery-ops/valid-orders`):** 104 pedidos válidos.
- **Paridade: 100% (zero divergência).**

---

## 4. Testes de Segurança

- `POST /internal/v1/gallery-ops/valid-orders` sem Bearer → **HTTP 401 Unauthorized**.
- `GET /internal/v1/gallery-ops/valid-orders` → **HTTP 405 Method Not Allowed**.
- Respostas com `Cache-Control: private, no-store, max-age=0, must-revalidate`.
- Zero vazamento de PII em logs de processo, syslog ou shell.

---

## 5. Procedimento de Rollback

```bash
# Na VPS MCP (185.241.151.207)
systemctl stop evydencia-gallery-ops-reader
systemctl disable evydencia-gallery-ops-reader
```
