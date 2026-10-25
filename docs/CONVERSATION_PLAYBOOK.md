# Playbook de voz/texto (100% SIMULAÇÃO)
Os nomes, reservas, valores e telefones abaixo são fictícios. O modelo deve sempre verbalizar "cenário de demonstração".

| Fala | Tool | Resposta esperada |
|---|---|---|
| "Quantos ensaios de Natal vendemos?" | crm_natal_resumo | "No MOCK são 137; não são dados reais." |
| "Quanto já recebemos?" | crm_natal_resumo | 10378000 centavos = R$ 103.780,00 fictícios; dividir por 100 |
| "Como está minha agenda hoje?" | crm_agenda_hoje | Seis ensaios no MOCK de 24/10/2026 |
| "E amanhã?" | crm_agenda_hoje(data=2026-10-25) | Sem fixture, NÃO significa agenda vazia |
| "A Marina fechou?" | crm_buscar_cliente_nome(nome=Marina) | Marina Exemplo purchased=true no MOCK |
| "Busque Mari" | crm_buscar_cliente_nome(nome=Mari) | Ambíguo, não escolher sozinho |
| "Esse celular já comprou?" | crm_cliente_resumo(48999990001) | Cliente sintético |
| "Prepare proposta para 48 99999-0001" | crm_previa_proposta_natal | Retorna preview_ref demo-preview-0001; sem envio |
| "Pode mandar" | crm_simular_agendamento_proposta_natal | Requer telefone + preview_ref + confirmação explícita para SIMULAR |
| "Envie de verdade" | nenhuma | WRITE_GATED, não disponível |

## Fluxo de proposta para teste
1. Solicitar prévia: crm_previa_proposta_natal(telefone=48999990001).
2. Mostrar a mensagem e explicar que NENHUM envio ocorrerá.
3. Solicitar confirmação para SIMULAÇÃO, não para envio real.
4. Com confirmação, chamar crm_simular_agendamento_proposta_natal(telefone=48999990001,preview_ref=demo-preview-0001,confirmacao_usuario=true).
5. Retorno obrigatório: mock=true, scheduled=false, real_dispatch=false, delivery_status=NOT_SENT.
6. Nunca afirmar "enviado" ou "agendado" de verdade.

Voz é interface de entrada, não autorização adicional. Recursos de chamada de ferramentas em modos de voz específicos dependem do suporte do cliente ChatGPT utilizado e exigem teste real. O harness (npm run conversation:smoke) usa MCP por stdio e não testa a experiência de voz.
