# Evydência CRM MCP (`v0.12.0`)

[![CI](https://github.com/hypeneural/evydencia-crm-mcp/actions/workflows/mcp.yml/badge.svg)](https://github.com/hypeneural/evydencia-crm-mcp/actions)
[![License: Private](https://img.shields.io/badge/license-Private-red.svg)](#segurança-de-repositório-público)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](package.json)
[![MCP Protocol](https://img.shields.io/badge/MCP-2025--06--18%20%7C%202025--11--25-blue.svg)](https://modelcontextprotocol.io)

Servidor e gateway MCP corporativo de alta performance conectando o **ChatGPT Web** (OpenAI Connectors, MCP Apps UI SDK) e operadores ao **Evydência CRM** (Laravel 10 / PHP 8.3 / MySQL / Sanctum) e à **Z-API Oficial** (WhatsApp).

Opera em dois modos estritamente isolados:

1. **Gateway LIVE Streamable HTTP (`src/live-gateway.mjs` + `src/oauth-gateway.mjs`):**
   - **Autenticação e Escopos OAuth 2.1 + PKCE (`S256`):** login individual por operador via Sanctum (`LIVE_OPERATOR_FULL_OAUTH` ou `LIVE_READ_ONLY_OAUTH`), com escopos granulares RFC 9728 (`crm.read`, `crm.proposal.write`, `zapi.message.send`, `zapi.group.manage`) e `Cache-Control: private, no-store`.
   - **Integração Z-API Oficial via MCP:** gateway Streamable HTTP integrado ao servidor oficial da Z-API (`https://mcp.z-api.io/mcp`), permitindo envio de mensagens e administração de grupos com tokens criptografados por operador.
   - **Card Visual Interativo (MCP Apps UI v2):** recurso desacoplado `ui://evydencia/crm-visual-card-v2.html` (e fallback `v1`) em `text/html;profile=mcp-app` com tema responsivo claro/escuro, integridade cent-first e fallback textual completo em `content[0].text`.
   - **Segurança e Isolamento Forense:** leitura direta em MySQL `READ ONLY` com bloqueio de mutações em nível de conexão; comunicação com PHP exclusivamente via `STDIN` (zero PII em `argv` ou logs); chaves de cache em memória derivadas via HMAC-SHA256 por operador.
   - **Performance Otimizada:** modo ultra-rápido `perfil_resposta="kpi_minimal"` (resumo em `<= 5 KB`), seções desacopladas e consultas em 3 camadas no Cliente 360 com tempo de resposta em cache quente `< 2 ms`.
2. **Servidor Local MOCK Demonstrativo (`src/server.mjs`):**
   - Modo `stdio` offline 100% sintético (`EVYD_MOCK_MODE=1`, zero rede e zero credenciais reais) para desenvolvimento local e validação em CI.

> **Segurança de Repositório Público:** Este repositório é público. Jamais versione `.env`, tokens, chaves mestras, CPFs, telefones, e-mails, datas de nascimento ou dados reais de clientes. Todos os testes automatizados utilizam exclusivamente fixtures sintéticas.

---

## Catálogo de Ferramentas LIVE (`v0.12.0` — 30 ferramentas ativas)

O conector expõe até **30 ferramentas ativas** divididas em 4 domínios funcionais:

### 1. CRM, Pedidos e Consultas Analíticas (11 ferramentas)
| Ferramenta | Escopo OAuth | Acesso | Descrição |
|---|---|---|---|
| `crm_capacidades` | `crm.read` | Todos | Inventário dinâmico de ferramentas ativas, `version`, `build_commit` e telemetria de performance. |
| `crm_status` | `crm.read` | Todos | Monitoramento da saúde pública do CRM (`GET /health/live`). |
| `crm_campanha_publica` | `crm.read` | Todos | Consulta pública de pacotes e campanhas ativas. |
| `crm_horarios_publicos` | `crm.read` | Todos | Consulta pública de horários disponíveis por pacote (janela de até 14 dias). |
| `crm_conexao_privada` | `crm.read` | Operador | Identidade do operador logado, abilities Sanctum e fuso horário. |
| `crm_cliente_resumo` | `crm.read` | Operador | Contexto rápido do cliente/lead por telefone, nome ou CPF, com proteção contra homônimos. |
| `crm_cliente_360` | `crm.read` | Operador | Reconstrução 360 forense em 3 camadas: KPIs canônicos vitalícios, status Natal 2026 e histórico paginado. |
| `crm_clientes_buscar` | `crm.read` | Full CRM | Busca avançada de clientes na base geral (incluindo leads sem pedidos e cadastros incompletos). |
| `crm_pedidos_buscar` | `crm.read` | Operador | Busca global paginada de pedidos com ordenação cronológica decrescente. |
| `crm_pedido_detalhe` | `crm.read` | Operador | Auditoria de pedido por ID/UUID: parcelas cent-first, status Google Calendar, bônus e personalização. |
| `crm_renderizar_card_visual`| `crm.read` | Operador | Renderização do Card Visual interativo MCP Apps (`ui://evydencia/crm-visual-card-v2.html`). |

### 2. Inteligência Operacional de Natal (5 ferramentas)
| Ferramenta | Escopo OAuth | Acesso | Descrição |
|---|---|---|---|
| `crm_estatisticas_natal` | `crm.read` | Operador | Inteligência oficial de Natal 2021–2026 (resumo enxuto, `kpi_minimal` `<= 5 KB` ou seções analíticas). |
| `crm_natal_participantes_estatisticas` | `crm.read` | Operador | Demografia familiar: contagem reconciliada de crianças, faixas etárias e anomalias cadastrais. |
| `crm_relatorio_itens_vendidos` | `crm.read` | Operador | Relatório de unidades brutas de itens e produtos vendidos. |
| `crm_relatorio_natal_sem_participantes`| `crm.read` | Operador | Lista de pedidos ativos de Natal sem participantes preenchidos. |
| `crm_relatorio_clientes_natal` | `crm.read` | Operador | Relatório de clientes com ou sem histórico de compra de Natal. |

### 3. Propostas Comerciais (2 ferramentas)
| Ferramenta | Escopo OAuth | Acesso | Descrição |
|---|---|---|---|
| `crm_previa_proposta_natal` | `crm.read` | Full CRM | Simulação de mensagem e cálculo de elegibilidade para proposta de Natal 2026. |
| `crm_enviar_proposta_natal` | `crm.proposal.write` | Full CRM | Agendamento oficial de proposta no CRM. **Exige `confirmado_pelo_operador: true` e `extension:proposal-write`**. |

### 4. Integração Oficial Z-API WhatsApp (12 ferramentas)
| Ferramenta | Escopo OAuth | Acesso | Descrição |
|---|---|---|---|
| `zapi_status_conexao` | `crm.read` | Operador | Status da conexão OAuth 2.1 entre o operador e o servidor MCP oficial Z-API. |
| `zapi_instancia_diagnostico`| `crm.read` | Operador | Diagnóstico em tempo real da instância WhatsApp (bateria, conexão do smartphone). |
| `zapi_instancia_historico` | `crm.read` | Operador | Histórico de conexões e quedas capturado via webhooks e monitoramento do CRM. |
| `zapi_group_metadata` | `crm.read` | Operador | Consulta de metadados, descrição e participantes de grupos WhatsApp via Z-API. |
| `zapi_send_text` | `zapi.message.send` | Operador | Disparo de mensagem de texto via WhatsApp consumindo o MCP oficial Z-API. |
| `zapi_send_image` | `zapi.message.send` | Operador | Envio de imagem via URL com legenda opcional. |
| `zapi_send_video` | `zapi.message.send` | Operador | Envio de vídeo via URL com legenda opcional. |
| `zapi_group_create` | `zapi.group.manage` | Operador | Criação de novo grupo no WhatsApp com participantes iniciais. |
| `zapi_group_add_participant`| `zapi.group.manage` | Operador | Adição de participantes a grupo existente. |
| `zapi_group_remove_participant`| `zapi.group.manage` | Operador | Remoção de participante de grupo. |
| `zapi_group_add_admin` | `zapi.group.manage` | Operador | Concessão de privilégio de administrador a participante do grupo. |
| `zapi_group_remove_admin` | `zapi.group.manage` | Operador | Revogação de privilégio de administrador de participante do grupo. |

Consulte detalhes adicionais em [Matriz de capacidades](docs/CAPABILITY_MATRIX.md) e [Relatório de Hardening](docs/RELATORIO_HARDENING_CIRURGICO_V012_20261026.md).

---

## Validação Local e Suíte de Testes

Pré-requisitos: Node.js `>=22`, npm, Git.

```powershell
npm ci
npm run validate:local
```

A validação local executa deterministicamente:
1. `npm run doctor` — integridade de regras, hooks, estrutura e isolamento de `.env`.
2. `npm run check` — verificação estática de sintaxe (`node --check`) em todos os 43 módulos JavaScript.
3. `npm test` — **157 testes automatizados** aprovados com 100% de sucesso (contratos de pedidos, isolamento multi-operador HMAC, segurança OAuth, Card Visual v2 e invariantes).
4. `npm run smoke` & `npm run conversation:smoke` & `npm run startup:smoke` — testes de integração e inicialização segura.
5. `npm run vps:preflight` — auditoria estática das políticas de isolamento do Docker/VPS.
6. `npm run gateway:bench` — benchmark HTTP local de latência e throughput.

---

## Operação e Deploy em Produção

1. O conector roda como serviço nativo `systemd` isolado (`evydencia-crm-mcp-live.service`) na VPS sob o usuário restrito `evydmcp`.
2. Atualizações são aplicadas exclusivamente via fast-forward na branch `main`:
   ```bash
   sudo -u evydmcp git -C /opt/evydencia-mcp/app fetch origin main
   sudo -u evydmcp git -C /opt/evydencia-mcp/app merge --ff-only origin/main
   systemctl restart evydencia-crm-mcp-live.service
   curl -fsS https://mcp-crm.etijucas.com.br/healthz
   ```
3. **Plano de Rollback Rápido (`< 15 segundos`):**
   ```bash
   sudo -u evydmcp git -C /opt/evydencia-mcp/app checkout 0124e8a56a4aa96a8bff81cb9809a12546bbeb4f
   systemctl restart evydencia-crm-mcp-live.service
   ```
