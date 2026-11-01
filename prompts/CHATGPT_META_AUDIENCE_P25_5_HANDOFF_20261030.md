# PROMPT DE HANDOFF — P25.5 PARA AUDITORIA CHATGPT

> **Como usar:** Copie integralmente o texto abaixo e cole no chat com o ChatGPT para a homologação final da etapa P25.5.

---

```markdown
# AUDITORIA FORENSE E RECIBO DE IMPLANTAÇÃO — P25.5 META AUDIENCE CSV

Olá ChatGPT. O Antigravity concluiu a finalização cirúrgica da PR #23, a validação de contrato de teste, a implantação no MCP LIVE da VPS e a realização com sucesso de um canário real de exportação de público de clientes para a Meta.

## 1. Identificação do Release
- **Repositório:** `hypeneural/evydencia-crm-mcp`
- **Branch:** `feat/meta-audience-crm-export-foundation-20261029`
- **PR:** #23 — mantida estritamente em **DRAFT**
- **HEAD Anterior da PR:** `67a4aee`
- **HEAD Implantado na VPS LIVE:** `3968dbcd87de9ae5f67bc1a1e6117d2678c50868`
- **Host de Produção:** VPS `185.241.151.207` (`evydencia-prod`)
- **Serviço Systemd:** `evydencia-crm-mcp-live.service` (ativo e saudável)
- **Backup Pré-Deploy:** `/opt/evydencia-mcp/app.backup-20261030_033520Z-6abe039`

## 2. Ajustes Aplicados no HEAD
1. **Contrato de Teste PHP (`52a2038`):** `test/meta-audience-php-contract.test.mjs` corrigido para corresponder à checagem server-side de `EVYD_META_AUDIENCE_LGPD_APPROVED` e `EVYD_META_AUDIENCE_LGPD_POLICY_REF`, preservando o código aprovador do servidor sem burocracias a cada exportação.
2. **Compatibilidade PDO Linux (`3968dbc`):** `scripts/crm-meta-audience-preflight-read.php` ajustado para normalizar o casing de colunas de `information_schema.statistics` (`array_change_key_case`), garantindo compatibilidade universal com PDO MySQL em distribuições Linux.

## 3. Validação Automatizada (Gate 0)
- `node --check` em 8 módulos: **PASS**
- `node --test` nos testes focados de audiência: **PASS** (48/48 testes, 1.20s)
- `php -l` em 5 scripts: **PASS** (0 erros sintáticos)
- Classificador Comercial PHP Puro: **PASS** (13/13 cenários)
- `npm run check` (52 arquivos): **PASS**
- `npm test` completo: **PASS** (**356/356 testes**, 0 falhas, 10.25s)

## 4. Diagnóstico Read-Only no MySQL Real (Gate 1)
Executado via `scripts/crm-forensic-bridge.php` com `action: meta.audience.schema.preflight` em 214 ms:
- Todas as 12 tabelas e colunas necessárias existem e estão íntegras (`all_required_tables_and_columns_exist: true`).
- Zero mutações, zero locks, transação 100% `READ ONLY`.

## 5. Canário de Exportação Controlada (Gate 5)
Invocada a ferramenta `crm_meta_publico_natal_exportar` vinculada ao snapshot aprovado `snapshot-20261030035118-c699b0d1`:
- **População Bruta Analisada:** 3.010 registros (2.911 clientes históricos + 99 propostas Natal 2026)
- **Compradores de 2026 Excluídos:** 219 clientes (critério `ANY_VALID_PURCHASE_2026` com `MAX(id)`)
- **Quarentena de Identidades Ambíguas:** 59 registros (51 colisões de customer_id + 8 incertos)
- **Registros sem Telefone Válido Excluídos:** 324 registros
- **Deduplicação de Telefones:** 16 registros colapsados
- **Linhas Líquidas Elegíveis:** **2.331 pessoas distintas** (mínimo Meta de 100 superado com 2.330 pessoas únicas)
- **SHA-256 Oficial:** `449df83ded42bfcbc29ef69a8a6c4ba9f1cbb2e8c4d4c8bc69960de290fdccfa`
- **Arquivo Privado Salvo:** `/var/lib/evydencia-mcp/meta-audience/meta-audience-natal2026-74e539d9-4fe5-4b0e-b627-bb43955efade.csv` (modo `0600`, expiração 1h)

## 6. Transferência e Validação Estrutural no Host do Gestor
O arquivo foi transferido via SFTP autenticado para `C:\Users\Anna Helena\Downloads\meta_audience_natal_2026_export.csv`:
- Hash SHA-256 verificado: `449df83ded42bfcbc29ef69a8a6c4ba9f1cbb2e8c4d4c8bc69960de290fdccfa` (100% correspondente)
- Total de linhas: 2.332 (1 cabeçalho + 2.331 clientes)
- Cabeçalho exato Meta: `email,phone,fn,ln,country`
- Telefones no formato: `55` + DDD + número (0 duplicidades, 0 inválidos)
- Cobertura de e-mail: 2.250 registros com e-mail (96,5%)
- Injeção de fórmulas: 0

## 7. Estado do Sistema e Serviços Coexistentes
- `evydencia-crm-mcp-live.service`: Ativo, rodando commit `3968dbc`.
- `PrintServer`: 100% preservado e operacional.
- `Z-API WhatsApp`: 100% preservado e operacional.
- `Gameplay / Galerias`: 100% preservado e operacional.
- `CRM Laravel`: Zero alterações de migrations, código ou tabelas.
- `Janitor Privado`: Validado em modo dry-run (`purge-meta-audience-private.mjs`).

## 8. Parecer
- **Homologação Local e de Produção:** `LIVE_CANARY_PASS`
- **Arquivo Exportado:** Pronto para upload manual na conta da Meta pelo gestor.
- **PR #23:** Mantida em **DRAFT**.
```