<?php
declare(strict_types=1);

/**
 * P25.1 Meta Audience CSV — Read-only extraction backend.
 * INCLUDED by scripts/crm-forensic-bridge.php only after Laravel bootstrap,
 * MySQL session READ ONLY and query guards are active.
 *
 * Runs inside a single REPEATABLE READ transaction to guarantee an InnoDB
 * consistent read snapshot across customers, proposals, orders, and suppressions.
 * No CRM database rows or external services are modified.
 */

if (!isset($payload, $forensicStartedMs) || !function_exists('emitForensicJson')) {
    fwrite(STDERR, "META_AUDIENCE_READ_BLOCKED: bridge_context_missing\n");
    exit(4);
}

$action = $payload['action'] ?? null;
if (!in_array($action, ['meta.audience.read', 'meta.audience.extract', 'meta.audience.preview'], true)) {
    emitForensicJson(['error' => 'invalid_meta_audience_action'], $forensicStartedMs);
}

$targetYear = (int) ($payload['year'] ?? 2026);
if ($targetYear !== 2026) {
    emitForensicJson(['error' => 'invalid_meta_audience_year'], $forensicStartedMs);
}

$legalBasisPolicy = (string) ($payload['legal_basis_policy'] ?? 'legitimate_interest_customer_reactivation_with_optout_check');
$legalBasisVerified = in_array($legalBasisPolicy, [
    'legitimate_interest_customer_reactivation_with_optout_check',
    'explicit_marketing_consent_verified',
], true)
    && getenv('EVYD_META_AUDIENCE_LGPD_APPROVED') === '1'
    && preg_match('/^[A-Za-z0-9_.:-]{8,120}$/', (string) getenv('EVYD_META_AUDIENCE_LGPD_POLICY_REF')) === 1;

// A policy name supplied by a caller is NEVER evidence of consent or lawful
// basis. Policy approval must be an explicit server-side operator attestation.
// Return no customers/proposals/phone hashes when approval is not configured.
if (!$legalBasisVerified) {
    emitForensicJson([
        'source' => 'CRM_META_AUDIENCE_READ_ONLY',
        'available' => false,
        'reason' => 'legal_basis_not_verified',
        'export_enabled' => false,
        'contains_personal_data' => false,
    ], $forensicStartedMs);
}

// Pure, locally testable classifier; no database access in this dependency.
require_once __DIR__ . '/crm-meta-audience-purchase-classifier.php';

// Helper: Normalize phone to E.164 (+55...) matching src/meta-audience-csv.mjs rules.
function evyNormalizePhoneE164(?string $raw): ?string
{
    if ($raw === null || strlen($raw) > 40) return null;
    $value = trim($raw);
    if ($value === '' || preg_match('/[^0-9+()\s.\-]/', $value)) return null;
    if (str_contains($value, '+') && (!str_starts_with($value, '+') || substr_count($value, '+') !== 1)) return null;

    $digits = preg_replace('/[\s()+.\-]/', '', $value);
    if (str_starts_with($value, '+') && !str_starts_with($digits, '55')) return null;
    if (str_starts_with($digits, '00')) {
        if (!str_starts_with($digits, '0055')) return null;
        $digits = substr($digits, 2);
    }
    $national = (in_array(strlen($digits), [12, 13], true) && str_starts_with($digits, '55'))
        ? substr($digits, 2) : $digits;

    static $dddSet = null;
    if ($dddSet === null) {
        $dddList = explode(' ', '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99');
        $dddSet = array_flip($dddList);
    }

    if (!in_array(strlen($national), [10, 11], true) || !isset($dddSet[substr($national, 0, 2)])) {
        return null;
    }
    $subscriber = substr($national, 2);
    // Brazilian mobile: 9 digits beginning 9. Fixed line: 8 digits beginning 2-5.
    if (strlen($subscriber) === 9 && !preg_match('/^9\d{8}$/', $subscriber)) return null;
    if (strlen($subscriber) === 8 && !preg_match('/^[2-5]\d{7}$/', $subscriber)) return null;

    return '+55' . $national;
}

