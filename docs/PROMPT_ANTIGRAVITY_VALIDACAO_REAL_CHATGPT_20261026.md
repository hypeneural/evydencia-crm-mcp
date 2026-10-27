# P0 — Gameplay privado × MCP LIVE: verificação final sem loops — 27/10/2026

> **Regra de governança atualizada.** O Antigravity está restrito a validações locais, no checkout permitido, sem SSH, cópia de chaves, modificações em serviços VPS, `.env`, bancos de produção, Windows PrintServer ou CRM Laravel. O operador de infraestrutura/Codex responsável por releases é o único executor da parte remota, em sessão separada e com credenciais autorizadas. Esta regra prevalece sobre qualquer instrução anterior de SSH ou deploy atribuída ao Antigravity. NÃO criar scripts nem PRs paralelas.

## Estado que o ChatGPT verificou diretamente em 27/10/2026

- `crm_capacidades(verificar_gameplay=true)` no Plugin **Evydencia CRM LIVE** retornou **build `e872fac`**, `release/live-35tools-gameplay-printserver`, **37 ferramentas catalogadas, 35 ativas para este operador**, incluindo ambas `crm_gameplay_links`/`crm_gameplay_auditoria` e as 3 PrintServer existentes. O relato de 26 ativas no Antigravity refere-se a outro contexto de sessão/integração Z-API, não a uma regressão provada. O inventário não prova funcionamento do Gameplay.
- O probe retornou `{checked:true,reachable:false,status:"gameplay_http_403",dataset_proven:false}`. O mesmo erro `gameplay_http_403` foi reproduzido diretamente ao chamar `crm_gameplay_auditoria({pagina:1,limite:20,status_atual:"todos",incluir_publicados:true})`. A requisição foi corretamente classificada `UNAVAILABLE` — não foram apresentados totais fictícios de fotos/sessões.
- `crm_gameplay_links({order_uuid:UUID_SINTETICO_NULO})` retornou `total:0` sem URLs. Esta chamada não prova a conexão com Gameplay porque o CRM não encontrou pedido.
- O relatório local anterior de `--crm-only` atestou 22 pedidos elegíveis de Natal 2026 (11 status 10 e 11 status 12), sem afirmar que links foram enviados. Não repetir busca CRM por costume; snapshots variam.
- O checkout Gameplay PR #43 depende da PR #30, permanece **draft**; `deploy/readiness.json` mantém `pilotReady=false`, `customerDataAllowed=false`, `automaticDeliveryAllowed=false`. A documentação `docs/ops/CONTABO_JOGOS_STAGING_2026-10-08.md` aponta arquitetura via **Docker/stackctl, com Caddy na borda**, e não execução direta de Node no host. Essa topologia é HISTÓRICA até o operador revalidar o estado vivo.
- PR PrintServer #12 mudou **21 commits** desde `cf0e8c7` até `23a3390`, inclusive mudanças de escopo `malotes`, scripts e instruções de governança; a release Gameplay atual NÃO deve incorporar essa PR avançada sem outro gate independente. Consulte `docs/HANDOFF_ANTIGRAVITY_LOCAL_ONLY_MALOTES_20261027.md` da PR #12. **Não atualizar/reiniciar MCP por causa de Gameplay enquanto o upstream permanecer 403.**

## Conclusão forense

**GO:** MCP LIVE/PrintServer preservados, ferramenta Gameplay exposta e autorizada ao operador.

**NO-GO:** o estado real do SQLite do Gameplay, sessões, quantidade de fotos, links operacionais e entrega não foram verificados. A resposta 403 demonstra bloqueio de requisição pela origem atual, NÃO demonstra diretamente se há ou não API privada, banco ou publicações na Media VPS.

**Por que apenas cadastrar SSH key não resolve sozinho?** Uma falha de SSH não prova, isoladamente, ausência da chave no `authorized_keys`: pode ser usuário, `sshd_config`/Match, chaves ofertadas ou ACL/permissões (`StrictModes`). O administrador deve verificar a configuração efetiva via console; não repetir testes de senhas ou copiar as chaves para GitHub/chat. O MCP precisa também de **rota HTTP privada REAL** e do serviço/catalog SQLite habilitado na própria Media VPS. A chave SSH é apenas um modo de obter acesso administrativo.

## Único trabalho permitido ao Antigravity local (sem novos scripts)

1. Ler este arquivo, `docs/GAMEPLAY_CRM_READ_INTEGRATION_20261026.md` e o protocolo de agente local vigente em `AGENTS.md` da PR #12. Não executar comandos remotos nem alterar secrets/portas.
2. Conferir apenas `git status --porcelain`, SHA e GitHub CI do checkout correspondente à PR #43 e à release MCP, usando as credenciais GitHub já existentes. Não mesclar PRs #11/#12/#30/#43 nem executar deploy.
3. Encerrar relatório em até 8 linhas: `MCP_LIVE=e872fac`, `TOOLS=35/37` na sessão ChatGPT, `GAMEPLAY_PRIVATE_HTTP=403`, `MEDIA_SSH=denied/not_verified`, `MEDIA_DB=not_verified`, `CRM_GAMEPLAY_JOIN=not_verified`, `PRINTER=not_touched`, `NEXT_OWNER=infra/Codex`.
4. Entregar ao responsável pela infraestrutura a seção seguinte, sem executá-la.

