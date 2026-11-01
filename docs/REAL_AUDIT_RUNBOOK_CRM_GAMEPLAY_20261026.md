# Execução real e forense — CRM × Gameplay, Natal 2026
**2026-10-26 | PR MCP #11 + PR Gameplay #43 | Somente leitura**

## Objetivo — o que é REAL e o que NÃO É
Esta etapa deixa de depender somente de fixtures:
1. **CRM real:** consultar `crm_pedidos_buscar` no conector LIVE já autorizado OU `audit-real-crm-gameplay.mjs --crm-only` no host MCP com as credenciais já provisionadas. Provar enum, paginação, número de pedidos e UUIDs (sem exportar UUIDs).
2. **Gameplay SQLite REAL:** com acesso read-only já autorizado ao arquivo SQLite do catálogo, rodar `scripts/forensic/audit-real-catalog-readonly.mjs` da PR Gameplay #43. Provar existência de sessões/revisões/blobs de verdade sem carregar mídias nem usar dados do CRM.
3. **Cruzamento REAL:** somente quando o endpoint de leitura Gameplay estiver implantado na rede privada e a equipe tiver autorizado explícita e separadamente a consulta de UUIDs reais, executar `audit-real-crm-gameplay.mjs --cross-check` no host autorizado do MCP. Ler dois status do CRM, buscar os UUIDs no Gameplay, verificar cada resposta, conferir novo snapshot do CRM.
4. **Browser real:** prova distinta em Android Chrome e iOS Safari, com sessão autorizada. Uma consulta SQLite ou HTTP 200 não prova que cada jogo Phaser funciona.

**Não** habilitar fotos para clientes, enviar WhatsApp, criar sessão, fazer upload, executar publicação, alterar banco, Caddy, Printserver, VPS ou `readiness.json` neste roteiro.

## Evidência CRM LIVE efetivamente consultada pelo ChatGPT
Nesta data o conector `Evydencia_CRM_Live` versão `0.12.0`, build `f6f93b5`, apresentou 33 ferramentas, sem ferramentas Gameplay registradas. Duas consultas `crm_pedidos_buscar`, recorte `product_slug=natal`, `2026-01-01..2026-12-31`, retornaram:
- status atual `waiting_product_retrieve` (10): 11 pedidos (1 página);
- status atual `order_completed` (12): 11 pedidos (1 página);
- 22 pedidos, UUIDs sintaticamente válidos; `source=CRM_FORENSIC_READ_ONLY_BRIDGE`; paginação total e returned_count coerentes.
- Pacotes observados: Ho-Ho-Ho 5 pedidos, Então é Natal 17 pedidos. Dados momentâneos; novos pedidos ou mudanças de status invalidam essas contagens.

**Estes dados não provam sessão Gameplay nem fotos publicadas.** A consulta LIVE só estabelece a população canônica.

## Arquivos criados
- MCP `src/gameplay-real-audit.mjs` — engine injetável que valida fonte CRM canônica, status 10/12, paginação completa, UUIDs distintos, consulta privada por lotes de até 50, contagens de fotos publicadas/preparadas, rechecagem não-cacheada de status.
- MCP `scripts/antigravity/audit-real-crm-gameplay.mjs` — entrada com `--crm-only` ou `--cross-check`, exige operador permitido + autorização explícita + ambiente preprovisionado. Não aceita UUIDs, tokens ou telefones em argumentos; nenhuma PII em stdout.
- MCP `test/gameplay-real-audit.test.mjs` — regressões de contagens, falhas, drift de CRM, privacidade; são testes sintéticos da implementação, não substituem o fluxo real.
- Gameplay `scripts/forensic/audit-real-catalog-readonly.mjs` — abre banco com `new DatabaseSync(path,{readOnly:true})` e `PRAGMA query_only=ON`, executa SELECT e só devolve agregados.
- Gameplay `scripts/forensic/audit-real-catalog-readonly.test.mjs` — regressão do leitor SQLite, sem dados de clientes.

## Segurança e autenticação
- A execução operacional deve ocorrer **somente no host privado aprovado**, com usuário de serviço e variáveis já provisionadas; sem transferir o arquivo `gateway.env` para o Avell ou ferramentas do Antigravity.
- Variáveis obrigatórias de auditoria CRM: `EVYD_REAL_AUDIT_AUTHORIZED=1`, `EVYD_REAL_AUDIT_OPERATOR_ACCESS_ATTESTED=1`, `EVYD_REAL_AUDIT_OPERATOR_ID` contido em `EVYD_ALLOWED_OPERATOR_IDS`, `CRM_BASE_URL`, `EVYD_INTERNAL_READ_TOKEN`. No host pré-provisionado, o programa nunca imprime valores.
- A atestação local de operador **não substitui** um grant OAuth independente. O resultado documenta `operator_oauth_revalidated_by_script=false`; não declarar autorização OAuth E2E comprovada por esse script.
- Para Gameplay `--cross-check`: `EVYD_GAMEPLAY_READ_ENABLED=1`, `EVYD_GAMEPLAY_READ_ORIGIN` privado, `EVYD_GAMEPLAY_PUBLIC_ORIGIN` pinado, `EVYD_GAMEPLAY_READ_TOKEN` de leitura isolado. O script não solicita capability URLs.
- Para inspeção SQLite Gameplay: `CATALOG_REAL_DB_AUDIT_AUTHORIZED=1`, `CATALOG_DATABASE_PATH`, `CATALOG_REAL_DB_ALLOWED_DIR` absoluto e previamente aprovado. Rejeita diretórios não autorizados. Deve rodar com Node 24 e usuário de leitura restrita.
- Nunca registrar `process.env`, bearer, cabeçalhos, linhas individuais CRM, `crm_order_uuid`, `order_id`, nomes, telefones ou caminhos do SQLite em stdout, GitHub, tickets ou PR.
- A leitura de SQLite não verifica hash do token de acesso, nem garante que o arquivo informado representa a implantação pública; exigir SHA do deploy e caminho de DB confirmado por evidência administrativa fora do output.

