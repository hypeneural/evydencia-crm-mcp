# Antigravity — fechar a última lacuna de Gameplay no MCP LIVE (27/10/2026)

**Estado comprovado diretamente pelo ChatGPT hoje:** `crm_capacidades` autentica o operador no MCP LIVE `0.12.0`, build **`91fe6fb`**, branch `release/live-35tools-gameplay-printserver`, **37 ferramentas no catálogo e 35 ativas**. Ambas `crm_gameplay_auditoria` e `crm_gameplay_links` estão **REGISTRADAS**, assim como as três ferramentas de PrintServer. Isto **NÃO prova** acesso à Media VPS. O plugin nesta conversa ainda não havia redescoberto as duas novas operações (catálogo da sessão ≠ inventário LIVE). O relatório do Antigravity registrou HTTP 403 ao tentar alcançar Gameplay pela borda pública, mas não comprovou SQLite ou endpoint privado operacionais na Media VPS.

**NÃO refazer** testes do Avell, scripts, PRs, branches ou o merge de Gameplay com PrintServer. Não repetir tentativas com senhas/users SSH diferentes; as tentativas para a Media VPS falharam no relatório de 27/10. Solicitar o acesso autorizado correto se ausente, sem credenciais no chat/commits.

## Melhoria já preparada no GitHub
Na PR MCP #11 **e** na mesma branch de release já implantada (mas commits novos ainda NÃO instalados na VPS), o ChatGPT atualizou:
- `src/gameplay-read-client.mjs`: `probeGameplayPrivateAccess` usa um UUID **sintético reservado** e `lookup-batch`, sem pedir capability links; apenas divulga a classificação de transporte/contrato.
- `src/live-gateway.mjs`: parâmetro **opcional** `crm_capacidades(verificar_gameplay=true)`; quando omitido, comportamento anterior e latência mantidos. Retorna `gameplay_private_probe: {checked,reachable,status,dataset_proven:false}`.
- `test/gameplay-read-client.test.mjs`: rejeição 403 e contrato sintético válido, com proibição de segredos/UUIDs em output.
- Nenhuma ferramenta extra, emissão WhatsApp, migração, mudança de escopo OAuth ou alteração do PrintServer.

**Estados esperados do diagnóstico:** `gameplay_http_403` indica que a origem configurada termina na borda pública bloqueada; `not_configured` indica ausência do cliente privado no gateway; `private_contract_ok` prova apenas que um serviço devolveu o contrato privado **para o UUID sintético**, e NÃO que o banco real, imagens ou jogos de cliente estejam prontos.

## 1. Check único na produção MCP (não no Avell)
1. Usar as credenciais administrativas **já autorizadas** para confirmar `systemctl cat evydencia-crm-mcp-live.service`, `systemctl show ... -p User -p WorkingDirectory -p ExecStart`, `/healthz` e release `git rev-parse HEAD`, sem imprimir `EnvironmentFile`/secrets.
2. Validar CI dos HEADs PR #11 e PR #43; verificar que a branch `release/live-35tools-gameplay-printserver` contempla PR #12/PrintServer. Se houver divergência/conflito: corrigir na mesma branch e registrar, sem `reset --hard` no diretório ativo.
3. No checkout isolado da **branch release**, rodar apenas `node --test test/gameplay-read-client.test.mjs test/live-gateway.test.mjs test/crm-label-render.test.mjs`; manter a suíte abrangente para CI já executada. **Backups** do build e env atual antes do restart; usar o mecanismo de troca e rollback já em operação.
4. Se e somente se os testes e a recuperação estiverem aprovados, publicar o HEAD da release com o probe e reiniciar **somente** `evydencia-crm-mcp-live.service`. Preservar todos os escopos, PrintServer, Z-API e os 35 registros ativos. Se número ou semântica retroceder, rollback imediato.

## 2. Testar daqui no ChatGPT SEM invocar Gameplay de cliente
No conector Evydência CRM LIVE atualizado:
`crm_capacidades(verificar_gameplay=true)`.
Registrar **somente** `build_commit`, `tools_active_count`, `gameplay_private_probe.status`, `reachable` e `dataset_proven`. Nunca copiar `gateway.env`, bearer, URLs capability ou dados de clientes. Não chamar `crm_gameplay_auditoria` com UUIDs reais enquanto o upstream estiver sem conexão. Se as ferramentas ainda não surgirem no ChatGPT, **atualizar/reconectar a descoberta do Plugin MCP**; as notificações de `tools/list_changed` não garantem retroativamente o cache de uma sessão existente. Iniciar nova conversa se necessário, depois que o servidor realmente atender às chamadas.

