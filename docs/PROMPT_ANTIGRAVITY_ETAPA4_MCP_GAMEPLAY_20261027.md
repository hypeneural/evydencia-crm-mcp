# Antigravity — Etapa 4 (preflight leitor privado, SEM DEPLOY)

Leia antes o recibo canônico da Etapa 3 em
`docs/RECIBO_ANTIGRAVITY_ETAPA3_MCP_GAMEPLAY_20261027.md` e o novo
runbook na Gameplay PR #43 em
`docs/integrations/READER_ONLY_CUT_PREFLIGHT_20261027.md`.

## Adendo de auditoria — falhas bloqueantes eliminadas no repositório

**Errata obrigatória:** o recibo HISTÓRICO da Etapa 3 (§6, passo 2) sugere
`RELEASE_DIR=<novo-reader>` no `stackctl`. Essa instrução era anterior ao
isolamento da Etapa 4 e **não pode ser executada**: mudaria o bundle público
do catálogo/gateway. A variável nova é **somente**
`CATALOG_READER_RELEASE_DIR=<bundle-privado-imutavel>`, enquanto
`RELEASE_DIR` deve conservar o caminho PÚBLICO atual.

Foram publicados scripts de auditoria em PR #14, sem escrita, rede ou
alteração de configuração:
- `npm run gameplay:compose:audit -- --gameplay-root "<WORKTREE_GAMEPLAY>"`.
  Lê os modelos normalizados de `docker compose config --format json`
  com variáveis **SINTÉTICAS**, verifica mounts, flags, redes, UID/GID,
  porta loopback e igualdade estrutural de `catalog` e `gateway`
  ANTES/DEPOIS do overlay. Só `COMPOSE_BOUNDARY_PASS` comprova
  o contrato offline; não comprova release VPS.
- `node scripts/antigravity/check-stackctl-reader-readonly.mjs --stdin`.
  Aceita a origem do wrapper por pipe SSH protegido, analisa somente
  indicadores sem executar comandos do wrapper e imprime flags
  booleanas; `BLOCKED_WRAPPER` exige parar. Mesmo
  `REVIEW_WRAPPER_MANUAL_PROOF_REQUIRED` **não autoriza o corte**:
  precisa de dry-run documentado do `stackctl` real com alvo
  `catalog-reader`, env separadas e zero dependências recreadas.
- Testes sintéticos `node --test test/audit-gameplay-reader-compose.test.mjs
  test/check-stackctl-reader-readonly.test.mjs`; falhas devem interromper
  a execução, sem fallback para `docker compose up` manual.

Inspeção remota read-only **se o operador SSH autenticado ainda tiver
permissão** (na worktree MCP local, sem gravar wrapper em disco):
```bash
ssh vpsops@169.58.210.14 'sudo -n cat /usr/local/sbin/stackctl' |
  node scripts/antigravity/check-stackctl-reader-readonly.mjs --stdin
```
Não imprimir texto do wrapper nem segredo. Se `sudo` falhar ou não
mostrar suporte, `BLOCKED_WRAPPER`. Somente suporte estático NÃO prova
que `stackctl` atualiza um único serviço; executar apenas os modos
help/config/dry-run COMPROVADAMENTE não mutáveis, conforme documentação
real do wrapper. Se não existirem, classificar `BLOCKED_WRAPPER`.