## Sequência de execução SEM loops

### Fase A — Avell, atualização curta do desenvolvimento
```powershell
$ErrorActionPreference='Stop'
$w=Join-Path $env:LOCALAPPDATA 'Evydencia\Antigravity\gameplay-mcp-20261026'
$m=Join-Path $w 'crm-mcp-dev'
$g=Join-Path $w 'gameplay-code'
foreach ($p in @($m,$g)) {
 if (-not (Test-Path (Join-Path $p '.git'))) { throw "WORKSPACE_AUSENTE: $p" }
 $dirty=git -C $p status --porcelain
 if ($LASTEXITCODE -ne 0 -or $dirty) { throw "WORKTREE_NAO_LIMPA: $p" }
}
node (Join-Path $m 'scripts\antigravity\prepare-avell.mjs') --workspace $w --refresh
if ($LASTEXITCODE -ne 0) { throw 'REFRESH_FALHOU' }
Push-Location $m
try {
 node --test test/gameplay-real-audit.test.mjs
 if ($LASTEXITCODE -ne 0) { throw 'TESTES_FALHARAM' }
} finally { Pop-Location }
```
Não repetir `npm ci`/suíte integral do Avell. Conferir CI GitHub dos SHAs atuais em PRs #11 e #43.

### Fase B — CRM real
Se o conector `crm_pedidos_buscar` autenticado estiver disponível ao Antigravity, executar duas consultas no escopo acima, `nivel_detalhe=resumo` e `limite=25`; confirmar `returned_count`, `total_matching_orders`, `has_more`, status ID/key e UUIDs distintos. **Saída pública somente agregada.**

Alternativa **somente** em host MCP autorizado, com ambiente de leitura **já** provisionado (não criar secrets via prompt):
```bash
node scripts/antigravity/audit-real-crm-gameplay.mjs --crm-only
```
Se faltar credencial ou atestação, reportar `CRM_REAL_HOST=not_verified`; não copiar `gateway.env` para a estação.

### Fase C — Gameplay SQLite real, antes de cruzar UUIDs
Somente no host Gameplay autorizado com Node 24, usuário autorizado, DB já presente e variáveis de auditoria preprovisionadas:
```bash
node scripts/forensic/audit-real-catalog-readonly.mjs
```
Distinguir `sessions_total`, `active_album_metadata_ready_without_token_check`, `ready_active_album_photos`, `staged_manifest_photos`. 0 sessões REAL nessa base significa 0 sessões **nessa base**, não "22 clientes sem fotos" — não houve cruzamento UUID ainda.

### Fase D — Cruzamento REAL CRM↔Gameplay
**Somente** depois de confirmar (1) que endpoint privado é inacessível pelo domínio público, (2) que token de leitura é distinto dos segredos Publisher/Server, (3) que existe autorização explícita para usar UUIDs reais neste endpoint e (4) que a implantação é a PR correta. No host MCP autorizado:
```bash
node scripts/antigravity/audit-real-crm-gameplay.mjs --cross-check
```
Produz só relatório agregado: `crm.by_current_status`, `gameplay.states`, `publication_pending`, `published_photo_count`, `preparing_photo_count`, `orders_in_preparation`, sem links capability nem UUIDs. Erro 503 e timeout = falha, nunca `not_found`.

Se um dos requisitos falhar: **não executar D**, anotar `GAMEPLAY_PRIVATE_API=not_verified`.

### Fase E — Decisão
`GO` somente para auditoria read-only autorizada, `NO-GO` para publicação real/deploy até prontidão em `deploy/readiness.json`, isolamento Caddy, provas de grant de mídia, backup/restauração SQLite WAL e dispositivos móveis. Nenhuma validação individual muda a liberação de piloto automaticamente.

## Referências oficiais
- Laravel 10 pagination: https://laravel.com/docs/10.x/eloquent-resources#pagination
- MCP tool structured results: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- Node SQLite DatabaseSync `readOnly`: https://nodejs.org/api/sqlite.html
- SQLite Online Backup API: https://www.sqlite.org/backup.html
- Caddy request matchers: https://caddyserver.com/docs/caddyfile/matchers
