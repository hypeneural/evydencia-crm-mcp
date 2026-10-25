# test — condições de aceite
- Testes sem chamadas de rede ao CRM e sem PII real.
- Cobrir bloqueios de elegibilidade, inputs inválidos e estado simulated != scheduled.
- Nunca remover assert para obter verde; diagnosticar causa.
- Executar npm test + ambos smokes após mudanças em tools.
