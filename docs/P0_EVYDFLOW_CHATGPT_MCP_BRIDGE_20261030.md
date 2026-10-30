# P0 — EvydFlow no ChatGPT via MCP LIVE (auditoria do gateway e contrato de implantação)
**Data:** 2026-10-30 · **Escopo:** `hypeneural/evydencia-crm-mcp` + contrato de integração com `hypeneural/evydflow` · **Estado:** PLANO AUDITADO, NÃO IMPLANTADO

## 0. O que é factual
- O gateway LIVE já existe: `src/live-gateway.mjs` implementa `createMcpHandler`, `requireBearerAuth`, catálogo `registerTool` e `/mcp` sobre Node/HTTP; `scripts/start-gateway.mjs` inicia o servidor.
- `src/oauth-gateway.mjs` fornece OAuth, verificação por operador e escopos; `crm_capacidades` expõe catálogo e commit. `src/server.mjs` é entrada **stdio MOCK**, não alvo desta feature.
- O conector observado pelo ChatGPT em 30/10/2026 era `v0.12.0`, build `2f7755d`, scopes `crm.audience.export` e `crm.read` (não concedia escrita EvydFlow).
- O repositório EvydFlow fornece `POST /api/production/runs/{run_id}/execution` (202 = persistido, **não concluído**), `GET .../progress`, `GET .../events`, bancos canônicos e worker. A API é loopback autenticada e same-origin: NÃO expor 8095.
- `AGENTS.md` e `docs/OPENAI_PLUGIN_DEPLOYMENT.md` estão parcialmente desatualizados: mencionam 30 tools e ausência de gateway OAuth, ao passo que `src/live-gateway.mjs` já tem OAuth; `deploy/gateway/compose.yaml`/`stack.yaml` são legado de compose enquanto `AGENTS.md` documenta systemd. NÃO implantar compose por engano.

## 1. Referências oficiais atuais verificadas em 30/10/2026
- OpenAI Plugin MCP server: https://developers.openai.com/plugins/build/mcp-server
- OpenAI Plugin OAuth: https://developers.openai.com/plugins/build/auth
- OpenAI conectar/testar: https://developers.openai.com/plugins/deploy/connect-chatgpt
- OpenAI API MCP: https://developers.openai.com/api/docs/mcp
- MCP transport 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP autorização 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

**Compatibilidade:** use a versão de protocolo negociada pelo SDK/ChatGPT; NÃO portar silenciosamente comportamento de transports `draft` (há revisão 2026-07-28 diferente). MCP remoto HTTPS/OAuth, `tools/list`, anotações corretas, schemas explícitos; não é necessário MCP UI para MVP. Após publicar novas tools, atualizar/reescanear conexão Plugin no ChatGPT e testar discovery real, não somente healthz.

