# MVP Natal sem editar Laravel — execução e gates (25/10/2026)

**Escopo implementado somente em** `hypeneural/evydencia-crm-mcp`. O repositório privado `hypeneural/evydencia-crm` foi consultado em main `9749cc09f06104103e08abef8576d8c7c2dc1fab`, SEM edição, deploy, migração ou SQL de produção. O MCP stdio ChatGPT permanece **100% MOCK e anônimo**.

## Entregáveis já implementados
| Componente | Caminho | Prova |
|---|---|---|
| Exportador CLI independente (fora do Laravel) | `tools/export-natal-digest.php` | `php -l` + `--help` no CI; execução LIVE requer aprovação explícita |
| Validador de agregados privados | `src/natal-digest-snapshot.mjs` | Testes de source, datas, R$ centavos, janelas YTD e vazamento de PII |
| Verificador CLI local | `scripts/check-private-snapshot.mjs` | Bloqueia snapshots inválidos, velhos, com permissão aberta ou dentro do repo |
| Interpretação status operacional | `src/order-readiness.mjs` | Status `waiting_product_retrieve` vs `product_retrieve_confirmed` e ambiguidades |
| Gate Windows | `scripts/validate-mvp.ps1` | Testes MCP + PHP CLI parse/help, zero SQL |
| Testes | `test/natal-digest-snapshot.test.mjs`, `test/order-readiness.test.mjs` | Incluídos em `npm test` e GitHub Actions |

## 1. Antigravity — executar AGORA, sem credenciais

Abra um PowerShell na raiz do clone MCP:

```powershell
git status --short
git fetch origin
git pull --ff-only origin main
.\scripts\validate-mvp.ps1
```

**Se houver diff local em `scripts/go.ps1`, preserve o arquivo**; não faça reset/clean nem force pull. Se houver conflito, reporte. `validate-mvp.ps1` é novo e independe de `go.ps1`. Deve finalizar com **GO_MVP_OFFLINE**. Sem consulta à infraestrutura do CRM.

```powershell
node scripts/tunnel-ready.mjs
```

Esse último diagnóstico é opcional e verifica apenas o Tunnel MOCK já existente. NÃO reiniciar daemon saudável, NÃO habilitar live no Tunnel anônimo.

## 2. Exportação agregada real — SOMENTE APÓS autorizar operação e testar carga

O método do CRM `App\Services\Reports\NatalValidOrdersQuery::getSeasonDigestMetrics()` já calcula vendas canônicas e comparativos 2022–2026 na mesma janela **01/08 a data equivalente de corte** de cada ano. Ele retorna contracted/received/balance em **centavos** e `data_status_2025`; default histórico pode ser `UNCONFIRMED`. O arquivo PHP independente executa *o método existente* através do bootstrap/ConsoleKernel Laravel: nenhuma linha PHP é adicionada ao CRM.

Antes de executar em um servidor com CRM real: confirmar PHP 8.3+, composer/vendor, app env correto, MySQL, autorização administrativa, impacto da consulta, disponibilidade de CPU e conta DB apropriada. Não executar automaticamente por cron sem medir latência, EXPLAIN/índices e carga. O bootstrap Laravel pode ter comportamento dependente do ambiente; não afirmar zero efeito operacional sem homologação.

Crie uma pasta privada FORA de qualquer Git, public_html e da raiz do CRM, com ACL NTFS (Windows) ou permissão 0700 (Linux). Nunca use .env/tokens no prompt. Após aprovação, o exemplo ilustrativo é:

```powershell
php tools\export-natal-digest.php --crm-root=C:\Caminho\AUTORIZADO\evydencia-crm --output=C:\ProgramData\Evydencia\private\natal-2026.json
npm run snapshot:inspect -- --file=C:\ProgramData\Evydencia\private\natal-2026.json
```

O `--crm-root` precisa apontar ao Laravel **instalado, com vendor e configuração de banco adequados**, não apenas a um clone de código. A pasta de saída já precisa existir. O programa não publica valores no terminal, grava **apenas agregados** em JSON privado (0640 não é aceito no Linux; arquivo 0600), via arquivo temporário e rename. O esquema veta nome, telefone, CPF, participantes, pedidos individuais, SQL e outros campos inesperados.

O snapshot expira em **até 300 segundos**, então a cada uso sua atualidade deve ser confirmada. O inspetor não mostra valores comerciais em logs; apresenta apenas schema, fonte, idade e estado de confiança. **O arquivo NÃO fica acessível ao Plugin anônimo.**

