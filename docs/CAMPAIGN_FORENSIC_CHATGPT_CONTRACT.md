# ChatGPT MCP — Campanhas forenses / Issue #29 (preparação)

**Não implantado.** `EVYD_CAMPAIGN_AUDIT_TOOLS_ENABLED=1` é opt-in explícito no gateway; default desligado, e o backend tem a flag `extension.campaign_forensic.enabled=false` por padrão. Esta branch sai de `feat/p0-oauth-print-incremental-auth-issue-27`
observada no build LIVE `9157ca6` em 31/10/2026, para preservar funcionalidades
que ainda não estão na `main`. PR deve ser reconciliada com #28 e #24 antes de merge.

## Ferramentas registradas nesta preparação

1. `crm_campanha_atividade_detalhe({contact_id})` — plano capturado, etapas,
   contadores por canal, estado, lacunas de materialização e link da atividade.
2. `crm_campanha_atividade_evidencias({contact_id,kind,channel?,cursor?,limit?})` —
   páginas de `items|events|attempts|callbacks|decisions`, até 100 registros;
   `channel` aceita `whatsapp|sms|email|voice` menos para decisions.
3. `crm_campanha_voz_diagnostico({contact_id})` — último **item registrado**
   de voz, última tentativa HTTP, resumo de voz. `provider_health=not_queried`,
   `audio_completed=not_verified_from_item_summary`: não confundir com disponibilidade
   atual nem comprovação de áudio completo.

4. `crm_campanhas_saude_operacional({})` — últimos sinais por conta de integração: tentativas HTTP, callbacks e erros em 24h; não é prova de saúde online.\n\nTodas readOnlyHint=true, destructiveHint=false, openWorldHint=false; acesso
`crm.read` no gateway + **ability específica** `extension:campaign-audit-read`
validada pelo backend. São apenas dicas de ferramenta: a permissão real é do CRM.

A ferramenta atual `crm_propostas_natal_consultar_lote` ainda serve para
**localizar o `contact_id` de até 50 telefones**. A partir daí, o detalhe e
as evidências novas permitem acompanhar o histórico longo em páginas.

## Semântica e limites

- `scheduled` confirma agendamento, **não** envio.
- `provider_accepted` confirma recebimento do provedor, **não** entrega.
- WhatsApp `RECEIVED` comprova entrega e `READ` leitura; `READ_BY_ME`
  não comprova leitura pelo cliente.
- SMS `DELIVRD` é o recibo de entrega; ausência de DLR é `unknown`.
- Velip API v2: HTTP 200 e `return.status_code=0/OK` provam aceite de API, não DLR. `httpdup` evita duplicidade em janela e erro 244 indica duplicidade, exigindo reconciliação, não novo MakeSMS. Conferir retorno `WR` conforme `VelipSmsProvider`.
- Resend `email.delivered` refere-se ao servidor destino; multi-destinatários
  podem ter resultados individuais desde 22/01/2026.
- SmartVoice: 202 = comando `QUEUED`; 409 = conflito de identidade/tentativa;
  `ANSWERED` não prova `AUDIO_COMPLETED`, e DTMF exige evento comprovado.
- `has_more=true` não permite alegar ausência de evidência.
- `campaign_state=legacy_closed` não prova execução completa da régua.
- `service_health=not_queried` não deve ser reportado como serviço saudável.
- Nenhum conteúdo de mensagens, e-mails, headers sensíveis ou tokens.
- `CRM 503` com flag desligada retorna falha explícita, não lista vazia.

## Contratos técnicos

`src/campaign-forensic-client.mjs` usa somente endpoints GET fixos em
`/api/v1/extension/campaign-audit/activities/{contactId}` e
`/evidence`, HTTPS/localhost, bearer da conexão autenticada, redirects proibidos,
timeout configurável, corpo máximo 768 KiB e validação de envelope.

`src/campaign-forensic-tools.mjs` registra os três tools com descrições de
seleção por intenção, input/output Zod e anotação estritamente read-only.

`src/live-gateway.mjs`: inclusão cirúrgica do registrador e catálogo; não altera
rotina de envio nem `proposal-intent-journal`.

## Dependências e gates

- Backend CRM #469 deve ser publicado **antes**, após CI/QA e operador aprovar.
- Configuração `extension.campaign_forensic.enabled` começa false.
- Tokens existentes não ganham ability nova automaticamente.
- Testes sintéticos novos:
  `node --test test/campaign-forensic-client.test.mjs test/campaign-forensic-tools.test.mjs`.
- Codex precisa executar `npm ci`, `npm run validate:local` e benchmark canônico
  no SHA final; não afirmar testes executados a partir deste commit remoto.
- Testar que o catálogo MCP continua íntegro (PrintServer, Z-API, Meta, Gameplay,
  CRM proposal), que erros 401/403/429/503 são diferentes e que nenhum POST comercial
  ocorre em reads.
- Projetar leaf posterior (CRM #469/MCP #29) de `lookup` por múltiplos telefones,
  pesquisa global por campanha, anomalias, callbacks órfãos e indicadores de saúde
  de workers/provedores em endpoints autenticados. Não implementar diagnóstico
  de disponibilidade usando resultados de mensagens passadas.

## Documentação oficial
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/reference
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://v2.developer.z-api.io/
- https://developers.velip.com.br/api/v2/getting-started/
- https://developers.velip.com.br/api/v2/rate-limits/
- https://resend.com/changelog/webhook-event-visibility

Sem API de polling SmartVoice pública validada aqui; usar o contrato proprietário
atualmente implementado em `SmartVoiceVoiceProvider::pollStatus` como fonte
canônica e testar sinteticamente antes de expor saúde em nova ferramenta.
