# Antigravity — concluir exportador Meta Customer List no Evydência MCP LIVE

**Contexto fixo:** repositório hypeneural/evydencia-crm-mcp; branch feat/meta-audience-crm-export-foundation-20261029 derivada do LIVE 6abe03992549cee83732ea538e728377a3c989fe. CRM Laravel (hypeneural/evydencia-crm) é SOMENTE REFERÊNCIA: não fazer checkout de alteração nem deploy nele. Não modificar Z-API, Gameplay, PrintServer, pagamentos, agenda ou projetos vizinhos.

## Ordem cirúrgica

1. Ler SOMENTE docs/META_AUDIENCE_CRM_EXPORT_20261029.md, src/meta-audience-csv.mjs, test/meta-audience-csv.test.mjs e as partes relevantes de scripts/crm-forensic-bridge.php, src/live-gateway.mjs, src/legacy-api-read.mjs, src/oauth-gateway.mjs e src/legacy-api-read.mjs. Não reiniciar P18/propostas nem mexer em outros PRs.
2. Rodar uma vez node --test test/meta-audience-csv.test.mjs. Reproduzir falhas reais, reparar sem desviar regras comerciais. Rodar node --check src/meta-audience-csv.mjs. Testes sintéticos NUNCA usam telefones reais.
3. Implementar action de leitura **global** no PHP isolado do MCP: customer + destinatários de Natal 2026, inclusive sem customer; sem N+1, sem last-8, duas fontes union + dedup. Usar PDO/Laravel do bridge com SQL READ ONLY e limites. Não introduzir migrations ou DML; não pedir alteração da API legada.
4. Excluir comprador com prova de **compra válida de qualquer produto em 2026**, não apenas Natal 2026. Validar explicitamente conversões/cancelados/chargeback/refunds na semântica CRM antes de escolher a SQL, e tratar desconhecido como bloqueio. Validar compartilhamento de telefones e registro de 8/9 dígitos.
5. Usar CommunicationSuppressionFilter/Evaluator para marketing conforme escopo Natal e termos Meta; mostrar em resumo quantos bloqueados, nunca os números em logs. Sinais ambíguos de autorização de marketing implicam não exportar. Recuperar consentimento/base legal válida da fonte do CRM ou exigir atestação documentada por operador, não inventar boolean verified.
6. Implementar tools `crm_meta_publico_natal_previa` (resumo read-only sem PII) e `crm_meta_publico_natal_exportar` (scope OAuth dedicado crm.audience.export + confirmado_pelo_operador=true). Resultados privados, export por páginas ligadas a mesmo snapshot/operador, sem URL pública nem tokens em parâmetros. ChatGPT deve conseguir entregar CSV como arquivo após exportar; arquivo não deve ser gravado no repo.
7. PHP + Node tests sintéticos: centenas de contatos, colisões, alterações entre páginas, comprador 2026 de produto não Natal, lead sem customer, campanhas 415/416, supressões, status inválidos, não comprado sem evidência, caso de cobertura parcial, perda da permissão OAuth, cancelamentos, arquivo corrompido.
8. Rodar testes focados e npm run check/test em checkout isolado, sem chamadas reais de envio. Comparar tools list, atributos readOnlyHint, permissões, 401/403, telemetry e isolamento de operador; passar gate com 1 auditoria de dados agregados LIVE somente após aprovação do operador e sem saída PII.
9. **Não publicar/deploy/merge** esta PR nem ativar Meta. Deixar pronto com recibo de testes, diffs, SHA, rollback só do MCP e comando futuro para ChatGPT. Nenhuma notificação periódica, GitHub Actions, CRM migrations, triggers, anúncios ou audiência Meta em produção.

## Critérios de aceitação
- Prévia contabiliza all CRM + all proposal2026 + unique, exclui buyer any-2026 + suppressions, soma reconciliada e cobertura COMPLETE.
- CSV com cabeçalho email,phone,fn,ln,country, identificação BR, nenhuma coluna interna, sem duplicidade ou compradores 2026.
- Export em ChatGPT no escopo novo explicitamente concedido, sem expor contatos em resposta de texto.
- Falha de compra/supressão/autorização bloqueia exportação, não assume zero.
- Estado de release LIVE permanece intacto; PR draft até homologação.
