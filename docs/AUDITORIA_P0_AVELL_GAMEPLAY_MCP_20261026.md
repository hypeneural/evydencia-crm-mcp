# Auditoria forense P0 — Gameplay × Evydência CRM MCP × Avell
**Data:** 26/10/2026 • **Alvo:** Windows 11 Avell com impressora e MCP já operando.

## Fontes de código auditadas
- `hypeneural/gameplay` PR #43, branch `feat/gameplay-status-read-api-20261026` baseada na PR #30 (SQLite publication stack).
- `hypeneural/evydencia-crm-mcp` PR #11, branch `feat/gameplay-read-client-20261026` baseada em main (gateway LIVE v0.12, OAuth e Z-API mantidos).
- `hypeneural/evydflow` PR #54 apenas como consumidor futuro: não clonar no Avell, não implementar painel nesta fase.
- Gameplay `AGENTS.md`, `apps/catalog-server/AGENTS.md`, `deploy/readiness.json`, `publication/SessionRepository.ts`, `publication/GameplayStatusLookup.ts`, `main.ts`, `CatalogServer.ts`.
- MCP `AGENTS.md`, `src/live-gateway.mjs`, `src/oauth-gateway.mjs`, `src/legacy-api-read.mjs`, `src/gameplay-read-client.mjs` e testes.

## Correções aplicadas após auditoria
1. **P0 Windows npm.cmd:** `spawnSync('npm')` não é execução confiável de lançador `.cmd` no Windows. O Avell agora despacha `npm ci`, `npm test` e `npm run gateway:test` através de `cmd.exe`, com allowlist de argumentos constantes. Teste cross-platform de geração da chamada.
2. **P0 isolamento do Avell:** workspaces separados em `%LOCALAPPDATA%\Evydencia\Antigravity\gameplay-mcp-20261026`. Nunca usar o diretório do MCP operacional nem mexer na impressora. `--refresh` só com git limpo e merge `--ff-only`; recusam-se remoto/branch inesperados e junctions/symlinks para árvore operacional.
3. **P0 autorização:** ferramentas Gameplay de links só são registradas quando o gateway tem `EVYD_ENABLE_OPERATOR_FULL_CRM=1`, credencial CRM direta com contexto OAuth por operador e configuração Gameplay válida. Um token Gameplay isolado não concede ferramenta de consulta administrativa.
4. **P0 configuração multi-instância:** `oauth-gateway.gatewayConfig(env)` captura a configuração Gameplay válida do env recebido, sem `process.env` implícito dentro do servidor MCP. Uma opção inválida desabilita Gameplay, não interrompe as demais ferramentas do CRM/Z-API. Teste OAuth sintético confirma discovery condicional.
5. **P0 origem do link:** endpoint REST interno privado e domínio público `https://jogos.fotosdenatal.com` são autoridades distintas; URLs de capability são verificadas contra a origem pública fixa.
6. **P0 escopo de busca:** filtros `product.slug=natal`, criação em 2026, CRM `detailLevel='resumo'`, com paginação `has_more` booleano obrigatório e travas contra filtro ignorado (ID/UUID). Em nomes ambíguos, pedir seleção do pedido; não enviar links em massa.
7. **P0 precisão do estado:** a consulta Gameplay é puramente SELECT/SQLite; checa sessão ACTIVE, revisão ACTIVE, manifesto, IDs exatos de variantes READY e hash de token da sessão **inclusive no batch**. O estado `published_unverified` não declara sucesso no navegador/Phaser.
8. **P0 vazamento:** somente consulta individual autorizada com `include_links=true` pode gerar `hub_url`/`gallery_url`; endpoint `lookup-batch` e auditoria MCP retornam null. Nunca logar token, telefone, foto, cabeçalho bearer ou URL capability.
9. **P1 eficiência:** CRM na auditoria faz normalmente 2 buscas de até 25 pedidos e Gameplay 1 batch até 50 para população de 22 pedidos observada em 26/10; esse número é snapshot, não constante da implementação. Limite de 80 páginas por filtro com falha fechada, sem partial success enganoso.
10. **P1 contratos:** novos `OUT_GAMEPLAY_LINKS` / `OUT_GAMEPLAY_AUDIT` tipados em Zod, `crm_capacidades` condicional; timeout e resposta 64KiB fail-closed.

## Onde o Antigravity deve olhar (em ordem)
1. Abrir `docs/PROMPT_ANTIGRAVITY_FLASH_AVELL_20261026.md`, executar o bloco PowerShell que cria clones isolados e chama `scripts/antigravity/prepare-avell.mjs`. Em seguida consultar `LEIA_PRIMEIRO.md` e `antigravity-preflight.json` gerados.
2. Testes offline em MCP: `node scripts/validate-gameplay-read.mjs`; opcionais no clone isolado: `node scripts/antigravity/prepare-avell.mjs --workspace <w> --run-mcp-tests`.
3. Gameplay: consultar CI da PR #43 em Node 24/pnpm 11.19.0. **Não alterar Node global do Avell (Node 22)**.
4. Teste de permissão e falha: garantir que sem full CRM nenhuma ferramenta de link esteja exposta; que quando Gameplay cair haja erro `gameplay_unavailable`, nunca `not_found`.
5. Verificar CI do SHA atual e reportar GO/NO-GO. Não rodar deploy nem ajustar `gateway.env` real.

## Dados CRM vs Gameplay
- **Autoridade de Natal 2026:** CRM. Regras de cobrança: status atual `waiting_product_retrieve` (10) OU `order_completed` (12). Não adicionar estado intermediário 11.
- **Autoridade de publicação digital:** Gameplay, sem inventar links por ordem, nome, telefone, ou URLs legadas.
- **Estados:** `not_found` sem sessão, `not_published` sem revisão ACTIVE, `partial` com inconsistência, `revoked` acesso retirado, `published_unverified` metadados íntegros sem prova de execução no navegador.
- **Falha de rede:** erro, nunca falta de galeria.
- **Perf:** medir latência p95 só em teste privado/sintético; não afirmar número sem medição.

## Bloqueio de produção fora deste hotfix
`deploy/readiness.json` do Gameplay ainda declara `pilotReady=false`, `customerDataAllowed=false`, `automaticDeliveryAllowed=false`. A PR #43 depende da PR #30 e da cadeia de publicação/autorização de mídia. Antes de cliente real: reconciliação da branch na principal, Caddy bloqueando `/internal/*` no público, backup/restauração SQLite WAL, media auth grant entre A/B, SHA VPS, smoke no navegador Android e Safari iOS. O Antigravity **não deve** ativar a feature por configuração apenas.

## Gate de decisão
**GO desenvolvimento isolado:** clonagem em workspace protegido, testes sintéticos e revisão de CI.
**NO GO dados reais/deploy:** qualquer readiness false, rede privada/Caddy não provados, publisher/mídia não reconciliados ou CI vermelha.

## Documentações oficiais verificadas
- Node.js child_process (Windows: arquivos `.cmd` demandam `cmd.exe` ou shell controlada):
  https://nodejs.org/api/child_process.html
- Git sparse checkout (cone) e clonar:
  https://git-scm.com/docs/git-sparse-checkout
  https://git-scm.com/docs/git-clone
- MCP structuredContent e outputSchema:
  https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- OWASP API1 BOLA:
  https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
