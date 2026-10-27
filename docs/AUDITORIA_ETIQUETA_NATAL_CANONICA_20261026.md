> **AUDITORIA COMPLEMENTAR 27/10/2026 — LEIA PRIMEIRO.** Os testes da primeira rodada produziram PDF e comprovaram spooler, mas o agente PowerShell ainda impunha 256 KiB por trabalho e podia deixar \`claimed\` sem ACK após erro. Ambos os problemas foram corrigidos na PR #1 do PrintServer: limite 5 MiB com SHA, ACK \`failed\` em erros locais pré-impressão e zero retry. Também há backpressure raster de 32 MiB e reconciliação 409 para job antigo minimal no modo canônico estrito. Na PR #12, a guarda de status e financeiro agora passa \`fresh:true\` para não reutilizar 15s de cache forense, e a prévia de 5–20 pedidos tem no máximo quatro consultas paralelas. **O go-live do fluxo não está autorizado apenas por CI ou pelo status spooled.** A fixture gerada com \`legacy_presets.natal\` não prova a configuração de todos os produtos; QR digital OpenCV não prova leitura física, e não existe ferramenta segura de baixa status 10 pelo MCP. Consulte o [dossiê e roteiro cirúrgico complementar](https://github.com/hypeneural/printserver/blob/feat/windows-label-mcp-broker-20261026/docs/AUDITORIA_FORENSE_E2E_POS_HOMOLOGACAO_20261027.md). \`crm_capacidades\` ainda reportava build \`f6f93b5\` em 27/10 (33 ferramentas), diferente das PRs. Não reiniciar nem reimprimir automaticamente.

# Etiqueta de Natal canônica — auditoria forense e integração sem reconstrução

**Data:** 26/10/2026. **Imagem de referência:** etiqueta 100×40 mm fornecida pelo gestor, com fundo preto/branco, nome, pacote, data, WhatsApp, copy e QR. A imagem contém dados de cliente e NÃO foi commitada nem usada como fixture.

## 1. Evidência no CRM real (fonte de verdade)
A implementação COMPLETA já existe em `hypeneural/evydencia-crm` `main`:
- `app/Services/OrderLabelService.php`: `generate($uuid)` coordena dados→template→GD PNG→resultado. Respeita `OrderLabelConfiguration::isEnabled()`; 100×40 mm, 300 DPI, cerca de 1181×472 px.
- `app/Services/OrderLabelDataResolver.php`: `Order::query()->with(['customer','items.product'])` por UUID, `customer.name` (normalizado e abreviado em nomes longos, mantendo sobrenome e partículas), `customer.whatsapp` (DDD e máscara), produto pelo bundle principal ou primeiro item válido, e `schedule_1` em `d/m/y`.
- `app/Services/OrderLabelTemplateResolver.php`: prioridade **produto ativo > imagem global armazenada > fallback técnico**. Overlay por produto pode ser `custom`, `disabled` ou `inherit` da configuração global. Portanto não existe um único PNG/fundo universal em todos os pedidos.
- `app/Services/OrderLabelRenderer.php`: canvas GD, fundo vindo do Storage (produto/global) ou arquivo local e desenha campos de nome/pacote/data/WhatsApp com fonte Archivo Black; depois overlays first_name/copy/QR. Não duplicar esse pipeline em Node.js.
- `app/Services/OrderLabelVariableResolver.php`: expandir `{id}`, `{order_id}`, `{order_uuid}`, `{customer_first_name}`, `{whatsapp}`, etc. URL QR exige HTTP(S) válido.
- `app/Services/OrderLabelQrCodeRenderer.php`: utiliza **chillerlan/php-qrcode instalado no Laravel**, PNG bruto com `imageBase64=false` da versão 2.0.8, ECC e quietzone configuráveis; cola QR no canvas GD.
- `config/order_label.php`: preset legado `natal` usa fundo `resources/order-label/assets/natal/bkpbackground.jpg` (importado do sistema antigo), `fit_mode=stretch`, URL `http://minhas.fotosdenatal.com/{id}`, `ECC=H`, QR 240 px posicionado em 83%/71%, primeiro nome 83%/42%, copy `Acesse suas fotos`; **essa é a configuração LEGADA**, não garantia de que cada produto usa esses valores hoje.
- No default técnico (sem preset), QR está desativado por padrão e seu URL template usa `https://minhas.fotosdenatal.com/{order_uuid}`. Produto/global podem sobrescrever ambos.
- `app/Http/Controllers/Manager/OrderLabelController.php`: GET autenticado de PNG/print HTML, somente sessão gerente (não usar como endpoint público, não enviar cookies do navegador ao broker).
- `tests/Fixtures/OrderLabel/Natal/etiqueta_1515.png` e docs `order-label-qrcode-overlays-plano-2026-06-17.md`: fixture visual antiga do CRM, 1181×472; background legado e hashes documentados.

