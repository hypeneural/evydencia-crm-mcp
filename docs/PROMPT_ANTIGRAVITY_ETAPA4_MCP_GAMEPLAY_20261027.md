# Antigravity — Etapa 4 (preflight leitor privado, SEM DEPLOY)

Leia antes o recibo canônico da Etapa 3 em
`docs/RECIBO_ANTIGRAVITY_ETAPA3_MCP_GAMEPLAY_20261027.md` e o novo
runbook na Gameplay PR #43 em
`docs/integrations/READER_ONLY_CUT_PREFLIGHT_20261027.md`.

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
