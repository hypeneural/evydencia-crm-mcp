# ANTIGRAVITY — ETAPA 2 CIRÚRGICA (AVELL / GEMINI 3.8 FLASH)

**Contexto já executado:** O Avell Windows 11 já possui os clones isolados `crm-mcp-dev` e `gameplay-code`, com PR #11 e PR #43, e uma rodada anterior de testes aprovada. O plano antigo `plano_execucao_avell.md` e `walkthrough.md` foram relatados na conversa. **NÃO REFAÇA A ETAPA 1. NÃO CRIE NOVOS CLONES/BRANCHES.**

**Sua missão exclusiva:** atualizar com segurança os dois clones que JÁ EXISTEM, executar UMA rodada dos testes MCP e avaliar os novos gates da auditoria de paginação canônica. Não desenvolver nova API.

## 1. Preparação/verificação (PowerShell 5.1, como usuário normal)

```powershell
$ErrorActionPreference='Stop'
$w=Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
$m=Join-Path $w 'crm-mcp-dev'
$g=Join-Path $w 'gameplay-code'
foreach($p in @($m,$g)){
 if(-not (Test-Path (Join-Path $p '.git'))){ throw "WORKSPACE_AUSENTE: $p" }
 $status=git -C $p status --porcelain
 if($LASTEXITCODE -ne 0 -or $status){ throw "GIT_NAO_LIMPO_OU_INVALIDO: $p" }
}
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --refresh --run-mcp-tests
if($LASTEXITCODE -ne 0){throw 'ATUALIZACAO_OU_TESTES_FALHARAM'}
Get-Content (Join-Path $w 'antigravity-preflight.json')
```

O `--refresh` verifica remoto e branch, atualiza usando `git merge --ff-only`, não usa `git reset`, e não toca MCP operacional/impressora. O `--run-mcp-tests` executa `npm ci --ignore-scripts`, `npm test`, `npm run gateway:test` no CLONE somente. Se falhar, PARE e reporte output real; não rode teste em loop.

## 2. Leia apenas este documento novo
`$m/docs/ANTIGRAVITY_AVELL_PLANO_REVISAO_FORENSE_20261026.md`

Atenção ao achado P0: `legacy-api-read.mjs` possui fallback de paginação cliente que NÃO demonstra completude; agora `crm_gameplay_auditoria` e busca por NOME precisam da paginação CANÔNICA pelo PHP forensic bridge. Se indisponível: erro `legacy_read_canonical_pagination_unavailable` e **NO-GO para auditoria completa**. Não tratar erro como galeria ausente e não alterar código para fabricar `has_more=false`.

A consulta por ID/UUID segue com verificação de identidade e sem mutações. O Gameplay fornece apenas estado SQLite e, em consulta individual autorizada, o link; `published_unverified` não prova runtime dos jogos.

## 3. Verifique CI do SHA ATUAL, não SHA antigo

```powershell
gh pr view 11 -R hypeneural/evydencia-crm-mcp --json headRefOid,isDraft,baseRefName,url
gh pr checks 11 -R hypeneural/evydencia-crm-mcp --json name,state,bucket,link
gh pr view 43 -R hypeneural/gameplay --json headRefOid,isDraft,baseRefName,url
gh pr checks 43 -R hypeneural/gameplay --json name,state,bucket,link
```

Se gh não existir ou não estiver autenticado, registrar limitação e consultar no GitHub com identidade autorizada. Não instalar ferramentas globais/alterar Node 22 do Avell. Gameplay usa Node 24 e pnpm 11 no GitHub Actions.

## 4. Relatório obrigatório e ENCERRAR
- Caminho, branch, SHA e árvore limpa dos dois clones, `antigravity-preflight.json`.
- TESTES MCP: número total, aprovados, falhas do TAP real. Não citar arquivo inexistente `gameplay-client.test.mjs`: são `gameplay-read-client.test.mjs`, `gameplay-read-client-hardening.test.mjs`, `gameplay-canonical-pagination.test.mjs`, além do gateway.
- CI por SHA atual, com jobs e URLs, `success|failure|pending`.
- `CRM_CANONICAL_SEARCH=available|unavailable|not_verified`; não concluir "sem pendências" até validar o bridge no host MCP.
- `GAMEPLAY_RUNTIME=not_verified` até prova real de mídia e jogos em navegador autorizado.
- `PRINTER_UNCHANGED=not_measured` se não houver baseline antes/depois.
- Decisão: GO somente para preparação/verificação isolada; NO-GO para dados de clientes/deploy enquanto readiness do Gameplay, Caddy, backup SQLite WAL e mídia não aprovados.

**PROIBIDO:** re-clone, force push, mudar env/serviços/portas, rodar servidor ou deploy, alterar Laravel/CRM/Z-API/EvydFlow/printserver, revelar fotos/segredos, habilitar Gameplay em produção, instalar Node 24 global. FIM.
