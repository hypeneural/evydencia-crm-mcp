# Antigravity — release restrito à VPS do MCP (27/10/2026)

**Autoridade conferida pelo gestor:** Antigravity opera `evydencia-crm-mcp` PR #12 e `printserver` PR #1 **somente na VPS exclusiva do MCP**, incluindo deployment coordenado de gateway e broker. Não acessar, pesquisar, editar, implantar ou executar scripts em outros servidores de negócios, outros repositórios ou bancos comerciais. Não modificar pedidos reais nem disparar WhatsApp. O notebook Windows é apenas o destino do agente de impressão; não reinstalar driver ou imprimir como parte deste deploy.

## G0 — Divergência LOCAL já identificada
- MCP PR #12: HEAD GitHub aprovado na abertura deste runbook `e2f9d3bd8a85599d81d1bd8f7ea3c3566aa8e637`; commit exclusivo do worktree antigo `50afb413d109bdc56c45eba037f2cf3088c6f42b` não constava do repositório remoto.
- PrintServer PR #1: HEAD remoto `05756319acb22b4ae0ecce494912d971fdf9bf68`; commit local antigo `e94be13d1f68860434a17a642b91f551feef9fa0` não constava no remoto.
- **Esses HEADs são referências, não alvos irrevogáveis.** Conferir novamente GitHub Actions dos SHAs reais. Não fazer `git checkout -B`, `reset --hard`, `git pull --rebase`, `push --force`, `cherry-pick` nem `git push` dos runners locais redundantes.
- Nos dois clones originais: `git status --porcelain`, `git rev-parse HEAD`, `git log -3 --oneline`; registrar os commits locais e, se necessário, criar refs de backup NOMINADAS sem mudar o HEAD.
- `git fetch origin` atualiza somente objetos/referências locais; usar **worktree novo e detached** para cada HEAD remoto:
  ```powershell
  # Na raiz de C:\Projetos\hypeneural\evydencia-crm-mcp
  git fetch origin
  git worktree add --detach ..\evydencia-mcp-release-check origin/feat/printserver-bridge-20261026
  # Na raiz de C:\Projetos\hypeneural\printserver
  git fetch origin
  git worktree add --detach ..\printserver-release-check origin/feat/windows-label-mcp-broker-20261026
  ```
  Se o destino já existir, PARAR e inspecionar `git worktree list`; não substituir ou apagar.
- Em cada worktree isolado, `npm run agent:validate:local`. Não copiar `scripts/agent-validate-local.mjs` de clones antigos: o script aprovado é `scripts/validate-agent-local.mjs`. A CI GitHub deve estar verde no mesmo HEAD final.
- Guia oficial: https://git-scm.com/docs/git-worktree (opção `--detach` preserva branches existentes).

## G1 — Confirmar o ALVO correto (sem mutação)
- Conectar somente à VPS do MCP autorizada para `mcp-crm.etijucas.com.br`. Validar o identificador do host, IPv4 do inventário, hostname e serviço **antes** de usar `sudo`; nunca inferir que uma VPS de negócios é a mesma.
- Conferir `systemctl show evydencia-crm-mcp-live.service evydencia-printserver.service -p ActiveState -p SubState -p MainPID -p WorkingDirectory -p FragmentPath`; não exibir conteúdo de `EnvironmentFile` ou tokens.
- Verificar `/opt/evydencia-mcp/app`, `/opt/evydencia-printserver`, códigos implantados e processos reais, comparando com HEADs das PRs. Testar somente endpoints de health, sem chamadas de escrita.
- Inspecionar o estado de fila `queued/claimed/unknown` de forma privada. Se houver claim ativo, tarefa incerta, trabalho pendente ou falta de snapshot verificável, **STOP** e reconciliar sem reenvio. Não remover jobs, tombstones nem ajustar `jobs.json` manualmente.
- Registrar plano de rollback com SHAs **implantados** antes do rollout, backup privado da fila e dos arquivos de configuração. Não copiar credenciais para logs ou GitHub.

## G2 — Release MCP VPS, somente se G0/G1 GO
1. Se o broker não estiver no HEAD aprovado, publicar **PrintServer Broker primeiro** pelo mecanismo existente de deploy da VPS, a partir de um checkout/artefato limpo e verificável, sob `evydmcp`. Exigir `PRINTSERVER_REQUIRE_CRM_ARTWORK=0` nesta etapa de compatibilidade e preservar a fila; reiniciar apenas `evydencia-printserver.service` se realmente houve mudança.
2. Confirmar `http://127.0.0.1:8097/healthz`, fila íntegra e polling do agente Windows. Falha: rollback do **código** conforme SHA anterior registrado, sem restaurar snapshot antigo de jobs sobre alterações novas.
3. Publicar **gateway MCP**, se necessário, a partir do HEAD aprovado. Manter `EVYD_MALOTES_READY_WRITE_ENABLED=0` e `EVYD_MALOTES_BATCH_ENABLED=0` (nenhuma mudança comercial nesta operação). Verificar `http://127.0.0.1:8090/healthz` e consulta `crm_capacidades` por operador com OAuth.
4. Verificar renderização PNG/PDF natalina por teste **sintético já existente**, somente se o SHA/ambiente mudou. Ativar `EVYD_CRM_LABEL_RENDER_ENABLED=1` depois de confirmar a dependência PHP e a arte; somente então `PRINTSERVER_REQUIRE_CRM_ARTWORK=1` no broker.
5. Para expor somente a impressão de 1–20 pedidos já prontos: `EVYD_MALOTES_PRINT_BATCH_ENABLED=1` no MCP. O schema deve anunciar apenas `modo=so_imprime` quando escrita comercial continua OFF; exigir escopo `print.jobs.write`, operador permitido, estado de pedido 10 e saldo 0. **Não** ativar outras flags de escrita.
6. Após mudanças de ambiente, reiniciar **somente o serviço afetado**, verificando health, build_commit e catálogo ativo. `systemctl status` ajuda leitura humana; `systemctl show` expõe propriedades estruturadas (docs https://www.freedesktop.org/software/systemd/man/latest/systemctl).

## G3 — Prova operacional e rollback
- Confirme `crm_capacidades`: build correto e `crm_previa_malotes_retirada`, `crm_solicitar_impressao_etiqueta`, `crm_consultar_impressao_etiqueta` ativas; `crm_processar_malotes_retirada` ativa com **somente impressão** se flag ON; ferramenta de baixa indisponível.
- Primeira impressão REAL somente com pedido autorizado, já disponível, quitado e confirmação explícita do gestor. `spooled` não garante etiqueta ejetada, QR legível ou impressão física. Não repetir automaticamente pedidos `unknown`/timeout/409.
- Se qualquer gate falhar: desligar flag nova afetada, preservar fila/tombstones e reportar o bloqueio. Nunca substituir o histórico de jobs com backup anterior sem reconciliação.
- Entregar **uma única resposta**: HEAD MCP, HEAD PrintServer, SHAs realmente em execução, snapshots/rollback, serviços, build e estado efetivo das ferramentas, indicação GO/NO-GO de impressão. Nenhuma operação nos sistemas fora da VPS MCP.

**Separação estrita:** este runbook não trata da alteração comercial de pedidos. Qualquer liberação de funcionalidade dependente de API externa ocorrerá em outro processo e não faz parte da tarefa de Antigravity.
