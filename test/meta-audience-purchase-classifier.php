<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/scripts/crm-meta-audience-purchase-classifier.php';

function verifyMetaDecision(string $name, array $orders, bool $buyer, bool $ambiguous): void
{
    $result = evyMetaAudienceClassifyPurchases2026($orders);
    if ($result !== ['buyer' => $buyer, 'ambiguous' => $ambiguous]) {
        fwrite(STDERR, "FAIL: {$name}\n");
        exit(1);
    }
}
function syntheticMetaOrder(string $status, bool $created = true, bool $paid = false, bool $has = true): array
{
    return ['status' => $status, 'created_2026' => $created,
        'paid_2026' => $paid, 'has_status' => $has];
}
verifyMetaDecision('no purchase', [], false, false);
verifyMetaDecision('waiting payment', [syntheticMetaOrder('waiting_payment')], false, false);
verifyMetaDecision('confirmed in 2026', [syntheticMetaOrder('payment_confirmed')], true, false);
verifyMetaDecision('session finished in 2026', [syntheticMetaOrder('session_schedule_confirmed')], true, false);
verifyMetaDecision('paid in 2026 but old order', [syntheticMetaOrder('waiting_payment', false, true)], true, false);
verifyMetaDecision('paid in 2026 completed order', [syntheticMetaOrder('order_completed', false, true)], true, false);
verifyMetaDecision('unpaid aborted', [syntheticMetaOrder('order_aborted')], false, false);
verifyMetaDecision('paid refunded quarantined', [syntheticMetaOrder('payment_refunded', true, true)], false, true);
verifyMetaDecision('chargeback paid quarantined', [syntheticMetaOrder('payment_chargeback', true, true)], false, true);
verifyMetaDecision('unknown state quarantined', [syntheticMetaOrder('session_finished')], false, true);
verifyMetaDecision('missing status quarantined', [syntheticMetaOrder('', true, false, false)], false, true);
verifyMetaDecision('buyer plus ambiguous', [
    syntheticMetaOrder('payment_confirmed'),
    syntheticMetaOrder('unknown'),
], true, true);
verifyMetaDecision('paid unknown state quarantined', [syntheticMetaOrder('unknown', false, true)], false, true);
fwrite(STDOUT, "META_AUDIENCE_PURCHASE_CLASSIFIER: 13/13 synthetic cases PASS\n");
