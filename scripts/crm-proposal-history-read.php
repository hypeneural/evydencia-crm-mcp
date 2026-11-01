<?php
declare(strict_types=1);

/**
 * Included ONLY by crm-forensic-bridge.php after Laravel boot and SQL READ ONLY guard.
 * Action: proposals.history.batch. No writes, queues, network or side effects.
 */
require_once __DIR__ . '/crm-proposal-history-phones.php';

$phones = $payload['telefones'] ?? null;
if (!is_array($phones) || !array_is_list($phones) || count($phones) < 1 || count($phones) > 50) {
    emitForensicJson(['error' => 'invalid_proposal_batch_size'], $forensicStartedMs);
}
$perContactLimit = min(25, max(1, (int) ($payload['historico_limite'] ?? 15)));
if (($payload['ano'] ?? 2026) !== 2026) {
    emitForensicJson(['error' => 'invalid_proposal_year'], $forensicStartedMs);
}

$groups = [];
$inputs = [];
foreach ($phones as $index => $rawPhone) {
    $parsed = evyProposalPhoneVariants($rawPhone);
    if ($parsed === null) {
        $inputs[] = ['index' => $index, 'status' => 'invalid_phone',
            'phone_masked' => is_string($rawPhone) ? substr(preg_replace('/\D/', '', $rawPhone) ?: '', -4) : null];
        continue;
    }
    $key = $parsed['canonical_e164'];
    if (!isset($groups[$key])) {
        $groups[$key] = $parsed + ['input_indices' => []];
    }
    $groups[$key]['input_indices'][] = $index;
    $inputs[] = ['index' => $index, 'status' => 'valid', 'canonical_e164' => $key];
}
if (!$groups) {
    emitForensicJson(['source' => 'CRM_NATAL_PROPOSAL_READ_ONLY', 'year' => 2026,
        'inputs' => $inputs, 'results' => [], 'coverage' => 'complete'], $forensicStartedMs);
}

$flow = \Illuminate\Support\Facades\DB::table('proposal_flows')
    ->where('slug', (string) config('proposals.natal_flow_slug', 'natal'))
    ->first(['id', 'slug', 'with_name_campaign_id', 'without_name_campaign_id']);
if (!$flow) {
    emitForensicJson(['source' => 'CRM_NATAL_PROPOSAL_READ_ONLY', 'year' => 2026,
        'inputs' => $inputs, 'results' => [], 'coverage' => 'unavailable',
        'reason' => 'proposal_flow_not_configured'], $forensicStartedMs);
}

// A identidade do destinatário e o cadastro são objetos diferentes. O HMAC é
// calculado somente no servidor com a mesma chave canônica do CRM.
$key = (string) config('proposals.hash_key');
if (strlen($key) < 32) {
    emitForensicJson(['error' => 'proposal_hash_key_missing'], $forensicStartedMs);
}
$hashToGroup = [];
$e164ToGroup = [];
$phoneTokens = [];
foreach ($groups as $canonical => $group) {
    foreach ($group['variants_e164'] as $e164) {
        $hashToGroup[hash_hmac('sha256', $e164, $key)][$canonical] = true;
        $e164ToGroup[$e164][$canonical] = true;
        $national = substr($e164, 3);
        foreach ([$national, '55' . $national, '+' . '55' . $national] as $token) {
            $phoneTokens[$token] = true;
        }
    }
}

$DB = \Illuminate\Support\Facades\DB::class;
$hashes = array_keys($hashToGroup);
$tokens = array_keys($phoneTokens);
$e164s = array_keys($e164ToGroup);
$maxRecords = 1500;
$truncated = [];

