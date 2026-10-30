# P0 — Integração EvydFlow no MCP LIVE / ChatGPT — auditoria arquivo a arquivo
Data 30/10/2026. PLAN ONLY — nenhuma escrita em produção. Repositório de execução irmão `hypeneural/evydflow`, PR #55, documentação `docs/production/P0_MCP_REMOTE_WORKFLOW_FILE_MATRIX_20261030.md` na branch `docs/p0-mcp-remote-workflow-20261030`.

## Estado verificado
Repositório MCP `main`, `package.json` versão 0.12.0 Node >=22; `src/live-gateway.mjs` implementa `createMcpHandler` Streamable HTTP /mcp, `McpServer.registerTool`, autenticação Bearer por operador, `oauth-gateway.mjs` OAuth, manifesto de capabilities, rate limiting, telemetria e handler `node:http`. `scripts/start-gateway.mjs` hospeda gateway. O MCP LIVE consultado pelo ChatGPT em 30/10: build `2f7755d`, operador 2, scopes efetivos `crm.audience.export,crm.read`. Não existe ferramenta de execução EvydFlow exposta. NÃO confundir build em Git com VPS.
`AGENTS.md` refere runtime systemd em /opt/evydencia-mcp/app; `deploy/gateway/compose.yaml` e `stack.yaml` são artefatos offline antigos com topologia/hostname diferente. Não aplicar docker compose no ambiente LIVE sem descobrir processo real. `docs/OPENAI_PLUGIN_DEPLOYMENT.md`, `docs/ONE_COMMAND.md`, `docs/DEPLOYMENT.md` ainda descrevem MOCK inicial, antes do LIVE OAuth; atualizar com adendo, sem destruir histórico.

## Achado P0 de OAuth
`src/oauth-gateway.mjs` `verifyAccessToken` lê sealedScopes do token, mas para acesso *não* `sc_narrow` calcula `effectiveScopes=eligible` da autorização atual. Assim um token antigo pode adquirir novo escopo adicionado ao conjunto eligible posteriormente, sem consentimento/grant original explícito. Ao introduzir `evydflow.execute` isso é inseguro. **Pré-requisito**: `effectiveScopes = sealedScopes.filter(s=>eligible.includes(s))` para todos os tokens; validar refresh, reautorização e degradação CRM. Suporte de novos escopos exige consentimento novo e reconexão do plugin, nunca herdar `crm.read`. Regression tests antes de produção.

