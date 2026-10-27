# Workstreams MCP — 2026-10-27

- Gameplay: PR #11 (`feat/gameplay-read-client-20261026`) integra leitura de pedidos e links de sessão; Gameplay PR #43 provê o leitor privado. Sem alterações na impressão, na baixa do CRM ou no envio automático.
- PrintServer: PR #12 (`feat/printserver-bridge-20261026`) integra etiqueta e malotes; issue #10 detalha confirmação financeira, autorização e mudança de status. Não depende da Gameplay.
- `main` é referência de desenvolvimento; `release/live-35tools-gameplay-printserver` representa a linha da implantação MCP observada. PRs baseadas em `main` NÃO podem ser promovidas diretamente sobre a release sem reconciliação.
- Publicidade de URL não implica acesso anônimo: `/s/:token` é uma capability privada na URL. A consulta individual requer operador OAuth autorizado e pedido CRM específico. Batch nunca traz tokens.
- Separar testes e CI por domínio, registrar SHA e comparar inventário de ferramentas antes/depois. Sem force push, merge automático ou alteração de produção.
- Estado de links: `hub_url` e `gallery_url` representam rotas distintas; `/s/:token` é o hub dos jogos, e `/s/:token/fotos` é a galeria. Links só podem ser apresentados como funcionais após publicação pública realmente homologada.
