# Auditoria OpenAI Plugin + PrintServer MCP LIVE — 26/10/2026

**Fontes de verdade:** chamadas ChatGPT ao MCP v0.12.0 (build `f6f93b5`), PR #12 e PR #1, guias oficiais OpenAI Plugins (guidelines/auth), protocolo MCP. **Não confundir** o build LIVE com o HEAD da branch em revisão.

## Verificação direta do ChatGPT
- 33/33 ferramentas invocáveis, operador OAuth #2, `granted_scopes` contém `print.jobs.write` e `print_tool_enabled=true`.
- `crm_consultar_impressao_etiqueta(999999,...)` → `synthetic_test=true`, `spooled`, `printed_physically=false`.
- `crm_previa_malotes_retirada([5127,5126])` → status de sessão agendada, valores pendentes, `print_eligible=false` e `changes_applied=false`.
- Não foram criados jobs de clientes reais nem enviadas mensagens. O relatório do Antigravity afirma que o broker novo está no host, mas a leitura do status de um job antigo **não confirma** que uma impressão nova foi entregue fisicamente.

## Implementação conforme OpenAI Plugin Guidelines
| Tool | Side effect | Annotation correta | Confirmação |
|---|---|---|---|
| `crm_previa_malotes_retirada` | consulta | `readOnlyHint=true, destructiveHint=false, openWorldHint=false` | não |
| `crm_consultar_impressao_etiqueta` | consulta broker | `readOnlyHint=true, destructiveHint=false, openWorldHint=false` | não |
| `crm_solicitar_impressao_etiqueta` | enfileira impressão térmica física | `readOnlyHint=false, destructiveHint=true, idempotentHint=true, openWorldHint=false` | sim; `confirmado_pelo_operador===true` |

A impressão é uma ação externa potencialmente irreversível, apesar da deduplicação por pedido. Antes, ela usava a anotação genérica de escrita aditiva (destructive false), inadequada. Corrigido exclusivamente no contrato dessa tool, sem alterar a lógica de API/CRM.

**Autorização:** `_meta.securitySchemes` para a ferramenta de imprimir exige OAuth `crm.read` e `print.jobs.write`; operadores precisam constar em `EVYD_PRINT_ALLOWED_OPERATOR_IDS`, com validação independente no backend. Declaração da permissão no catálogo nunca substitui verificação do token real.

**Contratos reais e minimização:** a ferramenta recebe `order_id`, `confirmado_pelo_operador` e `request_id` opcional. O gateway relê o pedido, exige status 10 e saldo zero, e envia ao broker somente ID, operador, nome/identificador mínimo e nome do pacote. O broker retorna `job_id`, status e informação de replay; nunca devolver PDF ou token ao ChatGPT.

**Limites conhecidos:** o catálogo permanece 33. A tool de prévia não altera status, e a tool de imprimir não envia WhatsApp. Foto → baixa de malote → mensagem via fluxo CRM exige endpoint canônico transacional de escrita no Laravel, com guardas de financeiro, concorrência e outbox; não há implementação segura dessa escrita atualmente. Não usar o endpoint legado `PUT /api/orders/status` sem a mesma proteção de domínio.

## Evidência de testes/rollout
- CI da PR #12 verifica anotação de impressão, esquema OAuth e guarda da confirmação. Novo HEAD é **branch**, não automaticamente produção; o runtime declarado pelo ChatGPT continua `f6f93b5`.
- CI da PR #1 verifica não haver claim/ACK não persistidos ao ocorrer erro de disco (além do teste de criação), sem contato com Windows ou pedidos reais.
- Somente Antigravity no AnnaHelena pode atestar que a tarefa de polling está viva agora, que o driver está carregado, que o papel 100×40 foi respeitado e que uma etiqueta foi entregue fisicamente.
- Sugerir P1 futuro: diagnóstico dedicado de heartbeat agente/queue e confirmação de papel pelo operador. Não sobrecarregar `crm_capacidades` com polling de hardware ou alterar catálogo de 33 ferramentas sem planejar versionamento e refresh no ChatGPT.

## Links oficiais
- https://developers.openai.com/plugins/plugin-guidelines
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/plan/tools
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools
