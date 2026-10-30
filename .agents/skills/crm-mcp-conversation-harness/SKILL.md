---
name: crm-mcp-conversation-harness
description: Testa conversas em fixtures com o protocolo MCP 2026-07-28, sem LLM, dados reais ou envios.
---
# Harness
1. node scripts/doctor.mjs, npm run check, npm test, npm run smoke, npm run conversation:smoke.
2. Exigir getProtocolEra() modern e structuredContent igual a JSON de texto.
3. Assert WRITE_GATED ausente das tools registradas e mock=true/source=fixture nas simulações.
4. Conferir docs/CONVERSATION_PLAYBOOK.md. Se falhar reportar comando, saída e patch mínimo.