$dispatchRows = $DB::table('proposal_dispatches as pd')
    ->where('pd.proposal_flow_id', (int) $flow->id)
    ->where('pd.created_at', '>=', '2026-01-01 00:00:00')
    ->where('pd.created_at', '<', '2027-01-01 00:00:00')
    ->whereIn('pd.phone_lookup_hash', $hashes)
    ->orderByDesc('pd.created_at')->orderByDesc('pd.id')
    ->limit($maxRecords + 1)
    ->get(['pd.id', 'pd.uuid', 'pd.request_id', 'pd.phone_e164', 'pd.phone_lookup_hash',
        'pd.resolved_customer_id', 'pd.campaign_scheduled_id', 'pd.campaign_scheduled_contact_id',
        'pd.selected_campaign_id', 'pd.status', 'pd.eligibility_status', 'pd.eligibility_reason',
        'pd.scheduled_at', 'pd.failed_at', 'pd.created_at']);
if ($dispatchRows->count() > $maxRecords) {
    $truncated[] = 'dispatches';
    $dispatchRows = $dispatchRows->take($maxRecords);
}

$campaignIds = array_values(array_filter(array_unique([
    (int) $flow->with_name_campaign_id, (int) $flow->without_name_campaign_id,
])));
$legacyRows = $DB::table('campaign_scheduled_contacts as cc')
    ->join('campaign_scheduleds as cs', 'cs.id', '=', 'cc.campaign_scheduled_id')
    ->whereIn('cc.whatsapp', $tokens)
    ->where(function ($q) use ($campaignIds, $flow) {
        $q->whereIn('cs.campaign_id', $campaignIds)
            ->orWhere('cs.suppression_snapshot->proposal_flow_slug', (string) $flow->slug)
            ->orWhere(function ($season) {
                $season->where('cs.suppression_snapshot->natal_proposal', true)
                    ->where('cs.suppression_scope_key', 'natal:2026');
            });
    })
    // A historical contact must belong to the 2026 season; never let a
    // reused campaign ID or an unrelated year prove a Natal 2026 dispatch.
    ->where(function ($season) {
        $season->where('cs.suppression_scope_key', 'natal:2026')
            ->orWhere(function ($undated) {
                $undated->whereNull('cs.suppression_scope_key')
                    ->where('cs.created_at', '>=', '2026-01-01 00:00:00')
                    ->where('cs.created_at', '<', '2027-01-01 00:00:00');
            });
    })
    ->where(function ($q) {
        $q->whereNull('cs.communication_class')->orWhere('cs.communication_class', '<>', 'operational');
    })
    ->orderByDesc('cc.id')->limit($maxRecords + 1)
    ->get(['cc.id as contact_id', 'cc.campaign_scheduled_id', 'cc.whatsapp',
        'cc.name as contact_name', 'cc.status as contact_status',
        'cs.campaign_id', 'cs.status as scheduled_status', 'cs.created_at']);
if ($legacyRows->count() > $maxRecords) {
    $truncated[] = 'scheduled_contacts';
    $legacyRows = $legacyRows->take($maxRecords);
}

$contactsById = [];
$contactGroupKeys = [];
$dispatchGroups = [];
foreach ($dispatchRows as $dispatch) {
    $related = array_keys($hashToGroup[(string) $dispatch->phone_lookup_hash] ?? []);
    foreach ($related as $canonical) {
        $dispatchGroups[$canonical][] = $dispatch;
        if ($dispatch->campaign_scheduled_contact_id) {
            $id = (int) $dispatch->campaign_scheduled_contact_id;
            $contactGroupKeys[$id][$canonical] = true;
        }
    }
}
$legacyGroups = [];
foreach ($legacyRows as $legacy) {
    $parsed = evyProposalPhoneVariants((string) $legacy->whatsapp);
    if (!$parsed) {
        continue;
    }
    $id = (int) $legacy->contact_id;
    $contactsById[$id] = $legacy;
    foreach ($parsed['variants_e164'] as $e164) {
        foreach (array_keys($e164ToGroup[$e164] ?? []) as $canonical) {
            $contactGroupKeys[$id][$canonical] = true;
            $legacyGroups[$canonical][$id] = $legacy;
        }
    }
}

