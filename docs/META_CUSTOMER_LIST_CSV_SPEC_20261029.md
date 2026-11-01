# Meta Ads — contrato de CSV manual e auditoria P25 (29/10/2026)

Estado: formatador OFFLINE v3 e validador disponíveis na PR draft #23. O leitor SQL global, ferramenta de exportação MCP, OAuth dedicado, download e implantação LIVE NÃO estão prontos. Nenhum upload para Meta autorizado.

## Requisitos de formato

O operador mostrou a tela de Públicos da Meta, que aceita CSV/TXT, pede pelo menos 100 clientes e um identificador principal. Baixar o modelo oficial nessa tela e validar o mapeamento antes de enviar o arquivo.

Cabeçalho e ordem fixos:

    email,phone,fn,ln,country

Exemplo exclusivamente sintético:

    exemplo@example.com,5548999999999,maria,silva,br

- phone: OBRIGATÓRIO, só dígitos; DDI 55 + DDD + número real (ex.: (48) 99999-9999 -> 5548999999999). Não escrever o sinal + no CSV. Internamente a identidade E.164 permanece +5548999999999 para relacionamentos exatos.
- Aceitar telefone nacional com DDD (10/11 dígitos), DDI55 (12/13), e prefixo explícito internacional 0055. DDD válido do Brasil e assinante celular 9xxxxxxxx ou fixo 2–5xxxxxxx. Não adivinhar nono dígito de celular antigo; não unir pelos últimos oito dígitos.
- DDD55 existe e não pode ser interpretado por engano como DDI: 55999999999 = DDD 55 + nove dígitos; CSV 5555999999999.
- Email: opcional, lowercase e trim, inválido vira vazio. Primeiro nome (fn) e sobrenome (ln): opcionais, separados e normalizados sem acentos/pontuação, em letras romanas minúsculas. Country: br.
- CPF, documento, data de nascimento, endereço, receita, dados de crianças, IDs internos e valor de compra NÃO entram no arquivo.
- REGISTRO SEM TELEFONE VÁLIDO NÃO ENTRA NO CSV, ainda que tenha email válido. Registro sem telefone pode participar de verificação de comprador/opt-out por email, protegendo contatos associados.
- 1 linha por telefone NORMALIZADO (não duplicar). Se o mesmo cliente tiver dois telefones válidos, 2 linhas com celulares diferentes podem representar a mesma pessoa; contagem de pessoas e de linhas são métricas distintas.
- CSV UTF-8 sem BOM, CRLF, vírgula, no mínimo 100 registros válidos para o gate da tela Meta. O transformador limita a 100 mil registros / 20 MB.
- Formato manual NÃO é payload da Marketing API. Para integração futura via API, respeitar normalização + SHA-256 da documentação de público personalizado. Não hashear antes de gerar o arquivo para upload manual na UI.

## Código a executar pelo Antigravity no checkout da PR #23

- src/meta-audience-csv.mjs: normalizePhone retorna +55... para dedup; formatMetaPhone retorna só dígitos; buildMetaAudienceCsv devolve CSV privado e contagens; assertMetaAudienceUploadReady exige 100 linhas.
- src/meta-audience-csv-validator.mjs: validateMetaCustomerListCsv verifica CSV INDEPENDENTEMENTE, sem dados pessoais nos resultados: header, UTF-8, CRLF, 55 + DDD + número, duplicidades de telefone, e-mail, nomes e country br.
- test/meta-audience-csv.test.mjs: testes sintéticos focados; não usar clientes reais.
- scripts/crm-meta-audience-preflight-read.php: consulta somente schema/índices e não expõe PII; não está registrada como ferramenta MCP LIVE.

Comandos:

    node --check src/meta-audience-csv.mjs
    node --check src/meta-audience-csv-validator.mjs
    node --test test/meta-audience-csv.test.mjs
    php -l scripts/crm-meta-audience-preflight-read.php
    php -l scripts/crm-forensic-bridge.php

Para validar arquivo REAL após implementação do adapter, usar em script local privado (não versionar o CSV e não exibir caminhos privados em logs):
- ler apenas process.env.META_PRIVATE_CSV_PATH com fs.readFileSync(path, 'utf8')
- importar validateMetaCustomerListCsv
- imprimir apenas JSON com ready, rows, unique_phones, rows_with_email e sha256
- em caso de falha, imprimir somente código META_CSV_..., sem linha/contato.

## Desempenho e proteção de dados

- union-find com compressão de caminho e união por tamanho agrupa contatos em quase O(N); Map remove repetição de telefone; ordenação O(K log K).
- source_counts.customers / proposals = quantidades de LINHAS fornecidas ao formatador, não necessariamente clientes únicos; se o adapter expandir dois telefones do mesmo cliente em duas linhas, contar ambas e registrar customer_ids únicos em métrica separada de prévia.
- Fonte SQL do Laravel precisa provar snapshot completo e consistente de clientes, propostas Natal 2026, compradores de qualquer produto em 2026, opt-outs e base legal aplicável, sem N+1, usando transação READ ONLY/REPEATABLE READ. Sem prova, NO_GO.
- MCP tools: prévia pode usar crm.read para contagens apenas; exportação de PII requer escopo crm.audience.export concedido efetivamente, confirmação explícita, transporte privado com expiração e autorização de operador verificada no runtime. Tool readOnlyHint e securitySchemes são metadados, não substituem enforcement.
- Não exportar contatos em resposta textual, não criar listagens na Meta via API, não alterar audiência antiga, não executar GitHub Actions.

## Referências para validação

- Meta Marketing API Audience: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences/ (pode exigir login / rate-limit)
- Meta Business Help e modelo oficial baixado da própria UI: https://www.facebook.com/business/help/
- MCP Tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP Authorization: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization

Data de aceitação: 29/10/2026; release atual: FORMATTER_V3_NOT_LIVE, LIVE_EXPORT_NO_GO.
