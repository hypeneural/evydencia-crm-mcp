# P25.8 — Parecer forense final após homologação P25.7 LIVE

**Data:** 2026-10-30 BRT. **PR:** #23, DRAFT. **Branch:**
`feat/meta-audience-crm-export-foundation-20261029`.
**Não foi realizada nova exportação de contatos, deploy, merge, alteração de
banco de dados, campanhas ou upload para Meta nesta auditoria.**

## 1. Estado independentemente verificado

A conexão `Evydencia CRM Live`, ferramenta `crm_capacidades` em modo de
**leitura**, retornou:
- build LIVE: `877d564`;
- versão 0.12.0;
- `tools_active_count=41`;
- `meta_audience_enabled=true`;
- escopos OAuth desta sessão NÃO incluem `crm.audience.export`.

GitHub PR #23 estava no HEAD `877d564127e974ac2dbac2bf75ab5f028476e3ea`,
base `base/reprint-live-6abe039-20261029`, DRAFT, mergeable contra
essa base. A alteração final `877d564` foi auditada: descrição textual
da prévia passou a informar `supressoes_exclusivas`,
`optouts_marketing_total` e `sobreposicao_compra_e_optout`,
com teste de contrato MCP.

O recibo do Antigravity #6515106730 declara **368/368 testes Node**,
13/13 classificadores PHP, checksum SHA-256 do CSV baixado,
status dos serviços vizinhos e deploy do HEAD P25.7.
Essas são evidências **reportadas pelo executor**; não houve acesso
aos logs systemd/journal pelo ChatGPT nesta sessão. A presença do build
LIVE confirma publicação do código, não substitui logs detalhados da VPS.

## 2. Parecer sobre merge

Comparação GitHub contra main antes dos novos hotfixes:
- base `main` em `f34680f9`;
- PR `877d564` **à frente por centenas de commits** de múltiplos
  subsistemas (não apenas público Meta);
- mergeable=true diz respeito à BASE operacional da PR, não a
  conformidade com `main`.

**MERGE_MAIN_NO_GO.** Manter PR #23 em DRAFT. Preparar em outro
procedimento um release train de reconciliação da main, analisando
diffs de todos os módulos, testes e disponibilidade, sem força de
push nem alterar retroativamente releases já funcionando.

## 3. Defeito de retenção identificado e corrigido no código P25.8

O janitor anterior era chamado apenas quando havia outra exportação e
por timeout **em memória** de uma hora no mesmo processo. Caso o processo
reiniciasse, esse timeout desaparecia; sem timer externo o arquivo
privado poderia permanecer além do TTL até uma nova exportação.

Correção implementada no código P25.8 **ainda não implantado**:
- `src/meta-audience-janitor.mjs`: varredura no boot e a cada 15 min,
  somente quando export de público está habilitado e diretório privado
  configurado; apenas arquivos com prefixo/UUID da própria feature.
- `src/live-gateway.mjs`: cria UM janitor por processo, cancela
  timer no close e sinaliza prontidão sem PII em `/healthz`
  (`meta_audience_retention_janitor_enabled`).
- `src/meta-audience-private-files.mjs`: limpeza idempotente para
  evitar que janitor periódico e purge pré-export concorram no mesmo
  arquivo: `ENOENT` após exclusão por outro sweep não aborta o fluxo.
- `test/meta-audience-janitor.test.mjs`: boot, sem overlap, erro
  redigido, stop idempotente e contrato do gateway.
- `test/meta-audience-private-files.test.mjs`: concorrência de limpezas.
- Script `validate-meta-audience-p25-local.sh` atualizado para incluir
  novos módulos e testes.

**Impacto:** não requer cronjob, serviço systemd adicional, alterações
de MySQL, flags novas, nem tarefas do operador. A retenção permanece
baseada no mtime do arquivo: uma varredura a cada 15 min pode removê-lo
**até aproximadamente 15 min após completar 1h**, enquanto gateway
estiver ativo. Reinício dispara nova varredura. Não prometer eliminação
exatamente no segundo de 1h.

## 4. Testes e honestidade do gate

- Conclusão P25.7 Antigravity: 368/368 PASS no HEAD 877d564.
- P25.8 ChatGPT: **13/13 verificações sintéticas V8** de scheduler,
  concorrência, health e código, sem runtime Node/PHP real.
- **Obrigatório para P25.8:** Antigravity executar validação nativa
  sobre o NOVO HEAD, registrar total/versões e conferir o comportamento
  do janitor com arquivos 100% sintéticos em diretório 0700 temporário.
- Não reexportar contatos nem solicitar novos clientes de produção para
  homologar retenção.

## 5. Upload Meta

Arquivo P25.5 anterior: 2.331 linhas/telefones distintos,
2.330 grupos de identidade elegíveis e 2.250 linhas com e-mail,
SHA-256 documentado no recibo. O arquivo foi relatado como conferido
por SFTP; **Meta ainda não confirmou importação, taxa de match ou
tamanho de público.** Não afirmar que 2.330 contas foram encontradas.

No upload manual pelo gestor, confirmar mapeamento
`email,phone,fn,ln,country`. Na atualização, remover contatos
obsoletos (como novos compradores) via operação suportada na Meta,
em vez de apenas adicionar novos membros.

A documentação oficial de systemd timers permite OnCalendar e
Persistent, mas **não é necessário criar outra unit nesta melhoria**:
a solução escolhida é uma manutenção interna do gateway, mantendo
invariáveis os demais processos da VPS.

## 6. Estados

- `P25_7_LIVE_RELEASE_CONFIRMED`
- `P25_7_LOCAL_TEST_RECEIPT_368_PASS`
- `P25_8_CODE_PREPARED`
- `P25_8_NATIVE_TESTS_PENDING`
- `P25_8_LIVE_DEPLOY_NOT_DONE`
- `MERGE_MAIN_NO_GO`
- `META_UPLOAD_NOT_VERIFIED`

Recomenda-se homologar e publicar o hotfix P25.8 no MCP isoladamente,
sem vincular essa pequena correção ao merge da main ou ao upload Meta.

## 7. Defesa adicional do janitor antes do próximo QA

Como a nova varredura inicia antes de qualquer exportação, o método de
limpeza passou a validar o diretório **de maneira independente** do
gateway, usando `realpath` + `relative` para garantir que o diretório
privado não esteja dentro do checkout Git nem através de symlink
intermediário. A mesma regra se aplica ao janitor CLI.

Regressão adicional incluída em `test/meta-audience-private-files.test.mjs`:
arquivo sintético expirado dentro de checkout ou acessado por alias
simbólico **não** é apagado; diretórios externos restritos continuam
permitidos. Sem acesso a dados reais.

A varredura ao iniciar e a cada 15 minutos continua protegida por
`cfg.audienceExportEnabled` e `cfg.audiencePrivateCsvDir`.
