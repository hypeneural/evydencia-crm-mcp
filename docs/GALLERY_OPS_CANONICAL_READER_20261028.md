# Gallery Ops Natal 2026 — contrato privado sem alterações do Laravel

**Escopo:** branch `feat/gallery-ops-canonical-reader-20261028`; nova linha de trabalho separada da PR #14 de links e da PR #12 de PrintServer.

## Fonte canônica

`scripts/crm-natal-bridge.php` aceita exclusivamente o modo `gallery.ops.valid_orders`. Ele usa o MESMO `NatalValidOrdersQuery::validNatalOrders($asOf, 2026-01-01, 2027-01-01, 'natal')` já implantado, sem duplicar regras de pagamento/status ou gerar mutações. A execução usa proteção MySQL READ ONLY e proxy Redis READ ONLY herdados do bridge.

Entrada via **STDIN** do subprocesso PHP:

```json
{"mode":"gallery.ops.valid_orders","limit":200,"after_id":0}
```

No primeiro retorno, guardar `as_of` (RFC3339 com offset) e passá-lo INALTERADO nas páginas seguintes. `next_cursor` é o último `order_id` já retornado; `null` significa fim. Checar que a soma das páginas coincide com `total_valid`. Não confundir com contagem bruta de `product_slug=natal` nem com a auditoria status 10/12.

Contrato de saída:

```json
{
  "schema_version": 1,
  "source": "crm_canonical_valid_natal_orders",
  "year": 2026,
  "as_of": "2026-10-28T10:00:00-03:00",
  "total_valid": 1,
  "items": [{
    "order_id": 1001,
    "order_uuid": "11111111-1111-4111-8111-111111111111",
    "customer_name": "Família SINTÉTICA",
    "customer_whatsapp": "5548999000000",
    "customer_phone": null,
    "customer_email": "familia.sintetica@example.invalid",
    "package_name": "Pacote exemplo",
    "status_key": "session_schedule",
    "created_at": "2026-10-20T12:00:00-03:00",
    "session_at": "2026-10-30T15:00:00-03:00"
  }],
  "next_cursor": null,
  "has_more": false
}
```

Na projeção administrativa entram **nome, WhatsApp, telefone alternativo e e-mail do titular cadastrado**, sujeitos a autenticação e autorização do gestor. Não entram CPF, crianças/participantes, endereço, dados bancários, URL capability ou mídia. Não registrar dados nominais em logs. Os nomes são PII administrativa, portanto não usar cache compartilhado, CDN ou respostas públicas.

## Serviço interno dedicado

`src/gallery-ops-reader.mjs`, executado por `npm run gallery-ops:reader`:
- `POST /internal/v1/gallery-ops/valid-orders`, JSON, Bearer de 32+ caracteres; todos os outros caminhos dão 404.
- Bind estrito `127.0.0.1:4196` por padrão. Para outra VPS, transportar somente por túnel privado (e.g. SSH loopback), **não** abrir 0.0.0.0 e não publicar no Caddy público.
- Segredo `GALLERY_OPS_READER_SECRET` exclusivo, distinto do bearer do Gameplay e das credenciais CRM.
- Entrada limitada a 1 KiB; timeout PHP 20 s; stdout 256 KiB, erros genéricos, sem PII em logs, sem subprocesso shell, sem segredo no argv.
- Sem nova ferramenta MCP pública nem modificações de `live-gateway.mjs`, `PrintServer`, `Z-API` ou `OAuth` existente.
- `GALLERY_OPS_READER_PORT` opcional; processo systemd separado do gateway operacional.

## Gates antes de ativação

```sh
node --check src/gallery-ops-reader.mjs
node --check scripts/start-gallery-ops-reader.mjs
php -l scripts/crm-natal-bridge.php
npm run gallery-ops:test
npm run check
npm test
```

Canário real: autenticação no BFF do Gameplay, consulta de todas as páginas e paridade pelo **mesmo asOf**, 401 sem Bearer no endpoint local, nenhuma rota pública do reader, 404 de ordem não elegível, logs sem PII, rollback = parar APENAS o processo `gallery-ops-reader`. Sem fazer deploy do gateway MCP principal.

**Estado:** implementação de código para PR Draft. Não prova acesso real, servidor ativo ou paridade LIVE até execução explícita.

## Ampliação autorizada de identificação dos clientes

O modo privado de Gallery Ops inclui também `customer_whatsapp` (preferencialmente normalizado em `whatsapp_e164`), `customer_phone` e `customer_email`, derivados da mesma linha do titular em `customers`. O cliente e o pedido devem continuar vinculados por `o.customer_id=c.id`. Esses campos são PII **somente para gestor autenticado**, nunca disponíveis em MCP público, logs de subprocesso ou leitor de catálogo. Sem CPF, endereço, datas de nascimento ou participantes. A UI usa contatos para localizar pedidos, não para disparar WhatsApp.

A data de criação do pedido é interpretada com o timezone efetivo `config('app.timezone')` do Laravel antes da apresentação em America/Sao_Paulo, sem impor UTC a timestamps do banco.