// Materialize campaign and group-intent provenance in fixed-size batches.
$allCampaignIds = array_values(array_filter(array_unique(array_merge(
    $campaignIds,
    $dispatchRows->pluck('selected_campaign_id')->map(fn ($id) => (int) $id)->all(),
    $legacyRows->pluck('campaign_id')->map(fn ($id) => (int) $id)->all()
))));
$campaignNames = $allCampaignIds
    ? $DB::table('campaigns')->whereIn('id', $allCampaignIds)->pluck('name', 'id')->all() : [];
$groupIntents = [];
$intentUuids = $dispatchRows->pluck('request_id')->filter()->unique()->values()->all();
if ($intentUuids && \Illuminate\Support\Facades\Schema::hasTable('proposal_group_intents')) {
    $intents = $DB::table('proposal_group_intents')
        ->whereIn('uuid', $intentUuids)
        ->get(['uuid', 'phone_lookup_hash', 'proposal_flow_id', 'action', 'state', 'inbound_message_id', 'outbound_message_id',
            'click_message_id', 'created_at']);
    foreach ($intents as $intent) {
        $groupIntents[(string) $intent->uuid] = [
            'phone_lookup_hash' => (string) $intent->phone_lookup_hash,
            'proposal_flow_id' => $intent->proposal_flow_id ? (int) $intent->proposal_flow_id : null,
            'projection' => [
            'source' => 'zapi_group_intent', 'action' => $intent->action,
            'state' => $intent->state,
            'inbound_message_id' => $intent->inbound_message_id,
            'outbound_message_id' => $intent->outbound_message_id,
            'click_message_id' => $intent->click_message_id,
            'created_at_brt' => formatBrt($intent->created_at),
            ],
        ];
    }
}

$contactIds = array_keys($contactGroupKeys);
$progressById = [];
$progressAvailable = true;
if ($contactIds) {
    try {
        $progressById = app(\App\Services\Proposals\GetProposalExecutionProgress::class)->getMany($contactIds);
    } catch (\Throwable) {
        $progressAvailable = false;
        // Fail closed: not having progress is not evidence of an unsent proposal.
    }
}

$deliveryRows = collect();
$eventRows = collect();
if ($contactIds) {
    $deliveryRows = $DB::table('campaign_stage_action_deliveries as d')
        ->leftJoin('campaign_stage_action_delivery_items as i', 'i.delivery_id', '=', 'd.id')
        ->whereIn('d.campaign_scheduled_contact_id', $contactIds)
        ->orderBy('d.id')->orderBy('i.id')
        ->limit(3501)
        ->get(['d.id as delivery_id', 'd.campaign_scheduled_contact_id as contact_id',
            'd.campaign_stage_id as stage_id', 'd.status as delivery_status', 'd.channel as delivery_channel',
            'i.id as item_id', 'i.channel', 'i.provider', 'i.provider_recipient',
            'i.status', 'i.outbox_status', 'i.provider_message_id',
            'i.sent_at', 'i.accepted_at', 'i.delivered_at', 'i.read_at', 'i.failed_at']);
    if ($deliveryRows->count() > 3500) {
        $truncated[] = 'delivery_items';
        $deliveryRows = $deliveryRows->take(3500);
    }
    $eventRows = $DB::table('communication_events')
        ->whereIn('campaign_scheduled_contact_id', $contactIds)
        ->orderByDesc('id')->limit(3501)
        ->get(['id', 'campaign_scheduled_contact_id', 'campaign_stage_id', 'delivery_id',
            'delivery_item_id', 'channel', 'provider', 'event_type', 'event_status',
            'provider_message_id', 'occurred_at', 'received_at']);
    if ($eventRows->count() > 3500) {
        $truncated[] = 'communication_events';
        $eventRows = $eventRows->take(3500);
    }
}
$deliveriesByContact = $deliveryRows->groupBy('contact_id');
$eventsByContact = $eventRows->groupBy('campaign_scheduled_contact_id');
// Tentativas são metadados de transporte: HTTP 200 sozinho não comprova envio.
$attemptsByItem = collect();
$itemIds = $deliveryRows->pluck('item_id')->filter()->unique()->values()->all();
if ($itemIds) {
    $attempts = $DB::table('provider_request_attempts')
        ->whereIn('delivery_item_id', $itemIds)
        ->orderByDesc('id')->limit(3501)
        ->get(['id', 'delivery_item_id', 'attempt_number', 'http_status', 'provider_message_id', 'created_at']);
    if ($attempts->count() > 3500) {
        $truncated[] = 'provider_attempts';
        $attempts = $attempts->take(3500);
    }
    $attemptsByItem = $attempts->groupBy('delivery_item_id');
}

