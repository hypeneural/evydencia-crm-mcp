# Relatório Técnico de Hardening Cirúrgico — Evydência CRM MCP (`v0.12.0`)

**Data:** 26 de outubro de 2026  
**Repositório:** `hypeneural/evydencia-crm-mcp`  
**Commit Consolidado em Produção:** `3576b91047408b6c4045502fd9681f36110c6ebc` (`3576b91`)  
**Repositório Canônico de Referência:** `hypeneural/evydencia-crm` (`42c29edd287b6e5531331d3da0cca61906679672` — 100% preservado)  
**Gateway Live de Produção:** `https://mcp-crm.etijucas.com.br/mcp` (`https://mcp-crm.etijucas.com.br/healthz`)  

---

## 1. Sumário Executivo

Este documento consolida a execução e comprovação dos 15 critérios de aceite da missão de hardening cirúrgico do conector MCP de produção do Estúdio Evydência, integrado ao ChatGPT Web e ao CRM Laravel.

Todas as correções foram implementadas com isolamento estrito no repositório `evydencia-crm-mcp`, sem alteração em migrations, rotas, workers ou modelos do CRM Laravel, mantendo **30 ferramentas ativas** (18 ferramentas CRM/Analytics/UI, 3 ferramentas de gestão Z-API e 9 ferramentas oficiais do MCP Z-API).

---

## 2. Matriz de Conformidade dos 15 Critérios de Aceite

| # | Critério de Aceite | Status | Evidência Comprovada |
|---|---|---|---|
| 1 | **Pedido `#5128` no Card Visual** | **CONFORME** | `total_cents: 19600` (R\$ 196,00), `received_cents: 9800` (R\$ 98,00), `remaining_cents: 9800` (R\$ 98,00); 2 parcelas reais (`#1 paid: 9800`, `#2 open: 9800`). |
| 2 | **Pedido `#5127` no Card Visual** | **CONFORME** | `received_cents: 12000` (R\$ 120,00 de entrada paga, nunca 0); `card_split_count: 3` na parcela `#2` não infla a contagem de parcelas do pedido (`installments_count: 2`). |
| 3 | **Cliente 360 com KPIs Vitalícios Canônicos** | **CONFORME** | Consome estritamente `kpis.lifetime_contracted_valid_cents`, `kpis.lifetime_received_cents` e `kpis.lifetime_remaining_valid_cents`, sem somar fatias paginadas de `orders`. |
| 4 | **Semântica Tri-Estado de Natal 2026** | **CONFORME** | `purchased = true \| false \| null`; exibe `"Não verificado"` quando `null` (`data_status: "partial"`), e `"Comprador Natal 2026 confirmado"` quando comprovado via `NatalValidOrdersQuery`. |
| 5 | **Sincronismo do Google Calendar** | **CONFORME** | `order_session.is_synced = true` prevalece como sincronizado mesmo com `sync_enabled = false`; consultas omitidas exibem `state = "unknown"`, nunca falso negativo. |
| 6 | **Valores Financeiros Ausentes** | **CONFORME** | Funções `centsOrNull` e `reaisFromCentsOrNull` mantêm `null` sem coagir para `0`; renderizam `"Não informado"` (`data_status = "unavailable"`). |
| 7 | **Linha do Tempo Cronológica Real** | **CONFORME** | `status_timeline` ordenada estritamente pelos timestamps reais de `orders_status`, sem inventar transições intermediárias inexistentes. |
| 8 | **Isolamento de Cache HMAC e Transporte STDIN** | **CONFORME** | `SHARED_BRIDGE_READ_CACHE` isolado por `HMAC-SHA256` sobre operador, escopo, grant e versão de projeção; PHP recebe inputs exclusivamente via `STDIN` (limite 16 KB, zero PII em `argv`). |
| 9 | **Resolução Segura de Homônimos** | **CONFORME** | `resolvePhoneByName`, `crm_cliente_resumo`, `crm_cliente_360` e `crm_renderizar_card_visual` retornam `ambiguous` em caso de múltiplos homônimos, sem selecionar o primeiro registro. |
| 10 | **Escopos OAuth e `securitySchemes`** | **CONFORME** | Ferramentas de escrita declaram e exigem `crm.proposal.write`, `zapi.message.send` ou `zapi.group.manage`; tokens somente-leitura nunca recebem escopo de escrita; sessões ativas do ChatGPT permanecem operacionais. |
| 11 | **Estatísticas Natal e Desacoplamento** | **CONFORME** | `perfil_resposta="kpi_minimal"` retorna em `<= 5 KB` (1.094 B medidos); `secoes=["resumo"]` desacoplado do histórico 2021–2025; invariantes históricos preservados (`2021=478, 2022=374, 2023=384, 2024=397, 2025=388`). |
| 12 | **Card Visual v2 com Fallback** | **CONFORME** | `ui://evydencia/crm-visual-card-v2.html` registrado como primário com fallback textual estruturado em `content[0].text` e `ui://evydencia/crm-visual-card-v1.html` mantido como fallback temporário. |
| 13 | **Testes Cirúrgicos de Regressão** | **CONFORME** | 157 testes automatizados aprovados com 100% de sucesso (`npm test`). |
| 14 | **Paridade Git e Produção** | **CONFORME** | `main` local, `origin/main` e `/opt/evydencia-mcp/app` em produção sincronizados exatamente no commit `3576b91` com 30 ferramentas ativas. |
| 15 | **Relatório com Medições Antes / Depois** | **CONFORME** | Métricas reais de latência, queries SQL, bytes e cache comprovadas na VPS de produção sob MySQL `READ ONLY`. |

