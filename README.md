# Evydência CRM MCP (`v0.10.0`)

Servidor e gateway MCP independente entre o ChatGPT (OpenAI Connectors / Apps SDK) e o **Evydência CRM** (Laravel 10 / PHP 8.3 / MySQL / Sanctum), operando em dois modos estritamente isolados:

1. **Gateway LIVE Streamable HTTP (`src/live-gateway.mjs` + `src/oauth-gateway.mjs`):**
   - Autenticação OAuth 2.1 + PKCE (`S256`) individual por operador autenticado no Sanctum (`LIVE_OPERATOR_FULL_OAUTH` ou `LIVE_READ_ONLY_OAUTH`), sem tokens compartilhados no ChatGPT e com `Cache-Control: private, no-store`.
   - Integração direta somente-leitura com os modelos e serviços oficiais do CRM (`scripts/crm-forensic-bridge.php` e `scripts/crm-natal-bridge.php`), com sessão MySQL `READ ONLY`, bloqueador de SQL mutável e proxy de cache em memória efêmera (zero mutação em MySQL ou Redis).
   - Otimizado para OpenAI MCP: `outputSchema` JSON Schema 2020-12 em todas as 17 ferramentas Live, `structuredContent` proporcional por `secoes` e `nivel_detalhe` (~9 KB no resumo padrão de Natal vs ~264 KB anteriores), montantes canônicos em `*_cents` (inteiro) + `*_reais`, verificação HTTP/WebP SSRF-safe de avatares (`RIFF....WEBP`) e confirmação explícita obrigatória (`confirmado_pelo_operador: true`) para agendamento idempotente de proposta.
2. **Servidor Local MOCK Demonstrativo (`src/server.mjs`):**
   - Modo `stdio` offline 100% sintético (`EVYD_MOCK_MODE=1`, zero rede e zero credenciais reais) para desenvolvimento local e validação em CI.

> **Segurança de Repositório Público:** Este repositório é público. Jamais versione `.env`, tokens, CPFs, telefones, e-mails, datas de nascimento ou payloads reais de clientes. Todos os testes automatizados utilizam exclusivamente fixtures sintéticas.

---

## Catálogo de Ferramentas LIVE (`v0.10.0` — 17 ferramentas)