// Disable query log to prevent memory exhaustion with large datasets.
\Illuminate\Support\Facades\DB::disableQueryLog();
// Retain only aggregate performance counters. Never store SQL text/bindings in
// Laravel's query log, which may otherwise contain customer PII in memory.
$metaSql = (object) ['count' => 0, 'ms' => 0.0];
\Illuminate\Support\Facades\DB::listen(static function ($event) use ($metaSql): void {
    $metaSql->count++;
    $metaSql->ms += (float) ($event->time ?? 0);
});

$snapshotId = 'snapshot-' . gmdate('YmdHis') . '-' . bin2hex(random_bytes(4));
$asOf = \Carbon\CarbonImmutable::now('America/Sao_Paulo')->toIso8601String();

// The forensic bridge permits SELECT and has already set session READ ONLY.
// It intentionally rejects arbitrary SET commands. Inspect isolation instead
// of attempting a SET which the SQL write guard would reject.
$isolation = \Illuminate\Support\Facades\DB::selectOne('SELECT @@transaction_isolation AS isolation');
if (strtoupper((string) ($isolation->isolation ?? '')) !== 'REPEATABLE-READ') {
    emitForensicJson(['source'=>'CRM_META_AUDIENCE_READ_ONLY',
        'available'=>false,'reason'=>'unexpected_transaction_isolation',
        'export_enabled'=>false,'contains_personal_data'=>false],$forensicStartedMs);
}
\Illuminate\Support\Facades\DB::beginTransaction();