## 2. Revisão por arquivo: gateway (MODIFY / CREATE / PRESERVE)
| Caminho | Decisão | Revisão/alteração exigida |
|---|---|---|
| `src/live-gateway.mjs` | MODIFY mínimo | Importar `registerEvydflowTools`; incluir nomes em reserved tool names e capabilities, erro seguro, injeção de transporte, tool registry. Evitar ampliar arquivo monolítico de 1178 linhas com lógica de broker. |
| `src/oauth-gateway.mjs` | MODIFY P0 antes de WRITE | Escopos separados `evydflow.read` / `evydflow.execute`; NÃO conceder execução baseada apenas em `crm.read`; autorização do operador/consent. Consertar `effectiveScopes=a.sc_narrow?sealedScopes.filter(...):eligible`: novos write scopes não podem surgir em token já emitido; fazer interseção com scopes selados e elegíveis, testando reauth/refresh, sem quebrar tokens legados. |
| `src/capabilities.mjs` | PRESERVE MOCK | Manifest de stdio MOCK não reflete LIVE; atualizar somente se houver razão de contrato, sem adicionar write em MOCK. |
| `src/core.mjs` | PRESERVE | Adaptador CRM Laravel não deve receber lógica Windows/evydflow. |
| `src/server.mjs` | PRESERVE | Stdio/mocks permanecerem isolados. |
| `src/live-abilities.mjs` | AUDIT | Reutilizar operador já validado, mas não inferir permissão EvydFlow das abilities de CRM. |
| `src/zapi-mcp-client.mjs` / `zapi-mcp-tools.mjs` | PRESERVE | Não enviar mídia do gateway: entrega somente pelo outbox canônico do EvydFlow. |
| `src/evydflow-tools.mjs` | CREATE | Registro das tools, schemas Zod, annotations, `structuredContent`, mensagens/erros concisos. |
| `src/evydflow-bridge.mjs` | CREATE | API de comando tipada para broker, sem shell arbitrário, sem acesso SQL do CRM, timeouts e idempotência. |
| `src/evydflow-broker.mjs` | CREATE ou ADAPTAR broker existente verificado | Persistir jobs e resultados no host. Preferir plataforma de polling já implantada se contrato/segurança forem equivalentes; não fazer integração com banco PrintServer nem com CRM. |
| `src/evydflow-agent-auth.mjs` | CREATE (se necessário) | Credencial de máquina independente, validação de nonce/timestamp/HMAC ou mTLS; nunca reutilizar token OAuth do usuário como token de máquina. |
| `scripts/start-gateway.mjs` | MODIFY somente se preciso | Lifecycle/close do broker/agent; não ativar bridge automaticamente sem feature flag. |
| `deploy/gateway/gateway.env.example` | MODIFY | Flags `EVYD_EVYDFLOW_ENABLED=0`, storage persistente, agent registration, timeouts e limites, sem segredos reais. |
| `deploy/gateway/compose.yaml`, `stack.yaml` | DOCUMENTAR COMO LEGADO | NÃO alterar/deployar sem provar topologia atual; produção documentada em systemd sob `/opt/evydencia-mcp/app`. |
| `docs/CAPABILITY_MATRIX.md`, `AGENTS.md` | MODIFY APÓS prova | Atualizar somente quando ferramentas estiverem realmente registradas e visíveis, com contagens derivadas do runtime. |
| `docs/OPENAI_PLUGIN_DEPLOYMENT.md`, `docs/DEPLOYMENT.md` | MODIFY posterior | Corrigir distinção legado MOCK vs LIVE atual, não apontar a túnel como requisito do LIVE existente. |
| `test/live-gateway.test.mjs` | EXTEND mínimo | `tools/list`, `tools/call`, OAuth e sem regressão das antigas. |
| `test/evydflow-auth.test.mjs` | CREATE | Tokens antigos sem nova permissão, scopes, operador errado, replay, 401/403. |
| `test/evydflow-bridge.test.mjs` | CREATE | Agent offline, lote/replay, resultado incerto, envelopes e redaction. |

## 3. Interfaces MCP MVP (não existem hoje; PROPOSTA DE CONTRATO)
1. `evydflow_status({})` — readOnly, `evydflow.read`; versão gateway, agente Windows, last_seen, worker SHA, fila, sem path/PII.
2. `evydflow_previa_lote({folders:[...],profile:"natal_digital_completo"})` — readOnly semanticamente **somente se não registrar run, draft ou enviar**; analisa caminhos localmente, CRM GET, revision, destinatário mascarado, passos já comprovados, custo possível, bloqueios; retorna `preflight_id`, `snapshot_digest`, validade curta.
3. `evydflow_executar_lote({preflight_id,snapshot_digest,request_id,confirmado_pelo_operador:true})` — WRITE controlado, scope `evydflow.execute`, autorização explícita na interação atual e no gateway; persiste lote, devolve `batch_id` + `QUEUED`; não espera serviços externos nem presume entrega.
4. `evydflow_consultar_lote({batch_id})` — readOnly, `evydflow.read`; resumo de N pedidos + estados.
5. `evydflow_consultar_pedido({batch_id,order_number})` — readOnly, recibos completos sanitizados, música e Z-API com status distintos.
**Posterior, se necessário:** `evydflow_reconciliar` e `evydflow_cancelar`, com semântica não reenviar e não cancelar efeito já aceito.

