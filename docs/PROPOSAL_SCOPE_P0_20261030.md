# Propostas Natal — pedido único e conciliação (#24)

## Contrato do operador

Um pedido explícito de enviar a proposta a um telefone identificado autoriza o fluxo saudável.
O gateway verifica internamente a prévia e agenda uma vez, sem solicitar confirmação redundante.
OAuth crm.proposal.write, ability extension:proposal-write e confirmado_pelo_operador=true
continuam obrigatórios. Ambiguidade não autoriza selecionar um destinatário por aproximação.

O parâmetro allow_initial_only é falso por padrão. Somente um pedido explícito para enviar
o WhatsApp inicial sem acompanhamentos permite true. Mudança entre modalidade completa e
inicial retorna os códigos públicos PROPOSAL_INITIAL_ONLY_CONFIRMATION_REQUIRED ou
PROPOSAL_DELIVERY_SCOPE_CHANGED e exige novo pedido; não há segundo POST automático.
send_again e abort_and_resend são recusados neste fluxo. O motor CRM preserva compra,
STOP, opt-out, supressão, cadência, snapshots e idempotência transacional.

## Referência durável

Antes do POST, um journal privado grava intenção e índice por UUID. O diretório raiz deve
ser previamente criado para o usuário do serviço, modo 0700, fora do checkout, e configurado
por EVYD_PROPOSAL_JOURNAL_DIR. Ausência, corrupção, symlink ou erro de escrita bloqueiam
novos agendamentos. A chave HMAC é derivada separadamente da chave operacional existente;
esta folha não a rotaciona nem grava credenciais no journal.

Os arquivos 0600 contêm UUID, hashes HMAC de operador/destinatário/conteúdo, modalidade,
geração e horário. Não contêm nome, telefone, conteúdo comercial ou token em texto aberto.
Publicação por link exclusivo ocorre somente após fsync; o primeiro processo vence e os
demais consultam sua referência. Resultados terminais são imutáveis. Incerteza e confirmação
não expiram para uma nova intenção; somente recusa definitiva permite nova geração.

crm_consultar_solicitacao_proposta_natal(request_id) chama exclusivamente o GET autenticado
do CRM /api/v1/extension/proposals/requests/{requestId}. Resoluções confirmed, rejected e
inconclusive são distintas. Registro ausente, pendente, inconsistente ou resposta perdida
mantém o bloqueio, inclusive após reinício. A confirmação informa modalidade e protocolo;
agendamento não comprova aceitação pelo provedor, entrega ou leitura.

## Rollout e rollback

Base da folha é o SHA produtivo 2f7755ddac2bdb802ffeb43ccf7f9cc7ddf3fa8c, com os demais
recursos operacionais preservados. Não substituir a linha produtiva pela main histórica nem
integrar trabalho Meta paralelo por efeito colateral. Backend #460 deve ser publicado e
comprovar o contrato antes da atualização MCP. Preservar tokens, grants e journal em rollback;
cliente antigo não deve admitir novas propostas enquanto não reconhecer o contrato seguro.

Testes usam rede/provedores sintéticos. Gate canônico e benchmark pertencem ao SHA final
registrado na PR. Teste automático não executa tool de envio LIVE. Canário consentido e
rastreamento de T0 são verificações operacionais separadas, não smoke genérico.