// Customer identity is independent of recipient identity. No suffix-only LIKE.
$hasE164 = \Illuminate\Support\Facades\Schema::hasColumns('customers', ['phone_e164', 'whatsapp_e164']);
$customerColumns = ['id', 'uuid', 'name', 'phone', 'whatsapp'];
if ($hasE164) $customerColumns = array_merge($customerColumns, ['phone_e164', 'whatsapp_e164']);
$customerQuery = \App\Models\Customer::query()->select($customerColumns);
$customerQuery->where(function ($q) use ($tokens, $e164s, $hasE164) {
    $q->whereIn('phone', $tokens)->orWhereIn('whatsapp', $tokens);
    if ($hasE164) {
        $q->orWhereIn('phone_e164', $e164s)->orWhereIn('whatsapp_e164', $e164s);
    }
});
$customerRows = $customerQuery->orderBy('id')->limit(201)->get();
if ($customerRows->count() > 200) {
    $truncated[] = 'customers';
    $customerRows = $customerRows->take(200);
}
$customersByGroup = [];
foreach ($customerRows as $customer) {
    $customerVariants = [];
    foreach ([$customer->whatsapp, $customer->phone,
        $hasE164 ? $customer->whatsapp_e164 : null,
        $hasE164 ? $customer->phone_e164 : null] as $phone) {
        $parsed = evyProposalPhoneVariants($phone);
        if ($parsed) {
            $customerVariants[] = $parsed['input_e164'];
        }
    }
    $customerVariants = array_values(array_unique($customerVariants));
    foreach ($groups as $canonical => $group) {
        $intersection = array_intersect($group['variants_e164'], $customerVariants);
        if (!$intersection) continue;
        $strength = in_array($group['input_e164'], $customerVariants, true) ? 'exact' : 'legacy_variant';
        $customersByGroup[$canonical][] = [
            'id' => (int) $customer->id, 'uuid' => (string) $customer->uuid,
            'name' => (string) $customer->name, 'match_strength' => $strength,
            'crm_customer_url' => 'https://evydencia.com/gestao/clientes/' . $customer->uuid . '/consultar',
        ];
    }
}

// Purchase: canonical Laravel policy, not inferred from existence of any order.
$purchaseIds = $customerRows->pluck('id')->map(fn ($x) => (int) $x)->all();
$purchases = [];
$purchaseAvailable = true;
if ($purchaseIds) {
    try {
        $asOf = \Carbon\CarbonImmutable::now('America/Sao_Paulo');
        $rows = app(\App\Services\Reports\NatalValidOrdersQuery::class)->validNatalOrders(
            $asOf,
            \Carbon\CarbonImmutable::parse('2026-01-01 00:00:00', 'America/Sao_Paulo'),
            \Carbon\CarbonImmutable::parse('2026-12-31 23:59:59', 'America/Sao_Paulo'),
            'natal'
        )->whereIn('o.customer_id', $purchaseIds)
         ->select(['o.customer_id', 'o.id', 'o.uuid'])
         ->orderByDesc('o.id')->limit(501)->get();
        if ($rows->count() > 500) {
            $truncated[] = 'natal_orders';
            $rows = $rows->take(500);
        }
        foreach ($rows as $order) {
            $id = (int) $order->customer_id;
            $purchases[$id][] = ['order_id' => (int) $order->id, 'order_uuid' => (string) $order->uuid,
                'crm_order_url' => 'https://evydencia.com/gestao/pedidos/' . $order->uuid . '/detalhes'];
        }
    } catch (\Throwable) {
        $purchaseAvailable = false;
    }
}