**Entrada:** caminho Windows absoluto `L:\NATAL\...` ou URI `file:///L:/NATAL/...` normalizada no **agente Windows**; rejeitar URL HTTPS como se fosse pasta local. Aceitar vários paths; limitar número e bytes, caminho canônico sob raízes allowlist, negar symlink/junction/reparse/UNC não autorizados. Nada de SSH, Powershell, subprocesso ou URL arbitrária por argumento MCP.

## 4. Segurança que NÃO pode ser simplificada
**P0 de OAuth:** `src/oauth-gateway.mjs` linhas próximas a `verifyAccessToken` recalculam escopos de tokens legados pela elegibilidade atual (`effectiveScopes`); ao introduzir `evydflow.execute`, usar sempre interseção scopes gravados no token + atuais + consentimento, inclusive refresh. Teste antigo token CRM read não ganha novo scope. `securitySchemes` corretos nas ferramentas e check server-side dentro do handler.
- OAuth do ChatGPT autentica operador; o token de máquina do agente Windows tem audiência/capacidades **diferentes** e usa somente APIs internas. Não encaminhar upstream Sanctum ao agente e não permitir a um segredo da máquina realizar tools do chat.
- O preflight fixa operador, pedido/CRM UUID, `fingerprint`, revisão, telefone mascarado na resposta, perfil/etapas, conta/custo musical e flags, digest do conjunto e expiração; execução confere os mesmos bytes e destinatários antes de WRITE.
- `confirmado_pelo_operador:true` isolado **não basta**. Exigir scope + preflight id + digest + autorização operacional real. Proibir explicitamente `soclick_submit`, VoIP e reenvio. Música paga e mídia aprovada pelo SHA têm gates independentes; não contornar.
- Isolar operador/tenant em todos os SELECTs. Logar `batch_id`/`execution_id`/códigos de erro; nunca nome, telefone, token, URL-capability de galeria, arquivo, letra, áudio ou caminho completo.
- Credenciais no host em `/srv/secrets/...`, no Windows em `C:\Evydencia\secrets`. Monitorar e rotacionar segredos históricos expostos, sem publicar bytes em PR.
- Sem retry automático de POST após timeout potencialmente aceito: `UNKNOWN_OUTCOME` e conciliação por `request_id`.

## 5. Broker persistente e isolamento (MVP)
- `/mcp` continua OAuth ChatGPT. Criar endpoints internos tipados `/internal/evydflow/agent/poll` e `/internal/evydflow/agent/report` **somente** com autenticação de agente, TLS, replay/nonce e rate limit; agente inicia toda conexão de saída do Windows. Não abrir Windows 8095.
- Broker mantém `batch_requests` (batch_id, operator_id, request_id unique por operador, preflight_digest, state, times), `batch_items` (batch_id, item_id, agent_id, run_id, execution_id, status), `batch_events` (seq, batch_id, item_id, state, proof_digest, timestamp), `agent_registry` (agent_id, operator scope, last_seen, release).
- Uma camada durável em armazenamento já aprovado da VPS, ou arquivo SQLite isolado persistente se comprovado o lifecycle systemd; **nunca memória volátil** nem SQLite de CRM/SóClick/PrintServer. Guardar payload de path cifrado ou em tabela de filas privada; purgar somente por retenção política. Unicidade de `(operator_id,request_id)`, vínculos por ID, leasing CAS. Resposta da tool não deve incluir caminhos/fontes sensíveis.
- Poll devolve comando tipado `PREFLIGHT|SCHEDULE|STATUS|RECONCILE` com deadline/nonce, e assinatura; agente reporta somente metadados sanitizados + recibos. Deduplicar por command_id.