try {
    $DB = \Illuminate\Support\Facades\DB::class;

    // 1. Fetch Natal Flow
    $flow = $DB::table('proposal_flows')
        ->where('slug', (string) config('proposals.natal_flow_slug', 'natal'))
        ->first(['id', 'slug', 'with_name_campaign_id', 'without_name_campaign_id']);

    // 2/3. Use the CRM's CANONICAL hasher and evaluator (independent
    // suppression key with application-key fallback). Never use the proposal
    // hash key directly: they can differ.
    $hasher = app(\App\Services\CommunicationSuppression\CommunicationSuppressionHasher::class);
    $suppressionEvaluator = app(\App\Services\CommunicationSuppression\CommunicationSuppressionEvaluator::class);
    $at = \Carbon\CarbonImmutable::now('America/Sao_Paulo');
    $suppressionRows = \App\Models\CommunicationSuppression::query()->active($at)
        // Narrow the candidate set to rules that CAN match marketing for
        // this season and WhatsApp/channel-all context; the evaluator still
        // makes the final authoritative decision in PHP.
        ->whereIn('communication_class',['marketing','all'])
        ->whereIn('channel',['whatsapp','all'])
        ->where(function($query){
            $query->where('scope_type','global')
                ->orWhere(function($season){
                    $season->where('scope_type','season')
                        ->where('scope_key','natal:2026');
                });
        })
        ->get(['id','phone_e164','phone_lookup_hash','customer_id','channel',
               'communication_class','scope_type','scope_key','reason_code',
               'starts_at','ends_at','revoked_at']);
    $rulesByHash = [];
    $rulesByCustomer = [];
    foreach ($suppressionRows as $rule) {
        $hash = (string) $rule->phone_lookup_hash;
        // Prove the installed hasher uses the SAME secret/key derivation as
        // rows already persisted in CRM. Without this, every opt-out can be
        // silently missed while tests with empty suppression tables pass.
        $persistedPhone = evyNormalizePhoneE164((string) $rule->phone_e164);
        if ($persistedPhone === null || $hash === ''
            || !hash_equals($hash, $hasher->hash($persistedPhone))) {
            throw new \RuntimeException('meta_audience_suppression_hash_mismatch');
        }
        if ($hash !== '') $rulesByHash[$hash][] = $rule;
        if ($rule->customer_id !== null) $rulesByCustomer[(int)$rule->customer_id][] = $rule;
    }
    $isSuppressed = static function (?string $phone, ?int $customerId = null)
        use ($hasher, $suppressionEvaluator, $rulesByHash, $rulesByCustomer, $at): bool {
        if ($phone === null && $customerId === null) return false;
        $hash = $phone !== null ? $hasher->hash($phone) : '';
        $context = \App\Services\CommunicationSuppression\Data\CommunicationContext::create(
            phoneE164: $phone ?? '+550000000000',
            phoneLookupHash: $hash,
            customerId: $customerId,
            channel: 'whatsapp', communicationClass: 'marketing',
            scopeType: 'season', scopeKey: 'natal:2026', evaluatedAt: $at
        );
        // Treat a documented marketing WhatsApp opt-out as a conservative
        // exclusion from custom-audience advertising, never the reverse.
        $matches = array_merge($rulesByHash[$hash] ?? [], $rulesByCustomer[$customerId] ?? []);
        $decision = $suppressionEvaluator->evaluateRules($matches, $context);
        if (!is_bool($decision->allowed)) throw new \RuntimeException('suppression_decision_unavailable');
        return !$decision->allowed;
    };

    // 4. Resolve 2026 Purchases (ANY_VALID_PURCHASE_2026)
    // Orders created in 2026
    $orders2026 = $DB::table('orders')
        ->where('created_at', '>=', '2026-01-01 00:00:00')
        ->where('created_at', '<', '2027-01-01 00:00:00')
        ->get(['id', 'customer_id', 'created_at']);

    // Installments paid in 2026 with positive payment total
    $paidInstallments2026 = $DB::table('orders_installments')
        ->where('payment_at', '>=', '2026-01-01 00:00:00')
        ->where('payment_at', '<', '2027-01-01 00:00:00')
        ->where('payment_total', '>', 0)
        ->get(['id', 'order_id', 'payment_at', 'payment_total']);

    $paidOrderIds2026 = [];
    foreach ($paidInstallments2026 as $inst) {
        $paidOrderIds2026[(int) $inst->order_id] = true;
    }

    $allCandidateOrderIds = [];
    $orders2026Ids = [];
    $ordersByCustomer = [];
    foreach ($orders2026 as $ord) {
        $oId = (int) $ord->id;
        $cId = (int) $ord->customer_id;
        if ($cId <= 0) throw new \RuntimeException('order_without_customer_relation');
        $allCandidateOrderIds[$oId] = true;
        $orders2026Ids[$oId] = true;
        $ordersByCustomer[$cId][$oId] = true;
    }
    // Compute the gap BEFORE adding paid IDs, otherwise it is always empty.
    // A 2025 order paid in 2026 must still block the customer.
    $missingOrderIds = array_diff(array_keys($paidOrderIds2026), array_keys($allCandidateOrderIds));
    foreach (array_keys($paidOrderIds2026) as $oId) {
        $allCandidateOrderIds[$oId] = true;
    }

    // Resolve customer IDs of older orders paid in the target year.
    if (!empty($missingOrderIds)) {
        $extraOrders = $DB::table('orders')
            ->whereIn('id', $missingOrderIds)
            ->get(['id', 'customer_id', 'created_at']);
        foreach ($extraOrders as $ord) {
            if ((int)$ord->customer_id <= 0) throw new \RuntimeException('order_without_customer_relation');
            $ordersByCustomer[(int) $ord->customer_id][(int) $ord->id] = true;
        }
        if (count($extraOrders) !== count($missingOrderIds)) {
            throw new \RuntimeException('paid_2026_orders_missing_referential_integrity');
        }
    }

    // Fetch latest status for all candidate orders
    $latestStatusByOrder = [];
    $ordersWithStatus = [];
    if (!empty($allCandidateOrderIds)) {
        $statusRows = $DB::table('orders_status')
            ->whereIn('order_id', array_keys($allCandidateOrderIds))
            ->orderBy('id', 'asc')
            ->get(['id', 'order_id', 'status']);
        foreach ($statusRows as $sr) {
            $oId = (int) $sr->order_id;
            $latestStatusByOrder[$oId] = (string) $sr->status;
            $ordersWithStatus[$oId] = true;
        }
    }

    // Domain logic is extracted into a pure, locally testable function:
    // no accidental divergence between the synthetic tests and SQL adapter.
    $buyerCustomerIds = [];
    $ambiguousCustomerIds = [];
    foreach ($ordersByCustomer as $cId => $orderMap) {
        $facts = [];
        foreach (array_keys($orderMap) as $oId) {
            $facts[] = [
                'status' => $latestStatusByOrder[$oId] ?? null,
                'has_status' => isset($ordersWithStatus[$oId]),
                'created_2026' => isset($orders2026Ids[$oId]),
                'paid_2026' => isset($paidOrderIds2026[$oId]),
            ];
        }
        $decision = evyMetaAudienceClassifyPurchases2026($facts);
        if ($decision['buyer']) $buyerCustomerIds[$cId] = true;
        if ($decision['ambiguous']) $ambiguousCustomerIds[$cId] = true;
    }

    // 5. Query ALL Customers
    $customers = $DB::table('customers')
        ->select(['id', 'uuid', 'name', 'email', 'whatsapp', 'phone', 'whatsapp_e164', 'phone_e164'])
        ->orderBy('id', 'asc')
        ->get();

    $records = [];
    $customerRecordsCount = 0;
    $uniqueCustomerCount = 0;
    $knownCustomerIds = [];

    foreach ($customers as $c) {
        $cId = (int) $c->id;
        $knownCustomerIds[$cId] = true;
        $uniqueCustomerCount++;
        $name = is_string($c->name) ? trim($c->name) : '';
        $email = is_string($c->email) ? trim($c->email) : '';

        // Evaluate phones: prefer whatsapp_e164, fallback to phone_e164, then raw
        // Do not lose a valid raw number just because a stale E164 field is
        // populated with an invalid value.
        $phone1 = evyNormalizePhoneE164($c->whatsapp_e164)
            ?? evyNormalizePhoneE164($c->whatsapp);
        $phone2 = evyNormalizePhoneE164($c->phone_e164)
            ?? evyNormalizePhoneE164($c->phone);

        $phones = [];
        if ($phone1 !== null) $phones[] = $phone1;
        if ($phone2 !== null && !in_array($phone2, $phones, true)) $phones[] = $phone2;

        $isBuyer = isset($buyerCustomerIds[$cId]);
        $purchaseAmbiguous = isset($ambiguousCustomerIds[$cId]);
        $purchaseStatus = $purchaseAmbiguous ? 'unavailable' : 'verified';

        // The domain evaluator handles channel, class, season/global and
        // customer_id rules; do not classify every active suppression equally.
        $customerSuppressed = $isSuppressed(null, $cId);
        foreach ($phones as $p) {
            if ($isSuppressed($p, $cId)) { $customerSuppressed = true; break; }
        }

        $baseRecord = [
            'source' => 'customer',
            'source_id' => 'customer-' . $cId,
            'name' => $name,
            'email' => $email !== '' ? $email : null,
            'bought_2026' => $isBuyer,
            'purchase_check_status' => $purchaseStatus,
            'suppressed' => $customerSuppressed,
            'suppression_check_status' => 'verified',
            'marketing_allowed' => $legalBasisVerified && !$customerSuppressed,
            'marketing_permission_status' => $legalBasisVerified ? 'verified' : 'unavailable',
            'identity_status' => $purchaseAmbiguous ? 'ambiguous' : 'verified',
        ];

        if (empty($phones)) {
            // Emit phone-less row so email participates in buyer/opt-out exclusion
            $records[] = array_merge($baseRecord, ['phone' => null]);
            $customerRecordsCount++;
        } else {
            foreach ($phones as $phone) {
                $records[] = array_merge($baseRecord, ['phone' => $phone]);
                $customerRecordsCount++;
            }
        }
    }

    // 6. Query Natal 2026 Proposal Contacts & Dispatches.
    // Missing expected flow is a failure, NOT an empty proposal population.
    $proposalRecordsCount = 0;
    $dispatchRecordsCount = 0;
    $scheduledRecordsCount = 0;
    if (!$flow) throw new \RuntimeException('natal_2026_proposal_flow_unavailable');
    if ($flow) {
        $campaignIds = array_values(array_filter(array_unique([
            (int) $flow->with_name_campaign_id,
            (int) $flow->without_name_campaign_id,
        ])));
        if (!$campaignIds) throw new \RuntimeException('natal_2026_flow_has_no_campaign_ids');
        // Only a successfully persisted eligible proposal may enter the
        // candidate list. A failed/aborted/suppressed/duplicate dispatch is
        // NOT proof of a reachable recipient (nor proof of delivery).
        $dispatches = $DB::table('proposal_dispatches')
            ->where('proposal_flow_id', (int) $flow->id)
            ->where('created_at', '>=', '2026-01-01 00:00:00')
            ->where('created_at', '<', '2027-01-01 00:00:00')
            ->where('status', 'scheduled')
            ->whereIn('eligibility_status', ['allowed', 'eligible'])
            ->whereIn('selected_campaign_id', $campaignIds)
            ->whereNull('duplicate_of_id')
            ->get(['id', 'phone_e164', 'resolved_customer_id',
                   'matched_customer_count','customer_resolution_status',
                   'campaign_scheduled_contact_id']);

        foreach ($dispatches as $d) {
            $phone = evyNormalizePhoneE164($d->phone_e164);
            $resCustId = $d->resolved_customer_id !== null ? (int) $d->resolved_customer_id : null;
            if ($resCustId !== null && !isset($knownCustomerIds[$resCustId]))
                throw new \RuntimeException('proposal_resolved_customer_missing');
            $isBuyer = ($resCustId !== null && isset($buyerCustomerIds[$resCustId]));
            $resolvedCustomerAmbiguous = $resCustId !== null
                && isset($ambiguousCustomerIds[$resCustId]);
            $dispatchIdentityAmbiguous = $resolvedCustomerAmbiguous
                || (int) $d->matched_customer_count > 1
                || str_contains(strtolower((string) $d->customer_resolution_status), 'ambig');

            $dispatchSuppressed = $isSuppressed($phone, $resCustId);

            $records[] = [
                'source' => 'proposal_2026',
                'source_id' => 'proposal-' . $d->id,
                'phone' => $phone,
                'email' => null,
                'name' => '',
                'bought_2026' => $isBuyer,
                'purchase_check_status' => $resolvedCustomerAmbiguous ? 'unavailable' : 'verified',
                'suppressed' => $dispatchSuppressed,
                'suppression_check_status' => 'verified',
                'marketing_allowed' => $legalBasisVerified && !$dispatchSuppressed,
                'marketing_permission_status' => $legalBasisVerified ? 'verified' : 'unavailable',
                'identity_status' => $dispatchIdentityAmbiguous ? 'ambiguous' : 'verified',
            ];
            $proposalRecordsCount++;
            $dispatchRecordsCount++;
        }

        // Only audit legacy scheduled-only contacts; not proof of a quote request.
        // Campaign ID and season scope must agree; no OR ambiguity.
        // Legacy scheduled contacts may be unsolicited, not sent, or merely
        // reserved. They are an audit metric, NOT automatically quote requests.
        // Every eligible proposal is already represented by a qualified
        // proposal_dispatch above. Do not export scheduled-only contacts.
        $scheduledRecordsCount = (int) $DB::table('campaign_scheduled_contacts as cc')
            ->join('campaign_scheduleds as cs', 'cs.id', '=', 'cc.campaign_scheduled_id')
            ->where('cs.created_at', '>=', '2026-01-01 00:00:00')
            ->where('cs.created_at', '<', '2027-01-01 00:00:00')
            ->whereIn('cs.campaign_id', $campaignIds)
            ->where('cs.suppression_scope_key', 'natal:2026')
            ->whereNotExists(function ($query) use ($flow) {
                $query->selectRaw('1')
                    ->from('proposal_dispatches as pd')
                    ->whereColumn('pd.campaign_scheduled_contact_id', 'cc.id')
                    ->where('pd.proposal_flow_id', (int) $flow->id);
            })->count();

    }

    $coverage = [
        'snapshot_id' => $snapshotId,
        'as_of' => $asOf,
        'target_year' => 2026,
        'purchase_rule' => 'ANY_VALID_PURCHASE_2026',
        'customers_complete' => true,
        'proposals_complete' => true,
        'purchases_2026_complete' => true,
        'suppression_complete' => true,
        'marketing_permission_complete' => $legalBasisVerified,
        'identity_crosscheck_complete' => true,
        'source_counts' => [
            // record count includes multiple verified phones per customer
            'customers' => $customerRecordsCount,
            'proposals' => $proposalRecordsCount,
        ],
        'origin_quality' => [
            'unique_customers' => $uniqueCustomerCount,
            'candidate_orders_created_2026' => count($orders2026),
            'installments_paid_in_2026' => count($paidInstallments2026),
            'suppression_rules_examined' => count($suppressionRows),
            'buyer_customer_ids' => count($buyerCustomerIds),
            'ambiguous_customer_ids' => count($ambiguousCustomerIds),
            'proposal_dispatch_rows' => $dispatchRecordsCount,
            'scheduled_only_not_exported' => $scheduledRecordsCount,
            'dispatch_scheduled_does_not_prove_delivered' => true,
            'scheduled_does_not_prove_quote_requested' => true,
        ],
    ];

    $response = [
        'source' => 'CRM_META_AUDIENCE_READ_ONLY',
        'snapshot_id' => $snapshotId,
        'as_of' => $asOf,
        'coverage' => $coverage,
        'records' => $records,
        'audience_query_telemetry' => [
            'sql_count' => $metaSql->count,
            'sql_ms' => round($metaSql->ms, 2),
        ],
    ];

} catch (\Throwable $error) {
    // Never serialize exception messages, SQL, parameters or PII. Preserve a
    // small, actionable code for the authenticated operator and audit log.
    $known = [
        'meta_audience_suppression_hash_mismatch',
        'paid_2026_orders_missing_referential_integrity',
        'order_without_customer_relation',
        'proposal_resolved_customer_missing',
        'natal_2026_proposal_flow_unavailable',
        'natal_2026_flow_has_no_campaign_ids',
    ];
    $reason = in_array($error->getMessage(), $known, true)
        ? $error->getMessage() : 'meta_audience_source_unavailable';
    $response = [
        'source' => 'CRM_META_AUDIENCE_READ_ONLY',
        'available' => false,
        'reason' => $reason,
        'contains_personal_data' => false,
        'export_enabled' => false,
        'audience_query_telemetry' => [
            'sql_count' => $metaSql->count,
            'sql_ms' => round($metaSql->ms, 2),
        ],
    ];

} finally {
    // emitForensicJson exits the process. It MUST happen after rollback,
    // never inside the transaction (where PHP exit can skip finally).
    \Illuminate\Support\Facades\DB::rollBack();
}
emitForensicJson($response, $forensicStartedMs);