**QR real:** o conteúdo exato depende da configuração efetiva (produto/global/preset) e do pedido. A URL HTTP legada deve ser revista operacionalmente para HTTPS, e validada em celular antes de alterar: migrar sem testar pode quebrar as galerias antigas. DENSO WAVE especifica quiet zone de 4 módulos; preset antigo 0 é uma herança visual com risco de leitura, não mudar silenciosamente o QR em produção. Verificar a leitura física do QR impresso em 203 DPI.

## 2. Arquitetura selecionada: composição 100% no Laravel
**Não copiar JPEG, fonte, posições nem QR para o PrintServer.** Em vez disso:
1. MCP `crm_solicitar_impressao_etiqueta` com confirmação explícita e OAuth `print.jobs.write` faz `direct.detail(order_id, resumo)` e exige `waiting_product_retrieve` + `remaining_cents===0`.
2. Se `EVYD_CRM_LABEL_RENDER_ENABLED=1`, `src/crm-label-render.mjs` inicia o script privado `scripts/crm-label-render-bridge.php` por **STDIN**, nunca argv, carregando o **CRM Laravel atual em modo leitura** e chamando diretamente `OrderLabelService->generate($orderUuid)`.
3. PHP devolve somente PNG base64, SHA-256, UUID/ID, fonte do template e dimensões 100×40; Node compara UUID/ID, hash e dimensões antes de passar o PNG ao broker. Não expor PNG nem nome/telefone/QR ao ChatGPT; stdout/stderr do subprocesso são limitados.
4. O PrintServer valida base64/SHA, PNG verdadeiro com CRC por chunk, dimensões/ratio e filtros; `src/crm-label-pdf.mjs` incorpora o raster exato em PDF 100×40 usando XObject RGB e máscara de alpha quando existente, sem recriar nenhum elemento visual.
5. O agente Windows já homologado imprime o PDF pelo SumatraPDF no mesmo perfil físico `LABEL` / `Etiqueta`, sem mudança de driver.
6. Se o renderizador canônico estiver ligado e falhar, **não existe fallback automático para etiqueta simples**. O broker dispõe de `PRINTSERVER_REQUIRE_CRM_ARTWORK=1` para rejeitar clientes antigos que enviem rótulo apenas textual.

No modo anterior, sem flags, o comportamento histórico continua igual; isto é apenas compatibilidade de rollout, NÃO recomendação para continuar imprimindo etiquetas simples no Natal após ativação completa.

## 3. Dados usados e proibições
| Campo impresso | Origem canônica |
|---|---|
| Nome de exibição | `orders.customer_id → customers.name`, abreviador `buildDisplayName` |
| Nome acima do QR | `customer_first_name` no overlay, se ativo |
| Pacote | bundle principal, senão primeiro `orders_items.product` válido |
| Data | `orders.schedule_1` formatado `d/m/y` |
| WhatsApp | `customers.whatsapp` normalizado, separado DDD+número |
| Fundo/ícones | PNG/JPG da configuração produto ou global ou preset |
| QR | URL resolvida pela configuração ativa e `OrderLabelQrCodeRenderer` |

**Não** usar foto de envelope para derivar número de telefone, URL QR, pacote nem nome final; as fotos servem para localizar candidatos. O CRM gera os dados definitivos e o QR.

**Não** usar o endpoint legado de escrita `PUT /api/orders/status`; a baixa via ChatGPT ainda depende do contrato transacional autorizado do CRM. `crm_previa_malotes_retirada` já aceita até 20 IDs, útil para 5/10/15 fotos, mas NÃO altera status. `crm_solicitar_impressao_etiqueta` exige status 10 já gravado e só imprime um pedido por chamada. Essa limitação é intencional: não fingir que lote de fotos equivale a baixa automática.

