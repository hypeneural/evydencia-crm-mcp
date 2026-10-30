# P25.9 — PÚBLICO META NATAL 2026 | MANUAL OPERACIONAL CANÔNICO

**Data de revisão:** 30/10/2026 — horário de Brasília. **Repositório:** `hypeneural/evydencia-crm-mcp`. **PR:** #23 DRAFT (`feat/meta-audience-crm-export-foundation-20261029`) baseada em `base/reprint-live-6abe039-20261029`.

**Esta é a página de entrada para operar e homologar a funcionalidade.** Os arquivos P25.1–P25.8 e os recibos históricos descrevem ESTADOS ANTERIORES e não devem ser usados para decidir o estado do release atual.

## 1. Situação comprovada e escopo

- Último release MCP LIVE confirmado pelo conector `crm_capacidades` na auditoria independente: **2f7755d**, versão 0.12.0, **41 ferramentas ativas**, público Meta habilitado.
- GitHub Actions confirmou **374/374 PASS em Linux** para o commit **240a9e3** (run `41058339843`). O Antigravity reportou **374/374 PASS em Windows** para o commit de código produtivo 2f7755d.
- **P25.9 é uma melhoria proposta na PR, NÃO está no LIVE até novo deploy autorizado.** Seu novo HEAD exige novo `bash scripts/antigravity/validate-meta-audience-p25-local.sh` e a execução do GitHub Actions. NÃO reutilize recibos do P25.8.
- Primeiro CSV de clientes foi gerado, transferido e conferido em canário P25.5/P25.6: **2.331 telefones** pertencentes a **2.330 grupos de pessoas elegíveis**, com 2.250 e-mails, SHA-256 reportado e auditado pelo Antigravity. Isso **não é** a quantidade de pessoas correspondidas no Facebook/Instagram.
- Upload para o Gerenciador de Públicos da Meta, tamanho de correspondência e vinculação a conjunto de anúncios: **NÃO comprovados**. Nenhuma campanha ou orçamento deve ser alterado por este trabalho.
- GitHub PR #23 segue DRAFT. **NÃO mesclar diretamente em main**: branch contém grande histórico de releases de outros subsistemas. A base da PR é operacional e exige release train de reconciliação separado.

## 2. Objetivo de negócio — exato

Exportar uma **lista de clientes** de uso manual na Meta com dois grupos de origem, reunidos e deduplicados:

1. **Todos os cadastros `customers` do CRM**, inclusive sem pedidos anteriores, com telefone brasileiro válido, que não pertençam a pessoa/grupo com compra válida em qualquer produto em 2026.
2. **Destinatários qualificados de proposta Natal 2026** em `proposal_dispatches`, mesmo sem `customer_id`, conforme a elegibilidade vigente do projeto. Não confundir toda conversa de WhatsApp, um item só agendado ou todos os leads históricos com um orçamento comprovadamente solicitado.

Excluir: compradores 2026 (inclusive por identidade relacionada), opt-outs e supressões de marketing abrangidos pela política operacional, identidades ambíguas e telefones inválidos/ausentes. O atendimento deve continuar sem depender de um formulário administrativo novo para cada atualização.

**Nunca inferir que 2.331 linhas são 2.331 pessoas**: quando uma pessoa tem dois telefones reconhecidos, podem existir duas linhas e apenas um grupo.

## 3. Arquitetura existente — NÃO reimplementar

Fluxo público sem dados pessoais na resposta do chat:

```text
ChatGPT / Antigravity / gestor autenticado
    |
    | OAuth crm.read                  OAuth crm.read + crm.audience.export
    v
crm_meta_publico_natal_previa ----> crm_meta_publico_natal_exportar
    |                                      |
    | snapshot_id, SHA256 e contagens      | confirmacao + snapshot_id
    | (sem contatos)                       | comparação FRESH do CRM
    v                                      v
src/live-gateway.mjs             src/legacy-api-read.mjs
    |                                      |
    +---------- scripts/crm-forensic-bridge.php
                         |
                         v
             scripts/crm-meta-audience-read.php
                         |
                  Laravel/MySQL READ ONLY
                         |
                         v
              src/meta-audience-csv.mjs
                 /             \
     src/meta-audience-       src/meta-audience-
       snapshot.mjs         csv-validator.mjs
                               |
                 src/meta-audience-private-write.mjs
                               |
                 CSV privado 0600 fora do checkout
                               |
                        SFTP autenticado
                               |
                    CSV local + validação SHA
                               |
                     upload MANUAL na Meta
```

