# UMA EXECUÇÃO LOCAL — Evydência MCP

**Para o Gemini 3.8 Flash: não pensar em quais comandos executar.** Abra o terminal PowerShell na pasta do clone, use apenas:

```powershell
git status --short
git pull --ff-only origin main
.\scripts\go.ps1
```

Se houver arquivos modificados, não faça pull sem antes preservá-los. `go.ps1` nunca faz git push, deploy, migração, upload nem altera o CRM. Cria `.env` somente se não existir e valida contra segredos, modo live e configurações imprevistas. Um `.env` anterior e inseguro bloqueia a execução, não é sobrescrito.

Resultado aceito: `GO_LOCAL_MOCK`, 0 falhas no npm test, smoke stdio e conversation smoke. Quando já instalou dependências, `go.ps1 -SkipInstall` reexecuta só os validadores.

**Quais ferramentas o ChatGPT usaria no ensaio:** `crm_capacidades`, `crm_natal_resumo`, `crm_agenda_hoje`, `crm_buscar_cliente_nome`, `crm_cliente_resumo`, `crm_previa_proposta_natal`, `crm_simular_agendamento_proposta_natal`. Todas respondem com dados sintéticos e nenhuma ação real.

**Para depuração manual MCP:** executar `npm start` como processo stdio, sem adicionar `go.ps1` como comando stdio do Tunnel; o script imprime status e contaminaria o protocolo. Consultar `docs/CHATGPT_TUNNEL_MOCK.md` para ligar ao ChatGPT, somente após o GO_LOCAL_MOCK.

**Se falhar:** envie para análise APENAS a primeira linha `BLOCKED:`/ `FAIL`, comando e log redigido, sem `.env` nem tokens. Não conserte removendo testes, enfraquecendo hooks ou ativando EVYD_PRIVATE_TOOLS. Contratos: `docs/CAPABILITY_MATRIX.md`.

**Classificações que NÃO podem ser confundidas:**
- GO_LOCAL_MOCK: SDK e fixtures funcionando no seu Windows.
- GO_CHATGPT_MOCK: chamada real do ChatGPT via Tunnel testada; ainda só fictícia.
- GO_HOMOLOG: API Laravel autorizada, sem envios.
- GO_SEND: ainda bloqueado; OAuth por operador, confirmação e journal durável pendentes.
