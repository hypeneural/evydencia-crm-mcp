# Recibo de Homologação P0 — Etiqueta Natalina Canônica & Windows 11 (28/10/2026)

## 1. Escopo e Contexto
- **Repositório:** `hypeneural/evydencia-crm-mcp`
- **PR:** #19 (`fix/label-render-readonly-preflight-20261028`)
- **Objetivo:** Eliminar a falha real `crm_label_render_unavailable`, homologar a renderização da arte canônica natalina (Natal 2026) e fechar a integração ponta a ponta MCP Gateway → Nginx → PrintServer Broker → Windows 11 Agent → Impressora Térmica `LABEL`.

---

## 2. Causas Raízes Isoladas e Resoluções

### Causa Raiz 1: Monolog Permission Denied em Ambiente Out-of-Process
- **Sintoma:** Ao invocar `OrderLabelService::generate($uuid)` out-of-process via bridge PHP sob o usuário de serviço `evydmcp`, ocorria a exceção:
  `UnexpectedValueException: The stream or file "/var/www/evydencia/current/storage/logs/laravel-YYYY-MM-DD.log" could not be opened in append mode: Failed to open stream: Permission denied`.
- **Origem:** O arquivo de log do Laravel pertencia a `www-data:www-data` com modo `0644`. Qualquer `Log::warning(...)` disparado pelo resolver tentava gravar nesse log e colapsava o bridge no catch genérico.
- **Correção:** Configurado `config(['cache.default' => 'array', 'logging.default' => 'null']);` em `scripts/crm-label-render-bridge.php` e `scripts/diagnose-crm-label-render.php`.
- **Commit:** `eae6c8fa5f2a4891cd87d7ec13ffd08b61c46ad1`.

### Causa Raiz 2: Permissões de Storage e Fallback Silencioso para Template Genérico
- **Sintoma:** O primeiro teste físico impresso utilizou a moldura básica antiga (`background.jpg`), omitindo a arte natalina decorada (gorro de Papai Noel, flocos de neve, laço de presente sobre o QR code e faixa com primeiro nome do cliente em maiúsculas).
- **Origem:** O diretório `/var/www/evydencia/shared/storage/app/order-labels` estava com permissões `0700 www-data:www-data`. O usuário `evydmcp` (pertencente ao grupo `www-data`) recebia *Permission denied* ao checar a existência de `order-labels/products/{id}/natal-legacy-bkpbackground.jpg`. O Laravel acionava o fallback silencioso para `OrderLabelTemplate::fromConfig()`.
- **Correções Aplicadas:**
  1. *Host VPS:* Aplicado `chmod -R u=rwX,g=rwX /var/www/evydencia/shared/storage/app/order-labels` e `chmod g+s`.
  2. *Código MCP:* Inserida trava obrigatória *fail-closed* no bridge: se `$result->context->fallbackReason !== null`, o processo encerra imediatamente com erro explicativo (`crm_label_template_fallback_...`), impedindo qualquer emissão com template degradado.
  3. *Tratamento de Erros:* `src/crm-label-render.mjs` atualizado para propagar os códigos específicos de fallback.
- **Commit:** `8121b9311281cf73a51b9344b1e5c131e922afd2`.

---

## 3. Recibos de Validação no Ambiente de Produção (VPS)

### Diagnóstico PHP (`scripts/diagnose-crm-label-render.php`)
```json
{
  "source": "CRM_LABEL_READONLY_PREFLIGHT",
  "ok": true,
  "stage": "complete",
  "width_mm": 100,
  "height_mm": 40,
  "width_px": 1181,
  "height_px": 472,
  "render_source": "product",
  "png_bytes": 109165,
  "sha256": "2bc6718e7b99cc643c458cd882b67fba5d6256f7156ecbcbb884b7956b5400b2",
  "changes_applied": false,
  "print_job_created": false,
  "physical_print_verified": false
}
```

### Sonda da Ponte Node.js (`scripts/verify-crm-label-render-live.mjs`)
```json
{
  "source": "CRM_LABEL_NODE_READONLY_PROBE",
  "ok": true,
  "render_source": "crm_canonical",
  "png_bytes": 109165,
  "sha256_verified": true,
  "changes_applied": false,
  "broker_called": false,
  "job_created": false,
  "printed_physically": false
}
```

### Ingress Nginx (Payload Base64 de Alta Resolução)
- Inserido `client_max_body_size 8M;` sob `location /v1/` no arquivo `/etc/nginx/sites-available/mcp-crm.etijucas.com.br`.
- Testado e recarregado via `nginx -t && systemctl reload nginx`.

---

## 4. Recibos do Canário Físico Autorizado (Pedido 5058)

- **Pedido Canário:** `5058` (UUID `52b7a312-297b-42a9-986a-905e61276a7e`, pacote *Experiência Ho-Ho-Ho*, status 10, saldo R$ 0).
- **Template Aplicado:** Produto 1 (`natal-legacy-bkpbackground.jpg`) com todos os ornamentos festivos oficiais.
- **Job Enqueue:**
  - **Job ID:** `f146d063-9159-4703-b901-6a4a00cb8830`
  - **Origem:** `crm_canonical`
  - **Estado Inicial:** `queued`
- **Execução do Agente Windows 11:**
  - Captura do trabalho via `/v1/jobs/claim`
  - Spooling térmico enviado ao driver `LABEL` (100×40 mm, USB001)
  - ACK reportado em **4,52 segundos**: `state: spooled`
  - Spooler Windows: **0 trabalhos pendentes**.
- **Tombstones de Deduplicação:** `seen_arrival_orders: [999999, 5088, 5093, 5058]`.

---

## 5. Salvaguardas e Governança
- Zero alterações no código do Laravel CRM (`/var/www/evydencia/current`).
- Zero alteração no banco de dados (`SET SESSION TRANSACTION READ ONLY`).
- Flags comerciais de mutação mantidas desativadas (`EVYD_MALOTES_READY_WRITE_ENABLED=0`, `EVYD_MALOTES_BATCH_ENABLED=0`).
- Sem vazamento de dados pessoais (PII) ou credenciais em logs ou commits.
