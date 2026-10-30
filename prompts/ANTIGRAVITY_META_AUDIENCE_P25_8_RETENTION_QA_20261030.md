# ANTIGRAVITY — P25.8 | QA local do janitor pós-restart e handoff de release isolado

**Repositório:** `hypeneural/evydencia-crm-mcp`
**Branch:** `feat/meta-audience-crm-export-foundation-20261029`
**PR:** #23 **DRAFT**, base `base/reprint-live-6abe039-20261029`.
**Último LIVE confirmado pelo ChatGPT:** `877d564`, 41 ferramentas.
**Relatório obrigatório:** `docs/META_AUDIENCE_P25_8_RETENTION_FINAL_AUDIT_20261030.md`.

O ChatGPT recebeu e auditou seu recibo de P25.7 (#6515106730), verificou
independentemente o build 877d564 no MCP LIVE e a correção de UX em GitHub.
O canário P25.5 e SHA foram validados anteriormente. **Não reexportar contatos,
não subir CSV novamente, não ligar anúncios e não refazer a feature.**

A única correção funcional nova, P25.8, já foi comitada pelo ChatGPT.
Elimina a dependência de criar nova exportação para limpar CSVs expirados
e a perda do timeout in-memory durante restart. Mantém o cleanup apenas
no processo MCP, sem cron/systemd timer extra.

## 1. Arquivos novos e alterados, NÃO REIMPLEMENTAR
- `src/meta-audience-janitor.mjs`: sweep no boot + a cada 15 minutos,
  `stop()`, anti-overlap, erro agregado sem caminhos/PII, timer unref.
- `src/live-gateway.mjs`: um janitor somente se export audience
  está habilitado e diretório privado configurado; stop no close;
  `/healthz` exibe `meta_audience_retention_janitor_enabled`.
- `src/meta-audience-private-files.mjs`: `ENOENT` em exclusões
  simultâneas é benigno; demais erros não são escondidos.
- `test/meta-audience-janitor.test.mjs`: boot, timer, erro, shutdown,
  isolamento do MCP.
- `test/meta-audience-private-files.test.mjs`: concorrência de purges.
- `scripts/antigravity/validate-meta-audience-p25-local.sh`: execução
  dos novos testes incluída.

## 2. Um ciclo LOCAL, com testes nativos reais

```bash
git fetch origin --prune
git switch feat/meta-audience-crm-export-foundation-20261029
git pull --ff-only
git status --short
git rev-parse HEAD
bash scripts/antigravity/validate-meta-audience-p25-local.sh
```

O recibo **368/368 PASS** vale APENAS para o SHA `877d564`.
Apresentar total real e erros no novo HEAD. Se houver falha P0, corrigir
o ponto específico, executar o teste afetado e UMA suíte completa.
Sem loops infinitos e sem reescrever commits anteriores.

## 3. Testes específicos de retenção

Usar DIRETÓRIO TEMPORÁRIO SINTÉTICO com permissão 0700 e nomes
`meta-audience-natal2026-<uuid>.csv` sintéticos.
Confirmar:
1. Arquivo expirado há >1h é apagado ao iniciar o gateway.
2. Arquivo novo e arquivo alheio NÃO são apagados.
3. A cada 15 min o sweep é agendado; `close()` cancela a tarefa,
   sem manter processo vivo artificialmente.
4. Dois sweeps simultâneos NÃO falham quando ambos enxergam o
   mesmo arquivo e um deles remove primeiro (ENOENT benigno).
5. Erros de FS não vazam caminho/PII em logs.
6. `/healthz` expõe somente booleano de prontidão, nunca path/token.
7. Quando export feature está OFF, NÃO executar manutenção involuntária.
8. Sem regressões na exportação CSV, no hash SHA-256, OAuth,
   PrintServer, Gameplay, Z-API, CRM e outros 41 tools.

**Atenção:** o TTL de 1h + sweep de 15 min significa que arquivos
podem permanecer até aproximadamente 1h15min enquanto gateway está
ligado; após reboot o sweep ocorre no boot. Não prometer 1h exata.

## 4. Gate de publicação opcional, NUNCA automático

**Não fazer deploy apenas porque os testes passaram.**
Se existir autorização atual e específica do gestor para publicar P25.8:
- Fazer backup do código LIVE `877d564`, preservar env/secrets e
  confirmar mecanismo de rollback já documentado.
- Atualizar SOMENTE MCP por fast-forward no release já existente.
- Rodar `npm run check` na VPS sob usuário do serviço.
- Reiniciar SOMENTE `evydencia-crm-mcp-live.service`.
- Conferir build novo, `/healthz` e
  `meta_audience_retention_janitor_enabled=true`;
  autenticação e inventário de 41 tools preservados.
- Validar cleanup apenas com arquivo sintético expirado no diretório
  privado, sem abrir CSV real de clientes.
- Falha de OAuth, saúde ou manutenção => rollback só do MCP.

Se não houver autorização atual, parar com `P25_8_DEPLOY_PENDING`.
Não tocar MYSQL, cron, timers systemd de outros serviços nem mídia.

## 5. Git e Meta

- **MERGE_MAIN_NO_GO**: a PR #23 tem centenas de commits de outros
  subsistemas à frente da main. `mergeable=true` da PR não valida
  mesclar diretamente na main. Manter PR DRAFT, criar release train
  controlado em outro trabalho.
- O CSV de 2331 telefones do canário anterior foi conferido por SHA no
  computador do gestor; NÃO solicitar reexportação.
- Upload Meta permanece PENDENTE de prova no Audience Manager,
  incluindo mapeamento, tratamento de opt-outs e taxa de match.
- Não publicar anúncios, campanhas, orçamento, públicos nem SMS/WhatsApp.

## 6. Recibo curto

Registrar na PR #23 SHA novo testado, Node/PHP, total PASS,
testes da retenção, noções de política de 1h + 15min,
resultado de HEALTH (se publicado) e rollback disponível.
NÃO repetir recibos históricos, não imprimir caminhos locais nem PII.

**Parecer do ChatGPT:** P25.7 LIVE confirmado, P25.8 CODE READY,
nova suíte nativa pendente, merge main bloqueado, upload Meta sem prova.
