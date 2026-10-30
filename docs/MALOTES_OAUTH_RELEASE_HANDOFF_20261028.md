# Handoff MCP / malotes — 28/10/2026

## Responsabilidades
- **Antigravity**: `hypeneural/evydencia-crm-mcp` e `hypeneural/printserver`, exclusiva VPS MCP, deployment só após gates.
- **Codex**: `hypeneural/evydencia-crm`, issue #431 / PR #437, HIGH e release do Laravel. Nunca usar a API legada de status para malotes.

## Evidência observada
- ChatGPT CRM LIVE: `build_commit=564ae0b`, branch Gameplay families, 36/38 tools, OAuth operador 2 com `crm.read` e `print.jobs.write` sem `crm.orders.write`; `crm_marcar_disponivel_retirada` e `crm_processar_malotes_retirada` estão NOT_AVAILABLE.
- Gameplay lookup privado responde `private_contract_ok`, porém `dataset_proven=false`; não usar como atestado de browser/media.
- A PR #12 contém proteção por modo; a linha da Gameplay PR #15 perdeu isso durante reconciliação.
- CRM PR #437 ainda DRAFT, HIGH FAIL no teste `OperationalNotificationDispatchTest`; rota #431 não comprovada no CRM LIVE.
- PrintServer PR #1 em HEAD `968e299`, CI anterior verde; commit do agente local `e94be13` preservado fora do remoto. Não fazer force push nem reimprimir.

## Patch nesta branch
1. Reintroduz `requiredMalotesModeScopes` e seus testes de três modos.
2. Adiciona configuração OFF por padrão `EVYD_MALOTES_PRINT_BATCH_ENABLED`, independente da escrita.
3. Gateway registra `so_imprime` sob `print.jobs.write`; `so_baixa` sob `crm.orders.write`; `baixa_e_imprime` exige ambos. O acesso é verificado também durante a execução do handler, não só no schema.
4. A manifestação `crm_capacidades` informa o batch de modo coerente com suas flags; adiciona teste OAuth para imprimir sem habilitar baixa comercial.
5. Preserva exclusivamente código e testes existentes de Gameplay, Z-API, propostas, leitor de CRM e impressão unitária; nenhuma alteração em Laravel/broker e nenhum deploy.

## Gates Antigravity (offline primeiro)
- Usar worktree novo no HEAD desta PR, nunca reset/rebase/force no clone divergente. `npm ci`, `npm test`, `npm run gateway:test`, `npm run check`; registrar SHA e CI real.
- Confirmar que todos os métodos `crm_gameplay_*` seguem disponíveis e que `crm_capacidades` não promete scopes não concedidos.
- Testar OAuth sintético: operador com apenas print ganha somente `so_imprime`; operador com apenas ready ganha `so_baixa`; ambos ganham os três modos; OFF expõe nenhum lote. Confirmação literal true; jamais chamar CRM ou impressora real no teste.
- Verificar PR #1 PrintServer e estado LIVE de fila/tombstones `queued/claimed/unknown` antes de qualquer release da VPS MCP.
- Se CI e testes OK, publicar só na VPS MCP por deploy oficial com snapshot/rollback. Manter `EVYD_MALOTES_READY_WRITE_ENABLED=0` e `EVYD_MALOTES_BATCH_ENABLED=0`; flag print batch OFF até autorização de smoke isolado.
- Não imprimir nova etiqueta real, cancelar fila, reenviar unknown, modificar CRM Laravel, reiniciar serviços alheios ou alterar Z-API.
- Reconsultar `crm_capacidades` após rollout e provar `build_commit` e ferramentas legadas antes de qualquer ativação.
- `spooled` não significa papel físico. Nunca afirmar WhatsApp entregue a partir da baixa.

## Gates Codex
- Retomar PR #437 dentro da issue #431 e claim real conforme `AGENTS.md`, reconciliar `main`.
- Investigar por que HIGH falha em `OperationalNotificationDispatchTest`, sem adulterar outro domínio para obter PASS.
- Confirmar duas conexões MySQL, guarda financeira em centavos, snapshot de status, replay e `DB::afterCommit` do observer.
- Avaliar `request_id`: é validado e logado, mas falta evidência de ledger durável por requisição. Exigir reconciliação em caso de timeout e não reenviar notificação por repetição de baixa.
- Só após HIGH PASS, revisão da política de mensagens e publicação Laravel com autorização separada: emitir Sanctum de operador exclusivo com `extension:orders-ready-write`, allowlist, kill-switch, e verificar rota por leitura segura.
- Sem mudança de status real no canário até confirmação explícita.

## GO
**GO de integração/código somente após CI no HEAD desta PR. NO-GO de baixa comercial até CRM #437 HIGH+release e permissão OAuth efetiva.**
