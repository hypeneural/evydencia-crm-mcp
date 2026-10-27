# ANTIGRAVITY — HANDOFF EXECUTIVO PARA VPS + CHATGPT (27/10/2026)

**Objetivo único:** disponibilizar no ChatGPT as consultas administrativas reais de Natal 2026 (status CRM, publicação, fotos e links individualizados) sem afetar MCP LIVE, PrintServer, Laravel ou Z-API. NÃO criar scripts novos. Usar e, se necessário, corrigir apenas os artefatos existentes. Execute as etapas de uma vez, sem loops de validação. Faça deploy somente quando os respectivos gates estiverem comprovados.

## FATOS FORENSES DE PARTIDA
- MCP Gameplay `hypeneural/evydencia-crm-mcp` PR #11 (`feat/gameplay-read-client-20261026`), base `main`. PrintServer MCP PR #12 (`610027b8...`), também base `main`, **em paralelo**. Não publicar somente a PR #11 sobre uma instalação que contenha as melhorias de PrintServer, nem aplicar PR #12 de modo que remova Gameplay. Preservar todas as ferramentas ativas e os contratos de impressão.
- Gameplay `hypeneural/gameplay` PR #43 (`feat/gameplay-status-read-api-20261026`) **baseada na branch PR #30**, não no default. Não assumir que basta fazer merge isolado da #43; conferir dependências, base, build e `deploy/readiness.json`.
- MCP LIVE previamente confirmado em `0.12.0`, build `f6f93b5`, 33 ferramentas, sem `crm_gameplay_auditoria` nem `crm_gameplay_links`. Fonte CRM de Natal 2026 retornou antes 11 pedidos status 10 e 11 status 12 (22 no snapshot): **não usar total fixo**.
- `deploy/readiness.json` Gameplay: `pilotReady=false`, `customerDataAllowed=false`, `automaticDeliveryAllowed=false`. **Não liberar mídias reais ou envio automático** nesta implantação. A implantação do componente administrativo de leitura pode ser considerada separadamente se segura, sem mudar essas flags.

## DISTINÇÃO OBRIGATÓRIA: "LINK EXISTE" NÃO É "LINK FOI ENVIADO"
- O contrato Gameplay comprova sessão/álbum e gera `hub_url` e `gallery_url` apenas em pedido individual autorizado. `published_unverified` NÃO comprova execução Phaser no telefone.
- Não foi identificada nesta PR uma fonte canônica de recibo outbound que vincule **UUID do pedido + versão/link ativo + canal + provider message id + status de envio**. No MCP, `link_delivery_status='not_verified'`, `link_sent_confirmed=null`, `link_opened_confirmed=null` e `delivery_receipt_verified=false`. Não chamar ninguém de `not_sent` sem um comprovante real de ausência, nem inventar `sent=true` por existência de URL.
- A auditoria em lote mostra `orders_with_delivery_unverified` e `published_orders_delivery_unverified`. Uma implementação futura do recibo canônico pode mudar isso, mas **não criar mecanismo de envio** nem disparar mensagens no rollout deste PR. Para "quem ainda não recebeu", deixar explícito que a informação ainda não é verificável até o CRM/Z-API expor prova por pedido.

## ETAPA 1 — UMA ÚNICA CONFERÊNCIA REMOTA, SEM TOCAR NO AVELL
1. No GitHub, coletar os SHAs/CI atuais de `evydencia-crm-mcp` PRs **#11 e #12**, `gameplay` PRs **#30 e #43** e conferir base/merge-base e interseções. Não promover commits com CI em vermelho ou pendente.
2. Na VPS (acesso administrativo já autorizado), ler **somente** o `systemctl cat evydencia-crm-mcp-live.service`, `systemctl show ... -p ExecStart -p User -p WorkingDirectory`, `/healthz`, commit implantado, instâncias Caddy e nginx, configuração do Gameplay e inventário real de portas/paths. **Não imprimir** EnvironmentFiles, tokens, payloads ou UUIDs.
3. Backup das configurações e binário/código **atualmente em uso** e plano de rollback verificado. Preservar `print.jobs.write`, as 33 tools LIVE, Z-API, OAuth e o PrintServer Avell. O diretório e serviço verdadeiros valem mais do que exemplos em `deploy/gateway/compose.yaml` ou `deploy/vps`.
4. Se não houver instância Gameplay com **SQLite persistente identificado**, não instalar serviço novo no escuro. Classificar `GAMEPLAY_DB_REAL=not_verified` e reportar o bloco exato para aprovação técnica.

## ETAPA 2 — GAMEPLAY, PRIMEIRO A LEITURA PRIVADA
1. Confirmar build Node24/pnpm11 e dependências PR #30/#43 no serviço Gameplay verdadeiro. A configuração de staging-demo não autoriza fotos de cliente.
2. Confirmar que `CATALOG_DATABASE_PATH` pertence ao mesmo processo da API e que SQLite WAL/media grants são consistentes. No host Linux correto, com usuário read-only, variáveis já autorizadas, executar script **já existente**: `node scripts/forensic/audit-real-catalog-readonly.mjs`. Guardar **somente totais agregados** de sessões, fotos ativas, staged e `consistent_sqlite_read_transaction`; não afirmar que esse banco é o de produção sem prova do processo.
3. Verificar qual edge realmente encaminha o host Gameplay (**Nginx exemplo existente no Gameplay; Caddy pode estar à frente**). Bloquear `/internal/*` e o próprio `/internal` no ingress público **antes de ligar a rota**, inclusive variantes normalizadas, e confirmar que POST público não alcança o upstream. Preferir rota exclusiva loopback/interface privada sem encaminhamento na borda; bloqueio 404/403 público e autenticação Bearer adicional no privado. Não confiar em `X-Forwarded-For` enviado pelo cliente.
4. Configurar somente no servidor os segredos de leitura separados (`CATALOG_INTERNAL_READ_SECRET` Gameplay e `EVYD_GAMEPLAY_READ_TOKEN` MCP: **mesmo segredo compartilhado entre estes dois componentes**, diferente dos segredos Publisher/Server). Não incluir valores em logs/terminal/chat/commit. Revisar nomes exigidos pelo código ativo; não reutilizar tokens de publicação. Testar `lookup-batch` privado com **UUID sintético/piloto autorizado**, resposta sem links, estados e contagem, e verificar que HTTP 503 não vira `not_found`.
5. **Gate:** se a base só tiver sessões sintéticas, o estado de produção dos pedidos CRM continua sem publicação comprovada. Não popular a base com imagens reais nem mudar readiness para fabricar uma prova.

