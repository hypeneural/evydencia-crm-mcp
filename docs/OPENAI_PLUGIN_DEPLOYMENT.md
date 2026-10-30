# OPENAI: roteiro de implantação do Plugin — 24/10/2026

## Arquitetura certa
ChatGPT Plugin → MCP server → adaptador HTTPS allowlist → Laravel Extension API Sanctum.
O GitHub contém **servidor MCP em stdio + ferramentas MOCK**. O repositório **NÃO contém** plugin instalado, tunnel_id, OAuth, servidor Streamable HTTP público nem credenciais. `plugin.json` não é exigido para testar o MCP local; só pode ser vinculado de forma válida após conectar um servidor/ID real e seguir o esquema de pacote da OpenAI.

### Etapa A: conectividade mínima com o ChatGPT
1. Executar `.\scripts\go.ps1` no Windows e obter GO_LOCAL_MOCK.
2. Criar o tunnel_id real no OpenAI Platform (permissões Tunnels Read+Manage/Use); ter runtime key FORA do repositório.
3. Instalar o cliente oficial https://github.com/openai/tunnel-client pela release/painel, executar `tunnel-client help quickstart`, `tunnel-client init`, `tunnel-client doctor --profile local-stdio --explain` e `tunnel-client run --profile local-stdio`.
4. ChatGPT Plugins → Add custom MCP server → Connection: Tunnel → selecionar ID; criar conexão, verificar a tool `crm_capacidades` e retorno `mock:true`.
5. Só agora há evidência GO_CHATGPT_MOCK. Não dizer que conexão está pronta apenas porque stdio passa no teste.
6. A criação de uma conexão custom retorna ID técnico `plugin_asdk_app...`. Este ID real pode ser fornecido ao Plugin Creator para empacotar o plugin, conforme documentação oficial. Nunca inventar ID.

### Etapa B: fluxo Plugin e habilidades
- Um plugin é a combinação opcional de skills, ferramentas MCP e UI. Skills de Antigravity em `.agents/skills` NÃO são automaticamente skills importadas em ChatGPT.
- Se for necessário distribuir skills pelo MCP, a OpenAI requer anúncio de `capabilities.extensions["io.modelcontextprotocol/skills"]`, `skills/list`, `skills/get` e `resources/read`, mais checagem de digest. Esse suporte não está implementado.
- A importação de skills via Scan Tools gera **snapshot** na versão do plugin; mudanças exigem nova varredura.
- `plugin.json` e `mcp.json` de pacote são fase posterior ao ID da conexão; não inserir URI falsa, placeholder de segredo ou cliente OAuth falso.
- Aplicar títulos, descrições, schemas e anotações corretas de cada tool. Já implementado: títulos, hints e server instructions. Testado pelo SDK Cliente.

### Etapa C: dados comerciais reais
- Antes de exposição remota de cliente/agenda, validar autenticação por operador. O servidor atual não implementa OAuth.
- OAuth 2.1: protected resource metadata, metadata AS, CIMD (preferido quando suportado) ou DCR, PKCE, validação issuer/audience/expiry/scopes e autorização por tool.
- Sanctum Laravel é credencial do upstream; não substitui identidade OAuth do ChatGPT.
- APIs de stats Natal, agenda privada e busca nominal não existem na Extension API; só mocks. Não usar APIs Manager SingleAuthentication.
- Envio real exige, além disso, intenção persistente e confirmação explícita fora de instruções do LLM, request_id UUID estável, idempotência e conciliação.

### Etapa D: publicação aberta
- Secure MCP Tunnel atende teste privado, **não** publicação pública do plugin.
- Para distribuição pública, a OpenAI requer URL HTTPS estável com transporte Streamable HTTP, auth e revisão.
- Cloudflare Agents e workers-oauth-provider são alternativas para implantação futura, não dependências do MVP local.

## Referências oficiais verificadas
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://github.com/openai/tunnel-client


## Comando correto do Tunnel em modo MOCK
Com tunnel_id e credenciais reais obtidos na OpenAI Platform, configure o perfil stdio com diretório de trabalho na raiz do clone. Não execute usando um ID inventado.

    tunnel-client init --sample sample_mcp_stdio_local --profile local-stdio --tunnel-id SEU_ID_REAL --mcp-command "node --env-file=.env scripts/start-mock.mjs"
    tunnel-client doctor --profile local-stdio --explain
    tunnel-client run --profile local-stdio

O entrypoint start-mock.mjs valida .env e o ambiente e reserva stdout ao protocolo MCP. NUNCA passar scripts/go.ps1 como comando stdio: ele imprime logs dos testes. O marcador SEU_ID_REAL deve ser substituído somente pelo ID do painel oficial. Não guardar chaves no Git ou nesta documentação.