## 6. Implantação real sem alterar CRM nem quebrar 37+ tools
- Antes de deploy: comparar `crm_capacidades.build_commit`, `git rev-parse HEAD`, `systemctl cat evydencia-crm-mcp-live.service`, `systemctl status`, `ss -lntp` e proxy Caddy. **Não assumir Docker**: docs oficiais internas estão divergentes.
- Gate de rollout: feature flag OFF por padrão; testar com gateway local e agente fake; ativar ferramenta somente após API Windows demonstrar worker e recibos reais. Atualizar escopos no OAuth/conexão ChatGPT e confirmar discovery efetiva.
- Sem alterar `src/server.mjs`, CRM Laravel, ZAPI original ou outros serviços da VPS. Medir latência: status read deve ser rápido; execução devolve 202 imediatamente. Sem timeouts de 30–60s para música.

## 7. Testes mínimos determinísticos
1. `node --check src/live-gateway.mjs src/oauth-gateway.mjs src/evydflow-tools.mjs src/evydflow-bridge.mjs` (ajustar comando para Node instalado).
2. `node --test test/evydflow-auth.test.mjs test/evydflow-bridge.test.mjs test/live-gateway.test.mjs`.
3. Um handshake MCP real `tools/list` no gateway local com OAuth do operador, somente dados sintéticos.
4. Uma única verificação integrada no HEAD final antes de implantar e um smoke de status read-only depois do deploy; não repetir `npm run validate:local` em cada mudança.
5. ChatGPT real: instalar/atualizar conexão Plugin, confirmar `evydflow_status` listada e scope efetivamente concedido. Sem canário real não marcar GO_EXECUTE.
6. Canário de envio apenas se autorizado e sem reexecutar pedidos históricos.

## 8. Estados e critérios de aceite
- `PREFLIGHT_OK`, `QUEUED`, `RUNNING`, `WAITING_EXTERNAL`, `PARTIAL`, `COMPLETED_WITH_PROOF`, `NEEDS_RECONCILIATION`, `FAILED`, `OFFLINE`; cada etapa também expõe `PROVIDER_ACCEPTED` diferente de `DELIVERED` e `READ`.
- Sem agent online ou sem versão runtime verificada: ferramenta `evydflow_status` informa bloqueio, e WRITE fica indisponível; sem fingir sucesso.
- `HTTP 202` = fila criada, não cliente notificado.
- Evidência por `order_number`, `run_id`, `execution_id`, `crm_order_uuid`, `revision`, `fingerprint`, provider_message_id (privado), SHA de artefato e data/hora.

## 9. Sequência exata para Antigravity (não loops)
1. **Fazer leitura de main e deste plano**, sem mexer no CRM. Verificar o build da VPS. Criar branch de implementação própria a partir de main.
2. Corrigir contract OAuth de scopes selados; teste focal de regressão dos tokens atuais.
3. Criar broker tipado persistente + transporte de polling de agente; testes de replay/offline.
4. Criar tool registration em módulo separado e ligar 5 tools ao gateway; atualizar manifest com estado REAL, não promessas.
5. Integração sintética com cliente Windows fake; nenhum WhatsApp/cobrança nesta etapa.
6. Implantar somente gateway com flag OFF e rollback para SHA anterior, observar saúde.
7. Integrar com agente EvydFlow da PR irmã, permitir flag de leitura, validar status.
8. Ativar execução após consentimento OAuth atualizado e canário autorizado.
9. Uma suíte focada por arquivo alterado, UMA suite integrada por HEAD final; evidências em documento redigido de IDs/hash, sem PII.
10. Parar no primeiro bloqueio real; reportar `COMPROVADO | PENDENTE | ERRO | SHA | COMANDO`. Não rodar testes infinitos.

## 10. Dependência do outro repositório
Documento irmão: `hypeneural/evydflow/docs/production/P0_MCP_REMOTE_WORKFLOW_IMPLEMENTATION_20261030.md` na branch `docs/p0-mcp-remote-workflow-20261030`.
**Este documento é planejamento e revisão; nenhum endpoint nem ferramenta nova foi implantado neste commit.**