## ETAPA 3 — MCP LIVE, ROLLOUT ADITIVO COM ROLLBACK
1. Reconciliar a PR #11 com a PR #12 do PrintServer e com a revisão realmente instalada; escolher mecanismo seguro existente de release/fast-forward ou integração revisada. Nunca `git reset --hard` na instância ativa, nunca substituir build inteiro pelo checkout exclusivo de uma PR.
2. Usar `npm ci --ignore-scripts` e testes/CI em release isolado e mecanismo já aprovado para ativação atômica do service `evydencia-crm-mcp-live.service`, preservando UID Node22, OAuth e PrintServer. Sem SSH ou permissão já existente: **não fingir deploy**, registrar impedimento.
3. Ativar `EVYD_ENABLE_OPERATOR_FULL_CRM=1`, `EVYD_GAMEPLAY_READ_ENABLED=1`, `EVYD_GAMEPLAY_READ_ORIGIN` (somente privada), `EVYD_GAMEPLAY_PUBLIC_ORIGIN=https://jogos.fotosdenatal.com`, e o token de leitura dedicado, respeitando permissões OAuth **do operador atual**. Não ativar antes de `lookup-batch` privado e ACL aprovados. Fazer uma ativação/restart controlado **somente** do serviço MCP, após constatar impacto e janela adequada, sem tocar na impressora e serviços Laravel/Z-API.
4. Conferir `/healthz`, `crm_capacidades` (ambas Gameplay anunciadas) e todas as ferramentas PrintServer já existentes. Se tool sumir, latência explodir, erro OAuth ou 5xx: rollback de build/env de MCP imediatamente.

## ETAPA 4 — TESTE DE PRODUÇÃO VIA CHATGPT
1. Com a conexão MCP atualizada no ChatGPT e OAuth legítimo: `crm_capacidades` deve listar `crm_gameplay_auditoria` e `crm_gameplay_links`. Se continuar no build antigo, verificar implantação/exposição; não presumir cache por conta própria.
2. Executar `crm_gameplay_auditoria(pagina=1,limite=20,incluir_publicados=true)`, com população CRM Natal 2026 status **10 ou 12**; validar `counts.total`, `pending_publication`, `published_photo_count`, `preparing_photo_count` e `orders_with_delivery_unverified`; **sem capability URLs** na auditoria em lote.
3. Escolher **um pedido individual autorizado** por `order_id` ou `order_uuid` e chamar `crm_gameplay_links`. Confirmar separação `hub_url` e `gallery_url`; busca por nome exige escolha explícita e nunca entrega o link diretamente. Nunca colar tokens completos do link em logs públicos.
4. Uma URL não abre o jogo automaticamente: `browser_runtime_verified=false` até navegador piloto com autorização, HTTP/mídia real e Phaser validados.
5. **Não enviar WhatsApp automaticamente.** Sem recibo de envio, relatório deve dizer `link_delivery_status=not_verified`; nenhuma conclusão de "link não enviado" é permitida.

## ETAPA 5 — ENTREGA E ENCERRAMENTO
Reportar numa única resposta concisa:
- SHAs exatos #11/#12/#30/#43, integridade CI e release/rollback usado;
- processo/DB Gameplay confirmado? total de sessões/fotos ativos/staged; público `/internal` bloqueado?;
- MCP build e ferramentas totais **antes/depois**, garantias PrintServer intactas, OAuth ativo;
- resultados de `crm_gameplay_auditoria` e 1 consulta autorizada (nunca URLs completas);
- `DELIVERY_RECEIPT`: `not_verified` até integração com prova CRM/Z-API por UUID/revisão;
- GO/NO-GO **separados** para API privada de leitura, ferramentas ChatGPT e publicação de mídia para famílias.

**PROIBIDO:** novo script, novo repositório, upload de fotos reais à staging-demo, mudança arbitrária de readiness, envio de WhatsApp, copiar DB/segredos ao Avell, reiniciar PrintServer/Spooler, limpar filas ou mexer no Laravel. Se todos os gates privados estiverem comprovados, fazer rollout administrativo de leitura **agora**. Se um gate P0 não estiver comprovado, não liberar esse pedaço; reporte a evidência concreta faltante, sem retomar ciclo de testes sintéticos.

**Fontes:** `docs/REAL_AUDIT_RUNBOOK_CRM_GAMEPLAY_20261026.md`; `docs/GAMEPLAY_CRM_READ_INTEGRATION_20261026.md`; `deploy/readiness.json`; `deploy/vps/nginx/christmas-games.conf.example`; `AGENTS.md`.
