# Auditoria forense — Legado fotosdenatal-dados vs CRM vs MCP
Data: 25/10/2026 (Brasil). Auditoria baseada em commits efetivamente inspecionados:
- fotosdenatal-dados (PRIVATE) main `ff47f62326137b78eda981bb08f1bc784b16b5ab`
- evydencia-crm (PRIVATE) main `9749cc09f06104103e08abef8576d8c7c2dc1fab`
- evydencia-crm-mcp (PÚBLICO) main de 25/10/2026

Sem acesso a banco de produção, sem credenciais reais e sem modificações no Laravel ou no repositório legado. NUNCA copiar valores comerciais identificáveis ou nomes de participantes do legado para este repositório público.

## 1. Artefatos concretos aproveitáveis

| Artefato legado | Natureza | Decisão |
|---|---|---|
| `data/natal_historical_calendar_immutable.json` | Calendário agregado 2021-2025; 366 datas por ano | PODE importar uma vez para arquivo agregado PRIVADO, com SHA-256 e proveniência LEGACY_UNVERIFIED |
| `data/natal_daily_2021..2025.json` | Série diária concluída e total anual | Referência cruzada, não cópia indiscriminada |
| `data/natal_analytics_full.json` | Evolution 2021-26 + matriz de pacotes, agendamento, fidelidade etc | Referência SOMENTE; vários painéis não são recalculados pelo sincronizador atual |
| `data/natal_daily_2026.json`, `last_sync_report.json` | Temporada dinâmica; último sync versionado 20/10/2026 | NÃO servir como atual; substituir por digest canônico vivo |
| `data/natal_2026_buyers.json`, `natal_non_buyers_2026.json` | Nome, celular, e-mail, histórico | NÃO versionar no MCP PÚBLICO nem conectar ao Plugin anônimo |
| `data/natal_master_customers.json`, `customer_last_participants.json` | Cliente 360, LTV, menores, idades e vinculação familiar | NÃO transferir; usar API Sanctum Cliente 360 sob OAuth por operador |
| `campaign_config` no MariaDB legado | Campanhas antigas + credenciais | NÃO utilizar para novo envio. CRM Laravel já possui propostas/preview/schedule |
| `sync_natal_data_from_crm.py` | GET /api/orders/search com token estático e paginação de 200, backup e reconciliação | Reaproveitar ideias de paginação e snapshots, NÃO o token e filtro de negócios |
| `atualizar_dados_crm.bat` | Facilita o dia a dia do operador | Substituído no MCP por validação PowerShell e exportador dedicado |

## 2. Divergências forenses que impedem uso direto

1. **Filtro de vendas incompatível com a regra comercial atual.** O legado `VALID_STATUS_IDS = {5,6,9,10,12}` só considera alguns status instantâneos e ignora os estados 7 (sessão finalizada), 8 (seleção agendada), 11 (entrega realizada). Não replica `NatalValidOrdersQuery::validNatalOrders()`, cuja elegibilidade usa evidência de pagamento ou etapa operacional, estado as-of, exclusões e ledger financeiro. NÃO tratar `valid_commercial_orders` legado como venda canônica.
2. **Nomes de status divergentes.** No legado, `9='selection_finalized'`, `10='waiting_pickup'`; o enum atual usa `selection_schedule_confirmed` e `waiting_product_retrieve`. Usar exclusivamente `OrderStatus` e `Customer360Query` atuais.
3. **Datas incompatíveis.** A linha do tempo antiga pode contar por `order.created_at`. A comparação canônica `getSeasonDigestMetrics()` usa `effective_at` entre 01/08 e data equivalente. Subtrair acumulados históricos de 07/31 é útil como *referência antiga*, mas NÃO fornece automaticamente uma comparação comercial certificada com 2026.
4. **Monetário.** O legado armazena BRL como floats; o novo contrato canônico é `*_cents`. O calendário antigo soma base e extras; não há prova de que seja caixa realmente recebido. `financial_status=RECORDED_GROSS` no CRM também não equivale a reconciliação bancária líquida.
5. **Sincronização parcial:** o script legado atualiza 2026 em evolution e recalcula alguns datasets, mas matrizes, tendências e outras seções do arquivo analítico podem refletir períodos anteriores. Último `last_sync_report` inspecionado: 2026-10-20. O calendário de 2026 não é atualizado em tempo real pelo Git.
6. **Autenticação perigosa:** o GET `/api/orders/search` ainda usa `SingleAuthentication` com token interno compartilhado para rotas que também permitem PUT status e POST execute campaign. NÃO fornecer `EVYDENCIA_TOKEN` ao Plugin.
7. **Dados pessoais em Git:** o legado é repositório PRIVADO, mas rastreia arquivos `data/` de clientes, contatos e participantes. Git privado não implica acesso público seguro, e copiar tais arquivos ao MCP PÚBLICO seria incidente de privacidade. Considerar minimização/retention/permissões e revisão do histórico Git em processo administrativo separado (nenhum arquivo removido nesta auditoria).

## 3. Histórico fixo 2021–2025: já implementado NO MCP

