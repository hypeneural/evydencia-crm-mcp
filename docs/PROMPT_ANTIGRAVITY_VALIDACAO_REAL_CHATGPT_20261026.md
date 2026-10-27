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


## Atualização confirmada: dois Avells, SSH existente e porta privada de Gameplay (27/10/2026)

**Nova evidência fornecida pelo operador do Avell do estúdio (DESKTOP-CUU7542):**
- Conexão real: \`ssh vps-prod\` -> \`vpsops@100.116.8.109\` via \`~/.ssh/id_ed25519_vps\`. Tailnet do estúdio: \`100.97.3.43\`. Conta remota \`vpsops\` (UID 1001) tem apenas \`NOPASSWD: /usr/local/sbin/stackctl\`, **não** tem root/sudo genérico.
- \`christmas-games-catalog\` e \`christmas-games-gateway\` estão saudáveis no relatório local; catálogo vinculado a **100.116.8.109:4180**; SQLite informado em \`/srv/runtime/christmas-games/data/sqlite/catalog.db\`, com WAL e SHM; runtime release \`20261019-8ac62b3\` em \`staging-demo\`. Evidência de presença de SQLite, não comprovação do schema/API \`lookup-batch\` ou de fotos reais publicadas. O SHA informado pertence à release instalada e ainda deve ser reconciliado com a PR Gameplay #43.
- Há um **Avell do quarto diferente** daquele que possui a chave do estúdio. A origem funcional é o Avell do estúdio; não copiar \`id_ed25519_vps\` privada para o quarto.

### Caminho mais simples: autorizar chave exclusiva do Avell do quarto via SSH que já funciona

1. No Avell do quarto, instalar/entrar no **mesmo tailnet Tailscale**, se ainda não conectado. Verificar \`tailscale ping 100.116.8.109\`.
2. Na conta Windows do quarto, executar \`ssh-keygen -t ed25519 -a 64 -f "$env:USERPROFILE\\.ssh\\id_ed25519_media_quarto" -C "avell-quarto-media"\` **uma vez** se a chave não existir. Preservar privada no quarto. Encaminhar ao estúdio **somente** o conteúdo \`id_ed25519_media_quarto.pub\` e verificar seu fingerprint.
3. Do Avell do estúdio, autenticado normalmente via \`ssh vps-prod\`, acrescentar a linha pública à **conta própria de vpsops** em \`~/.ssh/authorized_keys\`, se a conta tiver permissão de escrita. Garantir modos \`0700\` no diretório e \`0600\` no arquivo. Não editar \`/root/.ssh/authorized_keys\`; não desligar \`StrictHostKeyChecking\` e não habilitar senha de root SSH.
4. Do quarto, confirmar **fingerprint do host** por canal confiável e autenticar \`ssh -i "$env:USERPROFILE\\.ssh\\id_ed25519_media_quarto" vpsops@100.116.8.109\`. Este SSH **não concede root**; mantém \`sudo /usr/local/sbin/stackctl\` quando necessário para stacks.
5. Se o estúdio não puder alterar as chaves da própria conta por permissão/ACL, **não usar \`sudo stackctl\` para burlar autorização**. Um operador já autorizado no console da VPS decide o ajuste.

**Para manutenção que de fato exigir root:** usar sessão administrativa preexistente ou console autorizado uma vez, concedendo \`sudo\` auditável temporário ao operador com autenticação apropriada. \`vpsops\` NÃO possui \`sudo -i\` hoje. Não atribuir \`NOPASSWD:ALL\` permanentemente e não ativar \`PermitRootLogin yes\`/senha pela internet. Revogar qualquer elevação excepcional ao fim da manutenção. Se a tarefa couber em \`sudo stackctl\`, não há motivo para root genérico.

### Gate P0 da integração: origem e versão da API são separadas do SSH

- \`gameplayReadConfig()\` em \`src/gameplay-read-client.mjs\` exige URL **HTTPS** para host remoto, autorizando HTTP **somente em \`127.0.0.1\`/localhost/\`::1\`**. Por isso \`EVYD_GAMEPLAY_READ_ORIGIN=http://100.116.8.109:4180\` é **inválida**. Não alterar env para esse endereço HTTP.
- Opções permitidas ao responsável pela infraestrutura: HTTPS privado com certificado confiável no tailnet **OU** túnel seguro aprovado terminando em loopback no host MCP, apontando \`EVYD_GAMEPLAY_READ_ORIGIN=http://127.0.0.1:<PORTA_LOCAL_DO_TUNEL>\`. Esse túnel precisa ter lifecycle/restart/monitoramento e não abrir a porta 4180 publicamente.
- Antes de abrir conexão com UUIDs reais, verificar se a imagem/container **realmente implantado** inclui \`/internal/v1/sessions/lookup-batch\`, o \`CATALOG_INTERNAL_READ_SECRET\`, as demais configurações requeridas e as tabelas/revisões do banco. O staging saudável de outubro não comprova implantação da PR #43; não fazer rollout por substituição cega.
- O HTTP 403 observado do MCP é coerente com uso da **origem pública bloqueada**, mas não prova por si só que exista backend read-only internamente. Um \`GET /healthz\` público \`staging-demo\` não comprova publicação de clientes.
- Assim que a origem privada e a API real forem comprovadas, executar **um** probe \`crm_capacidades(verificar_gameplay=true)\` e depois \`crm_gameplay_auditoria\`. Manter recibos de entrega em \`not_verified\`, \`customerDataAllowed=false\` e sem envio WhatsApp.


## Atalho P0 (27/10/2026): evitar trial Tailscale expirado e aprovar zero dispositivos

**Evidência visual:** no painel Tailscale do Avell do quarto, máquina \`AnnaHelena\` / \`100.112.219.55\` mostra **Needs approval** e o banner **Enterprise Free trial has ended / Choose a plan**; a conta é gerenciada por \`contato@evydencia.com.br\`. Isso significa que a máquina **já se registrou** mas não pode enviar tráfego no tailnet por ausência de aprovação. Segundo https://tailscale.com/pricing, **após o Enterprise trial expirado sem escolha de plano, aprovações de dispositivos ficam bloqueadas**. NÃO é limite de quantidade de dispositivos. Plan Personal gratuito destina-se a uso **não comercial**, e não deve ser apresentado como plano legítimo para esta operação empresarial. Não criar outro tailnet gratuito para contornar aprovação.

### Decisão operacional: USAR SSH público autenticado por chave, sem Tailscale novo, VNC ou root

Já existe SSH funcional do **Avell do estúdio** (\`DESKTOP-CUU7542\`) à Media VPS, por \`ssh vps-prod\` -> \`vpsops@100.116.8.109\`. Os logs anteriores do quarto contra **169.58.210.14** deram \`Permission denied (publickey,password)\`, o que indica que pelo menos naquela tentativa SSH público respondeu e recusou as credenciais, não necessariamente firewall bloqueado. Usar chave **própria** do quarto autorizada no \`vpsops\` do servidor através da sessão válida do estúdio.

**Passo 1 — no Avell do quarto, PowerShell sem administrador** (não mexer na chave privada do estúdio):
\`\`\`powershell
$ErrorActionPreference='Stop'
$key=Join-Path $env:USERPROFILE '.ssh\id_ed25519_media_quarto'
New-Item -ItemType Directory -Force (Split-Path $key) | Out-Null
if(-not(Test-Path $key)){
 ssh-keygen -t ed25519 -a 64 -f $key -C 'avell-quarto-media'
 if($LASTEXITCODE -ne 0){throw 'GERACAO_CHAVE_FALHOU'}
}
if(-not(Test-Path "$key.pub")){throw 'CHAVE_PUBLICA_NAO_ENCONTRADA'}
Get-Content "$key.pub" | Set-Clipboard
ssh-keygen -lf "$key.pub"
Test-NetConnection 169.58.210.14 -Port 22 -InformationLevel Quiet
\`\`\`
A saída True da última linha indica que a porta pública é alcançável agora; False -> sem tentativas repetidas, usar acesso do estúdio ou resolver rede com operador.

**Passo 2 — no Avell do estúdio, PowerShell**:
\`\`\`powershell
ssh vps-prod
\`\`\`
Na sessão autenticada \`vpsops\`, rodar **uma vez** este trecho. Quando solicitado, colar **somente** a linha pública que veio de \`id_ed25519_media_quarto.pub\`; NÃO colar private key; o script verifica prefixo e evita duplicação:
\`\`\`bash
umask 077
mkdir -p "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
chmod 700 "$HOME/.ssh"
chmod 600 "$HOME/.ssh/authorized_keys"
printf 'Cole a linha SSH PUBLICA do Avell do quarto: '
IFS= read -r new_public_key
case "$new_public_key" in
  ssh-ed25519\ *) ;;
  *) echo 'FORMATO_INVALIDO'; exit 1 ;;
esac
grep -Fxq -- "$new_public_key" "$HOME/.ssh/authorized_keys" ||
  printf '%s\n' "$new_public_key" >> "$HOME/.ssh/authorized_keys"
unset new_public_key
echo 'CHAVE_PUBLICA_ADICIONADA_NA_CONTA_VPSOPS'
\`\`\`
**Atenção:** confirmar o formato com \`ssh-ed25519\` e a linha completa. A configuração de \`authorized_keys\` é do Linux \`vpsops\`, não de \`root\`. Se não houver permissão, parar e usar operador legitimamente autorizado; não usar \`sudo stackctl\` como contorno de ACL.

**Passo 3 — no quarto:** o fingerprint público do host SSH deve ser fornecido via sessão já autenticada do estúdio ou console confiável antes de adicionar host novo; não usar \`StrictHostKeyChecking=no\`. Após conferir a identidade do servidor:
\`\`\`powershell
$key=Join-Path $env:USERPROFILE '.ssh\id_ed25519_media_quarto'
ssh -o BatchMode=yes -o PasswordAuthentication=no -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=8 -i $key vpsops@169.58.210.14 'id -un; hostname'
\`\`\`
Se der \`Permission denied\`, confirmar ACL de \`authorized_keys\`, chave correta e \`sshd\` apenas com acesso do estúdio. Não tentar senha root. Se a porta pública não estiver acessível, usar o Avell do estúdio (já autorizado) para manutenção; **VNC não é pré-requisito**.

### Depois de SSH: a etapa REAL que falta
1. Com a sessão legítima \`vpsops\` ou \`sudo stackctl\`, conferir release real do \`christmas-games-catalog\` (o relatório do estúdio aponta \`8ac62b3\`), o volume SQLite real existente, e se a API \`/internal/v1/sessions/lookup-batch\` está **na imagem que está rodando**. A PR #43 ainda está draft e não está automaticamente no container.
2. O acesso SSH do quarto não estabelece a conectividade **MCP VPS -> Media VPS**. O cliente do MCP exige HTTPS remoto ou HTTP por **loopback**; não tentar \`EVYD_GAMEPLAY_READ_ORIGIN=http://100.116.8.109:4180\`. Se o servidor permitir, estabelecer túnel privado e persistente (sob responsabilidade de infra) ou HTTPS privado com certificado confiável; manter o 403 público.
3. Só após isso executar um probe \`crm_capacidades(verificar_gameplay=true)\`, um smoke privado sintético e a auditoria real. Não enviar mídias ou WhatsApp.
4. A conta \`vpsops\` tem \`NOPASSWD: /usr/local/sbin/stackctl\`, **não** \`sudo -i\`. Root genérico não é necessário para adicionar chave ao próprio usuário. Se algo realmente exigir root, o administrador autorizado faz elevação temporária auditada via console/sudo com rollback; NÃO habilitar \`PermitRootLogin yes\` com senha pública. Como uma senha antiga apareceu em relatórios/chat, rotacioná-la por canal seguro.

### Se escolher corrigir Tailscale em vez do SSH público
O admin do tailnet deverá selecionar um **plano apropriado para uso empresarial** (não Personal non-commercial). Os dispositivos existentes mantêm conexão após expirar a trial, mas as aprovações de novos dispositivos ficam suspensas sem escolha de plano (https://tailscale.com/pricing). \`AnnaHelena\` permanece pendente até aprovação do administrador e o tráfego permanece bloqueado. Não apagar dispositivos da tailnet para "abrir vagas": o bloqueio não é por vagas.

**DONE:** obtenção de SSH no quarto (ou manutenção já possível pelo estúdio), comprovação da imagem/API/SQLite real, conexão privada do MCP e retorno \`private_contract_ok\`. Nunca alegar que \`GAMEPLAY_DB_REAL\` foi verificado apenas porque o arquivo SQLite existe.
