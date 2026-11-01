<?php
declare(strict_types=1);

/**
 * Pure commercial decision for Meta 2026 audience exclusion.
 * Mirrors App\\Enums\\OrderStatus, but NEVER mutates the CRM or trusts a
 * 'waiting_payment' order without a positive paid installment.
 *
 * @param array<int,array{status:?string,has_status:bool,created_2026:bool,paid_2026:bool}> $orders
 * @return array{buyer:bool,ambiguous:bool}
 */
function evyMetaAudienceClassifyPurchases2026(array $orders): array
{
    $paidOrFulfilled = array_fill_keys([
        'payment_confirmed', 'session_schedule', 'session_schedule_confirmed',
        'selection_schedule', 'selection_schedule_confirmed',
        'waiting_product_retrieve', 'product_retrieve_confirmed', 'order_completed',
    ], true);
    $reversed = array_fill_keys([
        'order_aborted', 'payment_chargeback', 'payment_refunded',
    ], true);
    $pending = ['waiting_payment' => true, 'order_created' => true];

    $buyer = false;
    $ambiguous = false;
    foreach ($orders as $order) {
        if (($order['has_status'] ?? false) !== true) {
            $ambiguous = true;
            continue;
        }
        $status = (string)($order['status'] ?? '');
        $paid = ($order['paid_2026'] ?? false) === true;
        $created = ($order['created_2026'] ?? false) === true;

        if (isset($reversed[$status])) {
            // Even a refunded 2026 transaction is a commercial relationship:
            // quarantine its identity pending operator/legal policy review.
            if ($paid) $ambiguous = true;
            continue;
        }
        if ($paid && (isset($paidOrFulfilled[$status]) || isset($pending[$status]))) {
            $buyer = true;
            continue;
        }
        if ($created && isset($paidOrFulfilled[$status])) {
            $buyer = true;
            continue;
        }
        if ($paid || !isset($pending[$status])) $ambiguous = true;
    }
    return ['buyer' => $buyer, 'ambiguous' => $ambiguous];
}
