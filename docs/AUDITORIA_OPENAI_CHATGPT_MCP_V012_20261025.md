# Auditoria ampliada ChatGPT Web + Evydência CRM MCP (25/10/2026)

## 0. Proveniência, estado e escopo
- Produção LIVE verificada por `crm_capacidades` em 25/10/2026: **v0.12.0**, `build_commit=9896fc5`, `mode=LIVE_OPERATOR_FULL_OAUTH`, **29/29 ferramentas ativas**.
- Main GitHub em `9896fc599fa0018a9423b5d64e5e9d23adb940d2`. PR #8 (`codex/chatgpt-mcp-hardening-20261025`) foi baseada em `f7c7abf` v0.10.1 e está **behind_by=4** devido às PRs #7 (Z-API MCP) e #9 (diagnóstico de instância). **É PROIBIDO fazer merge/deploy da PR #8 antes de integrar a main v0.12.0, preservar Z-API e refazer validações.** Não forçar reset/rewrite de branch sem reconciliação e verificação de lease.
- Fontes inspecionadas: `hypeneural/evydencia-crm-mcp` (gateway, legacy-read, bridges, testes e docs), `hypeneural/evydencia-crm` (NatalValidOrdersQuery e NatalForensicStatisticsService), prints reais do painel de Natal, clientes, pedidos, financeiro e agenda. Código/relatos anteriores podem refletir estado antigo; não afirmar prod por PR aberta.
- Esta branch implementa **apenas correções locais** e um opt-in `perfil_resposta=kpi_minimal`. Nenhuma suíte foi executada no host LIVE ou publicada por esta análise.

## 1. Referências oficiais OpenAI/MCP a seguir em implementação
- https://developers.openai.com/plugins/build/mcp-server — servidor MCP, tools, outputSchema, securitySchemes, annotations, Inspector.
- https://developers.openai.com/plugins/guides/optimize-metadata — golden prompts positivos/negativos, nomes/descritivos focados, seleção e métricas de precisão/recall.
- https://developers.openai.com/plugins/build/chatgpt-ui — padrão aberto MCP Apps, `_meta.ui.resourceUri`, `ui/*` RPC via postMessage, widgets opcionais, render tools separadas de data tools, CSP.
- https://developers.openai.com/plugins/reference — `structuredContent`, `_meta` para widget, outputSchema exato, compatibilidade.
- https://developers.openai.com/plugins/build/auth — OAuth 2.1 + PKCE S256, protected resource metadata, resource/audience, issuer, escopos por tool e autenticação efetiva por requisição.
- https://developers.openai.com/plugins/deploy/troubleshooting — falhas de schema, CSP, widget, lente de performance e autenticação.
- https://developers.openai.com/plugins/deploy/connect-chatgpt — conexão, refresh após alteração de catálogo, testes de prompt direto/indireto/negativo no ChatGPT.
Nota: OpenAI hospeda Plugins/MCP Apps; NÃO assumir que o ChatGPT sempre renderiza cards customizados a partir de JSON e NÃO depender de UI para consultas. `structuredContent` é obrigatório para máquina quando suportado; UI é opcional e deve manter fallback acessível.

## 2. Observações reproduzidas (P0 / P1)
### P0. Precisão financeira e contratos
1. LIVE retorna `goal_total_expanded_revenue_cents=40000000` (R$400 mil) e `goal_total_expanded_revenue_reais=300000` (R$300 mil), fato reproduzido também após main v0.12.0. Há hotfix local na PR #8 em `scripts/crm-natal-bridge.php`; o campo legado `goal_revenue_reais` (meta-base) continua distinto por intenção e deve ganhar rótulo explícito. Nunca usar `*_reais` discrepante para KPI.
2. PHP devolve `loaded_sections`, `OUT_NATAL_STATS` v0.10 declara `sections_loaded`. PR #8 aceita `loaded_sections` mantendo alias de migração, mas a **main v0.12.0 deve ser reconciliada**.
3. `crm_estatisticas_natal(nivel_detalhe=resumo)` retornou **47 KB** em 25/10, enquanto README anuncia ~9KB: contém arrays de pendências e séries históricas não solicitadas. O novo `perfil_resposta=kpi_minimal` entra após bootstrap e `getDynamic2026Data(false,$ctx)`, retornando ANTES de `getHistoricalImmutableData()`, listas forenses e seis seções. O padrão anterior não muda. Somente ano=2026, `secoes=[]` ou `['resumo']`, sem cutoff histórico nem `nivel_detalhe=completo`. Campos canônicos + `data_status`, `integrity_checks`, `warnings` e método. Falta testar tempo SQL real.
4. Chamadas a seções `financeiro_caixa`/`clientes_recompra_campanhas` falharam algumas vezes com `legacy_read_natal_stats_unavailable` ao executar em paralelo: investigar child_process PHP, limite `maxBuffer=4194304`, timeout mínimo 18s, memory_limit, lock ou SQL lento. NÃO afirmar a causa até medir.
5. Relatório auxiliar financeiro de 2026 exibe pagos R$27.343, enquanto total canônico registrado é R$26.113, diferença de R$1.230. Confirmar escopo e dia de liquidação, não tratar como desaparecimento, nem efetuar lançamentos de ajuste sem investigação.
6. Permuta R$2.174 registrada como categoria de dinheiro e Stone débito como crédito no relatório de meios. Separar método nominal, natureza econômica (monetário, permuta, estorno) e meio (pix/débito/crédito). Recebido CRM ≠ comprovado em extrato bancário.

