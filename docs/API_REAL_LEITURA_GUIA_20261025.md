# API REAL do Evydência CRM — guia local e contrato de segurança (25/10/2026)

## Fontes verificadas
CRM Laravel main `9749cc09f06104103e08abef8576d8c7c2dc1fab`: `routes/extension-api.php`, `routes/api.php`, `OrderSearchRequest`, `OrderService::search`, `CustomerContextQuery`, `Customer360Query`, `ProposalPreviewController`, `NatalStatisticsController` e `NatalValidOrdersQuery`. Legado privado main `ff47f62326137b78eda981bb08f1bc784b16b5ab`.

**Este repositório MCP está PÚBLICO. NUNCA commitar token, respostas reais, dados de clientes, `.env.live.local` ou CSV de compradores.** Não compartilhar logs de ferramenta contendo dados sensíveis. CRM Laravel não foi modificado.

## 1. Família Sanctum da extensão: preferida para cliente
| Tipo | Endpoint verificado | Disponível no diagnóstico | Escopo do token |
|---|---|---|---|
| GET | `/api/v1/extension/bootstrap` | `CRM_PROBE_ACTION=bootstrap` | `extension:bootstrap` |
| GET | `/api/v1/extension/customer-context?phone=...` | `customer` | `extension:customer-read` |
| GET | `/api/v1/extension/customer-360?phone=...&page=1&per_page=5` | `history` | `extension:customer-read` |
| POST | `/api/v1/extension/proposals/preview` | `preview` (duplo opt-in) | `extension:proposal-read` |
| POST | `/api/v1/extension/proposals/schedule` | **NÃO IMPLEMENTADO** | `extension:proposal-write` |
| POST | `/api/v1/extension/proposals/{uuid}/abort` | **NÃO IMPLEMENTADO** | `extension:proposal-write` |

*Contexto JSON:* `data.lookup`, `data.customer`, `data.natal_2026`, `data.current_order`, `data.history`, `data.capabilities`.
*360 JSON:* `data.lookup`, `data.customer`, `data.kpis`, `data.current_order`, `data.natal_2026`, `data.history`, `data.orders`, `data.participants` (participantes sensíveis são descartados pelo MCP). Valores do 360 em REAIS decimais.
*Preview JSON:* `data.ready`, `data.phone_status`, `data.delivery_scope`, `data.message_preview`, `data.selection`, `data.summary`. A prévia pode acionar diagnóstico de worker mesmo sem enviar mensagem; não usá-la como ping.
*Bootstrap JSON:* `data.operator`, `data.token.abilities/expires_at`, `data.features`, `data.server`. O comando `extension:token:issue` do CRM concede **permissões de ESCRITA por padrão**; o diagnóstico detecta a presença delas no bootstrap, não as remove no Laravel.

## 2. Família legada sob SingleAuthentication: acesso GET isolado, chave poderosa
| Diagnóstico `CRM_PROBE_ACTION` | Endpoint GET existente |
|---|---|
| `orders` | `/api/orders/search` com slug Natal, período 2026, página 1 |
| `detail` | `/api/orders/{uuid}/detail` |
| `sold_items` | `/api/reports/sold-items` |
| `christmas_without_participants` | `/api/reports/christmas-orders-without-participants` |
| `buyers` | `/api/reports/customers-with-christmas-orders` |
| `non_buyers` | `/api/reports/customers-without-christmas-orders` |
| `campaign_schedule_search` | `/api/campaigns/schedule/search` |

A mesma chave de serviço acessa outras rotas de PUT/POST que alteram pedidos/disparam campanhas. **O fato de nosso adaptador usar apenas GET NÃO transforma a chave num token de leitura no CRM.** É proibido levar essa chave ao Plugin sem OAuth do usuário, e o diagnóstico exige `EVYD_ACK_LEGACY_WRITE_POWER=1`.

`OrderService::search` usa `paginate(200)`. O diagnóstico mostra apenas a ESTRUTURA dos primeiros cinco retornos, **não** os totais da empresa. `status.id` atual vai de 1 a 13; `waiting_product_retrieve=10` é aguardando retirada, `product_retrieve_confirmed=11` é entregue. `order_completed=12` isolado não comprova entrega.

## 3. Primeiro uso no Windows (Antigravity faz apenas o comando)
Com Node 22+ instalado, execute em `C:\Projetos\hypeneural\evydencia-crm-mcp`:

```powershell
git status --short
git fetch origin
git pull --ff-only origin main
Copy-Item config\live-read.env.example .env.live.local
.\scripts\validate-crm-key.ps1
```

