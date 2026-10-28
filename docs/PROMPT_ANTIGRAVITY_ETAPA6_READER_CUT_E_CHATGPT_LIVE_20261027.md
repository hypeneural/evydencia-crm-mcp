# ANTIGRAVITY — ETAPA 6 — Corte único catalog-reader + teste real MCP no ChatGPT

**Intenção operacional confirmada:** implantar o leitor privado na Media VPS, depois
validar a leitura do Gameplay por este ChatGPT. NÃO publicar fotos, abrir
capability URLs, enviar WhatsApp, alterar pedidos ou imprimir etiquetas.
Não repetir os 605 testes Gameplay e os 248 MCP em SHAs inalterados.

## O que o ChatGPT já fez (GitHub)
- Gameplay PR #43: `dd9788e196a549c955378ea6a3e45c88ae8f818a` (CI verde; reader e Compose revisados).
- MCP PR #14: integração sobre release das 35 ferramentas; CI verde na
  entrada desta revisão. **Não foi implantada.**
- SmartDialer PR #39: `feat/stackctl-catalog-reader-guard-20261027`,
  alterada pelo ChatGPT para verificar **todos** os hashes de
  `RELEASE.json`, restringir paths e symlinks, exigir Python3,
  comparar Compose público/privado, exigir no pós-corte 200 health,
  404 público/HEAD e 401 sem token, além de parar apenas o reader
  se o smoke falhar. Instalação atômica com SHA pinado por script
  `scripts/install-stackctl-reader-guard.sh`.
- **BLOCKER importante:** CI da PR #39 foi observado em FAILURE; logs de job
  retornaram BlobNotFound na conexão GitHub. Acessar pelo `gh`
  na máquina local antes de promover. Testes em sandbox mockado
  **não substituem** CI do novo HEAD e não atestam deploy real.
- Dossiê operacional da PR #39:
  `docs/CATALOG_READER_ONE_SHOT_CUT_20261027.md`.

## Etapa A — Local, objetiva (uma vez por novo SHA)

1. Nos 3 worktrees, `git status --short`, `git fetch --prune`,
   `git rev-parse HEAD`; fast-forward apenas se worktree limpo.
2. Resolver a CI vermelha da **PR #39**: usar
   `gh pr checks 39 -R hypeneural/smartdialer-platform` e
   `gh run view <run_id> -R hypeneural/smartdialer-platform --log-failed`.
   Último run anterior observado `40618146264`, mas usar o ID do HEAD
   atual. Se falha de infraestrutura, registrar razão e não inventar PASS.
   Corrigir uma vez a causa objetiva, com push só na PR #39.