### Significado dos principais campos
- `season.orders`: pedidos comerciais válidos na temporada **inteira até o instante de corte**, não somente desde agosto.
- `comparison.years['2026'].orders` versus `['2025'].orders`: comparação **01/08 → dia/hora equivalentes** em cada ano. Não comparar `season.orders` com a janela de 2025.
- `comparison.years['2025'].data_status`: se `UNCONFIRMED` ou `DATA_UNAVAILABLE`, não afirmar variação percentual/crescimento auditado; o leitor devolve delta nulo.
- `financial_status=RECORDED_GROSS`: recebido bruto registrado; **não** equivale a conciliação líquida/bancária. `UNCONFIRMED` deve ser explicitado.
- `source=LIVE_MYSQL` + `is_live=true`: significa cálculo via método canônico sobre banco acessível; ainda é necessário conferir origem, consistência, data e autorização.
- `as_of` e `captured_at`: data de corte comercial e captura; não inferir que um snapshot antigo é uma resposta atualizada.

## 3. Consulta de cliente/status — código preparado sem acesso real
O Laravel já tem GET `/api/v1/extension/customer-context` e `/customer-360` com Sanctum `extension:customer-read`; `src/core.mjs` já implementa os adaptadores HTTP com allowlist, limites e projeção sem nomes/datas de nascimento de crianças. `src/order-readiness.mjs` interpreta **apenas** a projeção recebida, sem acesso SQL ou exposição de tool.

- Pedido operacional Natal de um cliente pode ter prioridade sobre o mais recente por criação; confirmar qual pedido o usuário quer.
- `waiting_product_retrieve` = pronto/aguardando retirada **somente quando pedido resolvido sem ambiguidade**.
- `product_retrieve_confirmed` = já entregue.
- `order_completed` isolado = **não comprova** prontidão nem retirada.
- Cliente ambíguo ou sem pedido Natal ativo → pedir identificação; não inferir do primeiro pedido de histórico.

**GO_CUSTOMER_READ exige** servidor MCP com OAuth 2.1 por operador, issuer/audience/expiry/scopes validados por ferramenta e Sanctum de leitura mínimo. A conexão anônima atual **não** pode consultar clientes reais. Não adicionar tools reais no servidor stdio atual.

## 4. Busca nominal e pedido geral
GET `/api/orders/search` existe, mas usa `SingleAuthentication` com token global que também acessa operações de escrita; NÃO reutilizá-lo. Se consulta por nome/status geral se tornar indispensável, criar **adaptador privado com consultas SQL fixas** em schema/view SELECT estritamente limitado, host restrito, TLS/SSH, limite de linhas e tempo, preferindo réplica. Nenhuma conexão SQL está implementada neste commit; aguarda topologia, grants e autorização.

## 5. Envio de propostas
O Laravel existente implementa POST `/api/v1/extension/proposals/preview` (pode acionar sonda de worker) e POST `/proposals/schedule`. Ações de envio via MCP permanecem **WRITE_GATED**. Implementar futuramente em gateway autenticado, com confirmação visível, `name` PRESENTE, `request_id` UUID estável gravado ANTES do POST, `X-Idempotency-Key` igual, `resend_mode=normal`, tratamento 200 replay, 201 novo, 409 conflito e timeout sem novo UUID. Não usar Z-API direta ou endpoint legado de campanha.

## 6. Classificação
- **GO_CI_MVP_OFFLINE:** lint PHP, contrato Node, 17 tools MOCK e smokes aprovados no GitHub Actions.
- **GO_LOCAL_MVP_OFFLINE:** `validate-mvp.ps1` aprovado no Windows.
- **GO_LIVE_SNAPSHOT_READ:** ainda não; depende de execução autorizada, snapshot válido e benchmark.
- **GO_CHATGPT_REAL:** ainda não; depende de OAuth 2.1 por operador, proteção de endpoints e autorização.
- **GO_SEND:** bloqueado; confirmação e journal não implementados.

Fontes: documentação oficial OpenAI Plugins/OAuth e Secure MCP Tunnel; docs Laravel 10 console; MySQL 8.4 permissões SELECT; Antigravity regras e hooks. Consulte `docs/MVP_PRODUCAO_SEM_ALTERAR_CRM_20261025.md` para a auditoria cruzada anterior.

## 7. Camada histórica congelável 2021–2025
O novo módulo `src/legacy-historical.mjs` e o CLI `scripts/import-legacy-history.mjs` validam somente os agregados dos calendários 366 dias/ano de `fotosdenatal-dados` privado. O processo normaliza valores para centavos, calcula janela 01/08 até MM-DD, registra SHA-256 do arquivo e marca `canonical_comparison_allowed:false` e `LEGACY_UNVERIFIED`. O histórico nunca é conectado automaticamente ao MCP anônimo. Ver `docs/FORENSE_LEGADO_NATAL_20261025.md`.
