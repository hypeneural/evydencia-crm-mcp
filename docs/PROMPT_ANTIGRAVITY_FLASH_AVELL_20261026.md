# Antigravity — ETAPA 3 (Avell Windows 11, Gemini 3.8 Flash)

**Contexto já cumprido:** clones MCP `crm-mcp-dev` e Gameplay `gameplay-code` criados em AppData; última rodada do Antigravity registrou MCP 179/179, gateway 17/17 e Gameplay remoto CI verde. **NÃO CLONAR, REINSTALAR, TROCAR NODE, MEXER NA IMPRESSORA OU REFAZER A AUDITORIA.**

**Nova entrega pronta:** PR MCP #11 corrigida para aproveitar `GET /api/orders/search?page=N` do Laravel com paginação servidor (`paginate(200)`) quando a ponte PHP não está instalada no mesmo host. Testes de contrato com status 10/11/12 e contagens consistentes. Gameplay PR #43 não foi alterada. O acesso real de cliente continua NÃO liberado.

## Passo 1 — atualizar somente os clones já existentes

Execute uma única vez no PowerShell 5.1, como usuário normal:

```powershell
$ErrorActionPreference='Stop'
$w=Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
$m=Join-Path $w 'crm-mcp-dev'
$g=Join-Path $w 'gameplay-code'
foreach($p in @($m,$g)){
  if(-not (Test-Path (Join-Path $p '.git'))){throw "WORKSPACE_AUSENTE: $p"}
  $dirty=git -C $p status --porcelain
  if($LASTEXITCODE -ne 0 -or $dirty){throw "WORKTREE_SUJA_OU_INVALIDA: $p"}
}
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --refresh
if($LASTEXITCODE -ne 0){throw 'FALHA_ATUALIZACAO: parar e inspecionar erro'}
Push-Location $m
try{
  node --test test/gameplay-canonical-pagination.test.mjs test/inspect-canonical-bridge.test.mjs test/live-gateway.test.mjs
  if($LASTEXITCODE -ne 0){throw 'TESTES_CIRURGICOS_FALHARAM'}
  node scripts/antigravity/inspect-canonical-bridge.mjs --json
  if($LASTEXITCODE -ne 0){throw 'PROBE_FILESYSTEM_FALHOU'}
} finally {Pop-Location}
Get-Content (Join-Path $w 'antigravity-preflight.json')
```

**IMPORTANTE:** sem `--run-mcp-tests` aqui. O Antigravity já rodou `npm ci`, `npm test` e `gateway:test` antes. Rodar os testes específicos acima UMA VEZ e usar CI GitHub para suíte integral. Se o script mostrar que faltam arquivos PHP no Avell, anotar `local_php_bridge_absent_expected`; isso NÃO demonstra que o host VPS não tenha acesso à API Laravel canônica.

## Passo 2 — validar a CI atual

```powershell
gh pr view 11 -R hypeneural/evydencia-crm-mcp --json headRefOid,isDraft,baseRefName,url
gh pr checks 11 -R hypeneural/evydencia-crm-mcp --json name,state,bucket,link
gh pr view 43 -R hypeneural/gameplay --json headRefOid,isDraft,baseRefName,url
gh pr checks 43 -R hypeneural/gameplay --json name,state,bucket,link
```

Não reaproveitar SHAs antigos. Se `gh` não estiver disponível, consultar o site autenticado sem instalar ferramentas. Não editar o arquivo de ambiente real do MCP.

## Passo 3 — registrar resultado e ENCERRAR

Apresente somente:
1. Diretórios, branches e SHAs atuais, árvore limpa.
2. Resumo TAP real de cada teste da Etapa 1.
3. Workflows GitHub correspondentes EXATAMENTE aos SHAs das PRs.
4. `CRM_CANONICAL_SEARCH_AVELL=synthetic_contract_passed` ou erro; `CRM_CANONICAL_SEARCH_VPS=not_verified` até teste autorizado de produção.
5. `GAMEPLAY_RUNTIME=not_verified` e `PRINTER_BASELINE=not_measured`.
6. **GO apenas para desenvolvimento isolado**; **NO-GO para publicação de clientes e deploy** enquanto `readiness.json` tiver flags falsas ou Caddy, autorização de mídia, backup SQLite WAL e piloto não forem comprovados.

**PROIBIDO:** clonar novamente, instalar Laravel/Node 24, usar tokens reais no Avell, chamar Z-API, ativar opções de produção, enviar fotos, alterar CRM Laravel, Caddy, EvydFlow ou Printserver, fazer deploy ou criar novas PRs. Pare após entregar o relatório.