### P1. Semântica e histórico
7. `peak_days_top10` pode incluir base histórica/snapshot 2026 de 62 pedidos enquanto painel atual tem 102. Campos devem possuir `period_start`, `period_end`, `as_of` e `cohort`; não comparar escopos distintos.
8. `ano=todos` nos participantes retorna comparativo multi-ano com `population_reconciliation` referente a 2026. Declarar inequivocamente `primary_year=2026` e `historical_years=[2024,2025,2026]`, ou calcular roll-up trienal legítimo em SQL; não anunciar total da população somada.
9. Telas: lista global mostra 5055 pedidos (TODOS os produtos/anos) mas painel Natal mostra 102 (apenas vendas canônicas 2026); tela de relatório itens 37 pedidos filtrados por 01/10-31/10 não pode ser usado como venda Natal. Distinguir pedidos, pacotes, unidades, sessões, fotos reveladas e itens grátis.
10. Tela de pedido #5127 com avatar: WebP na URL foi validado pelo gateway HTTP, mas HTML personalizado no chat mostrou LX. `asset_accessible` não prova `rendered`; não logar URL privada nem expor proxy anônimo. Precisamos de teste no cliente real com CSP `resourceDomains`, `ui/notifications/tool-result`, `onload/onerror`, fallback e recurso UI atualizado por versão.
11. Divergências históricas de cadastro: anomalias de nascimento (diferença de 1 dia e de anos inteiros), parentesco impossível, pedidos sem participantes; não alterar automaticamente. Retornar evidência, tipo, contagem, grau de confiança e IDs do pedido sem nominar menores em relatórios agregados.
12. Vendas por horário da compra não equivalem a ROAS/horário ideal de anúncios: só comparar taxa de conversão por janela com exposição, gasto e atribuição reais, caso contrário informar volume observado.

### P1. Segurança e UX do catálogo v0.12
13. Produção tem 29 tools, incluindo Z-API `send_text/image/video` e mutações de grupos. O catálogo cresceu de 17 → 29. **Risco de seleção indevida**: ferramentas de envio precisam descrições `use when`, casos negativos, annotations `readOnlyHint:false`, `idempotentHint:false`, confirmação explícita e nunca retry cego. Existem controles de dedup para falha ambígua no bridge Z-API; preservá-los sem relaxar autorização.
14. Segregar em descoberta/domínios `crm.*` / `zapi.*` sempre que a plataforma permitir; nenhuma chamada Z-API para responder financeiramente. NÃO desenvolver mais 20 ferramentas para uma consulta simples. Criar só 1 KPI tipado se prova real de seleção melhora sobre `crm_estatisticas_natal(perfil_resposta=kpi_minimal)`.
15. O histórico da comunicação em conversas anteriores reforça: `customer-context` e `customer-360` pela API Sanctum, métricas pelo Laravel canônico, SQL limitado a queries fixas read-only, Games/Gameplay somente para status elegíveis e URL runtime realmente publicada; não confundir links com prontidão. Sem preview de proposta como ping (pode fazer diagnóstico do worker).