## 3. Primeiro gate real que falta: infraestrutura **Media VPS**, não CRM
A Media VPS do relatório é `169.58.210.14`; domínio público `jogos.fotosdenatal.com`. O teste HTTP 403 público apenas confirma bloqueio no Caddy, não a execução de `GameplayStatusLookup`. No host de mídia, SOMENTE com acesso SSH/autorização legítima:
1. Localizar o serviço real, `systemctl`/container/edge Caddy, e o checkout/commit que está ativo; confirmar Node24 e o arquivo SQLite real associado ao processo. O repositório `gameplay` PR #43 depende da PR #30 e das dependências anteriores; verificar cadeia antes de deploy.
2. Para a API privada read-only funcionar, `apps/catalog-server/src/main.ts` atualmente exige `runtime.databasePath`, `runtime.publisherApiSecret` e `runtime.serverSecret` além de `CATALOG_INTERNAL_READ_SECRET`. **Não inventar essas configurações nem copiar secrets do CRM.** Se faltar base persistente ou secrets de servidor/publicação, a API privada não será criada. Manter operações de publicação desabilitadas pela política de piloto.
3. Identificar o banco correto e executar **somente se já autorizado** `node scripts/forensic/audit-real-catalog-readonly.mjs` com credenciais/proteções próprias e retorno agregado. Caso contrário `GAMEPLAY_DB_REAL=not_verified`; não assumir zero fotos.
4. Estabelecer conectividade **verdadeiramente privada** da VPS MCP à Media VPS (por exemplo Tailscale/WireGuard previamente aprovado ou túnel dedicado, escutando somente interface privada). Não simplesmente abrir `/internal/*` na borda pública; manter 403 público. Validar a origem privada efetiva, token de leitura igual nos dois serviços mas distinto de Publisher/Server, `lookup-batch` sintético com 200 e envelope `schema_version=1`, nunca links no batch.
5. Atualizar `EVYD_GAMEPLAY_READ_ORIGIN` **somente** para a origem privada comprovada; o domínio público continua apenas em `EVYD_GAMEPLAY_PUBLIC_ORIGIN`. Reavaliar `crm_capacidades(verificar_gameplay=true)` -> `private_contract_ok`. Sem acesso autorizado à Media VPS, documentar impedimento e NÃO improvisar alterações de firewall.

## 4. Só após os gates: cruzamento real e links no ChatGPT
- CRM atual: duas buscas canônicas no Natal 2026 com status correntes 10 (`waiting_product_retrieve`) ou 12 (`order_completed`). O último snapshot real foi 11+11=22, não constante de código.
- Na VPS MCP autorizada, já com roteamento privado funcional, executar o script **existente** `node scripts/antigravity/audit-real-crm-gameplay.mjs --cross-check` (sem URL de família e sem PII nos logs).
- Após a descoberta do plugin ser atualizada, `crm_gameplay_auditoria({status_atual:'todos',incluir_publicados:true,pagina:1,limite:20})` compara sessões/fotos; `crm_gameplay_links({order_id:<ID aprovado>})` só com seleção explícita por operador. Se o Gameplay retornar `not_found`, isto significa sem sessão **na base consultada**, não ausência de fotos no Drive.
- `link_delivery_status='not_verified'`: não existe recibo canônico cruzado CRM/Z-API por UUID/revisão. Nunca relatar "link não enviado" nem emitir mensagens como parte do teste.

## 5. Encerramento P0, sem loops
Relatar exatamente:
`MCP_DEPLOY_SHA`, `MCP_TOOLS_ACTIVE`, `GAMEPLAY_PRIVATE_PROBE`, `MEDIA_DEPLOY_SHA`, `MEDIA_DB_READONLY`, `CRM_GAMEPLAY_JOIN`, `CHATGPT_TOOLS_DISCOVERED`, `PRINTSERVER_PRESERVED`.
Somente resultados **observados**, sem prometer implantação no chat, sem acessar banco do CRM para escrita e sem alterar `deploy/readiness.json` (`pilotReady=false`, `customerDataAllowed=false`, `automaticDeliveryAllowed=false`). Se o acesso à Media VPS for impossível, essa é a **única pendência de infraestrutura** a escalar; não repetir 232 testes que já passaram.

**Documentação oficial:** https://modelcontextprotocol.io/specification/2025-11-25/server/tools ; https://caddyserver.com/docs/caddyfile/matchers ; https://nodejs.org/api/sqlite.html ; https://www.sqlite.org/backup.html .
