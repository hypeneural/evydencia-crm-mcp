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

/**
 * Validate the concrete provider recipient independently from the campaign contact.
 * Without a recorded recipient the provider receipt remains attached to the
 * campaign execution, but DOES NOT confirm this phone number.
 */
function evyProposalRecipientMatch(mixed $providerRecipient, string $channel, array $group): string
{
    if (!in_array(strtolower($channel), ['whatsapp', 'sms', 'voip', 'voice'], true)) {
        return 'not_phone_channel';
    }
    $recipient = trim((string) $providerRecipient);
    if ($recipient === '') return 'not_recorded';
    $recipient = preg_replace('/@(?:c\\.us|s\\.whatsapp\\.net)$/i', '', $recipient);
    $parsed = evyProposalPhoneVariants($recipient);
    $e164 = $parsed['input_e164'] ?? null;
    if ($e164 === null) return 'unverifiable';
    if ($e164 === ($group['input_e164'] ?? null)) return 'exact';
    return in_array($e164, $group['variants_e164'] ?? [], true) ? 'legacy_variant' : 'mismatch';
}