| Ferramenta | Escopo / Modo | Acesso | Descrição resumida |
|---|---|---|---|
| `crm_capacidades` | Todos os modos Live | Leitura | Inventário fiel de ferramentas ativas, `version`, `build_commit` e escopos (sem itens `MOCK_ONLY`). |
| `crm_status` | Todos os modos Live | Leitura | Saúde pública do CRM (`GET /health/live`). |
| `crm_campanha_publica` | Todos os modos Live | Leitura | Catálogo público de pacotes de uma campanha. |
| `crm_horarios_publicos` | Todos os modos Live | Leitura | Disponibilidade pública de horários por pacote (janela até 14 dias). |
| `crm_conexao_privada` | Operador OAuth | Leitura | Identidade do operador Sanctum, fuso e abilities do token. |
| `crm_cliente_resumo` | Operador OAuth | Leitura | Contexto executivo do titular/lead por telefone, nome, CPF, e-mail ou UUID, com rota canônica `/gestao/clientes/{uuid}/consultar`. |
| `crm_cliente_360` | Operador OAuth | Leitura | Reconstrução 360 forense: perfil, avatar verificado via HTTP/WebP, completude cadastral, meios efetivos de pagamento, divergências cruzadas de participantes e histórico paginado de pedidos. |
| `crm_estatisticas_natal` | Direct CRM Read | Leitura | Inteligência oficial de `/gestao/natal/estatisticas` (`2021–2026`): resumo enxuto + `secoes` sob demanda (`simulador_previsao`, `financeiro_caixa`, `clientes_recompra_campanhas`, `agenda_demanda`, `pacotes_produtos_bonus`, `operacional_listas`). |
| `crm_natal_participantes_estatisticas` | Direct CRM Read | Leitura | Demografia e composição familiar de Natal: população reconciliada (crianças, adultos, pets, sem nascimento), faixas de bebês/crianças, parentesco, `0/1/2/3+` filhos, pacote × idade, histórico `2024–2026` e anomalias cadastrais. |
| `crm_pedidos_buscar` | Direct CRM Read | Leitura | Busca global paginada de pedidos ordenada do mais recente para o mais antigo, com filtros gerenciais e `nivel_detalhe` (`resumo`, `padrao`, `forense`). |
| `crm_pedido_detalhe` | Direct CRM Read | Leitura | Auditoria completa por `uuid` ou `order_id`: parcelas (`method_name` vs `method_category_label`), `bills`, `transactions`, `status_history`, `schedule_details` (Google Calendar), `personalization`, `bonus_classification`, bloqueio de edição de participantes e avatar validado. |
| `crm_clientes_buscar` | Operator Full CRM | Leitura | Busca direta na base geral de clientes e leads (inclusive `somente_sem_pedidos: true` e `somente_cadastro_incompleto: true`). |
| `crm_relatorio_itens_vendidos` | Direct CRM Read | Leitura | Unidades brutas de itens vendidos (`orders_items`) por período. |
| `crm_relatorio_natal_sem_participantes` | Direct CRM Read | Leitura | Pedidos ativos de Natal sem participantes cadastrados. |
| `crm_relatorio_clientes_natal` | Direct CRM Read | Leitura | Clientes com ou sem compra de Natal no ano corrente. |
| `crm_previa_proposta_natal` | Operator Full CRM | Leitura | Simulação oficial de elegibilidade e mensagem da proposta de Natal 2026 (não envia mensagem). |
| `crm_enviar_proposta_natal` | Operator Full CRM | Escrita idempotente | Agendamento oficial da proposta de Natal 2026 no CRM. **Exige `confirmado_pelo_operador: true` explícito** (sem valor padrão) e envia `X-Idempotency-Key`. |

Veja detalhes completos em [Matriz de capacidades](docs/CAPABILITY_MATRIX.md) e [Inventário Live](docs/CRM_LIVE_API_INVENTORY_20261025.md).

---

## Validação Local Determinística (Windows / Linux / CI)

Pré-requisitos: Node.js `>=22`, npm, Git.

```powershell
npm ci
npm run validate:local
```

`npm run validate:local` executa em sequência:
1. `npm run doctor` — integridade de estrutura, regras, hooks, lockfile e isolamento de `.env`.
2. `npm run check` — verificação sintática `node --check` em todos os módulos e scripts.
3. `npm test` — suíte determinística (`130` testes unitários, segurança OAuth, paridade forense, invariantes analíticos, sonda SSRF-safe de WebP e casos negativos).
4. `npm run smoke` & `npm run conversation:smoke` & `npm run startup:smoke` — validação fim a fim do modo Mock stdio.
5. `npm run vps:preflight` — auditoria estática de segurança de deploy (`read_only`, `no-new-privileges`, isolamento de segredos).

---

## Operação Segura de Deploy e Rollback (Host Live)

1. Confirmar CI/validação local verde e registrar o commit anterior em produção (`git rev-parse HEAD`) antes de atualizar.
2. Atualizar `/opt/evydencia-mcp/app` exclusivamente via `git fetch origin main && git checkout main && git pull --ff-only origin main` (sem editar o repositório Laravel em `/var/www/evydencia/current`).
3. Validar sintaxe dos bridges PHP (`sudo -u evydmcp -g www-data php -l scripts/crm-forensic-bridge.php` e `scripts/crm-natal-bridge.php`), reiniciar `evydencia-crm-mcp-live.service` e confirmar `version` + `build_commit` em `/healthz` e `crm_capacidades`.
4. **Rollback imediato** em caso de regressão:
   ```bash
   cd /opt/evydencia-mcp/app && git checkout <COMMIT_ANTERIOR> && systemctl restart evydencia-crm-mcp-live.service
   ```
