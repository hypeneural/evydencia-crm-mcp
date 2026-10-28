<?php
declare(strict_types=1);

/** Prova de envio baseada em recibo de provedor, não no agendamento. */
function evyProposalItemEvidence(object $item): array
{
    $messageId = trim((string) ($item->provider_message_id ?? ''));
    $accepted = !empty($item->accepted_at) && $messageId !== '';
    $read = !empty($item->read_at);
    $delivered = !empty($item->delivered_at);
    $state = $read ? 'read_confirmed' : ($delivered ? 'delivered_confirmed' :
        ($accepted ? 'provider_accepted' :
        (in_array((string) ($item->status ?? ''), ['unknown'], true) ||
         (string) ($item->outbox_status ?? '') === 'submitting' ? 'outcome_unknown' :
        (in_array((string) ($item->status ?? ''), ['failed', 'bounced'], true) ? 'failed' :
        (!empty($item->sent_at) ? 'submitted_unconfirmed' : 'not_confirmed')))));
    return ['delivery_id' => (int) $item->delivery_id, 'delivery_item_id' => $item->item_id ? (int) $item->item_id : null,
        'stage_id' => (int) $item->stage_id, 'channel' => (string) ($item->channel ?: $item->delivery_channel),
        'provider' => $item->provider ?: null, 'provider_message_id' => $messageId ?: null,
        'state' => $state, 'provider_accepted' => $accepted || $read || $delivered,
        'status' => $item->status ?: $item->delivery_status,
        'outbox_status' => $item->outbox_status ?: null,
        'sent_at_brt' => formatBrt($item->sent_at), 'accepted_at_brt' => formatBrt($item->accepted_at),
        'delivered_at_brt' => formatBrt($item->delivered_at), 'read_at_brt' => formatBrt($item->read_at),
        'failed_at_brt' => formatBrt($item->failed_at)];
}

