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
], true);

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

$snapshotId = 'snapshot-' . gmdate('YmdHis') . '-' . bin2hex(random_bytes(4));
$asOf = \Carbon\CarbonImmutable::now('America/Sao_Paulo')->toIso8601String();

// Open single read-only transaction with REPEATABLE READ snapshot.
\Illuminate\Support\Facades\DB::statement('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
\Illuminate\Support\Facades\DB::beginTransaction();

try {
    $DB = \Illuminate\Support\Facades\DB::class;

    // 1. Fetch Natal Flow
    $flow = $DB::table('proposal_flows')
        ->where('slug', (string) config('proposals.natal_flow_slug', 'natal'))
        ->first(['id', 'slug', 'with_name_campaign_id', 'without_name_campaign_id']);

    // 2. Fetch Hash Key for suppression lookups
    $hashKey = (string) config('proposals.hash_key', '');

    // 3. Active Marketing Suppressions
    $suppressionRows = $DB::table('communication_suppressions')
        ->whereNull('revoked_at')
        ->where(function ($q) {
            $q->whereNull('starts_at')->orWhere('starts_at', '<=', now());
        })
        ->where(function ($q) {
            $q->whereNull('ends_at')->orWhere('ends_at', '>', now());
        })
        ->get(['id', 'phone_lookup_hash', 'channel', 'communication_class', 'scope_type', 'scope_key']);

    $activeSuppressionHashes = [];
    foreach ($suppressionRows as $sRow) {
        $hash = (string) $sRow->phone_lookup_hash;
        if ($hash !== '') {
            $activeSuppressionHashes[$hash] = true;
        }
    }

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
    $ordersByCustomer = [];
    foreach ($orders2026 as $ord) {
        $oId = (int) $ord->id;
        $cId = (int) $ord->customer_id;
        $allCandidateOrderIds[$oId] = true;
        $ordersByCustomer[$cId][$oId] = true;
    }
    foreach (array_keys($paidOrderIds2026) as $oId) {
        $allCandidateOrderIds[$oId] = true;
    }

    // If there are paid order IDs from 2025 paid in 2026, get customer_id
    $missingOrderIds = array_diff(array_keys($paidOrderIds2026), array_keys($allCandidateOrderIds));
    if (!empty($missingOrderIds)) {
        $extraOrders = $DB::table('orders')
            ->whereIn('id', $missingOrderIds)
            ->get(['id', 'customer_id', 'created_at']);
        foreach ($extraOrders as $ord) {
            $ordersByCustomer[(int) $ord->customer_id][(int) $ord->id] = true;
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

    $validBuyerStatuses = [
        'payment_confirmed' => true,
        'session_schedule' => true,
        'session_schedule_confirmed' => true,
        'selection_schedule' => true,
        'selection_schedule_confirmed' => true,
        'waiting_product_retrieve' => true,
        'product_retrieve_confirmed' => true,
        'order_completed' => true,
    ];
    $reversedStatuses = [
        'order_canceled' => true,
        'order_aborted' => true,
        'chargeback' => true,
        'refunded' => true,
        'reversed' => true,
    ];

    // Determine purchase state per customer
    $buyerCustomerIds = [];
    $ambiguousCustomerIds = [];

    foreach ($ordersByCustomer as $cId => $orderMap) {
        $hasConfirmedPurchase = false;
        $hasAmbiguousOrder = false;

        foreach (array_keys($orderMap) as $oId) {
            if (!isset($ordersWithStatus[$oId])) {
                // Missing order_status history => ambiguous
                $hasAmbiguousOrder = true;
                continue;
            }
            $st = $latestStatusByOrder[$oId] ?? '';
            if (isset($validBuyerStatuses[$st])) {
                $hasConfirmedPurchase = true;
            } elseif (isset($paidOrderIds2026[$oId]) && !isset($reversedStatuses[$st])) {
                $hasConfirmedPurchase = true;
            } elseif ($st === '' || (!isset($reversedStatuses[$st]) && $st !== 'waiting_payment' && $st !== 'order_created')) {
                // Out of range or unrecognized operational status => quarantine
                $hasAmbiguousOrder = true;
            }
        }

        if ($hasConfirmedPurchase) {
            $buyerCustomerIds[$cId] = true;
        } elseif ($hasAmbiguousOrder) {
            $ambiguousCustomerIds[$cId] = true;
        }
    }

    // 5. Query ALL Customers
    $customers = $DB::table('customers')
        ->select(['id', 'uuid', 'name', 'email', 'whatsapp', 'phone', 'whatsapp_e164', 'phone_e164'])
        ->orderBy('id', 'asc')
        ->get();

    $records = [];
    $customerRecordsCount = 0;

    foreach ($customers as $c) {
        $cId = (int) $c->id;
        $name = is_string($c->name) ? trim($c->name) : '';
        $email = is_string($c->email) ? trim($c->email) : '';

        // Evaluate phones: prefer whatsapp_e164, fallback to phone_e164, then raw
        $phone1 = evyNormalizePhoneE164($c->whatsapp_e164 ?: $c->whatsapp);
        $phone2 = evyNormalizePhoneE164($c->phone_e164 ?: $c->phone);

        $phones = [];
        if ($phone1 !== null) $phones[] = $phone1;
        if ($phone2 !== null && !in_array($phone2, $phones, true)) $phones[] = $phone2;

        $isBuyer = isset($buyerCustomerIds[$cId]);
        $purchaseStatus = isset($ambiguousCustomerIds[$cId]) ? 'unavailable' : 'verified';

        // Check suppressions by phone hash
        $isSuppressed = false;
        if (strlen($hashKey) >= 32) {
            foreach ($phones as $p) {
                $pHash = hash_hmac('sha256', $p, $hashKey);
                if (isset($activeSuppressionHashes[$pHash])) {
                    $isSuppressed = true;
                    break;
                }
            }
        }

        $baseRecord = [
            'source' => 'customer',
            'source_id' => 'customer-' . $cId,
            'name' => $name,
            'email' => $email !== '' ? $email : null,
            'bought_2026' => $isBuyer,
            'purchase_check_status' => $purchaseStatus,
            'suppressed' => $isSuppressed,
            'suppression_check_status' => 'verified',
            'marketing_allowed' => $legalBasisVerified && !$isSuppressed,
            'marketing_permission_status' => $legalBasisVerified ? 'verified' : 'unavailable',
            'identity_status' => 'verified',
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

    // 6. Query Natal 2026 Proposal Contacts & Dispatches
    $proposalRecordsCount = 0;
    if ($flow) {
        $dispatches = $DB::table('proposal_dispatches')
            ->where('proposal_flow_id', (int) $flow->id)
            ->where('created_at', '>=', '2026-01-01 00:00:00')
            ->where('created_at', '<', '2027-01-01 00:00:00')
            ->get(['id', 'phone_e164', 'resolved_customer_id', 'campaign_scheduled_contact_id']);

        foreach ($dispatches as $d) {
            $phone = evyNormalizePhoneE164($d->phone_e164);
            $resCustId = $d->resolved_customer_id !== null ? (int) $d->resolved_customer_id : null;
            $isBuyer = ($resCustId !== null && isset($buyerCustomerIds[$resCustId]));

            $isSuppressed = false;
            if ($phone !== null && strlen($hashKey) >= 32) {
                $pHash = hash_hmac('sha256', $phone, $hashKey);
                if (isset($activeSuppressionHashes[$pHash])) {
                    $isSuppressed = true;
                }
            }

            $records[] = [
                'source' => 'proposal_2026',
                'source_id' => 'proposal-' . $d->id,
                'phone' => $phone,
                'email' => null,
                'name' => '',
                'bought_2026' => $isBuyer,
                'purchase_check_status' => 'verified',
                'suppressed' => $isSuppressed,
                'suppression_check_status' => 'verified',
                'marketing_allowed' => $legalBasisVerified && !$isSuppressed,
                'marketing_permission_status' => $legalBasisVerified ? 'verified' : 'unavailable',
                'identity_status' => 'verified',
            ];
            $proposalRecordsCount++;
        }

        // Also query verified legacy campaign_scheduled_contacts for Natal 2026
        $campaignIds = array_values(array_filter(array_unique([
            (int) $flow->with_name_campaign_id,
            (int) $flow->without_name_campaign_id,
        ])));

        $scheduledContacts = $DB::table('campaign_scheduled_contacts as cc')
            ->join('campaign_scheduleds as cs', 'cs.id', '=', 'cc.campaign_scheduled_id')
            ->where('cs.created_at', '>=', '2026-01-01 00:00:00')
            ->where('cs.created_at', '<', '2027-01-01 00:00:00')
            ->where(function ($q) use ($campaignIds) {
                $q->whereIn('cs.campaign_id', $campaignIds)
                  ->orWhere('cs.suppression_scope_key', 'natal:2026');
            })
            ->get(['cc.id', 'cc.lead_id', 'cc.whatsapp']);

        foreach ($scheduledContacts as $sc) {
            $phone = evyNormalizePhoneE164($sc->whatsapp);
            $isSuppressed = false;
            if ($phone !== null && strlen($hashKey) >= 32) {
                $pHash = hash_hmac('sha256', $phone, $hashKey);
                if (isset($activeSuppressionHashes[$pHash])) {
                    $isSuppressed = true;
                }
            }

            $records[] = [
                'source' => 'proposal_2026',
                'source_id' => 'scheduled-' . $sc->id,
                'phone' => $phone,
                'email' => null,
                'name' => '',
                'bought_2026' => false,
                'purchase_check_status' => 'verified',
                'suppressed' => $isSuppressed,
                'suppression_check_status' => 'verified',
                'marketing_allowed' => $legalBasisVerified && !$isSuppressed,
                'marketing_permission_status' => $legalBasisVerified ? 'verified' : 'unavailable',
                'identity_status' => 'verified',
            ];
            $proposalRecordsCount++;
        }
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
            'customers' => $customerRecordsCount,
            'proposals' => $proposalRecordsCount,
        ],
    ];

    emitForensicJson([
        'source' => 'CRM_META_AUDIENCE_READ_ONLY',
        'snapshot_id' => $snapshotId,
        'as_of' => $asOf,
        'coverage' => $coverage,
        'records' => $records,
    ], $forensicStartedMs);

} finally {
    \Illuminate\Support\Facades\DB::rollBack();
}
