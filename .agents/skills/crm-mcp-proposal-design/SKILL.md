---
name: crm-mcp-proposal-design
description: Planeja de forma segura a confirmação e idempotência da API de propostas de Natal antes de habilitar envio no ChatGPT.
---
# Implementação de propostas — fase seguinte
- Prévia: POST /api/v1/extension/proposals/preview, com extension:proposal-read.
- Escrita: POST /api/v1/extension/proposals/schedule, com extension:proposal-write + autorização can_send_proposals.
- Request real: request_id UUID estável, phone, name **presente** (null se sem nome), resend_mode normal, X-Idempotency-Key idêntico ao UUID.
- A confirmação deve conter telefone mascarado, nome/variante, conteúdo e escopo full_cadence ou initial_whatsapp_only.
- Persistir o request_id e status da intenção ANTES da chamada; confirmação autenticada por usuário, expiração curta, uso único e verificação de versão da prévia.
- Idempotência CRM complementa (não substitui) journal no MCP. Em timeout manter mesmo UUID; nunca criar nova tentativa até reconciliar.
- Proibir send_again e abort_and_resend neste MVP. Não expor cancelamento automático.
- 201=agendado; 200=replay; nenhum deles garante entregue/lido. 409/403/422/429/503 preservados como estado sem retry cego.
- Exigir OAuth autenticação individual antes de exposição remota; simples prompt não é barreira suficiente para confirmar envio.
- Geração de código de escrita SOMENTE em branch dedicada com testes e flag OFF.