## 3. Layouts recomendados no ChatGPT Web
| Pedido | Data tool | UI | Fonte de verdade |
|---|---|---|---|
| Vendeu quanto? | `crm_estatisticas_natal(perfil_resposta=kpi_minimal)` | 3 KPIs inline nativos, sem iframe | Laravel live + cents |
| Comparar anos | `crm_estatisticas_natal(secoes=['historico'])` | tabela/grafico nativos quando dados equivalentes | cutoff homogêneo |
| Financeiro | `crm_estatisticas_natal(secoes=['financeiro_caixa'])` | cards recebidos/em aberto, alerta permuta | parcelas canônicas |
| Pedido/cliente com foto | `crm_pedido_detalhe`/`crm_cliente_360` | MCP Apps card após fetch, fallback texto | UUID, avatar e autorização |
| Agenda e status | `crm_pedidos_buscar` ou ferramentas read específicas | tabela paginada, links | schedule + status histórico |
| Auditoria | tool forense filtrada | tabela curta e priorização | IDs e evidências |
| Envio/proposta | preview -> confirmação -> schedule | confirmation UI distinta | CRM idempotência |

### Componente avatar/card
- Ferramenta de busca retorna dados; ferramenta de render separada, se necessário, aceita identificador opaco e referencia recurso `ui://evydencia/order-card/v1.html`. Deve ser útil mesmo sem componente. Nunca confiar em campos de UI para autorização/escrita.
- Recursos MCP Apps declarados com `mimeType=text/html;profile=mcp-app`, `_meta.ui.resourceUri`, `_meta.ui.csp.resourceDomains` restritos. Preferir widgets discretos, nunca abrir o manager completo como iframe por padrão.
- Distinga status: `has_avatar`, `asset_check_status=validated`, `render_status=loaded/error/blocked/not_attempted`; um erro de visualização NÃO transforma imagem existente em ausente. Sem afirmar `loaded` até evento real.
- Renderize alt, responsive, teclado, modo claro/escuro, zero CSS de cores rígidas que prejudiquem acessibilidade. Sem dados de menores no widget público. Texto básico permanece acessível e verificável.
- Host ChatGPT pode oferecer gráficos e componentes nativos sem UI MCP Apps; sem garantia de gráfico para toda chamada. Widget não faz cálculos financeiros, apenas exibe structuredContent validado.

## 4. Matriz determinística de pergunta → fonte → resultado
Use golden prompts (inclua prompts indiretos e negativos), sem valores literais em fixtures públicas. Aferições LIVE de 25/10/2026 são apenas um snapshot e mudam com pedidos:
1. vendas Natal 2026/recebimentos; 2. YTD 2025/2024; 3. melhores semanas; 4. bebês até 3 anos; 5. famílias >=2 filhos (parentesco vs menores); 6. pacote de bebês <1 ano; 7. recompra 2025→2026; 8. dia/hora de compra sem inferir ROAS; 9. parcelas/permuta/caixa; 10. pedido 5127 + foto; 11. divergência de nascimento e saldo cancelados; 12. `crm_capacidades`; 13. perguntas de Z-API devem chamar ferramenta correta e **NUNCA enviar** sem solicitação e confirmação; 14. perguntas genéricas de clima/sports/web não devem usar CRM.
Avaliação mede: tool selection precision, count of calls, p50/p95 end-to-end, bytes JSON, schema errors, leakage, semântica de cutoffs, source, data_status.

## 5. Regras de execução Antigravity (prioridade)
1. **Antes de editar mais código**: `git status --short`, `git fetch origin`, `git log --oneline --decorate -10 --all`, `git diff origin/main...HEAD` e reconciliar PR #8 contra main v0.12.0, preservando Z-API v0.11/v0.12. Branch não deve sobregravar import de `fromJsonSchema`, novas ferramentas, auth, package-lock ou testes.
2. Rodar gates incrementais de arquivos afetados; depois `npm ci && npm run validate:local`. Também `php -l scripts/crm-natal-bridge.php` e `php -l scripts/crm-forensic-bridge.php`. Não executar DB LIVE nem mensagens Z-API.
3. Adicionar golden prompts com fixtures sintéticas e casos `isError`, `UNAVAILABLE`, timeouts, corte histórico recusado, permuta, saldo cancelado e avatar que abre por link mas não renderiza.
4. Benchmark do gateway sintético `npm run gateway:bench -- --calls=200 --concurrency=4`; medir separadamente bridge Laravel/MySQL. Meta KPI resposta <=5KB; p95 <=3s (meta, não medição); 0 discrepâncias cents/reais e 0 schema error.
5. Versão e deploy: somente após CI/review, plano rollback, smoke read-only e autorização operacional. `crm_capacidades.build_commit` deve bater HEAD implantado. Renovar tools/cache no ChatGPT após alterar metadados, confirmar visual do avatar **dentro do ChatGPT Web**, não só URL no browser.
6. Menor fricção: usar PR #8 existente; nada de PR extra ou patch Laravel sem evidência de que o bridge é insuficiente. Nenhuma exclusão/regravação de branch com git reset --hard.