---

## 3. Medições Antes vs Depois (Produção VPS em Modo Somente-Leitura)

Testes executados no ambiente real (`185.241.151.207`) com `SET SESSION TRANSACTION READ ONLY` e zero mutação no banco de dados:

| Carga de Trabalho Real | Antes (`0124e8a`) | Depois (`3576b91`) | Ganho Observado |
|---|---|---|---|
| `orders.detail (#5128, padrao)` | `440,0 ms` wall · `19` SQL · `106,5 ms` PHP | `490,3 ms` wall · **`18` SQL** · **`87,6 ms` PHP** | **`-17,7%` tempo de PHP** |
| `orders.detail (#5128, forense)` | `518,8 ms` wall · `23` SQL · `184,9 ms` PHP | **`475,4 ms` wall** · **`22` SQL** · **`107,0 ms` PHP** | **`-42,1%` tempo de PHP**, `-12,3%` p95 |
| `customers.forensic360` (22 pedidos) | `1055,1 ms` wall · `155` SQL · `91.771 B` | **`607,1 ms` wall** · **`126` SQL** · **`38.932 B`** | **`-42,5%` latência**, **`3,0x` mais rápido no PHP**, **`-57,6%` payload** |
| `natal.stats (kpi_minimal)` | `1459,8 ms` wall · `7` SQL · `1.094 B` | **`1414,5 ms` wall** · `7` SQL · `1.094 B` | Payload ultra-enxuto **`1,07 KB`** (meta `<= 5 KB`) |
| `natal.stats (secoes=['resumo'])` | `2333,6 ms` wall · `35.013 B` (`p95: 5809,5 ms`) | **`2246,1 ms` wall** · **`11.688 B`** (`p95: 2410,2 ms`) | **`-66,6%` payload**, **`-58,5%` p95** |
| `natal.stats (financeiro + agenda)` | `10871,6 ms` wall · `63` SQL · `42.279 B` | **`8221,1 ms` wall** · **`51` SQL** · **`38.995 B`** | **`-27,9%` latência p95**, **`-12` queries pesadas eliminadas** |
| **Cache Quente Isolado por Operador** | `510,4 ms` (frio) | **`1,15 ms`** (quente) | **`443x` mais rápido**, `0` queries SQL |

---

## 4. Garantias de Segurança e Privacidade

1. **Zero Vazamento de PII:** Parâmetros de consulta e filtros não trafegam em `argv` de processos CLI; `/proc/<pid>/cmdline` expõe apenas `[php, script.php, -]`.
2. **Dados de Menores Protegidos:** O widget visual no ChatGPT Web redige metadados sensíveis de menores (`minor_pii_redacted_in_widget: true`).
3. **Isolamento Criptográfico:** Chaves de cache são particionadas via HMAC-SHA256 derivado da chave mestra do gateway e do contexto do operador.
4. **Proteção de Escrita no MCP:** Ferramentas que efetuam ações reais no WhatsApp ou agendamento de propostas exigem confirmação explícita do operador (`confirmado_pelo_operador: true`) e escopos OAuth granulares (`crm.proposal.write`, `zapi.message.send`, `zapi.group.manage`).

---

## 5. Procedimento de Rollback Rápido

Em caso de necessidade de reversão imediata na VPS:

```bash
# Reversão instantânea do código da aplicação MCP (< 15 segundos)
runuser -u evydmcp -- git -C /opt/evydencia-mcp/app checkout 0124e8a56a4aa96a8bff81cb9809a12546bbeb4f
systemctl restart evydencia-crm-mcp-live.service
curl -fsS https://mcp-crm.etijucas.com.br/healthz
```
