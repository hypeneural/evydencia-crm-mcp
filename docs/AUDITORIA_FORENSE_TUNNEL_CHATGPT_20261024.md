# Auditoria forense pós-Tunnel — Evydência CRM MCP
Data de corte: 24/10/2026, hora local de Santa Catarina.

## Evidência e limites
Fonte 1: log do Antigravity fornecido pelo operador (nesta conversa), 159 linhas. Registra o fluxo Chrome DevTools, correção do ID do Tunnel, doctor, daemon e ferramentas chamadas no ChatGPT. É **evidência relatada pelo agente local**, não acesso independente deste repositório ao computador.
Fonte 2: GitHub main + GitHub Actions; correção CRLF já publicada no commit b556987d, com testes aprovados.
Fonte 3: chamada executada nesta conversa ao Plugin **Evydencia CRM Mock**, que respondeu efetivamente crm_capacidades e crm_natal_indicadores_mock, marcados mock:true/source:fixture.

Resultados relatados do local: tunnel-client 0.0.18, doctor RESULT ok, daemon local ready=true com estado polling e 18/18 entregas, zero falhas. 17/17 ferramentas descobertas no protocolo 2026-07-28. Ausência da ferramenta crm_agendar_proposta_natal. O log não comprova suporte de ferramentas em todos os modos de VOZ do ChatGPT.
**Não incluir neste documento o Tunnel ID, org/workspace ID, runtime key, URLs de conversas privadas ou caminhos com identificadores pessoais.**

## Análise forense — o que foi realmente corrigido
1. Falhas 404/401 por transcrição incorreta de um caractere no ID do Tunnel foram resolvidas usando o atributo textual do DOM, não inferência visual.
2. O perfil usa o binário oficial tunnel-client para apontar a um MCP stdio, sem abrir firewall ou HTTP público.
3. O MCP child utiliza o entrypoint seguro `node --env-file=.env scripts/start-mock.mjs`.
4. A correção CRLF de test/mock-business.test.mjs está na main. Aceita LF e CRLF sem enfraquecer frontmatter.
5. O log informa uma modificação local ainda não publicada em scripts/go.ps1 (ajuste do comando de inicialização no texto final).

## Próximo risco real
**A conexão foi criada sem autenticação individual. Isso é aceitável apenas para dados 100% sintéticos.** Nunca ativar EVYD_PRIVATE_TOOLS=1 ou EVYD_MOCK_MODE=0 no túnel atual. Um futuro CRM comercial requer OAuth 2.1 por operador, verificação de token por ferramenta, scopes Sanctum mínimos no upstream e controles de privacidade. A regra de envio real permanece WRITE_GATED e não existe ferramenta registrável de envio.

**Somente uma instância de tunnel-client por Tunnel ID com stdio.** Em um reinício, interrompa a instância anterior antes de subir outra; duas instâncias podem dividir initialize/tools/call em processos diferentes, mesmo se relatam ready. Fonte oficial: https://github.com/openai/tunnel-client/blob/master/docs/configuration.md.

A URL /health?details=true e /health/mcp dá um retrato local; **observação não é garantia contínua de que o ChatGPT conseguirá chamar a tool**. Fonte oficial: https://github.com/openai/tunnel-client/blob/master/docs/health.md.

## Correções publicadas no MCP após o log
- docs/CHATGPT_MOCK_HOMOLOGACAO.md: marco e limites do GO_CHATGPT_MOCK.
- scripts/verify-tunnel-mock.mjs: avaliador sem credenciais do inventário esperado de 17 ferramentas.
- scripts/tunnel-ready.mjs: CLI portável no Windows e Linux; consulta SOMENTE http://127.0.0.1:8080/health?details=true e /health/mcp. Não procura runtime key nem tunnel id.
- test/tunnel-ready.test.mjs: testes de sucesso, ferramenta ausente/inesperada, descoberta incompleta, sem prontidão, e leitura por loopback.
- Usar **node scripts/tunnel-ready.mjs** para validação local; NÃO executar o módulo utilitário verify-tunnel-mock.mjs diretamente no Windows.

## Arquitetura comparada com bases oficiais
- modelcontextprotocol/typescript-sdk v2.4.0: mantém stdio e Client; adequado; sem motivo para reescrever em outra stack.
- openai/tunnel-client: transporte já homologado; adotar diagnóstico e operação com instância única.
- mcp-use/mcp-use: atalhos de desenvolvimento, mas migração traria dependências sem benefício comprovado para 17 tools que já operam.
- openai/mcp-extensions: interface rica opcional após validar UX, não requisito de primeira integração.
- cloudflare/agents e workers-oauth-provider: alternativas para *fase posterior* de gateway HTTPS, OAuth e estado durável, não para o MOCK sem credenciais.

## Contratos CRM — confirmados na main
A API Laravel Sanctum só expõe bootstrap, customer-context, customer-360, proposals/preview, proposals/schedule e proposals/{uuid}/abort com abilities específicas. As rotas comerciais/gerenciais de estatísticas, agenda privada, filtros gerais e busca nominal **não constam** de routes/extension-api.php. O MCP mantém essas capacidades como MOCK_ONLY.
O POST proposals/preview pode sondar worker e não deve ser anotado read-only em ambiente real. Nenhuma ferramenta de schedule/abort foi adicionada.

## GO/NO-GO
- GO_LOCAL_MOCK: o log informa PASS no Windows; sem nova execução neste ambiente.
- GO_CHATGPT_MOCK: o log informa PASS e houve verificação independente nesta conversa por Plugin conectado.
- GO_CHATGPT_VOICE: PENDENTE, deve ser testado explicitamente em um modo de voz que tenha acesso ao Plugin.
- GO_REAL_READ: BLOQUEADO, falta autenticação por operador e endpoints read-only escopados.
- GO_SEND: BLOQUEADO, confirmação explícita vinculada a intenção, journal durável e idempotência ainda ausentes.

## Fontes oficiais
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://www.antigravity.google/docs/hooks
- https://www.antigravity.google/docs/rules/
- https://github.com/openai/tunnel-client/blob/master/docs/onboarding.md
- https://github.com/openai/tunnel-client/blob/master/docs/health.md