require_once __DIR__ . '/crm-proposal-history-evidence.php';

$results = [];
foreach ($groups as $canonical => $group) {
    $customerCandidates = $customersByGroup[$canonical] ?? [];
    usort($customerCandidates, fn ($a, $b) => ($a['match_strength'] === 'exact' ? 0 : 1) <=> ($b['match_strength'] === 'exact' ? 0 : 1));
    $exactCandidates = array_values(array_filter($customerCandidates, fn ($c) => $c['match_strength'] === 'exact'));
    $customerStatus = count($exactCandidates) === 1 ? 'exact_unique_with_possible_variants' :
        (count($exactCandidates) > 1 ? 'ambiguous_exact' :
        (count($customerCandidates) === 1 ? 'variant_only_requires_confirmation' :
        (count($customerCandidates) > 1 ? 'ambiguous' : 'not_found')));
    $commercialCustomer = $customerStatus === 'exact_unique_with_possible_variants' ? $exactCandidates[0] : null;
    foreach ($customerCandidates as &$candidate) {
        $candidate['natal_2026_purchased'] = $purchaseAvailable
            ? !empty($purchases[$candidate['id']]) : null;
        $candidate['natal_orders'] = $purchaseAvailable
            ? ($purchases[$candidate['id']] ?? []) : [];
    }
    unset($candidate);
    $customerId = $commercialCustomer['id'] ?? null;
    $buy = $customerId !== null && $purchaseAvailable ? !empty($purchases[$customerId]) : null;
    $executions = [];
    $seenContact = [];
    foreach ($dispatchGroups[$canonical] ?? [] as $dispatch) {
        $cid = $dispatch->campaign_scheduled_contact_id ? (int) $dispatch->campaign_scheduled_contact_id : null;
        $executions[] = ['source' => 'proposal_dispatch', 'dispatch_uuid' => $dispatch->uuid,
            'dispatch_status' => $dispatch->status, 'eligibility_status' => $dispatch->eligibility_status,
            'eligibility_reason' => $dispatch->eligibility_reason, 'campaign_id' => (int) $dispatch->selected_campaign_id,
            'campaign_name' => $campaignNames[(int) $dispatch->selected_campaign_id] ?? null,
            'source_intent' => isset($groupIntents[(string) $dispatch->request_id])
                && hash_equals((string) $dispatch->phone_lookup_hash, $groupIntents[(string) $dispatch->request_id]['phone_lookup_hash'])
                && (int) $groupIntents[(string) $dispatch->request_id]['proposal_flow_id'] === (int) $flow->id
                    ? $groupIntents[(string) $dispatch->request_id]['projection'] : null,
            'contact_id' => $cid, 'scheduled_id' => $dispatch->campaign_scheduled_id ? (int) $dispatch->campaign_scheduled_id : null,
            'created_at_brt' => formatBrt($dispatch->created_at), 'scheduled_at_brt' => formatBrt($dispatch->scheduled_at),
            'failed_at_brt' => formatBrt($dispatch->failed_at),
            'recipient_match' => $dispatch->phone_e164 === $group['input_e164'] ? 'exact' : 'legacy_variant',
            'activity_url' => $dispatch->campaign_scheduled_id
                ? route('manager.campaign.scheduled.detail', $dispatch->campaign_scheduled_id) : null];
        if ($cid) $seenContact[$cid] = true;
    }
    foreach ($legacyGroups[$canonical] ?? [] as $cid => $legacy) {
        if (isset($seenContact[$cid])) continue;
        $executions[] = ['source' => 'legacy_scheduled_contact', 'dispatch_uuid' => null,
            'dispatch_status' => null, 'eligibility_status' => null, 'eligibility_reason' => null,
            'campaign_id' => (int) $legacy->campaign_id,
            'campaign_name' => $campaignNames[(int) $legacy->campaign_id] ?? null,
            'source_intent' => null, 'contact_id' => (int) $cid,
            'scheduled_id' => (int) $legacy->campaign_scheduled_id,
            'created_at_brt' => formatBrt($legacy->created_at), 'scheduled_at_brt' => null,
            'failed_at_brt' => null,
            'recipient_match' => evyProposalPhoneVariants((string) $legacy->whatsapp)['input_e164'] === $group['input_e164'] ? 'exact' : 'legacy_variant',
            'activity_url' => route('manager.campaign.scheduled.detail', $legacy->campaign_scheduled_id)];
    }
    $anyAccepted = false;
    $phoneAcceptedExact = false;
    $phoneAcceptedLegacy = false;
    $phoneRecipientUnverified = false;
    $phoneRecipientMismatch = false;
    $initialAccepted = false;
    $initialKnown = false;
    $firstAcceptedAt = null;
    $eventsOut = [];
    foreach ($executions as &$execution) {
        $cid = $execution['contact_id'];
        $progress = $cid ? ($progressById[$cid] ?? null) : null;
        $execution['progress'] = $progress ? [
            'state' => $progress['state'] ?? null,
            'state_label' => $progress['state_label'] ?? null,
            'current_stage' => $progress['current_stage'] ?? null,
            'next' => $progress['next'] ?? null,
            'stages' => $progress['stages'] ?? [],
            'items_summary' => $progress['items'] ?? [],
        ] : null;
        $initialStage = ($progress['source'] ?? null) === 'captured' ? ($progress['stages'][0]['id'] ?? null) : null;
        if ($initialStage !== null) $initialKnown = true;
        $deliveryItems = [];
        foreach ($deliveriesByContact->get($cid, collect()) as $raw) {
            $item = evyProposalItemEvidence($raw);
            // A campaign contact is not proof of the actual provider recipient.
            // Validate the channel and concrete provider_recipient independently.
            $itemChannel = strtolower((string) ($item['channel'] ?? ''));
            $isPhoneChannel = in_array($itemChannel, ['whatsapp', 'sms', 'voip', 'voice'], true);
            $providerRecipient = trim((string) ($raw->provider_recipient ?? ''));
            $recipientMatch = evyProposalRecipientMatch($providerRecipient, $itemChannel, $group);
            $item['recipient_match'] = $recipientMatch;
            $item['recipient_phone_confirmed_exact'] = $isPhoneChannel && $recipientMatch === 'exact' && $item['provider_accepted'];
            $item['recipient_phone_legacy_candidate'] = $isPhoneChannel && $recipientMatch === 'legacy_variant' && $item['provider_accepted'];
            $item['provider_attempts'] = $raw->item_id
                ? $attemptsByItem->get((int) $raw->item_id, collect())->take(5)->map(static fn ($attempt) => [
                    'attempt_number' => (int) $attempt->attempt_number,
                    'http_status' => $attempt->http_status === null ? null : (int) $attempt->http_status,
                    'provider_message_id' => $attempt->provider_message_id ?: null,
                    'attempted_at_brt' => formatBrt($attempt->created_at),
                ])->values()->all() : [];
            $deliveryItems[] = $item;
            if ($isPhoneChannel && $item['provider_accepted']) {
                $phoneAcceptedExact = $phoneAcceptedExact || $recipientMatch === 'exact';
                $phoneAcceptedLegacy = $phoneAcceptedLegacy || $recipientMatch === 'legacy_variant';
                $phoneRecipientUnverified = $phoneRecipientUnverified || in_array($recipientMatch, ['not_recorded', 'unverifiable'], true);
                $phoneRecipientMismatch = $phoneRecipientMismatch || $recipientMatch === 'mismatch';
            }
            if ($item['provider_accepted'] && !in_array($recipientMatch, ['mismatch', 'unverifiable'], true)) {
                $anyAccepted = true;
                if ($initialStage !== null && $item['stage_id'] === (int) $initialStage && $item['channel'] === 'whatsapp') {
                    $initialAccepted = true;
                }
                $moment = $item['accepted_at_brt'] ?? $item['delivered_at_brt'] ?? $item['read_at_brt'];
                if ($moment && ($firstAcceptedAt === null || $moment < $firstAcceptedAt)) $firstAcceptedAt = $moment;
            }
        }
        $execution['delivery_items_count'] = count($deliveryItems);
        $execution['delivery_items'] = array_slice($deliveryItems, 0, $perContactLimit);
        $execution['delivery_items_truncated'] = count($deliveryItems) > $perContactLimit;
        if ($execution['delivery_items_truncated']) $truncated[] = 'per_contact_delivery_history';
        $contactEvents = $eventsByContact->get($cid, collect());
        if ($contactEvents->count() > $perContactLimit) $truncated[] = 'per_contact_event_history';
        foreach ($contactEvents->take($perContactLimit) as $event) {
            $eventsOut[] = ['id' => (int) $event->id, 'contact_id' => $cid,
                'stage_id' => $event->campaign_stage_id ? (int) $event->campaign_stage_id : null,
                'delivery_item_id' => $event->delivery_item_id ? (int) $event->delivery_item_id : null,
                'channel' => $event->channel, 'provider' => $event->provider,
                'event_type' => $event->event_type, 'event_status' => $event->event_status,
                'provider_message_id' => $event->provider_message_id,
                'occurred_at_brt' => formatBrt($event->occurred_at),
                'received_at_brt' => formatBrt($event->received_at)];
        }
    }
    unset($execution);
    usort($eventsOut, fn ($a, $b) => ($b['occurred_at_brt'] ?? $b['received_at_brt'] ?? '') <=> ($a['occurred_at_brt'] ?? $a['received_at_brt'] ?? ''));
    $results[] = [
        'canonical_e164' => $canonical, 'input_indices' => $group['input_indices'],
        'input_e164' => $group['input_e164'], 'variants_e164' => $group['variants_e164'],
        'legacy_variant_is_identity_proof' => false,
        'customer_match_status' => $customerStatus, 'customer_candidates' => $customerCandidates,
        'natal_2026' => ['purchased' => $buy,
            'orders' => $customerId !== null && $purchaseAvailable ? ($purchases[$customerId] ?? []) : [],
            'source' => $purchaseAvailable ? 'NatalValidOrdersQuery' : 'unavailable'],
        'proposal' => ['record_status' => count($executions) ? 'found' : ($truncated ? 'not_verified_partial_coverage' : 'not_found_in_queried_sources'),
            'any_campaign_message_accepted' => $anyAccepted ? true : ($truncated ? null : false),
            'phone_recipient_exact_accepted' => $phoneAcceptedExact,
            'phone_recipient_legacy_candidate_accepted' => $phoneAcceptedLegacy,
            'phone_recipient_unverified' => $phoneRecipientUnverified,
            'phone_recipient_mismatch_detected' => $phoneRecipientMismatch,
            'initial_whatsapp_accepted' => $initialAccepted ? true : ($initialKnown && !$truncated ? false : null),
            'first_accepted_at_brt' => $firstAcceptedAt,
            'execution_count' => count($executions),
            'progress_available' => $progressAvailable],
        'executions' => $executions,
        'recent_events' => array_slice($eventsOut, 0, $perContactLimit),
        'recent_events_has_more' => count($eventsOut) > $perContactLimit,
    ];
    if (count($eventsOut) > $perContactLimit) $truncated[] = 'per_contact_event_history';
}

emitForensicJson([
    'source' => 'CRM_NATAL_PROPOSAL_READ_ONLY', 'year' => 2026,
    'timezone' => 'America/Sao_Paulo', 'generated_at_brt' => \Carbon\CarbonImmutable::now('America/Sao_Paulo')->toIso8601String(),
    'coverage' => $truncated === [] && $progressAvailable && $purchaseAvailable ? 'complete' : 'partial',
    'truncated_sources' => array_values(array_unique($truncated)),
    'progress_available' => $progressAvailable, 'purchase_available' => $purchaseAvailable,
    'inputs' => $inputs, 'results' => $results,
    'disclaimer' => 'Agendado não é enviado; variantes sem 9 não provam identidade. Ausência de registros não comprova ausência de envio externo.',
], $forensicStartedMs);
