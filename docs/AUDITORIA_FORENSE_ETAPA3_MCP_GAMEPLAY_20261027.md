# Auditoria forense cruzada — Etapa 3, 27/10/2026
**Escopo:** Avell Antigravity, MCP PR #14, Gameplay PR #43, Media VPS private reader, futura leitura real via ChatGPT. **Somente código/docs em branches Draft; nada em produção foi alterado pelo ChatGPT.**

## 1. Fontes conferidas
- Antigravity relatou 247/247 MCP PASS, 22/22 gateway PASS, 604/604 Gameplay PASS, staging 375 arquivos PASS, PRs CI verdes. Esses números são **evidências locais relatadas**: não extrapolar para commits subsequentes.
- GitHub MCP PR #14: branch `integration/live-35tools-gameplay-reconciled-20261027`, baseada em `release/live-35tools-gameplay-printserver`, status **Draft** e HEAD obtido na consulta de 27/10: `9dce0beb795ad98b75724189f9af6ac8bd1c8b34`. O texto encaminhado por Antigravity menciona `9dce0bee4fe4737759dc23c8a9a207212450ae71`, **SHA divergente**. Não declarar ser o mesmo commit; atualizar ambos por `gh pr view 14 --json headRefOid` e `git rev-parse origin/integration/live-35tools-gameplay-reconciled-20261027`. O recibo existente em GitHub ainda cita o HEAD inicial `582cd9a`.
- Gameplay PR #43 antes desta auditoria: `c7526bf5853157a5b7891f3baaafaca2c39b79f7`; CI histórico verde. Esta auditoria **publicou commits novos** na PR #43, portanto build anterior e CI anterior não aprovam o novo HEAD.
- MCP LIVE `crm_capacidades(verificar_gameplay=true)`, consulta real somente leitura por ChatGPT: `build_commit=e872fac`, branch release, `tools_active_count=35/37`, `gameplay_private_probe={checked:true,reachable:true,status:private_contract_ok,dataset_proven:false}`. Ferramentas de baixa de malotes/retirada **NOT_AVAILABLE**, três PrintServer **LIVE_ACTIVE**. Nenhum cliente foi consultado.

## 2. Achados e correções implementadas
**P0 — Compose não iniciava reader como esperado:** `deploy/vps/docker/compose.private-audit.yaml` declarava serviço `catalog-reader` com `image: node:24-alpine` sem `command`; o `command` no serviço diferente `catalog` de `compose.persistence.yaml` não é herdado. No Gameplay PR #43, `catalog-reader` agora define `command: ['node', 'server/main.js']`, e `tools/deploy/staging-boundaries.test.mjs` possui teste para entrypoint, read-only, loopback e segredo em arquivo. Em deploy, também verificar com Compose o comando final e o arquivo real `server/main.js` no release manifest.
**P1 — smoke MCP aceitava 409 genérico:** `scripts/antigravity/verify-private-gameplay-reader.mjs` agora exige JSON `{error:'CUSTOMER_LINKS_NOT_ENABLED'}` além do status 409, com teste de regressão de 409 alheio ao Gameplay. Sem Bearer ou sem túnel de loopback, NÃO retornar GO.
**P1 — relatório de rollback inseguro:** retirar recomendações de `git checkout SHA && systemctl restart` em árvore LIVE e `docker stop && docker rm` fora do stackctl. Rollback aprovado deve ser via artefatos imutáveis e wrapper do serviço, conferindo hashes e configurações antes/depois; restart simples do Compose não aplica mudanças de `command`/mounts.
**P1 — relatórios superestimam produção:** `GET /` no reader LIVE retornou 200 segundo o Antigravity, portanto **NO-GO sidecar implantado** (binário intermediário `37190a8`, diferente do código endurecido `c7526bf`). `readiness.json` continua com três flags false. CI local não prova permissão de mídia, renderização Phaser, abertura WhatsApp nem dataset real.

## 3. Divergências de documentação corrigidas conceitualmente
- O item visual é `crm_renderizar_card_visual`, não `crm_ui_cartao_resumo`.
- Z-API real é `zapi_instancia_diagnostico`, `zapi_instancia_historico`, `zapi_status_conexao` mais as ferramentas de mensagem/grupo. Não usar nomes inventados nos recibos.
- A presença de `catalog.db`, `catalog.db-wal` com 0 bytes e `catalog.db-shm` não prova restore. Separar consistência do snapshot, integridade, restauração e proveniência. O `VACUUM INTO` e a rotina de restore existente em `tools/deploy/backup-restore-catalog.mjs` são operações distintas; NÃO executar restore contra a base live.
- Sidecar privado apenas indexa estados e contagens; estado `published_unverified` é metadata, não jogo ou foto aberta. Link só por lookup de pedido individual autorizado, condicionado a piloto específico. Nada automático na régua WhatsApp.
- As 35 tools existem na **release atualmente conectada**. Novo build MCP ainda exige verificação independente do inventário real depois de um deploy autorizado.

