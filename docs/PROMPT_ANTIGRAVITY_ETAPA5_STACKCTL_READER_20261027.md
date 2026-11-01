# Antigravity — ETAPA 5: desbloquear stackctl-reader com segurança

Objetivo: preparar no Avell a correção **do mecanismo de deploy**, sem fazer corte real. As integrações MCP/Gameplay e Compose passaram nos HEADs da Etapa 4. O bloqueio atual é `BLOCKED_WRAPPER` — `stackctl` na Media VPS executa deploy de toda a stack.

**Primeiro, ler:**
`docs/AUDITORIA_ETAPA4_E_PLANO_STACKCTL_ETAPA5_20261027.md` na PR #14.
Não voltar às etapas 1–4 nem executar testes repetitivos sem mudanças de HEAD.

## 1. Sincronização e evidência

- Usar os worktrees já presentes: MCP `crm-mcp-pr14` (PR #14) e Gameplay `gameplay-code` (PR #43).
- Rodar `git status --short`, `git fetch --prune`, `git rev-parse HEAD`, comparar upstream e fast-forward somente se limpo. Sem reset, force push, rebase desnecessário ou checkout no host.
- Validar novo SHA/CI de ambas as PRs e registrar se não coincidirem com Etapa 4 (`e401aab` MCP / `dd9788e` Gameplay). Não herdar verde dos commits antigos.

## 2. Teste dirigido da melhoria de auditoria

Na PR #14, o ChatGPT fortaleceu
`scripts/antigravity/check-stackctl-reader-readonly.mjs` e os testes
`test/check-stackctl-reader-readonly.test.mjs`.
Agora o relatório identifica riscos de `--remove-orphans`,
rollback por `restart`, e não confunde comentários com implementação.

No worktree MCP:
```powershell
npm ci
node --test test/check-stackctl-reader-readonly.test.mjs test/audit-gameplay-reader-compose.test.mjs
npm run check
npm run gateway:test
```
Use `npm test` apenas se CI do HEAD não estiver verde ou houver código funcional alterado. As 35 tools e as rotas PrintServer/Z-API devem permanecer intactas.

## 3. Análise do wrapper — somente leitura

- Pelo SSH já aprovado, obter origem/autoria do `/usr/local/sbin/stackctl`, `sha256sum`, help e código de funções `cmd_deploy` e `cmd_rollback` **sem imprimir/guardar segredos**.
- O resultado anterior foi `BLOCKED_WRAPPER` porque `cmd_deploy` contém `docker compose up -d --remove-orphans` e o rollback é só `docker compose restart`.
- Localizar a **fonte canônica versionada** do wrapper e seu mecanismo de instalação. Se não houver fonte canônica, criar um plano de migração do wrapper para repositório da stack responsável; não editar o arquivo operacional via SSH nesta etapa.
- A checagem estática é apenas indício. Não confundir `REVIEW_WRAPPER_MANUAL_PROOF_REQUIRED` com GO; validar por testes de argv e dry-run real, sem tocar em produção.

## 4. Implementação em branch de desenvolvimento da stack correta

Propor `reader-plan`, `reader-deploy` e `reader-rollback` com:
- release de leitor independente e imutável por `CATALOG_READER_RELEASE_DIR`, sem alterar `RELEASE_DIR` público;
- `reader-plan` efetivamente read-only, validação do Compose normalizado e dry-run do **serviço único**;
- execução seletiva futura exclusivamente `catalog-reader`, usando `--no-deps` e **nunca** `--remove-orphans`; outras stacks/serviços não podem ser recriados;
- allowlist estrita de paths e UID/GID, locks, manifest SHA256, proibição de symlinks, segregação de segredos e rejeição de variáveis ausentes;
- rollback por artefato anterior realmente seguro, ou desabilitar reader se não existir rollback seguro. O build anterior `37190a8` tem GET `/` 200 e **não deve ser declarado rollback conforme**;
- testes com CLI Compose fake que comprovem argv selecionando um único serviço, sem escrita quando `reader-plan` for chamado, e failure injection de rollback.

Não inserir remendo cego no `stackctl` host. **O ChatGPT não possui a íntegra atual desse wrapper no repositório**, portanto confirme a fonte antes de ajustar. Corrigir e publicar branch/PR na stack proprietária, com CI e referência às PRs Gameplay #43/MCP #14. Se a implementação exigir modificar produção ou sudo write, interromper e documentar.

## 5. Confirmar somente pré-condições, não implantar

- Gameplay PR #43: sem mudanças funcionais novas; confirmar Compose independente e `pnpm release:verify` para o HEAD usado.
- Conferir `docker compose config` com variáveis sintéticas segregadas; `COMPOSE_BOUNDARY_PASS` não comprova wrapper.
- Verificar evidência anterior de SQLite Backup API em scratch. Não usar `restoreCatalog()` sobre LIVE (Gameplay issue #44).
- Conferir que o reader LIVE ainda está no build anterior e a raiz retorna 200, portanto continua NO-GO até futura atualização autorizada.
- Não tocar em Caddy, catálogo público, portas, banco, CRM, PrintServer, Z-API nem `readiness.json`.

## 6. Recibo

Publicar na branch proprietária do wrapper (e referenciar na PR #14):
`docs/RECIBO_ANTIGRAVITY_ETAPA5_STACKCTL_READER_20261027.md`.

Incluir:
1. repo/caminho/fonte canônica do `stackctl`, SHA inicial e plano de distribuição;
2. PR de alteração do wrapper (ou BLOCKED_SOURCE caso fonte ausente);
3. testes de argv, dry-run e isolamento, com hashes e CI do SHA;
4. critérios GO local, NO-GO deploy até autorização; proposta de cut e rollback;
5. sem segredos, UUIDs de clientes ou dump bruto de Compose.

**Não executar nenhum deploy, merge, restart, docker up/down, mudança de env/stackctl LIVE, publicação de fotos, impressão ou disparo WhatsApp.** Entregar recibo único, sem ficar em loop de testes.