3. Rodar só `bash -n scripts/stackctl scripts/install-stackctl-reader-guard.sh`
   e `python3 -m unittest discover -s tests -p test_stackctl_reader.py -v`
   na plataforma. Se wrapper corrigido, simular com Docker mockado:
   `reader-plan` sem `up`, `reader-deploy` apenas `catalog-reader`,
   retorno 404/401 e contenção de falha. O teste antigo em `/tmp` pode
   precisar de fixture de release com allowlist **/srv/runtime/christmas-games/releases/**;
   jamais flexibilizar a allowlist do wrapper de produção para acomodar mock.
4. Verificar CIs correntes #14 e #43 uma única vez. Não repetir suíte de
   605 testes se Gameplay ainda estiver no SHA `dd9788e`.

## Etapa B — Pré-corte na Media VPS

1. Conferir acesso autorizado a root/instalador. `vpsops` possuir
   `sudo NOPASSWD: /usr/local/sbin/stackctl` **não** autoriza
   `sudo bash install...`. Se root não disponível, `BLOCKED_PRIVILEGE`.
2. Não executar `git checkout` de PR no `/srv/platform` main.
   Preparar worktree isolado contendo PR #39 em
   `/srv/platform/worktrees/stackctl-reader-guard`, e comparar SHA
   do `scripts/stackctl` com o revisado no GitHub.
3. Inspecionar versão ACTIVE, Compose project labels e IDs de
   `christmas-games-catalog` e `christmas-games-gateway`, mounts e
   `RELEASE_DIR` efetivo; preservar ambos byte a byte.
4. Garantir `compose.private-audit.yaml` da PR #43 no diretório oficial
   `/srv/platform/stacks/christmas-games`, sem sobrescrever base.
   Se o overlay não estiver presente ou conflitar com a stack real,
   abortar e documentar (não improvisar Compose).
5. Preparar NOVO bundle em
   `/srv/runtime/christmas-games/releases/<release-id>` com o
   `RELEASE.json` íntegro, o conteúdo de `.release/vps` do SHA
   testado, UID/GID adequados e todos os arquivos read-only, sem symlinks.
   Verificar caminhos de segredo host por ACL, sem ler/imprimir valores.
6. Preservar o backup SQLite via Backup API + restauração scratch já
   demonstrada. Não usar `restoreCatalog()` contra LIVE (issue #44).

## Etapa C — Instalação controlada + corte (uma única tentativa)

Somente **se CI #39 verde, GitHub SHA estável, root autorizado e
preflight isolado comprovado**:

1. Instalar wrapper com script pinado
   `scripts/install-stackctl-reader-guard.sh <candidate> <sha256>`
   executado como root via canal previamente autorizado. Esse script
   preserva backup e só modifica `/usr/local/sbin/stackctl`.
   Verificar SHA256 instalado. Não alterar outros serviços.
2. Executar
   `stackctl reader-plan christmas-games <immutable-reader-release>`.
   Exigir `COMPOSE_BOUNDARY_PASS` e `PREFLIGHT_PASS`, público
   sem drift, mesmo Compose project que a stack viva.
3. Executar UMA VEZ
   `stackctl reader-deploy christmas-games <immutable-reader-release>`.
   Deve passar por `--no-deps --no-build catalog-reader` sem
   `--remove-orphans`. Exigir `READER_HARDENING_SMOKE_PASS`.
   Não executar `stackctl deploy christmas-games`.
4. Comparar IDs de containers `catalog`/`gateway`, mounts,
   uptime, domínios públicos e Caddy antes/depois. Se houver mudança,
   **NO-GO** e conter reader. Se o reader falhar, wrapper para apenas
   o reader; NÃO revertê-lo a `37190a8` (serve HTML na raiz).
5. Usar o segredo leitor já provisionado **em arquivo** dentro de
   contexto SSH seguro (nunca argv/log) para smoke autenticado
   com UUID sintético: batch 200 `not_found`, zero URLs;
   single `include_links:true` 409 com
   `CUSTOMER_LINKS_NOT_ENABLED`. Confirmar bloqueio de
   `/internal/*` na borda pública.

## Etapa D — Handoff para validação AQUI no ChatGPT

**Pare após o corte reader-only bem-sucedido**, sem alterar MCP LIVE.
Retorne na conversa recibo enxuto SEM secrets/PII:
- SHAs GitHub/instalado do wrapper, reader bundle e Compose;
- `READER_HARDENING_SMOKE_PASS` + 200/404/401/200-auth/409-json;
- IDs público/gateway ANTES/DEPOIS iguais;
- status de release/binário efetivo do reader;
- `NO-GO` explícito para mídia pública e WhatsApp;
- se travar: um código preciso (`BLOCKED_CI`,
  `BLOCKED_PRIVILEGE`, `BLOCKED_COMPOSE`, `BLOCKED_SMOKE`)
  sem tentativas em loop.

Depois disso, o ChatGPT chamará `crm_capacidades(verificar_gameplay=true)`
e `crm_gameplay_auditoria` em LIVE apenas leitura, validará
`private_contract_ok`, 35/37 tools, PrintServer e os estados agregados.
Se necessário, haverá **corte MCP independente** para PR #14,
mediante runbook oficial e diff do inventário, sem misturar o
corte do reader com Z-API, CRM ou PrintServer.

**Proibições:** sem `--remove-orphans`, `docker compose down`,
reset/force, edição no main vivo, `restoreCatalog()` em LIVE,
exposição de UUIDs/tokens reais, publicação, mensagens, labels,
escritas CRM ou flags readiness.
