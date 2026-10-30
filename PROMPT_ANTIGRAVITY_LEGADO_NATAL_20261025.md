# PROMPT PRONTO — ANTIGRAVITY / EVYDÊNCIA MCP — REUSO DO LEGADO NATAL

**Tarefa:** homologar o que já foi implementado no repositório `C:\Projetos\hypeneural\evydencia-crm-mcp`. Reutilizamos o conceito de snapshots do projeto privado `hypeneural/fotosdenatal-dados`. NÃO editar ou desenvolver código no Evydência CRM Laravel nem no sistema legado nesta tarefa.

## Estado publicado
- Fonte estática `natal_historical_calendar_immutable.json`: anos 2021 a 2025, 366 dias/ano e campos agregados.
- `src/legacy-historical.mjs`: valida dados históricos PRIVADOS, normaliza centavos, calcula janela de 01/08 ao dia de corte, marca `LEGACY_UNVERIFIED` e proíbe comparação canônica automática.
- `scripts/import-legacy-history.mjs`: cria uma saída privada com hash SHA-256, sem sobrescrever um arquivo existente e sem transportar clientes.
- `tools/export-natal-digest.php`: aproveita `NatalValidOrdersQuery::getSeasonDigestMetrics()` para 2026, ainda sem execução real.
- `src/order-readiness.mjs`: interpretação de status de retirada, ainda offline.
- Plugin ChatGPT MOCK com 17 ferramentas permanece ativo e isolado de dados reais.

## Execute sem inventar etapa
1. No clone MCP, rode `git status --short` e `git rev-parse HEAD`. Não descartar mudanças locais em `scripts/go.ps1`. Se limpo e sem conflito, `git fetch origin` e `git pull --ff-only origin main`.
2. Leia `AGENTS.md`, `docs/FORENSE_LEGADO_NATAL_20261025.md` e `docs/MVP_AGREGADOS_EXECUCAO_20261025.md`. Use a skill `crm-mcp-legacy-history`.
3. Execute `npm run validate:local` e `.\scripts\validate-mvp.ps1`. Não chamar o CRM, não executar exportador real e não instalar novos frameworks.
4. Confirme testes: cinco anos, 366 dias, tolerância monetária em centavos, status `LEGACY_UNVERIFIED`, prevenção de PII, arquivo privado, hash SHA-256 e proibição de sobrescrita.
5. Se o operador autorizar a importação real dos calendários PRIVADOS, localize o arquivo legado, crie diretório privado fora de qualquer repositório com ACL adequada e execute **somente localmente**:
   `npm run history:import -- --source="CAMINHO_PRIVADO_ABSOLUTO" --output="SAIDA_PRIVADA_ABSOLUTA.json" --cutoff=10-25`
   Nunca colar dados brutos ou caminhos/credenciais sensíveis no ChatGPT. Esta importação não dá acesso aos clientes.
6. Confira a divergência legada: `VALID_STATUS_IDS={5,6,9,10,12}` omite outros estados atuais (7,8,11); histórico legado usa regra diferente de `NatalValidOrdersQuery`. Não apresente valores legados como auditados/comparáveis automaticamente com 2026.
7. Para clientes reais, use apenas plano de conexão OAuth por operador e as APIs Sanctum `customer-context`/`customer-360` já existentes, separadas do Plugin MOCK. A busca por nome requer adaptação segura, NÃO o token global legado.
8. Para pergunta "quantos faltam fotografar/entregar", não deduzir apenas de `scheduled/unscheduled`. Exigir contagem por status vigente e prova de realização/retirada, obtida futuramente com consulta permitida.
9. Não desenvolver outro mecanismo de WhatsApp. O envio existente `proposals/schedule` continua desabilitado no MCP até confirmação visual, OAuth e journal/idempotência.

## Relatório enxuto
Retorne SHA, arquivos alterados, Node/PHP, testes e CI, status da importação privada (não feita ou realizada com autorização), o que ainda falta para dados REAIS e se o Plugin MOCK continua com as mesmas 17 tools. Não confundir sucesso dos testes com produção conectada. Se houver erro, corrigir apenas a causa comprovada, sem reescrever módulos.
