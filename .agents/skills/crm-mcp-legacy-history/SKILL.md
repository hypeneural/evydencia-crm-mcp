---
name: crm-mcp-legacy-history
description: Auditoria e importação OFFLINE de agregados históricos Natal 2021–2025 a partir do repositório privado legado, sem PII e sem ferramenta MCP LIVE.
---
# Fluxo estrito Gemini Flash
1. Leia APENAS `docs/FORENSE_LEGADO_NATAL_20261025.md`.
2. Confirme `git status --short` antes de atualizar; preservar alterações locais.
3. Execute `npm run validate:local` e `.\scripts\validate-mvp.ps1` sem acesso ao CRM.
4. Nunca transportar `data/natal_2026_buyers.json`, `natal_master_customers.json`, `customer_last_participants.json` ou quaisquer CSVs de clientes para o Git MCP público.
5. Importação histórica real NÃO deve ser executada sem autorização do operador e pasta privada ACL; `npm run history:import` requer `--source`, `--output`, `--cutoff`.
6. `LEGACY_UNVERIFIED` não equivale a `data_status_2025=OK`; nunca somar dados legados ao digest canônico.
7. Plugin atual permanece MOCK 17 ferramentas. Sem dados reais, OAuth, SQL amplo ou envio.
8. Relate HEAD, testes, verificações, diferença entre histórico fixo e 2026 dinâmico, pendências reais. Não repetir pesquisa ampla.