`src/legacy-historical.mjs` valida estritamente o arquivo calendário privado: exatos cinco anos, 366 dias/ano, dez campos agregados por dia, monotonicidade de acumulação, soma receita base+extras, centavos e ausência de campos adicionais. O cálculo de janela YTD legado começa em **01/08**, usando acumulado do dia de corte menos 31/07, e registra `LEGACY_UNVERIFIED`.

`scripts/import-legacy-history.mjs` faz importação MANUAL e offline de agregados de um arquivo privado para outro local privado, grava SHA-256 da fonte e **não sobrescreve** o snapshot de mesmo nome. Não importa nomes ou telefones. O Plugin anônimo não registra nenhuma ferramenta de leitura histórica.

### Homologação local sem dados comerciais
No clone MCP:
```powershell
npm run validate:local
```

### Importação opcional apenas em máquina com dados privados autorizados
Antes de usar, confirmar diretório de destino com ACL NTFS privada e fora do Git, sem compartilhamento público. Use caminhos reais **somente no terminal local** (não colar no chat):

```powershell
npm run history:import -- --source="C:\\CAMINHO_PRIVADO\\fotosdenatal_dados\\data\\natal_historical_calendar_immutable.json" --output="C:\\ProgramData\\Evydencia\\private\\legacy-history-10-25.json" --cutoff=10-25
```

Se já existir arquivo de destino, o comando bloqueia sobrescrita. Os valores só são gravados em snapshot privado; o stdout informa hash e validação, não estatísticas. Um mesmo arquivo antigo pode ser consultado para outra data de corte usando outro nome de saída; isso NÃO significa recalcular as vendas de anos anteriores.

Importante: `archived_ytd_gross_cents_aug01_to_cutoff` é receita bruta LEGADA, não `paid_cents` da regra comercial atual. O campo `canonical_comparison_allowed:false` proíbe confronto automático com as vendas 2026.

## 4. MVP final por frequência de atualização

| Pergunta do gestor | Fonte | Atualização e confiança |
|---|---|---|
| Quanto vendemos em 2021-25? | Histórico congelado LEGADO | Uma importação, mas apresentar como não conciliado até homologar com CRM |
| Quanto vendemos em 2026? | `NatalValidOrdersQuery::getSeasonDigestMetrics()` | Snapshot privado com expiração máxima de 5 minutos; só após homologação real |
| 2026 vs mesmo dia 2025? | Comparativo CANÔNICO do digest `sales_2026_orders` e `sales_2025_orders` | Usar `data_status_2025`; se UNCONFIRMED, não apresentar crescimento certificado |
| Contratado, recebido, saldo? | Digest CANÔNICO | Diferenciar em centavos e status financeiro |
| Quantos ainda faltam fotografar? | Status atual por pedido + sessão agendada/data | `scheduled` e `unscheduled` sozinhos NÃO dão total restante; definir contagem operacional separada |
| Quantos aguardam revelação/retirada? | Último status CANÔNICO de pedidos do Natal | `waiting_product_retrieve=10` significa pronto para retirar; `product_retrieve_confirmed=11` já entregue. Estados 7–9 não são prova de prontidão |
| Qual pedido do cliente? | Cliente 360/Context Sanctum por celular | Sob OAuth individual, on-demand e com desambiguação |
| Pesquisar por nome completo | API gerencial legada NÃO aconselhada | Planejar somente leitura SQL restrita/serviço isolado, nunca token amplo |
| Disparar proposta de Natal? | POST `/api/v1/extension/proposals/preview` e `/schedule` | Só com OAuth por operador, confirmação visual, UUID persistente/idempotência; NÃO liberar no MOCK |

**Não concluir que toda sessão com data passada foi concluída.** Estado do pedido e agenda são informações distintas. Para quantidades restantes, deve haver definição explícita de elegibilidade, timezone, data e prova de conclusão; nenhum SQL livre exposto ao LLM.

## 5. Caminho para produção sem PR no Laravel
1. Aprovar/rodar `scripts/validate-mvp.ps1` local (PHP e Node). Manter Tunnel anônimo só MOCK.
2. Congelar histórico estático em arquivo privado (neste módulo), comparar uma amostra de datas com o CRM e documentar divergências; não contaminar os números canônicos.
3. Homologar exportador separado de `getSeasonDigestMetrics()` em ambiente PHP Laravel autorizado, medir consulta e publicar digest agregado em privado (TTL 300s); nunca versionar real.
4. Desenvolver conexão **separada** MCP LIVE com OAuth 2.1 individual; identidade e scopes validados por ferramenta. Consultas agregadas e depois Cliente 360 Sanctum (read-only).
5. Somente se necessário, complementar status geral, nome e agenda via consultas SQL parametrizadas com usuário somente leitura, conexão privada e poucos campos; proibir SELECT * e SQL livre.
6. Confirmar leitura correta e auditoria de solicitações. Depois, em fase independente, habilitar fluxo de proposta com confirmação e journal durável.

## Estado
**Histórico legado:** validação e importação privadas implementadas, integração ChatGPT LIVE NÃO.
**CRM Laravel:** intocado.
**MCP anônimo:** 17 tools mockadas preservadas.
**Envio real:** bloqueado.

Fontes oficiais verificadas: https://developers.openai.com/plugins/build/auth ; https://developers.openai.com/plugins/build/mcp-server ; https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
