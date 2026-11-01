# Antigravity — Continuação executável no Avell: pedidos × fotos × Gameplay

**Data 26/10/2026. Sem loops de testes.** O Avell Windows 11 opera impressora e MCP; os repositórios **já estão clonados** e o Gameplay não deve ser instalado globalmente. Você está usando Gemini 3.8 Flash. **Não refaça arquitetura, branches ou instalações.**

**Objetivo novo:** demonstrar relação `order_id` do CRM → `order_uuid` → `photo_sessions.crm_order_uuid` no Gameplay, status atual 10/12 (obrigação), fotos **publicadas** e fotos **em preparação** separadas, e deixar explícito que o hub publicado não prova que os jogos foram executados no navegador.

**PRs existentes:**
- `hypeneural/evydencia-crm-mcp` PR #11, branch `feat/gameplay-read-client-20261026`;
- `hypeneural/gameplay` PR #43, branch `feat/gameplay-status-read-api-20261026` (ainda baseada na PR #30).

## ETAPA A — uma única rodada local segura

PowerShell 5.1, sem privilégios de administrador:

```powershell
$ErrorActionPreference='Stop'
$w=Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
$m=Join-Path $w 'crm-mcp-dev'
$g=Join-Path $w 'gameplay-code'
foreach($p in @($m,$g)){
 if(-not (Test-Path (Join-Path $p '.git'))){throw "WORKSPACE_AUSENTE: $p"}
 $state=git -C $p status --porcelain
 if($LASTEXITCODE -ne 0 -or $state){throw "WORKTREE_NAO_LIMPA: $p"}
}
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --refresh
if($LASTEXITCODE -ne 0){throw 'ATUALIZACAO_FALHOU'}
Push-Location $m
try{
 node --test test/gameplay-order-status.test.mjs test/smoke-gameplay-readonly.test.mjs
 if($LASTEXITCODE -ne 0){throw 'TESTE_DE_RELACIONAMENTO_FALHOU'}
} finally {Pop-Location}
git -C $m rev-parse HEAD
git -C $g rev-parse HEAD
```

Não usar `npm ci`, `npm test` inteiro, `pnpm install`, Node 24 global nem reiniciar serviço/impressora. A CI remota executa TypeScript e SQLite do Gameplay Node24.

## ETAPA B — conferir a semântica, sem adivinhar

| Campo | Fonte | Interpretação |
|---|---|---|
| `order_id` | CRM | Número visível na gestão |
| `crm_order_uuid` | CRM + Gameplay | Chave **única** da relação, nunca nome/telefone |
| `status_id/status_key` | CRM | Status ATUAL, não histórico |
| `publication_required_by_crm` | MCP | true **somente** status atual 10 ou 12 em Natal 2026 |
| `published_photo_count` | Gameplay | Fotos do manifesto ativo com todas as variantes READY |
| `active_revision_manifest_photo_count` | Gameplay | Fotos descritas por revisão ativa, inclusive parcial; não é quantidade publicada |
| `preparing_photo_count` | Gameplay | Fotos na última revisão STAGED; pode ser null/0; não são fotos entregues |
| `digital_experience_status` | MCP | `no_gameplay_session`, `album_in_preparation`, `album_not_published`, `publication_incomplete`, `album_published_runtime_unverified`, `access_revoked`, `preparation_invalid` |
| `individual_games_verified/browser_runtime_verified` | MCP | false porque não há recibo de cada jogo no navegador |

**Nunca** inferir de `photo_count=0` que o fotógrafo não produziu fotos no estúdio. Não somar `preparing_photo_count` com `published_photo_count` como fotos distintas: uma revisão nova pode substituir as mesmas fotos.

Se o cliente possui dois pedidos, devolver **duas linhas por ID/UUID**. Se a busca nominal trouxer mais de um pedido, exigir seleção por ID antes de liberar URLs capability.

## ETAPA C — verificar GitHub atual por SHA

```powershell
gh pr view 11 -R hypeneural/evydencia-crm-mcp --json headRefOid,isDraft,baseRefName,url
gh pr checks 11 -R hypeneural/evydencia-crm-mcp --json name,state,bucket,link
gh pr view 43 -R hypeneural/gameplay --json headRefOid,isDraft,baseRefName,url
gh pr checks 43 -R hypeneural/gameplay --json name,state,bucket,link
```

Se `gh` não estiver disponível, conferir manualmente no GitHub. Conferir que Quality Gates & Build, Gallery mobile E2E, MCP test e validate pertencem ao HEAD exato da PR. Se ainda houver pending/failure, NO-GO e reportar o erro. Não inventar PASS.

## ETAPA D — validação REAL, somente se já autorizada e configurada

O CRM LIVE já retornou 11 pedidos atuais status 10 e 11 status 12 para Natal 2026, em consulta de 26/10/2026. **Isso NÃO prova que a mídia Gameplay foi publicada.**

A API Gameplay não consta hoje nas 33 ferramentas MCP LIVE. Sua PR é draft. Não realizar deploy para fazê-la aparecer.

Após implantação **aprovada** de uma API privada Gameplay com Caddy fechado e segredo de leitura independente, em host autorizado **com credenciais já provisionadas** e `EVYD_GAMEPLAY_SMOKE_AUTHORIZED=1`, usar SOMENTE um pedido sintético/piloto aprovado e executar `node scripts/antigravity/smoke-gameplay-readonly.mjs`. O script usa `EVYD_GAMEPLAY_SMOKE_ORDER_UUID` do ambiente, sem passar token nem UUID na linha de comando, chama só lookup-batch e só imprime estado + contagens agregadas. **Não execute se faltar qualquer pré-condição**, e jamais rode isso na impressora para alcançar diretamente a API privada.
 
Verificar separadamente, na VPS, o `crm_capacidades` após ativação autorizada do MCP; a versão LIVE atual não anuncia Gameplay. Nenhuma consulta ao CRM deve transformar um 503 do Gameplay em "jogo não feito".

## ETAPA E — relatório único e fim

Reportar **4 blocos curtos**:
- `LOCAL`: worktrees, SHAs atuais e TAP dos testes novos;
- `CRM_REAL`: total de pedidos elegíveis consultados, sem nomes/telefones;
- `GAMEPLAY_REAL`: `not_deployed_or_not_verified`, ou resultado do smoke autorizado — nunca alegar runtime provado sem navegador;
- `RELEASE`: `GO_DEV` ou `NO_GO_PRODUCTION`, com motivos `pilotReady`, `customerDataAllowed`, `automaticDeliveryAllowed`, Caddy /internal, media authorization, SQLite WAL, operação navegador.

**Não** alterar CRM Laravel, Z-API, Printserver, EvydFlow, VPS, produção, `gateway.env`, Node global, ou disparar mensagens. Não criar novas PRs. Encerrar após os passos autorizados.