## Único trabalho necessário ao administrador da Media VPS / responsável pelo release

1. Usar **console autorizado** da Contabo ou acesso já válido para confirmar a instância, login permitido, `sshd -T` com parâmetros `-C` apropriados, `AuthorizedKeysFile` efetivo, permissões de home/`.ssh`/chaves, ACL e `journalctl -u ssh`. Registrar só diagnóstico sem prints de chaves. Criar/autorizar chave pública **apenas** para usuário aprovado, com autenticação por chave e sem acesso de escrita além do necessário. Não usar senhas em loop.
2. Inventariar no host de mídia o Caddy real, `stackctl`/Docker, container Gameplay e o volume SQLite montado. Não deduzir a existência do DB pelo `healthz` em `staging-demo`. Confirmar SHA do container em execução e a origem do `CATALOG_DATABASE_PATH`; NÃO criar/copiar DB artificialmente.
3. Checar no código `apps/catalog-server/src/main.ts`: a API interna é registrada somente com `runtime.databasePath`, `runtime.publisherApiSecret`, `runtime.serverSecret` e `CATALOG_INTERNAL_READ_SECRET`. A leitura exige também origem privada acessível a partir do MCP. Se ainda estiver `previewAuthority=file-demo` e sem SQLite, manter staging intacto e classificar `MEDIA_DB=not_verified` ou `not_present` (somente se comprovado). Segredos externos e publisher devem permanecer fora de logs/commits; a política de publicação de clientes segue BLOQUEADA.
4. Expor **apenas** interface/túnel PRIVADO aprovado entre host MCP e `catalog-server` (Tailscale/WireGuard/SSH port forwarding com escopo e ACL mínimos). Não remover bloqueio público do Caddy para `/internal*`, nem aceitar IP público como substituto de autenticação; não confiar em `X-Forwarded-For` arbitrário. Antes de alterar o MCP, provar POST privado de `lookup-batch` com UUID sintético e `schema_version=1`, sem URLs e sem dados reais.
5. Usando mecanismo de rollout já autorizado, alterar **somente** `EVYD_GAMEPLAY_READ_ORIGIN` para o endereço privado comprovado e garantir que `EVYD_GAMEPLAY_READ_TOKEN` corresponde ao `CATALOG_INTERNAL_READ_SECRET` do serviço, distinto de Publisher/Server. Reiniciar apenas o MCP numa janela aprovada com rollback; preservar OAuth/Z-API/PrintServer. `EVYD_GAMEPLAY_PUBLIC_ORIGIN` mantém domínio público e não deve ser origem de API.
6. No host de mídia, com banco REAL e usuário autorizado somente-leitura, `scripts/forensic/audit-real-catalog-readonly.mjs` deve ser executado no ambiente Node24 adequado, inclusive **dentro de container isolado com montagem read-only** se o Node não estiver instalado no host; observar coexistência SQLite WAL/SHM. Confirmar somente agregados, sem divulgar UUIDs ou fotos.
7. No host MCP, com autorização operacional já existente, executar o script `scripts/antigravity/audit-real-crm-gameplay.mjs --cross-check` (nome do arquivo histórico; o operador de release é quem executa). Na sessão ChatGPT repetir apenas `crm_capacidades(verificar_gameplay=true)` até **uma** confirmação `private_contract_ok`, e então a auditoria. Sem necessidade de redeploy se o problema era somente roteamento/configuração.
8. Nenhum novo deploy ou chave é autorizado por este documento. Se faltar console/acesso legítimo, parar e comunicar **MEDIA_ACCESS_BLOCKED**. Sem migração/dados de clientes, sem modificações em `readiness.json`, sem mensagens WhatsApp nem liberação de mídia.

## Indicadores de aceite
`MCP_BUILD` confirmado; `PRINTER_TOOL_NAMES` preservados; `MEDIA_AUTHORIZED_ACCESS` confirmado; `CATALOG_RUNTIME_AND_DB_PROVEN` confirmado; `PRIVATE_LOOKUP_SYNTHETIC` HTTP 200 com contrato válido e sem link; `MCP_PROBE=private_contract_ok`; `CRM_JOIN_REAL` consultado com contagens/estados reais; `DELIVERY_RECEIPT` permanece `not_verified` até contrato canônico CRM/Z-API; `CUSTOMER_RELEASE=NO-GO` sob flags atuais.

### Fontes oficiais
- OpenSSH `sshd` e permissões: https://man.openbsd.org/sshd.8
- Caddy matcher `path`/`remote_ip`/`client_ip`: https://caddyserver.com/docs/caddyfile/matchers
- Caddy trusted proxies: https://caddyserver.com/docs/caddyfile/options
- Tailscale SSH/ACL: https://tailscale.com/docs/reference/ssh-over-tailscale
- MCP `tools/list` e `listChanged`: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- SQLite backup e WAL: https://www.sqlite.org/backup.html