**P0 SQLite WAL:** conforme SQLite oficial, montagens somente leitura
de banco em modo WAL exigem `-wal` e `-shm` legíveis/existentes ou
outra abertura suportada. Verificar no UID do container; a presença
dos três arquivos no host não comprova abertura pelo reader.
NÃO copiar `catalog.db` isoladamente e não usar `restoreCatalog()`
contra destinos LIVE (Gameplay issue #44). Preparar prova de backup
online + `integrity_check` + restauração em scratch SEM mutar produção.

## Por que existe esta etapa?

O ChatGPT confirmou diretamente no GitHub que os HEADs da Etapa 3
(`2a8f0dd` MCP / `ab672a4` Gameplay) tinham CI verde. Também testou
o MCP conectado em modo somente leitura: build `e872fac`, 35/37
ferramentas ativas; `private_contract_ok` mas `dataset_proven=false`.
A auditoria agregada de status 10 e 12 de Natal 2026 retornou 22
pedidos, 16 publicações sem prova de browser, 6 pendências, 525 fotos
registradas nos manifests e **22 entregas de links não verificadas**.
Essas contagens são um snapshot, não prova de fotos físicas, vídeo,
browser ou envio.

## Correção adicional aplicada em Gameplay PR #43

O overlay do reader antes usava `RELEASE_DIR`, compartilhada com o
catálogo público; uma operação Compose futura poderia renderizar o
catálogo público para outro bundle. Agora as três montagens de release
do leitor utilizam **exclusivamente**
`CATALOG_READER_RELEASE_DIR`, obrigatória e independente do
`RELEASE_DIR` público. A regressão está em
`tools/deploy/staging-boundaries.test.mjs`.

**Não tentar instalar usando o antigo RELEASE_DIR como substituto.**
Primeiro confirmar se `/usr/local/sbin/stackctl` permite passar a
variável separada e executar a atualização de apenas um serviço.
Sem essa comprovação, `BLOCKED_WRAPPER`.

## Faça agora, no Avell e sem interação com clientes

1. `git fetch --prune` nos worktrees existentes. Registrar HEADs,
   `git status --short`, upstream e CI nos **HEADs novos**;
   sem `reset`, merge, força ou mudanças em release LIVE.
2. Gameplay PR #43: rodar testes direcionados
   `pnpm exec vitest run tools/deploy/staging-boundaries.test.mjs`.
   Depois `pnpm check`, `pnpm release:staging`, `pnpm release:verify`
   uma única vez no novo SHA. Conferir o bundle 375 arquivos/manifesto,
   seus hashes e `server/main.js`. Se número de arquivos mudar,
   registrar o valor real sem tentar forçar 375.
3. MCP PR #14: não mudou código funcional nesta Etapa 4;
   validar `git status`, `npm run gateway:test`,
   `node --test test/gameplay-integration-release.test.mjs` e
   CI do HEAD. Comparar apenas o inventário real de 35 ferramentas,
   com ferramentas de malotes de escrita NOT_AVAILABLE.
4. Fazer *dry-run* do Compose **com valores sintéticos** e as duas
   variáveis distintas `RELEASE_DIR` e `CATALOG_READER_RELEASE_DIR`.
   A checagem de sintaxe `config --quiet` é insuficiente: conferir
   renderização efetiva do modelo Compose, mounts de `catalog-reader`,
   `catalog` e `gateway`, comando, perfis, redes e bind
   `127.0.0.1:4182`. **Não publicar a saída completa**, que pode
   incluir paths e variáveis privadas.
5. SSH pontual READ-ONLY à Media VPS: inspeção do wrapper
   `stackctl` (somente help/show/status), montagem e imagem efetivas
   de `catalog-reader`, versão `37190a8` se ainda for a mesma,
   prova de 200/401 e estado de GET `/` com 404 ou 200. Não imprimir
   nem copiar segredo. Resolver comandos exatos do wrapper pelos seus
   docs/help antes de qualquer proposta de execução. **Não executar
   upload, docker up, restart, stop, rm, merge ou modificação de env**.
6. Preparar plano de snapshot SQLite via backup online, verificação e
   **restauração isolada em diretório de teste**, incluindo cópia
   consistente dos arquivos de mídia se existir dependência.
   Somente observar/planejar nesta rodada, sem restaurar produção.
7. Registrar uma lista de ações de corte FUTURO para `catalog-reader`
   com bundle imutável, hashes, sequência de atualização seletiva via
   `stackctl`, probes reais 200/401/404/409 com segredo já provisionado
   no próprio host, critérios de GO e rollback seguro. Nenhum outro
   serviço pode ser recriado.
8. Preparar a etapa seguinte de ChatGPT: `crm_capacidades` e
   `crm_gameplay_auditoria` só leitura, e teste físico de mídia
   por um pedido **especificamente autorizado**, somente depois
   dos gates do reader. Sem Z-API, publicação ou link automático.

## Entrega única

Criar em MCP PR #14:
`docs/RECIBO_ANTIGRAVITY_ETAPA4_MCP_GAMEPLAY_20261027.md`
com HEADs, CI dos HEADs, hash do novo bundle, Compose normalizado
com provas *redigidas* (sem segredos), suporte real do `stackctl` à
variável independente, plano de snapshot/restore e evidências
`PROVADO / NÃO_PROVADO`.

Classificar:
- **GO código/CI** somente após novos gates.
- **GO preflight reader** somente se Compose, wrapper e rollback
  demonstrados.
- **NO-GO para deploy** até autorização operacional separada.
- **NO-GO cliente real** até grants, mídia e Safari/Chrome físico.

Pare de modo explícito ao encontrar BLOCKED_WRAPPER ou outros riscos
sem tentar contorná-los. Não pedir confirmações sobre o que já foi
respondido nem repetir suites aprovadas no mesmo SHA.

## Pendência desacoplada do backup/restore

Gameplay [issue #44](https://github.com/hypeneural/gameplay/issues/44):
`restoreCatalog()` pode excluir banco/WAL/SHM de um destino existente antes
de validar sua integridade SQLite, e pode remover o diretório de mídia.
**Não execute essa função contra LIVE** como parte do preflight.
A solução de fail-closed/rollback será tratada em PR separada. Não
alterar os scripts de restauração durante esta homologação do reader.
