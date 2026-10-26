# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [0.12.0] - 2026-10-26

### Adicionado
- **Card Visual v2 interativo (MCP Apps):** novo recurso `ui://evydencia/crm-visual-card-v2.html` com suporte a tema claro/escuro, renderização condicional de estados de avatar e fallback textual estruturado em `content[0].text`.
- **Compatibilidade temporária:** recurso `ui://evydencia/crm-visual-card-v1.html` registrado como fallback de compatibilidade e rollback.
- **Escopos OAuth 2.1 granulares e RFC 9728:** suporte a `crm.read`, `crm.proposal.write`, `zapi.message.send` e `zapi.group.manage` com validação server-side de escopos e abilities reais do Sanctum.
- **Isolamento de cache HMAC por operador:** chaves de cache em memória derivadas via HMAC-SHA256 combinando `operatorId`, `authScope`, `upstreamGrantHash` e versão de projeção.
- **Transporte STDIN seguro:** comunicação com scripts PHP exclusivamente via `STDIN` limitado a 16 KB de entrada e 8 MB de saída, eliminando parâmetros e PII de `/proc/<pid>/cmdline` e logs.
- **Diagnóstico em tempo real Z-API:** ferramentas `zapi_instancia_diagnostico` e `zapi_instancia_historico` com base em webhooks reais e verificação seletiva.
- **Resolução segura de homônimos:** suporte a status `ambiguous` em buscas de clientes por nome, prevenindo a seleção arbitrária do primeiro registro.
- **Modo `kpi_minimal`:** retorno ultra-enxuto de estatísticas de Natal 2026 em payload `<= 5 KB` (1.094 bytes medidos).

### Corrigido
- **Contratos financeiros nos cards visuais:** valores monetários agora utilizam inteiros em centavos canônicos (`total_cents`, `received_cents`, `remaining_cents`), garantindo exatidão comprovada nos pedidos `#5127` e `#5128`.
- **Falsa contagem de parcelas no pedido `#5127`:** `card_split_count: 3` na parcela `#2` não infla a contagem de parcelas do pedido (`installments_count: 2`).
- **KPIs vitalícios no Cliente 360:** consumo estrito de `kpis.lifetime_contracted_valid_cents`, `kpis.lifetime_received_cents` e `kpis.lifetime_remaining_valid_cents` em vez de soma de pedidos paginados.
- **Semântica honesta de Natal 2026:** adoção de 3 estados (`purchased = true | false | null`), exibindo `"Não verificado"` quando a verificação for inconclusiva ou ausente.
- **Falso negativo no Google Calendar:** detecção corrigida para a chave camelCase `syncEnabled` retornada pelo CRM e preservação do status sincronizado quando `order_session.is_synced = true`.
- **Otimização de queries SQL:** refatoração de `customers.forensic360` em 3 camadas (Camada A agregados, Camada B Eloquent paginado e Camada C auditoria sob demanda), reduzindo latência em 42,5% e queries em clientes recorrentes.
- **Desacoplamento de seções de Natal:** `secoes=["resumo"]` não carrega mais a série histórica 2021–2025, reduzindo o payload em 66,6%.
- **Eliminação de N+1:** remoção de queries repetidas em `$order->currentStatus()` nos lotes forenses.
- **Injeção de dependência de `NatalValidOrdersQuery`:** resolução via container de serviços do Laravel no bridge forense.

## [0.11.0] - 2026-10-25

### Adicionado
- **Integração com MCP oficial Z-API:** gateway bridge Streamable HTTP consumindo `https://mcp.z-api.io/mcp` via OAuth 2.1 individual por operador.
- **Descoberta dinâmica de ferramentas Z-API:** 9 ferramentas oficiais expostas automaticamente (`zapi_send_text`, `zapi_send_image`, `zapi_send_video`, `zapi_group_create`, etc.).
- **Isolamento de credenciais:** instância e tokens da Z-API criptografados em cofre local isolado no gateway (`zapi-oauth.enc.json`).

## [0.10.1] - 2026-10-25

### Corrigido
- **Compatibilidade outputSchema:** suporte a arrays vazios codificados pelo PHP (`[]` vs `{}`) sem rejeição no validador Zod do cliente MCP.

## [0.10.0] - 2026-10-25

### Adicionado
- **Auditoria analítica de Natal A–F:** relatórios canônicos de inteligência operacional e metas.
- **Demografia de participantes:** contagem reconciliada de crianças, faixas etárias e anomalias de parentesco.
- **Sonda de avatar WebP SSRF-safe:** validação de cabeçalhos HTTP e magic bytes (`RIFF....WEBP`) antes de vincular avatares.
- **Guardrail de escrita:** confirmação obrigatória de agendamento de propostas de Natal (`confirmado_pelo_operador: true`).
