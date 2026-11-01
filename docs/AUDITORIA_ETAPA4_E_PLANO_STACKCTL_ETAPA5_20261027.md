# ETAPA 5 — Homologação do stackctl para corte SOMENTE do catalog-reader

Data: 27/10/2026. Repositórios: MCP PR #14, Gameplay PR #43.
Documento técnico, **sem autorização de deploy**.

## 1. Resultado forense da Etapa 4

O Antigravity concluiu em worktrees locais que Gameplay PR #43 `dd9788e196a549c955378ea6a3e45c88ae8f818a` passou 605 testes, staging com 375 arquivos e CI; MCP PR #14 `e401aab0b7efc0fd3917454826bed3aded145a2a` teve CI aprovado e manteve 35 tools ativas da release. O leitor na Media VPS continuou sob o build `20261027-37190a8`: HTTP 200 `/healthz`, 401 sem Bearer, porém HTTP 200 na raiz (não é o binário endurecido).

Foi demonstrado via Compose sintético que `CATALOG_READER_RELEASE_DIR` não modifica `RELEASE_DIR` dos serviços públicos, porém isso **não** garante que o `stackctl` operacional faça uma atualização isolada.

**P0 — BLOQUEIO REAL:** wrapper host `/usr/local/sbin/stackctl` tem `cmd_deploy()` com `docker compose up -d --remove-orphans` para todos os serviços e `cmd_rollback()` baseado em `docker compose restart`. Não aceita release independente nem alvo de serviço único. O wrapper **não deve ser executado em deploy** no estado atual.

A auditoria no GitHub encontrou no script de checagem local apenas heurísticas de presença de palavras; foi adicionado diagnóstico explícito de `--remove-orphans` e rollback `restart` no `check-stackctl-reader-readonly.mjs`, incluindo regressões para comentários que falsamente declaram suporte. Essa checagem continua sendo revisão estática, e **nunca** aprova produção automaticamente.

## 2. Alteração necessária de stackctl — fase de desenvolvimento

**Atenção:** a cópia canônica completa do wrapper, a política de distribuição e seus testes não estão versionados nas PRs auditadas. O ChatGPT não deve inventar patch por número de linha ou editar a VPS sem o conteúdo e mecanismo de distribuição oficial.

A execução local do Antigravity deve:

1. Identificar repositório/fonte canônica do `stackctl`, origem do arquivo ativo, checksums e forma documentada de atualização. Se a única cópia estiver na VPS, inspecionar por SSH read-only e produzir **versão sanitizada** para revisão em branch *dedicada*, excluindo credenciais, nomes de usuários privados e endpoints de segredos. Não sobrescrever o wrapper LIVE.
2. Na branch de desenvolvimento da **stack responsável**, propor comandos isolados, por exemplo `reader-plan`, `reader-deploy`, `reader-rollback`. Os comandos globais de deploy/rollback devem permanecer como estavam, sem mudar semântica.
3. `reader-plan` deve ser efetivamente **read-only**: validar entrada e gerar resumo redigido do comando, não chamar `up`. Diferenciar checksum real/manifest, mounts ativos, project-name, perfis e variáveis da stack, sem exibir segredo nem `docker compose config --environment` em logs.
4. `reader-deploy` deve exigir release imutável e devidamente verificada, apenas dentro de `/srv/runtime/christmas-games/releases/`, e permitir somente o `catalog-reader`. Paths não absolutos, links simbólicos, conteúdo fora do prefixo e releases sem manifesto devem falhar. Preservar exatamente o `RELEASE_DIR` público e o mesmo `--project-name` da stack LIVE.
5. O único comando mutável futuro aprovado, quando houver autorização separada, é equivalente a `docker compose ... --profile audit-private -f compose.persistence.yaml -f compose.private-audit.yaml up -d --no-deps --no-build catalog-reader`. Não usar `--remove-orphans`, `down`, `rm`, `restart` global ou `up` sem serviço. A topologia real e os arquivos Compose devem ser validados antes de fixar o argv.
6. O wrapper deve manter lock exclusivo (por exemplo `flock`), recibo contendo SHAs/checksums anteriores e novos, timeout e gate rollback. O comando de deploy deve ser livre de `eval` e comandos dinâmicos provenientes de parâmetros. Pré-condição: plano de snapshot e restauração isolada já comprovado.
7. Rollback não equivale a `docker compose restart`. Reverter o reader requer uma release anterior íntegra, imutável, segura e verificada por smoke. **O reader antigo `37190a8` retorna 200 em `/` e não deve ser declarado rollback seguro para o hardening.** Na falta de versão anterior segura, o plano é isolar/desabilitar apenas o reader e registrar degradação do MCP.
8. Tests locais sem VPS mutável: mockar `docker`, confirmar que argv do `reader-plan` nunca invoca `up`; rejeitar `--remove-orphans`, wildcard de serviços, env ausente e `RELEASE_DIR` diferente; simular erro de mount/probe e validação de rollback. Realizar testes de arquivo, serviço e concorrência.
9. Se a fonte do `stackctl` pertencer a outra stack/repo, abrir PR **nesse repo**, sem criar cópia não gerenciada em Gameplay ou MCP. Referenciar MCP #14 e Gameplay #43.
10. Não realizar merge ou deploy nessa etapa. A revisão manual precisa atestar exatamente a execução seletiva do serviço (não basta grep nem CI verde).

## 3. Critérios objetivos de homologação após aprovação específica

- Compile Gameplay `dd9788e` ou um SHA mais recente testado; validar `RELEASE.json`, arquivo `server/main.js` e SHA256, copiar só para uma nova release imutável.
- Antes do corte: comparar modelo Compose normalizado (públicos byte-a-byte idênticos), inspecionar `docker compose --dry-run` se suportado e validar flags/paths do wrapper real.
- Após futuro corte: reader efetivamente novo, loopback 4182, GET /healthz=200; GET /, /demo/fotos, GET e HEAD /s/synthetic=404; POST batch não autenticado=401; POST autenticado com UUID sintético ausente=200 sem URLs; include_links=true=409 com `CUSTOMER_LINKS_NOT_ENABLED`.
- MCP `crm_capacidades(verificar_gameplay=true)` e `crm_gameplay_auditoria` somente leitura. `dataset_proven=false` não se converte automaticamente em prova de mídia.
- Nada de links reais, publicação, mensagens, impressão, alteração de pedidos ou flags `readiness.json` nesta etapa.

## 4. Segregação de riscos

- **MCP LIVE:** 35/37 ferramentas disponíveis; PrintServer, Z-API e OAuth não participam do corte do reader.
- **Gameplay #44:** `restoreCatalog()` tem risco de apagar destino antes de integridade; nunca usar contra LIVE.
- **Banco:** 21 sessões, 22 revisões, 2.073 registros de blobs e backup scratch íntegro foram **relatados pelo Antigravity**, mas não comprovam consistência dos 149 MB de mídia.
- **CI:** no momento da Etapa 4 estavam verdes os HEADs `e401aab` e `dd9788e`. Commits adicionais precisam do seu próprio CI.
- **Autorização:** GO para preparar patch de wrapper em branch; **NO-GO** deploy e clientes.

## Fontes oficiais

- Docker Compose `up`: https://docs.docker.com/reference/cli/docker/compose/up/
- Docker Compose `config`: https://docs.docker.com/reference/cli/docker/compose/config/
- Docker Compose `restart`: https://docs.docker.com/reference/cli/docker/compose/restart/
- SQLite Online Backup API: https://sqlite.org/backup.html
