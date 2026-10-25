---
name: crm-mcp-live-contract-check
description: Homologa a estrutura das consultas existentes na API real do Evydência CRM usando chave somente no Windows, sem expor dados pessoais, sem alterar Laravel e sem conectar o Plugin anônimo ao CRM.
---
# Antigravity Flash — executor, não redesenvolvedor

1. Leia APENAS `docs/API_REAL_LEITURA_GUIA_20261025.md` e `AGENTS.md`. Não abra todos os repositórios nem reescreva a arquitetura.
2. Rode `git status --short`, confira mudanças locais, `git fetch origin` e `git pull --ff-only origin main` quando não houver conflito; preserve go.ps1.
3. Execute `.\scripts\validate-crm-key.ps1`. Sem `.env.live.local`, apenas fixtures offline. Com `.env.live.local`, roda diagnóstico HTTP somente se flags de autorização estiverem 1.
4. Chave é preenchida PELO OPERADOR diretamente em `.env.live.local`; nunca copiar para chat, logs, debug, screenshots ou Git. Não imprimir resposta bruta.
5. Primeiro `CRM_PROBE_FAMILY=extension`, `CRM_PROBE_ACTION=bootstrap`; confira estrutura e `broad_write_abilities`. Só depois customer/history com telefone autorizado e consentimento.
6. Não chamar preview sem opt-in separado: a prévia pode acionar worker de diagnóstico. NÃO chamar schedule nem abort.
7. Se chave legada `SingleAuthentication`, sinalizar que é global e também permite escrita em OUTRAS ROTAS. Usar somente diagnóstico GET com `EVYD_ACK_LEGACY_WRITE_POWER=1`. Nunca ligar ao Plugin.
8. Histórico privado 2021–2025: código já existe em `src/legacy-historical.mjs` e importação é separada, offline e sem clientes. 2026 canônico via `tools/export-natal-digest.php` requer autorização para executar no ambiente Laravel.
9. Para gráficos, o helper `src/chart-ready.mjs` devolve modelo headless; não implemente UI iframe nem lib nova enquanto OAuth LIVE não estiver aprovado.
10. Reporte: HEAD, tests, resultado offline, método de autenticação (sem token), JSON schema status, endpoints com 401/403, prova de não envio e BLOCKED/GO_CONTRACTS_LOCAL. Não habilitar ferramentas LIVE em `src/server.mjs`.