- `scripts/crm-meta-audience-preflight-read.php` confere tabelas/colunas/índices somente de leitura, sem DDL.
- `scripts/crm-meta-audience-purchase-classifier.php` mantém regras comerciais, estornos/chargeback e quarentena.
- `src/meta-audience-private-files.mjs` + `src/meta-audience-janitor.mjs`: TTL 1h; varredura ao boot e a cada 15 minutos enquanto o gateway está ativo; não depende de cron externo. Exclui somente arquivos da feature e não atravessa symlinks para checkout.
- `src/oauth-gateway.mjs`: exportação exigente de OAuth dedicado, allowlist de operador e confirmação explícita; `crm.read` sozinho não autoriza exportação.
- `src/meta-audience-csv-audit.mjs`: verificação independente SHA/quantidades do arquivo baixado.

## 4. Matriz de relacionamentos MySQL que exige atenção

| Tabela | Vínculo e finalidade |
| --- | --- |
| `customers` | Fonte primária de identidade. `id`, telefone/WhatsApp normalizados, e-mail, nome |
| `orders` | `orders.customer_id` => `customers.id`; compras de qualquer produto |
| `orders_status` | `order_id` => `orders.id`; último status pelo maior ID |
| `orders_installments` | `order_id` => `orders.id`; pagamentos em 2026, inclusive pedido criado antes |
| `orders_items` / `products` | Verificação comercial contextual; NÃO restringir a Natal para excluir compradores 2026 |
| `proposal_flows` / `proposal_dispatches` | Propostas Natal 2026 elegíveis e identidade por destinatário/cliente vinculado |
| `campaign_scheduleds` / `campaign_scheduled_contacts` | Rastro de agendamento, não prova de entregue/lido nem de pedido espontâneo |
| `leads` | Ligações de proposta/campanha; não importar indiscriminadamente leads sem despacho elegível |
| `communication_suppressions` | Excluir grupos abrangidos por opt-out de marketing WhatsApp/ALL, escopo Natal/global |

O preflight que confirma tabela/coluna/índice **não comprova sozinho** as regras de pagamento, opt-out nem intenção do lead. Os testes de classificação e canário complementam esse diagnóstico. Não criar índices/migrations durante a validação do MCP.

## 5. Correções P25.9 na PR — execução local APENAS

### P25.9.1 — Preview sem CSV pessoal em cache

`src/meta-audience-snapshot.mjs` converte o resultado do formatador em metadados imutáveis (`snapshot_id`, `as_of`, `purchase_rule`, `sha256` e contadores). Nenhum e-mail, nome, telefone ou CSV é retido no `audienceSnapshots` aguardando confirmação. A prévia continua exibindo agregados e usa o mesmo `snapshot_id`.

### P25.9.2 — Revalidação integral dos contadores

A exportação faz leitura nova do CRM e exige não apenas o SHA-256 do CSV igual, mas também **as contagens do relatório e os totais de origem** iguais aos da prévia. Ex.: comprador já excluído adquire opt-out, mudando `identity_groups_with_suppression` mas não a lista final. Nesse caso **pedir nova prévia** para o gestor aprovar os números atualizados. Preserva confirmação humana, sem atualizar silenciosamente estatísticas diferentes.

### P25.9.3 — Gravação privada fail-closed

`src/meta-audience-private-write.mjs`: abertura exclusiva `wx` com 0600, escrita, sincronização em disco e encerramento. Erro durante escrita/sync => fechar e apagar arquivo criado incompleto, emitindo somente código de erro sem contato/caminho. Se o arquivo já existia (`EEXIST`), **NUNCA apagar o arquivo preexistente**. Nenhuma nova API, banco, serviço ou transporte público.

### P25.9.4 — Metadados MCP corretos

A ferramenta que cria arquivo privado recebe anotação MCP conservadora (não read-only, não tratar como idempotente para tentativas automáticas, não executa envio Meta). As anotações são meros hints; o controle real continua em OAuth, confirmação e checagem de escopo. Verificar o comportamento do SDK na suíte nativa.

## 6. Como o gestor usa HOJE (sem etapas de deploy)

