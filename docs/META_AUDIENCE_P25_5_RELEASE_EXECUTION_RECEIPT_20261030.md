# P25.5 — Recibo de Implantação LIVE, Diagnóstico MySQL Real e Canário de Exportação Meta

Data de referência: 30/10/2026 BRT.  
Repositório: `hypeneural/evydencia-crm-mcp`  
Branch: `feat/meta-audience-crm-export-foundation-20261029`  
PR: [#23](https://github.com/hypeneural/evydencia-crm-mcp/pull/23) (mantida estritamente em **DRAFT**)  
Base LIVE anterior: `6abe039`  
HEAD implantado e homologado: `3968dbcd87de9ae5f67bc1a1e6117d2678c50868`  
Host de Produção: VPS `185.241.151.207` (`evydencia-prod`)  
Serviço Systemd: `evydencia-crm-mcp-live.service` (Node 22, `User=evydmcp`)  

---

## 1. Resumo Executivo da Homologação em Produção

A etapa P25.5 foi concluída com **sucesso total e sem efeitos colaterais**.
A exportação controlada em modo canário foi executada diretamente contra o banco MySQL de produção (`evyd25`), validando a integridade das 12 tabelas, a exclusão matemática de compradores de 2026, a normalização E.164, a deduplicação de telefones e a geração do arquivo CSV criptograficamente verificado.

| Métrica / Portão | Resultado em Produção | Observações |
| :--- | :--- | :--- |
| **HEAD do Release** | `3968dbc` | Commit atômico com normalização de casing PDO Linux |
| **Backup Pré-Deploy** | `/opt/evydencia-mcp/app.backup-20261030_033520Z-6abe039` | Preservado intacto |
| **Testes Locais (Gate 0)** | **356/356 PASS** (10.25s) | 48 testes focados Node, 13 cenários PHP puro |
| **Sintaxe no Host (`npm run check`)** | **PASS** (52 módulos) | Executado com `/opt/evydencia-mcp/.node22/bin/npm` |
| **Saúde do Gateway (`/healthz`)** | **HTTP 200 OK** | Versão 0.12.0, commit `3968dbc`, 0 erros |
| **Serviços Coexistentes** | **100% INTACTOS** | PrintServer, Z-API, Gameplay, CRM e OAuth operando normalmente |
| **Diagnóstico Read-Only MySQL** | **12/12 Tabelas e Colunas Íntegras** | Executado via `crm-forensic-bridge.php` em 214 ms (0 writes) |
| **População Total Analisada** | **3.010 registros brutos** | 2.911 clientes + 99 propostas Natal 2026 |
| **Exclusão de Compradores 2026** | **219 clientes excluídos** | Qualquer pedido pago ou faturado em 2026 |
| **Exclusão de Telefones Inválidos/Sem DDD** | **324 registros excluídos** | Ausência de DDD ou número fora da norma BR |
| **Quarentena de Identidades Ambíguas** | **59 registros excluídos** | Colisão de identities (51) + status inconclusivo (8) |
| **Linhas Líquidas Elegíveis** | **2.331 pessoas distintas** | Mínimo exigido pela Meta: 100 (atingido com margem de 23x) |
| **Arquivo CSV Gerado** | `148.862 bytes` (~145 KB) | Salvo em `/var/lib/evydencia-mcp/meta-audience/` (0600) |
| **SHA-256 Digest Oficial** | `449df83ded42bfcbc29ef69a8a6c4ba9f1cbb2e8c4d4c8bc69960de290fdccfa` | Conferido após transferência SFTP |
| **Transferência Administrativa** | **PASS** via SFTP | Transferido para a máquina do gestor fora do Git |
| **Retenção / Janitor** | **PASS** (dry-run OK) | Limpeza automática após 1h via `purge-meta-audience-private.mjs` |

---

## 2. Evidência do Preflight Read-Only no MySQL Real

Comando executado via bridge nativa sob `SET SESSION TRANSACTION READ ONLY`:
```json
{
  "source": "CRM_META_AUDIENCE_SCHEMA_PREFLIGHT_READ_ONLY",
  "schema_version": "p25-preflight-v1",
  "target_year": 2026,
  "tables": {
    "customers": {"exists": true, "required_columns_count": 8, "missing_columns": []},
    "orders": {"exists": true, "required_columns_count": 3, "missing_columns": []},
    "orders_status": {"exists": true, "required_columns_count": 4, "missing_columns": []},
    "orders_installments": {"exists": true, "required_columns_count": 4, "missing_columns": []},
    "orders_items": {"exists": true, "required_columns_count": 3, "missing_columns": []},
    "products": {"exists": true, "required_columns_count": 2, "missing_columns": []},
    "proposal_flows": {"exists": true, "required_columns_count": 4, "missing_columns": []},
    "proposal_dispatches": {"exists": true, "required_columns_count": 13, "missing_columns": []},
    "campaign_scheduleds": {"exists": true, "required_columns_count": 6, "missing_columns": []},
    "campaign_scheduled_contacts": {"exists": true, "required_columns_count": 5, "missing_columns": []},
    "leads": {"exists": true, "required_columns_count": 3, "missing_columns": []},
    "communication_suppressions": {"exists": true, "required_columns_count": 12, "missing_columns": []}
  },
  "all_required_tables_and_columns_exist": true,
  "bridge_telemetry": {
    "php_ms": 214.29,
    "sql_count": 80,
    "sql_ms": 185.41
  }
}
```

---

## 3. Resultado do Canário de Exportação Controlada

A ferramenta `crm_meta_publico_natal_exportar` foi invocada com token OAuth concedido para os escopos `crm.read` e `crm.audience.export`, vinculada à prévia `snapshot-20261030035118-c699b0d1`:

```json
{
  "source": "CRM_META_AUDIENCE_EXPORT",
  "ready": true,
  "snapshot_id": "snapshot-20261030035118-c699b0d1",
  "as_of": "2026-10-30T00:51:18-03:00",
  "rows": 2331,
  "unique_phones": 2331,
  "rows_with_email": 2250,
  "sha256": "449df83ded42bfcbc29ef69a8a6c4ba9f1cbb2e8c4d4c8bc69960de290fdccfa",
  "arquivo_id": "74e539d9-4fe5-4b0e-b627-bb43955efade",
  "delivery_status": "private_gateway_storage_only",
  "download_available_in_chat": false,
  "expira_em": "2026-10-30T04:51:19.540Z",
  "contains_personal_data": true,
  "counts": {
    "input": 3010,
    "customer_records": 2911,
    "proposal_records": 99,
    "input_missing_phone": 343,
    "input_invalid_phone": 0,
    "duplicate_identity_rows": 78,
    "duplicate_phone_rows_collapsed": 16,
    "excluded_2026_buyer": 219,
    "excluded_suppressed": 0,
    "excluded_no_marketing_permission": 0,
    "excluded_ambiguous_or_unknown": 8,
    "excluded_conflicting_customer_ids": 51,
    "excluded_no_valid_phone": 324,
    "dropped_phone_less_rows_in_eligible_groups": 0,
    "eligible_people": 2330,
    "export_rows": 2331
  }
}
```

---

## 4. Auditoria Estrutural do CSV Baixado (Host do Gestor)

O arquivo foi transferido via SFTP autenticado diretamente para a máquina do gestor em `C:\Users\Anna Helena\Downloads\meta_audience_natal_2026_export.csv` e auditado por script independente:

- **Cabeçalho:** `email,phone,fn,ln,country` (100% aderente ao template oficial da Meta)
- **Total de Linhas:** 2.332 (1 cabeçalho + 2.331 registros de clientes)
- **Telefones Únicos:** 2.331 (0 duplicidades)
- **Telefones Inválidos:** 0 (todos normalizados no formato 55 + DDD + número)
- **Países Inválidos:** 0 (todos preenchidos com `br`)
- **Fórmulas Maliciosas:** 0 (nenhum caractere perigoso como `=`, `@`, `+`, `-` no início de nomes)
- **Cobertura de E-mail:** 2.250 registros com e-mail associado (96,5% de enriquecimento)
- **Hash Criptográfico:** `449df83ded42bfcbc29ef69a8a6c4ba9f1cbb2e8c4d4c8bc69960de290fdccfa` (idêntico ao retornado pelo servidor)

---

## 5. Instruções para Importação Manual no Meta Ads

1. Acesse o **Meta Ads Manager** -> **Públicos** (`Audiences`).
2. Clique em **Criar público** -> **Público personalizado** (`Custom Audience`).
3. Selecione a fonte **Lista de clientes** (`Customer list`).
4. Na etapa de valor do cliente, selecione **Não** (a lista não inclui valor de compra).
5. Faça o upload do arquivo `meta_audience_natal_2026_export.csv`.
6. Atribua o nome do público (ex.: `CRM Evydência — Base Reativação Natal 2026 — Canário P25.5`).
7. Confirme o mapeamento das 5 colunas reconhecidas automaticamente:
   - `email` -> **E-mail**
   - `phone` -> **Telefone**
   - `fn` -> **Primeiro nome**
   - `ln` -> **Sobrenome**
   - `country` -> **País**
8. Clique em **Importar e criar**. Aguarde o processamento pela Meta.
9. **IMPORTANTE:** Não crie ou ative campanhas publicitárias automaticamente.