## 4. Scripts entregues e testes
### MCP (sem alterar CRM)
- `scripts/crm-label-render-bridge.php`: render canônico por UUID na instalação Laravel atual, somente leitura; sem HTTP público. Não suporta pedido inexistente.
- `src/crm-label-render.mjs`: limitação de bytes, timeout, UID/UUID, CRC prefix, SHA-256 e guardas da feature flag.
- `scripts/crm-label-synthetic-fixture.php`: uma etiqueta natalina com dados 100% fictícios, assets/renderer oficiais, saída privada `private/crm-label-natal-synthetic.png`. Nunca lê pedido real.
- `test/crm-label-render.test.mjs`: guardas e divergências.
- `test/live-gateway.test.mjs`: injeção de renderizador sintético no gateway OAuth, guardas e payload apenas enviado após confirmação/financeiro, fail-closed.
### PrintServer
- `src/crm-label-pdf.mjs`: PNG→PDF 100×40 exato, sem dependências NPM externas.
- `src/broker.mjs`: campos opt-in `label_png_base64`, `label_png_sha256`, `label_source=crm_canonical`, etiqueta HTML/PDF antiga segue apenas até rollout; `render_source` reporta o modo de cada job.
- `test/crm-label-pdf.test.mjs`: 8-bit RGB/RGBA, CRC, SHA, ratio e broker estrito.
- `scripts/wrap-crm-label-fixture.mjs`: transforma fixture privada do MCP em `test-output/crm-label-natal-synthetic.pdf` com manifesto hash.
- `windows/Invoke-CrmArtworkPrintTest.ps1`: somente UMA impressão física sintética quando invocado com `-AuthorizeSinglePrint`; verifica manifesto e PDF.

## 5. Sequência cirúrgica para Antigravity — **SEM usar cliente real**
1. Confira HEAD da PR #1 PrintServer e PR #12 MCP e CI no SHA. Não repita suites verdes.
2. Configure `EVYD_CRM_APP_PATH` com o checkout/caminho autorizado do Laravel que tenha `vendor/autoload.php`, `bootstrap/app.php` e `resources/order-label/assets/natal/bkpbackground.jpg`. Sem isso a renderização bloqueia; não permitir fallback silencioso.
3. Execute `php -l scripts/crm-label-render-bridge.php` e `php -l scripts/crm-label-synthetic-fixture.php`. Para fixture: `php scripts/crm-label-synthetic-fixture.php` a partir do checkout MCP, verificando somente saída sintética. Se dependências do Laravel não estiverem no AnnaHelena, execute no ambiente de teste autorizado que tenha o CRM — **não instalar vendor na produção à força**.
4. Com ambos os repositórios lado a lado, no checkout PrintServer: `node scripts/wrap-crm-label-fixture.mjs`. Verifique tamanho PDF, raster, layout, QR (scanner de celular) e `test-output/crm-label-natal-synthetic.manifest.json`.
5. Teste negativo Windows: `powershell -NoProfile -File windows/Invoke-CrmArtworkPrintTest.ps1` → `NOT_EXECUTED`. Com bobina e autorização de teste físico já concedida: **uma única vez** `-AuthorizeSinglePrint`, sem reenvio automático, conferência humana de fundo, nome, QR, contraste, alinhamento e gap. `spooled` não é confirmação física.
6. Só depois planejar rollout **duplo** controlado: broker atualizado primeiro com `PRINTSERVER_REQUIRE_CRM_ARTWORK=0`; gateway atualizado com `EVYD_CRM_LABEL_RENDER_ENABLED=0`; conferir binários/caminhos/rollback. Em janela sem novos jobs e com smoke sintético, ativar render canônico no gateway e então exigir artwork no broker. Monitorar 409/422 e transações incertas. Não alterar o CRM Laravel, Z-API, Nginx nem driver.
7. Para validar um pedido **REAL**, somente com autorização da equipe, identidade e saldo certificados; não usar `999999` (fixture) para gerar etiqueta real nem violar status 10. Confirmar em status 10, autorização do operador, uma intenção e consultar resultado.

## 6. Futuros três modos comerciais
- **Somente etiqueta:** para pedido que já está status 10 e quitado, acionar a impressão canônica (nenhuma baixa).
- **Somente dar baixa:** dependerá de endpoint CRM seguro de status 10 + notificações, com idempotência/financeiro, e não chama PrintServer.
- **Baixa + etiqueta:** só depois de a baixa confirmar status 10 no CRM e de o operador aprovar as ações; então gerar PNG atual e enfileirar, mantendo falhas independentes.
- Para 5/10/15 envelopes, identificação e prévia em lote, confirmações por ID e estado financeiro; nunca deduzir ID do CRM pelo código externo de laboratório.

## Referências
- CRM: `docs/order-label-qrcode-overlays-plano-2026-06-17.md`, `docs/order-label-personalizada-analise-2026-06-03.md`, `docs/active/malotes/implementation-301.md`.
- OpenAI Plugin guidelines: https://developers.openai.com/plugins/plugin-guidelines
- DENSO WAVE QR quiet zone: https://www.qrcode.com/en/howto/code.html
- SumatraPDF: https://www.sumatrapdfreader.org/docs/Command-line-arguments
- Laravel 10 Filesystem: https://laravel.com/docs/10.x/filesystem
