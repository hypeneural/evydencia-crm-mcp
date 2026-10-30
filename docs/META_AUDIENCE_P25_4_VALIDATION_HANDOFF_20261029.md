# P25.4 — Recibo de Homologação Final e Handoff de Release para ChatGPT

Data de referência: 29/10/2026.  
Repositório: `hypeneural/evydencia-crm-mcp`  
Branch: `feat/meta-audience-crm-export-foundation-20261029`  
PR: [#23](https://github.com/hypeneural/evydencia-crm-mcp/pull/23) (mantida estritamente em **DRAFT**)  
Base LIVE: `6abe03992549cee83732ea538e728377a3c989fe`  
HEAD testado e aprovado: [`f68e20c7684f2b5cf84e4bab4c6cf488f5a5f2d4`](https://github.com/hypeneural/evydencia-crm-mcp/commit/f68e20c7684f2b5cf84e4bab4c6cf488f5a5f2d4)  
Ambiente de Execução: Node `v24.22.1`, PHP `8.3.36 (cli) (ZTS Visual C++ 2019 x64)`

---

## 1. Resumo Executivo da Homologação (Gate 0)

A suíte completa foi executada de forma nativa e isolada via:
```bash
bash scripts/antigravity/validate-meta-audience-p25-local.sh
```

**Métricas consolidadas do novo HEAD:**
- **Checagem de Sintaxe JS (`node --check`):** **PASS** (8 módulos validados: audiência, gateway, OAuth, leitor, preflight e janitor).
- **Suíte Focada Meta Audience (`node --test`):** **48/48 PASS** (0 falhas, duração ~1.20s):
  - `test/meta-audience-csv.test.mjs` (20/20 PASS)
  - `test/meta-audience-mcp.test.mjs` (12/12 PASS)
  - `test/meta-audience-private-files.test.mjs` (3/3 PASS)
  - `test/meta-audience-php-contract.test.mjs` (10/10 PASS)
  - `test/meta-audience-release-preflight.test.mjs` (3/3 PASS)
- **Lint de Código PHP (`php -l`):** **PASS** em 5 scripts (`crm-meta-audience-purchase-classifier.php`, `crm-meta-audience-read.php`, `crm-meta-audience-preflight-read.php`, `crm-forensic-bridge.php`, `test/meta-audience-purchase-classifier.php`).
- **Classificador Comercial PHP Puro:** **13/13 PASS** (`php test/meta-audience-purchase-classifier.php`).
- **Checagem Global do Projeto (`npm run check`):** **PASS** (52 arquivos sem erros).
- **Suíte Completa do Conector (`npm test`):** **356/356 PASS** (0 falhas, 0 cancelados, duração ~9.34s).

---

## 2. Auditoria dos Hotfixes Críticos P25.4

1. **Objeto Canônico `scopeChallenge` (MCP SDK v2.4):**
   - Comprovada a remoção do artifício de array híbrido; o retorno foi padronizado no formato de objeto canônico `{ scopes: [...requiredScopes], errorDescription: '...' }`.
   - Validada a emissão de HTTP 403 real via handshake MCP HTTP para clientes sem o escopo `crm.audience.export`.
2. **Isolamento de Armazenamento Privado (Fora do Checkout Git):**
   - Validado em `src/live-gateway.mjs` e `test/meta-audience-mcp.test.mjs`: o conector resolve o `realpath` e proíbe estritamente a criação de arquivos CSV dentro do repositório Git, inclusive se caminhos intermediários utilizarem symlinks (`crm_meta_audience_private_directory_inside_checkout`).
3. **Performance SQL e Paridade de Status:**
   - O leitor agora processa pedidos em lotes de 1.000 IDs e recupera o status mais recente via subconsulta com `MAX(id)`, garantindo paridade total com o `CurrentOrderStatusResolver` do Laravel sem escanear todo o histórico de eventos de status.
4. **Isolamento de Recursos do Leitor Meta:**
   - Limite específico configurado para a extração Meta de 45 segundos e teto de 24 MiB de stdout, mantendo intactos os limites padrão de 8 MiB e timeouts curtos das demais ferramentas do conector.
5. **Preflight Offline e Janitor com Dry-Run Seguro:**
   - `scripts/antigravity/meta-audience-release-preflight.mjs`: executado sem segredos, reporta `status: "FEATURE_DISABLED"` quando os flags estão desligados.
   - `scripts/antigravity/purge-meta-audience-private.mjs`: opera em modo `dry_run` por padrão (`--apply` explícito exigido para deleção).

---

## 3. Matriz de Avaliação dos Portões (Gates 0 a 6)

| Portão | Critério Auditado | Resultado | Detalhe Técnico |
| :--- | :--- | :---: | :--- |
| **Gate 0** | QA local único no HEAD | **PASS** | `validate-meta-audience-p25-local.sh` concluído com código 0. 356 testes Node e 13 testes PHP PASS. |
| **Gate 1** | SQL Homologação / Staging | **UNKNOWN** | Intocado. Consultas validadas sinteticamente; staging real com réplica pendente antes do go-live. |
| **Gate 2** | Base Legal LGPD / DPO | **CONTRATO PASS / POLÍTICA PENDENTE** | Falha fechada sem dados se `EVYD_META_AUDIENCE_LGPD_APPROVED !== '1'`. Decisão formal de política documentada pendente. |
| **Gate 3** | Código Implantado Inerte | **PRONTO** | Procedimento estruturado para deploy inicial com flags `0`. |
| **Gate 4** | Ativação Parcial (Prévia) | **BLOQUEADO** | Requer aprovação jurídica e autorização de operador. |
| **Gate 5** | Exportação Privada | **BLOQUEADO** | Requer homologação SQL, diretório `0700` fora do checkout e escopo OAuth dedicado. |
| **Gate 6** | Retenção e Rollback | **PASS** | Janitor com dry-run seguro comprovado. Rollback funcional documentado. |

---

## 4. Roteiro Operacional de Release em Duas Fases (Canário OFF)

### Fase 1: Implantação Inerte (Zero Risco)
1. **Configuração de Ambiente na VPS:**
   ```env
   EVYD_META_AUDIENCE_ENABLED=0
   EVYD_AUDIENCE_EXPORT_ENABLED=0
   ```
2. **Deploy da Unit MCP:**
   - Atualizar a base de código do conector MCP para a versão da PR #23.
   - Reiniciar exclusivamente o processo da unit MCP.
   - Nenhuma ferramenta nova de público (`crm_meta_publico_natal_*`) será registrada.
   - Todas as 29 ferramentas existentes (CRM, PrintServer, Z-API, Gameplay) operam 100% inalteradas.
3. **Procedimento de Rollback:**
   - Em caso de qualquer anomalia na unit MCP, reverter o commit para o build LIVE anterior (`6abe039`) e reiniciar o processo, preservando bancos e serviços adjacentes.

### Fase 2: Ativação Controlada (Somente após Homologação e Parecer LGPD)
1. Ativação de prévia (`EVYD_META_AUDIENCE_ENABLED=1`, `EVYD_AUDIENCE_EXPORT_ENABLED=0`).
2. Exportação privada (`EVYD_AUDIENCE_EXPORT_ENABLED=1` com pasta `0700` fora do checkout Git e allowlist estrita).

---

## 5. Parecer Final

- **Qualidade de Código e Testes Locais:** **LOCAL_QA_GO** para o HEAD `f68e20c7684f2b5cf84e4bab4c6cf488f5a5f2d4`.
- **Produção / Deploy / Upload Meta Ads / Disparos:** **ESTRITO LIVE_EXPORT_NO_GO**.
- **PR #23:** Mantida em **DRAFT**.
