# Antigravity — Etapa 7: hotfix MCP individual 409, UMA implantação

Leia primeiro `docs/AUDITORIA_FORENSE_CHATGPT_LIVE_ETAPA6_20261028.md`.
**O reader da Media VPS já está atualizado e deve permanecer intacto.**

## Contexto realmente provado pelo ChatGPT

- MCP LIVE build `e872fac`, 35/37 tools, Gameplay private probe
  `private_contract_ok`. A base do catálogo está acessível por lookup-batch.
- Auditoria do recorte CRM status 10/12: 22 pedidos, 16 estados
  `published_unverified`, 4 sem sessão, 2 revogados, 525 fotos em
  manifests; 22 URLs de pedido CRM, **zero links de hub/galeria**.
- O CRM canônico tem 104 pedidos Natal 2026 válidos (snapshot 28/10).
- Tentativas reais `crm_gameplay_links(order_id=5093|5058|5068)`
  falharam com `gameplay_http_409`, mesmo sem pedido de links públicos.
  `crm_pedidos_buscar` confirmou as três ordens.
- A release `e872fac` sempre chama `gameplay.lookup(...,{includeLinks:true})`
  e propaga 409. A PR #14 já implementa
  `lookupGameplayWithCustomerLinks` com nova consulta metadata-only após
  409; teste de regressão HTTP single 409 + batch 200 adicionado no
  `test/gameplay-links.test.mjs`.

## Execução local SEM loop

1. Sincronizar SOMENTE o worktree MCP PR #14, proteger mudanças locais e
   conferir HEAD+base e `git status`. Não refazer testes 605 do Gameplay.
2. Validar **CI do HEAD atual da PR #14** e executar apenas o novo teste
   `node --test test/gameplay-links.test.mjs` se necessário.
   Se CI falhar, diagnosticar o job específico uma vez e documentar.
3. Conferir o inventário antes/depois: 35 ferramentas ativas; PrintServer
   `crm_previa_malotes_retirada`, `crm_solicitar_impressao_etiqueta`
   e `crm_consultar_impressao_etiqueta`; Z-API/OAuth intactos. Os dois
   tools de malotes sem disponibilidade NÃO devem ser acionados.
4. Planejar o **deploy independente do MCP** na sua VPS própria, usando o
   runbook operacional existente. Capturar SHA ativo, checksum, unit
   systemd, rollback exato, health e probes antes da mudança. O deploy
   não é feito com o `stackctl` do catálogo.
5. Somente após CI verde, release da VPS MCP validada e preflight seguro,
   aplicar o hotfix com **um** restart seletivo do MCP, sem atualizar
   PrintServer, CRM, Z-API, Gateway de mídia ou fotos.
6. Voltar imediatamente ao ChatGPT com recibo (sem tokens/PII):
   HEAD instalado, Build ID/health, 35/37 tools e evidência de operação
   seletiva. Sem divulgação de clientes.
7. Validar no conector aqui:
   - `crm_capacidades(verificar_gameplay=true)`: commit atualizado e
     `private_contract_ok`, 35/37 ferramentas;
   - `crm_gameplay_links(order_id=5093)`: pedido publicado metadata,
     fotos e `customer_links_status='unavailable_http_409'`, **sem URL**;
   - `crm_gameplay_links(order_id=5058)`: `no_gameplay_session`;
   - `crm_gameplay_links(order_id=5068)`: `access_revoked`;
   - `crm_gameplay_auditoria(incluir_publicados=true,limite=50)`:
     contagens consistentes com novo snapshot;
   - `crm_estatisticas_natal(perfil_resposta='kpi_minimal')`:
     denominação comercial independente da auditoria restrita 10/12.
8. Se qualquer lookup continuar falhando, **não tentar reenvio ou liberar
   links**. Guardar resposta curta sem segredos, fazer rollback MCP
   pelo runbook anterior e registrar NO-GO com causa. Uma tentativa só.

## Segurança e evidência ainda pendentes

- `CATALOG_PRIVATE_CUSTOMER_LINKS_ENABLED` permanece desabilitado.
- Não publicar fotos, URLs capability, enviar WhatsApp, imprimir,
  alterar pedidos, restaurar SQLite, habilitar `readiness` ou mexer no
  catálogo público.
- `dataset_proven=false`, `browser_runtime_verified=false` e
  `individual_games_verified=false` não devem ser convertidos em
  `true` apenas por sucesso do MCP.
- Edge `https://jogos.fotosdenatal.com/internal/*` não pôde ser
  verificado externamente pelo ChatGPT. Validar negação com HTTP
  de borda por operador (sem expor credenciais); não declarar PASS
  só porque curl falhou por DNS/TLS.

Registre um único recibo final no repositório com antes/depois, motivo
da liberação, resultado, links restritos e rollback. Evite retestar
suites já verdes nos mesmos SHAs.