## Matriz arquivo por arquivo (MCP)
| Arquivo | Evidência | Intervenção mínima |
|---|---|---|
| `src/live-gateway.mjs` | `LIVE_TOOL_NAMES`, `manifest()`, `OUT_CAPACIDADES`, `liveServer()`, wrapper `reg()`, `createGateway()` e `/mcp` | Adicionar 4–6 tools `evydflow_*` com schema Zod estrito, annotations hints honestos e requiredScopes separados; manifesto dinâmico só declara active se agente/broker realmente configurado. Injetar bridge em `liveServer` sem poluir CRM |
| `src/oauth-gateway.mjs` | `supportedGatewayScopes`, `ALL_WRITE_SCOPES`, `computeGrantedScopes`, `verifyAccessToken` | Corrigir P0 no intersection sealed∩eligible; adicionar `evydflow.read`, `evydflow.execute`, `evydflow.music.generate`, `evydflow.music.send` condicionados a flags/ACL e consentimento explícito. Não conceder a sessão existente por padrão |
| `src/capabilities.mjs` | manifesto legado para MOCK/stdio | NÃO confundir com inventário LIVE; não adicionar tool somente neste manifest |
| `src/server.mjs` | stdio MOCK/legado, sem OAuth por usuário | NÃO ALTERAR nesta fase; tools remotas só no gateway LIVE |
| `src/core.mjs` | facade allowlist Laravel CRM | NÃO ADICIONAR operações de Windows nem endpoints arbitrários |
| `src/live-abilities.mjs` | valida abilities do CRM | Examinar apenas para mapear operador; autorização EvydFlow separada, não inventar `extension:evydflow-write` no CRM |
| `src/zapi-mcp-client.mjs` e `src/zapi-mcp-tools.mjs` | ponte OAuth por operador para Z-API | NÃO reutilizar envio direto para a música/fotos; EvydFlow outbox é autoridade dos recibos e dedupe |
| `src/mcp-ui-cards.mjs` | recurso UI cards visual | Opcional; status JSON estruturado primeiro; sem card obrigatório para MVP |
| `scripts/start-gateway.mjs` | Node HTTP + graceful shutdown | Verificar inicialização/parada de broker e erro sem vazamento. Preferir novo serviço broker/agent isolado se necessário |
| `deploy/gateway/gateway.env.example` | placeholders com operador/CRM/segredos | Adicionar apenas variáveis NÃO secretas e caminhos de segredo para broker/tenant; sem segredo no Git |
| `deploy/gateway/compose.yaml`, `stack.yaml`, `Caddyfile.snippet` | referência offline histórica e hostnames divergentes | Não aplicar diretamente; documentar runtime REAL systemd e endpoint Caddy live; somente mudança aditiva previamente validada |
| `AGENTS.md`, `docs/CAPABILITY_MATRIX.md` | catálogo anterior de 30 tools, não corresponde necessariamente ao build LIVE | Atualizar após implementação com capability `EVYDFLOW`, escopo e evidência; preservar contratos legados |
| `docs/OPENAI_PLUGIN_DEPLOYMENT.md`, `docs/AUDITORIA_OPENAI_CHATGPT_MCP_V012_20261025.md` | URLs docs OpenAI e notas de conexão Plugin | Acrescentar adendo v0.12 LIVE, refresh/re-scan de tools e autenticação por operador |
| `test/live-gateway.test.mjs`, `test/security-hardening.test.mjs`, `test/plugin-metadata.test.mjs` | cobrem gateway/token | Acrescentar apenas testes focais de novos schemas/scopes/error mappings |
| `scripts/verify-vps-deployment.mjs` | preflight VPS offline | Acrescentar verificação broker configurado e sem exposição do agente (opcional depois de GO local) |

## Arquivos NOVOS MCP sugeridos
- `src/evydflow-bridge.mjs`: cliente tipado do broker local persistente (SEM acesso ao disco Windows ou execução de shell). APIs: status, preview, enqueue, poll, proofs, reconcile. Timeout curto e payload pequeno, `redirect:'error'`, allowlist host fixo, resposta validada. Não reutilizar `crmClient`.
- `src/evydflow-tool-schemas.mjs`: esquemas de input/output Zod com `paths` 1..20, strings curtas, caminho Windows/UNC somente; sem URI HTTP arbitrária; `request_id` UUID; `batch_id` opaco; erro sanitizado.
- `src/evydflow-broker.mjs`: persistência leve (se não houver broker já existente): tabela commands com command_id PK, operator_id, batch_id, request_id UNIQUE por operador, payload_digest, expires_at, state, lease_until, created_at; receipts eventuais; inbox polling do agente; não armazenar fotos/MP3/tokens ou caminho original nos logs. Se PrintServer já expõe broker aplicável, reaproveitar infra sem compartilhar fila de impressão e sem mudar serviço atual.
- `test/evydflow-bridge.test.mjs`: contrato, degraded/offline, timeout, conflito/replay, respostas parcials.
- `test/evydflow-oauth-scope.test.mjs`: token anterior NÃO ganha novo scope, consentimento novo, refresh e auth degrade; nenhuma tool write sob `crm.read`.
- `docs/EVYDFLOW_PLUGIN_RUNBOOK.md`: onboarding ChatGPT, rescan, GO/NO-GO, rollback, saúde.