## 4. Procedimento faseado, com evidência e rollback
1. **GO apenas para homologação local:** Antigravity sincroniza os worktrees sem perder mudanças, roda testes pontuais modificados; depois `pnpm check`, `pnpm release:staging`, `pnpm release:verify`, `npm run gateway:test`, `npm test`, `npm run check`. Registrar HEADs *após* as correções desta auditoria, não usar SHA antigo. CI do HEAD específico.
2. **Preflight VPS somente leitura:** registrar container ID, comando real, hash do bundle, mount read-only (incluindo WAL/SHM), UID/GID, bind 127.0.0.1:4182, exposição ingress, Compose merge final (`config --quiet` e output redigido sem segredos), serviço `stackctl` e artefato de rollback. Anexar **prova de restauração em local temporário** antes de liberar mudança.
3. **Corte SIDE-CAR somente com autorização operacional:** preparar novo release imutável e sua configuração; via `stackctl` executar uma única recriação do **catalog-reader**, sem modificar catalog público, Caddy, outros containers, Laravel, PrintServer nem Z-API. Não usar restart simples para aplicar mounts/command.
4. **Pós-corte:** health 200, raiz/demo/sessions 404, sem Bearer 401, com Bearer legítimo + UUID sintético 200 e `not_found` sem URLs, lookup `include_links:true` 409 com código exato; provar `/internal/*` inacessível pela borda. Se falhar, restaurar leitor anterior via wrapper ou mantê-lo desativado, sem tocar em publicação do catálogo.
5. **Segundo momento real no ChatGPT (somente leitura):** depois de prova de tunnel MCP→Media VPS, ver `crm_capacidades(verificar_gameplay=true)` e `crm_gameplay_auditoria` filtrada, com dados agregados sem PII. Só testar galeria/mídia/jogos com 1 pedido autorizado, ticket separado, grant por sessão, browser Safari/Chrome físico, WebP reais e revogação. Não enviar Z-API nem mover status CRM nessa etapa.

## 5. Critérios e decisões
| Domínio | Estado |
| --- | --- |
| CI dos HEADs anteriores | Histórico verde, confirmado via GitHub |
| Gameplay Compose/command novo | Código e regressão publicados, aguardando novo CI |
| MCP smoke HTTP 409 canônico | Código e regressão publicados, aguardando novo CI |
| MCP LIVE atual | 35/37 ativo; reader privado alcançável, dataset **não** comprovado |
| Sidecar VPS atualmente implantado | **NO-GO** até binário novo, probes completos e rollback |
| Fotos, URL e jogos reais | **NO-GO**, `readiness` false |

## 6. Referências oficiais
- Docker Compose production/selective update: https://docs.docker.com/compose/how-tos/production/
- Compose restart limitations: https://docs.docker.com/reference/cli/docker/compose/restart/
- SQLite WAL/read-only: https://www.sqlite.org/wal.html
- Node 24 sqlite.DatabaseSync: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html

**Handoff da próxima fase:** `docs/PROMPT_ANTIGRAVITY_ETAPA3_MCP_GAMEPLAY_20261027.md`.

## 7. CI real coletado após o patch — diagnóstico específico

- Gameplay HEAD intermediário `90bbd7f5c4bbe4403cae982c3268cc107abaac60`: workflow `CI` run `40594611698`, job `Quality Gates & Build` **FAIL** exclusivamente por `prettier --check .` nos arquivos `tools/deploy/staging-boundaries.test.mjs` e `docs/integrations/GAMEPLAY_STATUS_READ_V1_20261026.md`. O log do próprio CI mostrou **605 testes Vitest e 113 suites PASS** e Depcruise sem violações (522 módulos). Não é falha do comportamento do sidecar.
- O ChatGPT publicou correções de estilo restritas a esses dois arquivos; o novo HEAD Gameplay deve ter o CI acompanhado até resultado final antes de GO. Nunca reaproveitar o CI `c7526bf` nem o resultado FAIL do intermediário como conclusão do HEAD novo.
- MCP PR #14 HEAD após as novas alterações: `d5ae4d6a36a5caad028a9d0995e053189dad690d`, com `Validate MCP` e `MCP validation` retornando **SUCCESS** em consulta ao GitHub. Essa aprovação é de código, não de implantação, banco ou cliente.
