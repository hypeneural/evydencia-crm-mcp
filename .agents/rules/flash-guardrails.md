---
trigger: model_decision
description: "Guardrails para tarefas de engenharia do MCP no Antigravity/Gemini 3.8 Flash, incluindo código, contratos, tools, scripts e segurança."
---
# Procedimento anti-alucinação
1. Primeiro git status --short + localizar arquivo e fonte verificável.
2. Formule a hipótese em 1 frase; cite path:linha, contrato e teste. Caso não exista evidência marque UNVERIFIED e NÃO implemente live.
3. Prefira patches de no máximo 3 arquivos por ciclo, exceto scaffolding/documentação.
4. Escreva teste negativo antes do patch. Rode node scripts/doctor.mjs, npm run check, npm test, npm run smoke, npm run conversation:smoke.
5. Não altere testes só para passar, não relaxe validações e não substitua mocks por placeholders de dados reais.
6. Se falhar, capture comando, saída, arquivo e causa; corrija uma causa por vez.
7. Só marque GO_LOCAL com logs dos gates. Somente indique GO_CHATGPT_MOCK após conexão com ChatGPT efetivamente testada.
8. Nunca anuncie tool de escrita como disponível: WRITE_GATED não é tool invocável.
