# P0 LabelRenderer — execução cirúrgica Antigravity (28/10/2026)

## Fato real / delimitação
- ChatGPT executou UMA tentativa física autorizada via `crm_solicitar_impressao_etiqueta` no pedido canário de status10/saldo0 e recebeu `crm_label_render_unavailable`, antes de `printer.enqueue`. Nenhum job_id. Não repetir.
- Consulta de trabalho histórico sintético `999999` via `crm_consultar_impressao_etiqueta` respondeu `spooled`; não atesta papel, tamanho, QR, hardware.
- A ponte PHP (`scripts/crm-label-render-bridge.php`) usa `OrderLabelService::generate`, mas o bootstrap ocorre fora do catch e o erro é colapsado. Diagnósticos adicionais nesta PR são executáveis **somente leitura**, não alteram o bridge produtivo.
- Antigravity é dono do MCP/PrintServer; Codex é dono do Laravel. Não editar `hypeneural/evydencia-crm` e não habilitar baixa status10.

## Protocolo local em worktree descartável
1. `git fetch --prune`, novo worktree no HEAD desta PR, sem reset/rebase/cherry-pick dos worktrees antigos.
2. `npm ci && npm run check && npm test && npm run gateway:test`
3. `node --check scripts/verify-crm-label-render-live.mjs`
4. `php -l scripts/diagnose-crm-label-render.php`
5. `node --test test/label-readonly-preflight.test.mjs`
6. Verificar CI no SHA exato. **Esses testes offline não substituem a validação Laravel real.**

## VPS MCP — G0 somente leitura e sem credenciais no log
Verificar por leitura: `systemctl show evydencia-crm-mcp-live.service -p ActiveState -p User -p WorkingDirectory -p MainPID`, `php -v`, `php -m` (gd/pdo_mysql), `readlink -f /var/www/evydencia/current`, `namei -l /var/www/evydencia/current/vendor/autoload.php`, e permissões dos assets/fonts no caminho `storage`.

**NUNCA executar `php .../crm-label-render-bridge.php` sem STDIN JSON; um erro de input não testa Laravel!**

Usar `read -rs UUID` em shell privado com `set +x`, copiando o UUID do CRM para uma variável temporária (não inserir UUID em histórico, cron, commit, relatórios ou argv de processo). Exemplos de conteúdo de STDIN:

```json
{"order_uuid":"<UUID_LIDO_EM_SESSAO_PRIVADA>"}
```

Executar com o mesmo usuário do processo real (descobrir por `systemctl show -p User --value`) e a mesma revisão de Laravel já instalada; não assumir root. Injetar somente `EVYD_CRM_APP_PATH=/var/www/evydencia/current` e flags estritamente necessárias; os segredos permanecem no mecanismo padrão do Laravel.

```bash
# Depois de carregar UUID em sessao privada sem echo
set +x
SVC_USER="$(systemctl show -p User --value evydencia-crm-mcp-live.service)"
test -n "$SVC_USER" || { echo 'service_user_missing'; exit 1; }
APP=/opt/evydencia-mcp/app
printf '{"order_uuid":"%s"}' "$UUID" |
  sudo -u "$SVC_USER" env EVYD_CRM_APP_PATH=/var/www/evydencia/current \
  php "$APP/scripts/diagnose-crm-label-render.php"
# Somente se acima retornar ok:true:
printf '{"order_uuid":"%s","order_id":5093}' "$UUID" |
  sudo -u "$SVC_USER" env EVYD_CRM_APP_PATH=/var/www/evydencia/current \
  EVYD_CRM_LABEL_RENDER_ENABLED=1 node "$APP/scripts/verify-crm-label-render-live.mjs"
unset UUID SVC_USER
```

As duas saídas têm campos sanitizados. **Não imprimir nem anexar stdout da ponte canônica antiga**: contém PNG base64 e dados do cliente.

## Matriz de diagnóstico
- `stage=filesystem/autoload/bootstrap`: usuário systemd, release path, vendor/autoload, bootstrap/app, PHP CLI.
- `stage=db_read_only`: ambiente PDO/MySQL, conta da aplicação, `SET SESSION TRANSACTION READ ONLY`, privilégios/conexão. Não relaxar a restrição.
- `stage=extensions`: `gd`, `pdo_mysql`, fontes FreeType.
- `stage=configuration`: `ORDER_LABEL_ENABLED` efetivo e configurações cacheadas (não executar `config:clear`).
- `stage=order_lookup`: consulta UUID e relações sem escrita.
- `stage=template_lookup`: configurações por produto/globais, `Storage::disk(...)->exists`, diretórios e ativos.
- `stage=dimension_guard`: 100x40, DPI, limites vigentes.
- `stage=service_generate`: PNG GD/QR/assets/fontes; registrar classificação da exceção apenas em evidência privada.
- `stage=contract`: dimensões, PNG/bytes.
As exceções não expõem texto, SQL, nomes de clientes ou paths. Se depender do Laravel, handoff específico ao Codex, sem patch cruzado.

## PrintServer e Windows 11
- Não publicar código novo do broker por causa deste erro, pois ele ocorre antes do enqueue.
- PrintServer HEAD declarado `968e299`, `PRINTSERVER_REQUIRE_CRM_ARTWORK=1`; verificar sem job novo, preservar tombstones/queue.
- Windows 11: no repo PrintServer seguir a PR de diagnóstico somente leitura e executar `powershell.exe -NoProfile -NonInteractive -File windows/Test-LabelRuntimeReadOnly.ps1`. O script lê `Get-Printer`, `Get-PrintJob`, `Get-PrintConfiguration`, `Get-ScheduledTask` e `Get-ScheduledTaskInfo` sem invocar `agent.ps1` nem imprimir.
- Não mudar driver, tamanho padrão, Sumatra, tarefa, tokens ou spooler se a causa estiver no PHP.

## Gates e rollback
- G0: reproduzir falha e classificar o estágio com 1 execução READ-ONLY.
- G1: corrigir somente causa reproduzida, passando testes offline e integração real sem job.
- G2: CI e testes do SHA exato, snapshot e rollback do MCP se houver alteração de runtime; não usar `rm -rf` como primeira operação de rollback.
- G3: renderização canônica verificada e broker/agent read-only íntegros, liberar somente novo canário com autorização do operador e reconciliação do histórico.
- NUNCA registrar `spooled` como prova de papel ou QR físico. A confirmação depende do operador na impressora.

## Fontes oficiais
- Microsoft Learn Get-Printer, Get-PrintJob, Get-ScheduledTaskInfo: https://learn.microsoft.com/en-us/powershell/module/printmanagement/get-printer ; https://learn.microsoft.com/en-us/powershell/module/printmanagement/get-printjob ; https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/get-scheduledtaskinfo
- Laravel 10 (composer.json declara laravel/framework ^10.10): https://laravel.com/docs/10.x/database ; https://laravel.com/docs/10.x/deployment ; https://api.laravel.com/docs/10.x/Illuminate/Database/Connection.html
- MySQL: https://dev.mysql.com/doc/refman/8.0/en/set-transaction.html
- PHP CLI/proc_open: https://www.php.net/manual/en/function.proc-open.php