No arquivo `.env.live.local` você digita **localmente** sua chave, sem publicar:
- `CRM_BASE_URL=https://evydencia.com` e `CRM_EXPECTED_HOST=evydencia.com` (HTTPS e host EXATAMENTE igual).
- `CRM_PROBE_FAMILY=extension` para Sanctum, `CRM_READ_TOKEN` com o bearer Sanctum, `CRM_PROBE_ACTION=bootstrap`.
- `CRM_LIVE_NETWORK_CONSENT=1` (autoriza a verificação de rede). Sem a flag o processo NÃO chama a API.
- Depois, para cliente, `CRM_PROBE_ACTION=customer` ou `history`; preencher `CRM_TEST_PHONE` e `CRM_LIVE_CUSTOMER_CONSENT=1` somente para cadastro que o operador esteja autorizado a consultar.
- Para `preview` preencher também `CRM_LIVE_PREVIEW_PROBE_CONSENT=1`; não chama `schedule`.
- Se sua credencial é a chave antiga do `fotosdenatal-dados`, escolher `CRM_PROBE_FAMILY=legacy`, `CRM_PROBE_ACTION=orders`, `EVYD_ACK_LEGACY_WRITE_POWER=1`. A chave é global e perigosa — recomendado apenas para diagnóstico local de curto prazo. `detail` também exige `CRM_TEST_ORDER_UUID` conhecido.
- Execute novamente `.\scripts\validate-crm-key.ps1` depois de configurar a chave.

**O log deve exibir `CRM_JSON_STRUCTURE_PASS`**, seguido apenas de estrutura JSON: campos, tipos, `kind:object`, `kind:array`, presença de capacidade write e avisos. Não exibe nomes, telefone, itens individuais ou montantes reais. O diagnóstico verifica schema/estrutura, **não** uma reconciliação comercial com o painel.

Se a chave Sanctum retorna 401/403/503, verifique validade, abilities e `EXTENSION_API_ENABLED` configurado no CRM; **NÃO alterar o Laravel nem desabilitar proteções** para fazer o teste passar. Se o script bloquear `crm_https_required` ou `live_probe_host_mismatch`, revisar HTTPS e host exato. Não colar tokens no ChatGPT.

## 4. Estatísticas e histórico
A tela `manager/natal/estatisticas` tem 11 abas:
- Evolução e comparativo YTD, Financeiro, Projeção, Aquisição, Agenda, Pacotes, Resgate, Fidelizados, Master, Participantes e Reajuste.
- JSON `GET /manager/natal/estatisticas/overview` é protegido por `auth:manager` e sessão; chave Sanctum ou SingleAuthentication NÃO dá acesso. Não armazenar cookie do painel no MCP.
- `NatalValidOrdersQuery::getSeasonDigestMetrics()` é a referência *canônica* para 2026 e comparação na mesma janela 01/08 → ponto de corte entre temporadas, usando `effective_at`, não apenas created_at.
- `tools/export-natal-digest.php` já está pronto fora do Laravel, mas execução em produção requer aprovação, performance e pasta privada. `src/natal-digest-snapshot.mjs` valida origem, data, status históricos e centavos.
- A camada legada 2021–2025 pode ser importada uma vez por `scripts/import-legacy-history.mjs` para arquivo privado; tem origem `LEGACY_UNVERIFIED` e não deve ser misturada com vendas canônicas de 2026 sem conciliação.

## 5. Visualização ChatGPT
- MCP deve retornar `structuredContent` compactado e texto útil. O ChatGPT pode construir tabelas e gráficos conforme o contexto; **JSON de gráfico por si só NÃO garante que um gráfico aparecerá**.
- `src/chart-ready.mjs` já modela dados de comparação de vendas e finanças; só exibe comparação 2025/2026 quando o histórico oficial está confirmado. Gráficos históricos do legado ficam separados.
- Para dashboard interativo e navegação por gráficos, ChatGPT suporta UI opcional MCP Apps em iframe `_meta.ui.resourceUri` com recurso `ui://`, mas adiciona superfície de execução, autenticação e manutenção. Recomenda-se somente após LIVE OAuth estar homologado. A UI NÃO deve mostrar valores privados em Plugin anônimo.
- Referências: https://developers.openai.com/plugins/build/mcp-server , https://developers.openai.com/plugins/build/chatgpt-ui , https://developers.openai.com/plugins/build/auth .
- Antigravity atual: regras para invariantes, skills para etapas; workflows clássicos estão sendo substituídos por skills (https://antigravity.google/docs/migration/workflows-to-skills).

## 6. Próximos gates
A) GO_LOCAL_JSON: offline schemas + testes e lint.
B) GO_SANCTUM_READ_LOCAL: bootstrap e, com autorização, um cliente por telefone; estrutura bate com HEAD do CRM.
C) GO_LEGACY_GET_LOCAL: somente com aceitação explícita do risco de token global.
D) GO_NATAL_DIGEST_PRIVATE: exportador e snapshot de 2026 executados no ambiente PHP autorizado e conciliados com painel, sem Git/Plugin.
E) GO_CHATGPT_LIVE: conexão SEPARADA do MOCK, OAuth 2.1 por operador, escopo e identidade verificados em cada chamada. **Ainda não implementado.**
F) GO_SEND: bloqueado até confirmação visual, registro durável, idempotência e auditoria. Nenhum write foi criado neste trabalho.

Nenhum dado real foi acessado na criação deste material; os testes de rede só podem ocorrer com a chave local e opt-in expresso.