1. Conexão MCP com OAuth efetivamente autorizado e finalidade previamente configurada.
2. Perguntar: **“Faça a prévia do público Meta Natal 2026, sem contatos individuais.”**
3. Conferir registros de origem, compradores 2026, opt-outs, inválidos, elegíveis e `snapshot_id`.
4. Pedir explicitamente: **“Exporte o snapshot aprovado para CSV privado.”**
5. O operador autorizado retira o CSV por SFTP do diretório privado do serviço. **Não existe download direto no ChatGPT Web homologado.** O `arquivo_id` não é um link.
6. Validar arquivo offline e importar **manualmente** no Meta Ads Manager > Públicos > Criar público personalizado > Lista de clientes. Nome sugerido: `N26 | RMKT | CRM+PROPOSTAS | NAO COMPROU`.
7. Em futuras atualizações usar opção de **substituição/remoção** de contatos antigos na audiência, quando disponível no Gerenciador Meta. **Adicionar apenas** novos contatos pode manter compradores que saíram do novo CSV.

CSV manual: `email,phone,fn,ln,country`; telefone brasileiro `55` + DDD + assinante, só dígitos; e-mail minúsculo, `country=br`. Nenhum CPF, receita, dados de crianças, histórico de pedidos, comentários ou IDs internos. O upload manual NÃO é o payload com hashes da Marketing API. O número mínimo de 100 identidades é um GATE DO SISTEMA, não garantia de match Meta.

## 7. Um único ciclo de QA LOCAL do novo HEAD (sem VPS)

```bash
git fetch origin --prune
git switch feat/meta-audience-crm-export-foundation-20261029
git pull --ff-only
git status --short
git rev-parse HEAD
bash scripts/antigravity/validate-meta-audience-p25-local.sh
```

Cobertura obrigatória:
- Node --check, PHP lint/classificador e npm run check/npm test;
- novas suítes `test/meta-audience-snapshot.test.mjs`, `test/meta-audience-private-write.test.mjs` e integração MCP;
- CSV com mesmo SHA e contagens DIFERENTES => `crm_meta_audience_snapshot_changed_review_again`;
- nenhuma informação pessoal armazenada no cache de prévia;
- queda de disco/arquivo EEXIST nunca deixa CSV parcial nem apaga arquivo antigo;
- conservação das 41 ferramentas e compatibilidade de OAuth;
- sem login de Meta, sem escrever banco, sem SFTP ou consulta real à VPS.

Se falhar, corrigir somente o P0 demonstrado, repetir teste focal e uma suíte completa. Não criar testes infinitos, novos serviços ou branches paralelas.

## 8. Release, reversão e Git (FORA do escopo do Antigravity agora)

- P25.9 NÃO deve ser implantado automaticamente. Preparar um diff/release e rollback **restrito ao MCP** para eventual autorização.
- Nenhum merge na `main` como parte deste ciclo. A PR #23 aponta para base operacional e tem histórico acumulado de outros serviços; requer release train separado.
- Não alterar variáveis secretas, CRM Laravel, Z-API, PrintServer, Gameplay, GitHub Actions, base MySQL, campanhas ou anúncios Meta.
- Registrar na PR somente SHA testado, número de testes, versões, falhas, tempo, ausência de PII, decisões e pendências.
- Não publicar CSV, arquivo real, número de cliente, caminho privado, token ou telefone em comentário, issue ou log.

## 9. Referências oficiais

- [MCP tools e controle de acesso](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) — `readOnlyHint`, `idempotentHint` são anotações, não controle de acesso.
- [Meta Marketing API — Custom Audiences](https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences/) — fluxo API distinto do CSV manual.
- [Meta Business Help](https://www.facebook.com/business/help/) — conferir campos aceitos e política de atualização na UI autenticada.
- [Termos Meta Customer Audience](https://www.facebook.com/legal/terms/customaudience) — uso comercial condicionado à autorização e exclusões aplicáveis.

**Limitação de consulta:** Developers/Business Help podem exigir login ou aplicar rate limit; o template realmente mostrado no Gerenciador de Públicos da conta do gestor prevalece para mapear colunas, sem alterar a regra de não enviar dados pessoais a GitHub/ChatGPT.

**Status deste documento:** `P25_8_LIVE_CONFIRMED`, `P25_9_CODE_COMMITTED`, `P25_9_NATIVE_QA_PENDING`, `META_UPLOAD_UNVERIFIED`, `MERGE_MAIN_NO_GO`.