## Interface ChatGPT MCP (contratos)
`evydflow_status` readOnly: responde `agent_connected`, SHA do worker realmente observado, timestamp last heartbeat, canonical DB readiness, queue stats (sem PII).
`evydflow_previa_pastas` readOnly: `{paths:[...],profile:'natal_digital_completo'}` → `preview_id,expires_at,snapshot_digest,rows` por pedido; nenhum envio, rascunho, ACL de Drive ou cobrança.
`evydflow_executar_lote` WRITE: `{preview_id,snapshot_digest,request_id,confirm_live_whatsapp,confirm_paid_music,soclick_submit:false}` → `batch_id,queued,execution_ids`; operador com scopes emitidos E aprovados, TTL, recipient/revision bound. Nunca inferir consentimento pelo texto de descrição da tool.
`evydflow_lote_status` readOnly, `evydflow_pedido_provas` readOnly, `evydflow_reconciliar` readOnly (reconciliação segura sem reenvio).
Opcional `evydflow_aprovar_musica` WRITE separado: exige `approved_media_sha256`, consentimento explícito, escopo `evydflow.music.send` e não gera música adicional. Não faça `music_send` automático sem autorização do hash exato.
Todos retornam `structuredContent` consistente e texto resumido, não apenas HTTP 200. Sent = accepted, delivered requer webhook. `tools/list` não deve anunciar ferramenta desativada como ativa.

## Segurança e topologia
Browser ChatGPT → HTTPS `mcp-crm.etijucas.com.br/mcp` (OAuth resource, AS metadata, Bearer, operador) → broker server-only com fila durável → agente Windows com conexão **de saída** autenticação mútua + comando assinado e TTL → FastAPI 127.0.0.1 e worker supervisionado, via adaptador local; responses persistem no broker para consultas futuras no chat.
Nada de abrir porta 8095 externa; não aceitar URL arbitrária, executável, comando PowerShell, cron, hostnames arbitrários nem symlinks reparse. A verificação de policy `soclick_submit=false` é redundante gateway+Windows; nenhuma tool SóClick de envio físico.

## Protocolos/documentação para checar durante implementação
- OpenAI Plugins: `https://developers.openai.com/plugins/build/mcp-server`, `/build/auth`, `/deploy/connect-chatgpt`, `/build/tools` (consultar versão atual ao implantar).
- MCP specification authorization, transport, tool metadata: `https://modelcontextprotocol.io/specification`.
- Contratos locais: `docs/OPENAI_PLUGIN_DEPLOYMENT.md`, `docs/AUDITORIA_OPENAI_CHATGPT_MCP_V012_20261025.md`, `docs/CHATGPT_MCP_HARDENING_20261025.md`, `docs/RELATORIO_HARDENING_CIRURGICO_V012_20261026.md`, `AGENTS.md`.
- Plugin custom deve ter tools descobertas/atualizadas após deploy; não assumir que GitHub commit cria ferramenta conectada ou que skills `.agents` são importadas automaticamente.

## Execução Antigravity em ordem / cortes cirúrgicos
P0a: fetch origin; inspecionar worktrees, SHA main e produção; não editar branches ativas de outros agentes. Criar PR estreita.
P0b: corrigir scope intersection + teste. Confirmar token já emitido não amplia privilégios.
P0c: bridge/read-only status+preview via agente, sem expor caminhos nem PII. Teste de contrato local + um handshake real SEM envios.
P0d: ferramenta executar lote idempotente; aprovação explícita/TTL/digest. Agente consome, cria `production_execution_requests`, worker existente age. Música SHA approval em tool separada.
P0e: query receipts e reconciliação. Offline windows sinaliza `AGENT_OFFLINE`, nunca fake success.
P0f: publicar no gateway LIVE pelo procedimento systemd/Caddy realmente implantado, sem reiniciar CRM, Z-API, PrintServer ou Gameplay. Smoke de read-only do MCP, reconnect/rescan ChatGPT, tools observadas `crm_capacidades`, `evydflow_status`; um pedido sintético, depois canário real explicitamente autorizado.
P0g: Rodar apenas `node --test test/evydflow-bridge.test.mjs test/evydflow-oauth-scope.test.mjs test/live-gateway.test.mjs`, `npm run check` uma vez por HEAD integrado e verificação curta do gateway; evitar `npm run validate:local` repetido sem necessidade.
Rollback: feature flag OFF remove tools evydflow, agente para de consumir, preserva comandos e recibos; OAuth atual e CRM tools continuam disponíveis. Não revogar tokens desnecessariamente, mas reautorizar scopes novos.
GO: token original read-only não consegue executar; preview read-only funciona; enqueue devolve 202/queued e ids; double-submit replay não duplica; música crédito/aprovação separados; X-URL 8095 inacessível externamente; store canônico preservado; webhook de entrega reconhecido; shutdown/restart broker não perde estado.
