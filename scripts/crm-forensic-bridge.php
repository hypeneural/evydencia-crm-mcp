<?php
declare(strict_types=1);

/**
 * Read-only forensic CLI bridge for Evydencia CRM Live MCP.
 * Bootstraps Laravel models/enums/services on the CRM host under MySQL READ ONLY session guard
 * to provide 100% parity with management screens (/gestao/pedidos, /gestao/pedidos/$UUID/detalhes,
 * /gestao/clientes) without modifying any file in /var/www/evydencia/current.
 */

$appBase = getenv('EVYD_CRM_APP_PATH') ?: '/var/www/evydencia/current';
$autoload = rtrim($appBase, '/\\') . '/vendor/autoload.php';
$bootstrap = rtrim($appBase, '/\\') . '/bootstrap/app.php';

if (!is_file($autoload) || !is_file($bootstrap)) {
    fwrite(STDERR, json_encode(['error' => 'crm_forensic_bridge_unavailable']) . "\n");
    exit(2);
}

$rawInput = $argv[1] ?? '';
if ($rawInput === '' || $rawInput === '-') {
    $rawInput = stream_get_contents(STDIN) ?: '{}';
}
$payload = json_decode($rawInput, true);
if (!is_array($payload)) {
    fwrite(STDERR, json_encode(['error' => 'crm_forensic_invalid_input']) . "\n");
    exit(3);
}

require $autoload;
$app = require $bootstrap;
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Models\Customer;
use App\Models\Order;
use App\Services\Order\OrderCalculator;
use App\Services\Order\OrderListMoney;
use App\Services\Order\Queries\OrderListOpenInstallmentCondition;
use App\Services\PagarmeCardProfileService;
use App\ViewData\OrderParticipantManagementViewData;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// Enforce mathematical read-only safety at the database session and query-listener levels.
DB::statement('SET SESSION TRANSACTION READ ONLY');
$conn = DB::connection();
if (method_exists($conn, 'beforeExecuting')) {
    $conn->beforeExecuting(static function (string $query): void {
        if (!preg_match('/^\s*(select|show|describe|explain|set\s+session\s+transaction\s+read\s+only)\b/i', $query)) {
            throw new RuntimeException('forensic_bridge_write_blocked');
        }
    });
}

$tz = 'America/Sao_Paulo';
$todayBrt = CarbonImmutable::now($tz)->startOfDay();
$cardSvc = app(PagarmeCardProfileService::class);

function toCarbonBrt(mixed $value, string $tz = 'America/Sao_Paulo'): ?CarbonImmutable
{
    if ($value === null || $value === '') {
        return null;
    }
    try {
        if ($value instanceof DateTimeInterface) {
            return CarbonImmutable::instance($value)->setTimezone($tz);
        }
        $str = trim((string) $value);
        if ($str === '' || str_starts_with($str, '0000-00-00')) {
            return null;
        }
        return CarbonImmutable::parse($str, $tz)->setTimezone($tz);
    } catch (Throwable) {
        return null;
    }
}

function formatBrt(mixed $value, string $tz = 'America/Sao_Paulo'): ?string
{
    return toCarbonBrt($value, $tz)?->format('Y-m-d H:i:s');
}

function centsOf(mixed $amount): int
{
    if ($amount === null || $amount === '') {
        return 0;
    }
    return OrderListMoney::fromDatabaseDecimal($amount);
}

function reaisOfCents(int $cents): float
{
    return round($cents / 100, 2);
}

function enumInt(mixed $v): ?int
{
    if ($v === null) {
        return null;
    }
    if (is_int($v)) {
        return $v;
    }
    if (is_object($v) && isset($v->value) && is_numeric($v->value)) {
        return (int) $v->value;
    }
    if (is_numeric($v)) {
        return (int) $v;
    }
    return null;
}

function enumProp(mixed $v, string $prop): ?string
{
    if (is_object($v) && isset($v->{$prop}) && is_string($v->{$prop}) && $v->{$prop} !== '') {
        return $v->{$prop};
    }
    return null;
}

function scalarOrEnumString(mixed $v): ?string
{
    if ($v === null || $v === '') {
        return null;
    }
    if (is_string($v) || is_int($v) || is_float($v)) {
        return trim((string) $v) ?: null;
    }
    if (is_object($v)) {
        if (isset($v->key) && is_string($v->key)) {
            return $v->key;
        }
        if (isset($v->value) && is_scalar($v->value)) {
            return (string) $v->value;
        }
    }
    return null;
}

function customerInitials(?string $name): string
{
    $parts = preg_split('/\s+/u', trim((string) $name), -1, PREG_SPLIT_NO_EMPTY);
    if (!$parts) {
        return '?';
    }
    return mb_strtoupper(mb_substr($parts[0], 0, 1) . (count($parts) > 1 ? mb_substr((string) end($parts), 0, 1) : ''));
}

function maskPhoneBr(?string $raw): ?string
{
    $d = preg_replace('/\D/', '', (string) $raw);
    if ($d === '' || strlen($d) < 4) {
        return null;
    }
    return '(**) *****-' . substr($d, -4);
}

function humanAgeAt(?string $birthYmd, CarbonImmutable $refDate): ?string
{
    if ($birthYmd === null || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthYmd) || str_starts_with($birthYmd, '0000-')) {
        return null;
    }
    try {
        $b = CarbonImmutable::createFromFormat('Y-m-d', $birthYmd, 'America/Sao_Paulo')->startOfDay();
    } catch (Throwable) {
        return null;
    }
    if ($b->greaterThan($refDate)) {
        return null;
    }
    $diff = $b->diff($refDate);
    $years = (int) $diff->y;
    $months = (int) $diff->m;
    $days = (int) $diff->d;

    if ($years === 0 && $months === 0) {
        return $days <= 1 ? 'recém-nascido' : "{$days} dias";
    }
    $parts = [];
    if ($years > 0) {
        $parts[] = $years === 1 ? '1 ano' : "{$years} anos";
    }
    if ($months > 0) {
        $parts[] = $months === 1 ? '1 mês' : "{$months} meses";
    }
    return implode(' e ', $parts);
}

function yearsAt(?string $birthYmd, CarbonImmutable $refDate): ?int
{
    if ($birthYmd === null || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthYmd) || str_starts_with($birthYmd, '0000-')) {
        return null;
    }
    try {
        $b = CarbonImmutable::createFromFormat('Y-m-d', $birthYmd, 'America/Sao_Paulo')->startOfDay();
    } catch (Throwable) {
        return null;
    }
    if ($b->greaterThan($refDate)) {
        return null;
    }
    return (int) $b->diff($refDate)->y;
}

function safeCustomerUrl(string $uuid): string
{
    try {
        $url = route('manager.customer.read', $uuid);
        if (is_string($url) && str_starts_with($url, 'https://evydencia.com/')) {
            return $url;
        }
    } catch (Throwable) {
        // Fallback to canonical CRM URL below
    }
    return "https://evydencia.com/gestao/clientes/{$uuid}/consultar";
}

function projectCustomer(?Customer $c, bool $fullProfile, PagarmeCardProfileService $cardSvc): ?array
{
    if (!$c) {
        return null;
    }
    $avatarUrl = $c->getAvatarUrl();
    $readiness = $cardSvc->check($c);
    $missingFields = array_values($readiness->missingFields ?? []);
    $missingLabels = $cardSvc->humanizeMissingFields($missingFields);

    $base = [
        'id' => (int) $c->id,
        'uuid' => $c->uuid,
        'crm_customer_url' => $c->uuid ? safeCustomerUrl($c->uuid) : null,
        'name' => $c->name,
        'customer_since_brt' => formatBrt($c->created_at),
        'updated_at_brt' => formatBrt($c->updated_at),
        'phone_masked' => maskPhoneBr($c->whatsapp ?: $c->phone),
        'avatar' => [
            'has_avatar' => $avatarUrl !== null,
            'url' => $avatarUrl,
            'revision' => (int) ($c->avatar_revision ?? 0),
            'initials' => customerInitials($c->name),
            'asset_accessible' => $avatarUrl !== null ? null : false,
            'asset_check_status' => 'not_checked',
        ],
        'registration_completeness' => [
            'is_complete_for_card' => (bool) $readiness->ready,
            'status_label' => $readiness->ready ? 'Cadastro completo' : 'Cadastro incompleto',
            'missing_fields' => $missingFields,
            'missing_field_labels' => $missingLabels,
        ],
    ];

    if ($fullProfile) {
        $birthStr = null;
        if ($c->birth !== null && $c->birth !== '') {
            $birthStr = $c->birth instanceof DateTimeInterface
                ? CarbonImmutable::instance($c->birth)->format('Y-m-d')
                : substr((string) $c->birth, 0, 10);
        }
        $docTypeStr = scalarOrEnumString($c->document_type);
        $base['email'] = $c->email ?: null;
        $base['document_type'] = $docTypeStr ? strtoupper($docTypeStr) : null;
        $base['document'] = $c->document ?: null;
        $base['whatsapp'] = $c->whatsapp ?: null;
        $base['whatsapp_e164'] = $c->whatsapp_e164 ?: null;
        $base['phone'] = $c->phone ?: null;
        $base['birth_date'] = ($birthStr && !str_starts_with($birthStr, '0000-')) ? $birthStr : null;
        $base['address'] = [
            'zipcode' => $c->zipcode ?: null,
            'street' => $c->street ?: null,
            'number' => $c->number ?: null,
            'district' => $c->district ?: null,
            'city' => $c->city?->name ?: null,
            'state' => $c->city?->state?->abbr ?: null,
        ];
    }

    return $base;
}

function resolvePaymentEnum(?object $paymentMethod): ?PaymentMethod
{
    if (!$paymentMethod) {
        return null;
    }
    $raw = method_exists($paymentMethod, 'getRawOriginal')
        ? $paymentMethod->getRawOriginal('method')
        : ($paymentMethod->method ?? null);
    if ($raw instanceof PaymentMethod) {
        return $raw;
    }
    if (is_string($raw) && ctype_digit($raw)) {
        return PaymentMethod::coerce((int) $raw);
    }
    return PaymentMethod::coerce($raw);
}

/**
 * Projects a collection of Eloquent Orders with batch-loaded status history, bonus applications,
 * open installment aggregates, participant completion state, and customer avatars.
 */
function projectOrdersBatch(
    Collection $orders,
    bool $fullProfile,
    PagarmeCardProfileService $cardSvc,
    CarbonImmutable $todayBrt,
    string $detailLevel = 'forense'
): array {
    if ($orders->isEmpty()) {
        return [];
    }

    $isSummaryOnly = ($detailLevel === 'resumo');
    $includeCalendarSync = ($detailLevel === 'forense');

    $orders->loadMissing([
        'customer.city.state',
        'items.product',
        'installments.paymentMethod',
        'installments.transactions',
        'installments.bills',
        'participants.relation',
        'coupon',
        'cake',
    ]);

    $calendarUiSvc = null;
    if ($includeCalendarSync && class_exists(\App\Services\Calendar\Presentation\OrderCalendarUiStateService::class)) {
        try {
            $calendarUiSvc = app(\App\Services\Calendar\Presentation\OrderCalendarUiStateService::class);
        } catch (Throwable) {
            $calendarUiSvc = null;
        }
    }

    $orderIds = $orders->modelKeys();

    $openByOrder = collect();
    try {
        $openByOrder = (new OrderListOpenInstallmentCondition())->apply(
            DB::table('orders_installments')->whereIn('order_id', $orderIds)
        )->selectRaw('order_id, COUNT(*) as open_count, SUM(total) as open_total')
            ->groupBy('order_id')
            ->get()
            ->keyBy('order_id');
    } catch (Throwable) {
        $openByOrder = DB::table('orders_installments')
            ->whereIn('order_id', $orderIds)
            ->whereNull('payment_at')
            ->where('total', '>', 0)
            ->selectRaw('order_id, COUNT(*) as open_count, SUM(total) as open_total')
            ->groupBy('order_id')
            ->get()
            ->keyBy('order_id');
    }

    $statusRowsByOrder = DB::table('orders_status')
        ->whereIn('order_id', $orderIds)
        ->orderBy('id')
        ->get(['id', 'order_id', 'status', 'created_at', 'updated_at'])
        ->groupBy('order_id');

    $bonusRowsByOrder = DB::table('order_bonus_applications')
        ->whereIn('order_id', $orderIds)
        ->orderBy('id')
        ->get()
        ->groupBy('order_id');

    $projected = [];

    foreach ($orders as $order) {
        $calc = new OrderCalculator($order);
        $subtotalCents = centsOf($calc->subtotal());
        $discountItemsCents = centsOf($calc->discount_items());
        $couponAmountCents = centsOf($order->coupon_amount);
        $totalDiscountCents = centsOf($calc->discount_total());
        $commercialCents = centsOf($calc->total());
        $receivedCents = $order->installments->sum(static fn ($i) => centsOf($i->payment_total));
        $remainingCents = centsOf($calc->total_remaining());

        $openRow = $openByOrder->get($order->id);
        $openCount = (int) ($openRow->open_count ?? 0);
        $openCents = centsOf($openRow->open_total ?? 0);

        $statusCollection = $statusRowsByOrder->get($order->id, collect())->values();
        $totalStatuses = $statusCollection->count();
        $statusHistory = $statusCollection->map(static function ($entry, int $idx) use ($totalStatuses): array {
            $coerced = OrderStatus::coerce($entry->status);
            $recBrt = formatBrt($entry->created_at);
            $updBrt = formatBrt($entry->updated_at);
            return [
                'event_id' => (int) $entry->id,
                'status_id' => $coerced?->value ?? null,
                'status_key' => $coerced?->key ?? (string) $entry->status,
                'status_label' => $coerced?->description ?? (string) $entry->status,
                'recorded_at_brt' => $recBrt,
                'updated_at_brt' => ($updBrt !== null && $updBrt !== $recBrt) ? $updBrt : null,
                'is_current' => $idx === ($totalStatuses - 1),
            ];
        })->all();

        $currentStatusEnum = $order->currentStatus();
        $currentStatusKey = $currentStatusEnum?->key ?? ($statusHistory ? end($statusHistory)['status_key'] : null);

        // Financial review checks (same invariants as OrderListRowProjectionService)
        $reviewReasons = [];
        if ($order->installments->isEmpty()) {
            $reviewReasons[] = 'no_installments';
        }
        foreach ($order->installments as $instCheck) {
            $tCents = centsOf($instCheck->total);
            $pCents = centsOf($instCheck->payment_total);
            if ($instCheck->total === null || $tCents < 0 || $pCents < 0) {
                $reviewReasons[] = 'invalid_amount';
            }
            if (($pCents > 0 && $instCheck->payment_at === null)
                || ($tCents > 0 && $instCheck->payment_at !== null && $pCents <= 0)) {
                $reviewReasons[] = 'payment_date_amount_mismatch';
            }
        }
        if ($commercialCents < 0 || $commercialCents !== ($receivedCents + $openCents)) {
            $reviewReasons[] = 'commercial_balance_mismatch';
        }
        if ($openCents > 0 && in_array($currentStatusKey, ['order_aborted', 'payment_chargeback', 'payment_refunded'], true)) {
            $reviewReasons[] = 'reversed_order_with_balance';
        }
        $reviewReasons = array_values(array_unique($reviewReasons));
        $reversed = in_array($currentStatusKey, ['order_aborted', 'payment_chargeback', 'payment_refunded'], true);
        $paymentNeedsReview = $reviewReasons !== [] || $reversed;

        // Installments projection
        $effectivePaidByMethodCents = [];
        $effectivePaidMethods = [];
        $configuredMethods = [];
        $paidMethodCategories = [];
        $paidInstallmentsCount = 0;

        $installmentsOut = $order->installments->sortBy('installment')->values()->map(
            static function ($inst) use (
                &$effectivePaidByMethodCents,
                &$effectivePaidMethods,
                &$configuredMethods,
                &$paidMethodCategories,
                &$paidInstallmentsCount
            ): array {
                $totalCents = centsOf($inst->total);
                $paidCents = centsOf($inst->payment_total);
                $paidAtBrt = formatBrt($inst->payment_at);
                $isPaid = $paidAtBrt !== null && $paidCents > 0;
                if ($isPaid) {
                    $paidInstallmentsCount++;
                }

                $pm = $inst->paymentMethod;
                $enum = resolvePaymentEnum($pm);
                $methodName = ($pm && is_string($pm->name) && trim($pm->name) !== '')
                    ? trim($pm->name)
                    : ($enum?->description ?? null);
                $categoryKey = $enum?->key ?? null;
                $categoryLabel = $enum?->description ?? null;

                if ($methodName !== null) {
                    $configuredMethods[] = $methodName;
                }
                if ($isPaid) {
                    $effKey = $methodName ?? 'Método não informado';
                    $effectivePaidMethods[] = $effKey;
                    $effectivePaidByMethodCents[$effKey] = ($effectivePaidByMethodCents[$effKey] ?? 0) + $paidCents;
                    if ($categoryLabel !== null) {
                        $paidMethodCategories[] = $categoryLabel;
                    }
                }

                $txOut = $isSummaryOnly
                    ? []
                    : $inst->transactions->sortBy('id')->values()->map(static fn ($tx): array => [
                        'transaction_id' => (int) $tx->id,
                        'status_code' => enumInt($tx->status),
                        'status_key' => enumProp($tx->status, 'key'),
                        'status_label' => enumProp($tx->status, 'description'),
                        'message' => scalarOrEnumString($tx->message),
                        'gateway_order_or_tx_id' => scalarOrEnumString($tx->original_id),
                        'gateway_status' => scalarOrEnumString($tx->original_status),
                        'gateway_reference' => scalarOrEnumString($tx->original_message),
                        'recorded_at_brt' => formatBrt($tx->created_at),
                    ])->all();

                $billsOut = $isSummaryOnly
                    ? []
                    : $inst->bills->sortBy('id')->values()->map(static function ($b): array {
                        $bAmountCents = centsOf($b->amount);
                        $bPaidCents = centsOf($b->payment_total);
                        return [
                            'bill_id' => (int) $b->id,
                            'installment' => enumInt($b->installment),
                            'status_key' => enumProp($b->status, 'key') ?? scalarOrEnumString($b->status),
                            'status_label' => enumProp($b->status, 'description'),
                            'type_key' => enumProp($b->type, 'key') ?? scalarOrEnumString($b->type),
                            'type_label' => enumProp($b->type, 'description'),
                            'amount_cents' => $bAmountCents,
                            'amount_reais' => reaisOfCents($bAmountCents),
                            'paid_cents' => $bPaidCents,
                            'paid_reais' => reaisOfCents($bPaidCents),
                            'expiry_at_brt' => formatBrt($b->expiry_at),
                            'closed_at_brt' => formatBrt($b->closed_at),
                            'aborted_at_brt' => formatBrt($b->aborted_at),
                            'note' => scalarOrEnumString($b->note),
                        ];
                    })->all();

                $discInstCents = centsOf($inst->discount);
                $incInstCents = centsOf($inst->increase);
                $finesInstCents = centsOf($inst->fines);
                $intInstCents = centsOf($inst->interest);

                return [
                    'installment_id' => (int) $inst->id,
                    'number' => $inst->installment !== null ? (int) $inst->installment : null,
                    'card_split_count' => $inst->installments !== null ? (int) $inst->installments : 1,
                    'expiry_at_brt' => formatBrt($inst->expiry_at),
                    'total_reais' => reaisOfCents($totalCents),
                    'total_cents' => $totalCents,
                    'paid_reais' => reaisOfCents($paidCents),
                    'paid_cents' => $paidCents,
                    'paid_at_brt' => $paidAtBrt,
                    'is_paid' => $isPaid,
                    'discount_cents' => $discInstCents,
                    'discount_reais' => reaisOfCents($discInstCents),
                    'increase_cents' => $incInstCents,
                    'increase_reais' => reaisOfCents($incInstCents),
                    'fines_cents' => $finesInstCents,
                    'fines_reais' => reaisOfCents($finesInstCents),
                    'interest_cents' => $intInstCents,
                    'interest_reais' => reaisOfCents($intInstCents),
                    'method_id' => $inst->payment_method_id !== null ? (int) $inst->payment_method_id : null,
                    'method_name' => $methodName,
                    'method_description' => $pm?->description ?: null,
                    'method_category_key' => $categoryKey,
                    'method_category_label' => $categoryLabel,
                    'transactions' => $txOut,
                    'bills' => $billsOut,
                ];
            }
        )->all();

        $effectivePaidMethods = array_values(array_unique($effectivePaidMethods));
        $configuredMethods = array_values(array_unique($configuredMethods));
        $paidMethodCategories = array_values(array_unique($paidMethodCategories));
        $effectivePaidByMethodReais = [];
        foreach ($effectivePaidByMethodCents as $mKey => $mCents) {
            $effectivePaidByMethodReais[$mKey] = reaisOfCents($mCents);
        }

        // Items + bonus provenance
        $orderBonuses = $bonusRowsByOrder->get($order->id, collect())->keyBy('order_item_id');
        $bundleItem = $order->items->first(static fn ($it) => $it->product?->bundle === 'Y') ?? $order->items->first();
        $singleItem = $order->items->count() === 1 ? $order->items->first() : null;
        $entrySnapshotCents = ($singleItem && preg_match('/\A1(?:\.0+)?\z/', (string) $singleItem->quantity) === 1)
            ? centsOf($singleItem->entry)
            : 0;

        $itemsOut = $order->items->values()->map(static function ($it) use ($orderBonuses): array {
            $qty = (float) $it->quantity;
            $unitCents = centsOf($it->amount);
            $grossCents = (int) round($unitCents * $qty);
            $discCents = centsOf($it->discount);
            $netCents = centsOf($it->total);
            $entryCents = centsOf($it->entry);
            $isBundle = ($it->product?->bundle === 'Y');

            $bonusRow = $orderBonuses->get($it->id);
            if ($bonusRow !== null) {
                $snap = is_string($bonusRow->rule_snapshot ?? null)
                    ? (json_decode($bonusRow->rule_snapshot, true) ?: [])
                    : [];
                $hasOverride = ($bonusRow->order_bonus_rule_override_id !== null) || !empty($bonusRow->manual_override_type);
                $bonusClassification = [
                    'classification' => $hasOverride ? 'manual_bonus_override' : 'campaign_bonus',
                    'origin' => (string) ($bonusRow->source ?? 'automatic_rule'),
                    'proven' => true,
                    'application_uuid' => $bonusRow->uuid ?? null,
                    'status' => $bonusRow->status ?? null,
                    'reason' => $bonusRow->reason ?? null,
                    'benefit_key' => $snap['benefit_key'] ?? null,
                    'campaign_slug' => $snap['campaign_slug'] ?? null,
                    'discount_policy' => $snap['discount_policy'] ?? null,
                    'manual_override_type' => $bonusRow->manual_override_type ?? null,
                    'applied_at_brt' => formatBrt($bonusRow->applied_at),
                ];
            } elseif ($isBundle) {
                $bonusClassification = [
                    'classification' => 'package_bundle',
                    'origin' => 'catalog_bundle',
                    'proven' => true,
                ];
            } elseif ($netCents > 0 && $discCents === 0) {
                $bonusClassification = [
                    'classification' => 'regular_paid_item',
                    'origin' => 'paid_addition',
                    'proven' => true,
                ];
            } elseif ($netCents > 0 && $discCents > 0) {
                $bonusClassification = [
                    'classification' => 'partially_discounted_item',
                    'origin' => 'item_discount',
                    'proven' => false,
                ];
            } else {
                $bonusClassification = [
                    'classification' => 'zero_net_untracked',
                    'origin' => 'unknown',
                    'proven' => false,
                    'note' => 'Item com valor líquido R$ 0,00 sem registro em order_bonus_applications; origem exata (bônus legado, cupom ou cortesia manual) não rastreada automaticamente.',
                ];
            }

            return [
                'order_item_id' => (int) $it->id,
                'product_id' => $it->product_id !== null ? (int) $it->product_id : null,
                'name' => $it->product?->name ?? null,
                'slug' => $it->product?->slug ?? null,
                'reference' => $it->product?->reference ?? null,
                'description' => $it->product?->description ?? null,
                'is_bundle' => $isBundle,
                'quantity' => $qty,
                'unit_price_cents' => $unitCents,
                'unit_price_reais' => reaisOfCents($unitCents),
                'gross_amount_cents' => $grossCents,
                'gross_amount_reais' => reaisOfCents($grossCents),
                'discount_cents' => $discCents,
                'discount_reais' => reaisOfCents($discCents),
                'net_total_cents' => $netCents,
                'net_total_reais' => reaisOfCents($netCents),
                'total_reais' => reaisOfCents($netCents),
                'entry_cents' => $entryCents,
                'entry_reais' => reaisOfCents($entryCents),
                'bonus_classification' => $bonusClassification,
            ];
        })->all();

        // Participants + registration completion state + lock reason + age at session vs today + kinship anomaly check
        $pvd = new OrderParticipantManagementViewData($order);
        $sessionCarbon = toCarbonBrt($order->schedule_1);
        $sessionDateRef = $sessionCarbon?->startOfDay();
        $todayYmd = $todayBrt->format('Y-m-d');
        $sessionYmd = $sessionDateRef?->format('Y-m-d');
        $adultKinshipNorms = ['mae', 'pai', 'vo', 'avo', 'esposo (a)', 'marido', 'esposa', 'titular'];
        $kinshipAgeAnomalies = [];

        $participantsMapped = $order->participants->values()->map(
            static function ($p) use ($order, $fullProfile, $todayBrt, $todayYmd, $sessionDateRef, $sessionYmd, $adultKinshipNorms, &$kinshipAgeAnomalies): array {
                $birthYmd = null;
                if ($p->birth !== null && $p->birth !== '') {
                    $birthYmd = $p->birth instanceof DateTimeInterface
                        ? CarbonImmutable::instance($p->birth)->format('Y-m-d')
                        : substr((string) $p->birth, 0, 10);
                    if (str_starts_with((string) $birthYmd, '0000-')) {
                        $birthYmd = null;
                    }
                }
                $pName = $p->name ? trim((string) $p->name) : null;
                $kinship = $p->relation?->name ? trim((string) $p->relation->name) : null;
                $ageToday = humanAgeAt($birthYmd, $todayBrt);
                $ageSession = $sessionDateRef ? humanAgeAt($birthYmd, $sessionDateRef) : null;
                $refDateForYears = $sessionDateRef ?? $todayBrt;
                $yearsAtRef = yearsAt($birthYmd, $refDateForYears);

                if ($kinship !== null && $yearsAtRef !== null && $yearsAtRef < 14) {
                    $kinNorm = Str::ascii(mb_strtolower($kinship));
                    if (in_array($kinNorm, $adultKinshipNorms, true)) {
                        $kinshipAgeAnomalies[] = [
                            'order_id' => (int) $order->id,
                            'participant_id' => (int) $p->id,
                            'participant_name' => $fullProfile ? $pName : null,
                            'kinship' => $kinship,
                            'birth_date' => $fullProfile ? $birthYmd : null,
                            'age_years_at_reference' => $yearsAtRef,
                            'age_at_session' => $ageSession,
                            'anomaly_code' => 'parent_or_adult_kinship_with_child_age',
                            'advisory' => 'Parentesco adulto registrado com data de nascimento infantil (< 14 anos). Provável inversão cadastral; confirmar com o titular antes de alterar.',
                        ];
                    }
                }

                return [
                    'participant_id' => (int) $p->id,
                    'name' => $pName,
                    'birth_date' => $birthYmd,
                    'kinship' => $kinship,
                    'age' => $ageToday,
                    'age_today' => $ageToday,
                    'age_reference_date' => $todayYmd,
                    'age_at_session' => $ageSession,
                    'session_reference_date' => $sessionYmd,
                ];
            }
        )->all();

        $participantsOut = $fullProfile ? $participantsMapped : [];

        $canEditNow = $pvd->customerCanEdit();
        $accessLabel = method_exists($pvd, 'customerAccessLabel')
            ? $pvd->customerAccessLabel()
            : ($canEditNow ? 'Edição liberada ao cliente' : 'Edição bloqueada para o cliente');
        $tempAccessState = method_exists($pvd, 'temporaryAccessState') ? $pvd->temporaryAccessState() : 'disabled';
        $tempAccessLabel = method_exists($pvd, 'temporaryAccessLabel') ? $pvd->temporaryAccessLabel() : null;

        if ($canEditNow) {
            $editLockReason = 'editable';
        } elseif (stripos((string) $accessLabel, 'desativado') !== false || $tempAccessState === 'disabled') {
            $editLockReason = 'portal_feature_disabled';
        } elseif (in_array($currentStatusKey, ['order_completed', 'product_retrieve_confirmed', 'order_aborted', 'payment_chargeback', 'payment_refunded'], true)) {
            $editLockReason = 'order_finalized_or_reversed';
        } else {
            $editLockReason = 'status_locked_for_customer';
        }

        // Schedule & Google Calendar sync state (OrderCalendarUiStateService)
        $googleCalendarState = null;
        if ($calendarUiSvc !== null) {
            try {
                $calRaw = $calendarUiSvc->forOrder($order);
                if (is_array($calRaw)) {
                    $sessPurpose = is_array($calRaw['purposes']['orderSession'] ?? null) ? $calRaw['purposes']['orderSession'] : [];
                    $selPurpose = is_array($calRaw['purposes']['orderSelection'] ?? null) ? $calRaw['purposes']['orderSelection'] : [];
                    $histEntries = is_array($calRaw['history']['entries'] ?? null) ? array_slice($calRaw['history']['entries'], 0, 20) : [];
                    $googleCalendarState = [
                        'available' => true,
                        'sync_enabled' => (bool) ($calRaw['enabled'] ?? false),
                        'order_session' => [
                            'is_synced' => (bool) ($sessPurpose['isSynced'] ?? false),
                            'status' => $sessPurpose['status'] ?? null,
                            'synced_at_label' => $sessPurpose['syncedAtLabel'] ?? null,
                            'status_message' => $sessPurpose['statusMessage'] ?? null,
                            'html_link' => $sessPurpose['htmlLink'] ?? null,
                        ],
                        'order_selection' => [
                            'is_synced' => (bool) ($selPurpose['isSynced'] ?? false),
                            'status' => $selPurpose['status'] ?? null,
                            'synced_at_label' => $selPurpose['syncedAtLabel'] ?? null,
                            'status_message' => $selPurpose['statusMessage'] ?? null,
                            'html_link' => $selPurpose['htmlLink'] ?? null,
                        ],
                        'schedule_change_history_count' => count($histEntries),
                        'schedule_change_history' => $histEntries,
                    ];
                }
            } catch (Throwable) {
                $googleCalendarState = [
                    'available' => false,
                    'unavailable_reason' => 'calendar_ui_state_query_failed',
                ];
            }
        }

        $scheduleDetails = [
            'session_at_brt' => formatBrt($order->schedule_1),
            'selection_at_brt' => formatBrt($order->schedule_2),
            'auxiliary_schedule_at_brt' => formatBrt($order->schedule_3),
            'google_calendar' => $googleCalendarState ?? [
                'available' => false,
                'unavailable_reason' => $includeCalendarSync ? 'calendar_service_unavailable' : 'omitted_in_list_level_use_order_detail',
            ],
        ];

        // Personalization, cake, notes & explicit Santa audio availability
        $hasChildPers = !empty($order->child_fullname)
            || !empty($order->child_options)
            || !empty($order->child_values)
            || !empty($order->child_genders);
        $cakeModel = $order->relationLoaded('cake') ? $order->cake : null;
        $personalization = [
            'observation_public' => $fullProfile ? ($order->note ?: null) : null,
            'internal_note' => $fullProfile ? ($order->inner ?: null) : null,
            'child_personalization' => [
                'available' => $hasChildPers,
                'unavailable_reason' => $hasChildPers ? null : 'not_filled_on_order',
                'child_fullname' => $fullProfile ? ($order->child_fullname ?: null) : null,
                'child_options' => $order->child_options ?? null,
                'child_values' => $order->child_values ?? null,
                'recorded_child_genders' => $order->child_genders ?? null,
            ],
            'cake' => $cakeModel
                ? [
                    'available' => true,
                    'cake_id' => (int) $cakeModel->id,
                    'status' => scalarOrEnumString($cakeModel->status ?? null),
                    'decision_status' => scalarOrEnumString($cakeModel->decision_status ?? null),
                    'delivery_at_brt' => formatBrt($cakeModel->delivery_at ?? null),
                    'note' => scalarOrEnumString($cakeModel->note ?? $cakeModel->observation ?? null),
                ]
                : [
                    'available' => false,
                    'unavailable_reason' => 'no_cake_record_for_order',
                ],
            'santa_audio' => [
                'available' => false,
                'unavailable_reason' => 'no_santa_audio_field_in_crm_schema',
            ],
        ];

        $custProjected = projectCustomer($order->customer, $fullProfile, $cardSvc);
        $topPaymentMethods = $effectivePaidMethods !== [] ? $effectivePaidMethods : $configuredMethods;

        $projected[] = [
            'order_id' => (int) $order->id,
            'order_uuid' => $order->uuid,
            'crm_order_url' => $order->uuid ? "https://evydencia.com/gestao/pedidos/{$order->uuid}/detalhes" : null,
            'crm_customer_url' => $custProjected['crm_customer_url'] ?? null,
            'customer_name' => $order->customer?->name,
            'customer_phone_masked' => maskPhoneBr($order->customer?->whatsapp ?: $order->customer?->phone),
            'customer_avatar_url' => $custProjected['avatar']['url'] ?? null,
            'customer_has_avatar' => $custProjected['avatar']['has_avatar'] ?? false,
            'customer_initials' => $custProjected['avatar']['initials'] ?? '?',
            'customer' => $isSummaryOnly ? null : $custProjected,
            'status_id' => $currentStatusEnum?->value ?? null,
            'status_key' => $currentStatusKey,
            'status_label' => $currentStatusEnum?->description ?? null,
            'status' => [
                'id' => $currentStatusEnum?->value ?? null,
                'key' => $currentStatusKey,
                'label' => $currentStatusEnum?->description ?? null,
            ],
            'status_history_count' => count($statusHistory),
            'status_history' => $isSummaryOnly ? [] : $statusHistory,
            'created_at' => $order->created_at ? CarbonImmutable::instance($order->created_at)->toIso8601String() : null,
            'created_at_brt' => formatBrt($order->created_at),
            'updated_at_brt' => formatBrt($order->updated_at),
            'session_at' => formatBrt($order->schedule_1),
            'selection_at' => formatBrt($order->schedule_2),
            'auxiliary_schedule_at' => formatBrt($order->schedule_3),
            'schedule_details' => $scheduleDetails,
            'observation' => $fullProfile ? ($order->note ?: null) : null,
            'internal_note' => $fullProfile ? ($order->inner ?: null) : null,
            'personalization' => $isSummaryOnly ? null : $personalization,
            'package_name' => $bundleItem?->product?->name ?? null,
            'item_count' => count($itemsOut),
            'items' => $isSummaryOnly ? [] : $itemsOut,
            'payment_methods' => $topPaymentMethods,
            'total_reais' => reaisOfCents($commercialCents),
            'received_reais' => reaisOfCents($receivedCents),
            'remaining_reais' => reaisOfCents($remainingCents),
            'total_cents' => $commercialCents,
            'received_cents' => $receivedCents,
            'remaining_cents' => $remainingCents,
            'payment_summary' => [
                'subtotal_cents' => $subtotalCents,
                'subtotal_reais' => reaisOfCents($subtotalCents),
                'items_discount_cents' => $discountItemsCents,
                'items_discount_reais' => reaisOfCents($discountItemsCents),
                'coupon_code' => $order->coupon?->code ?? null,
                'coupon_discount_cents' => $couponAmountCents,
                'coupon_discount_reais' => reaisOfCents($couponAmountCents),
                'total_discounts_cents' => $totalDiscountCents,
                'total_discounts_reais' => reaisOfCents($totalDiscountCents),
                'total_cents' => $commercialCents,
                'total_reais' => reaisOfCents($commercialCents),
                'received_cents' => $receivedCents,
                'received_reais' => reaisOfCents($receivedCents),
                'remaining_cents' => $remainingCents,
                'remaining_reais' => reaisOfCents($remainingCents),
                'entry_snapshot_cents' => $entrySnapshotCents,
                'entry_snapshot_reais' => reaisOfCents($entrySnapshotCents),
                'installments_count' => count($installmentsOut),
                'paid_installments_count' => $paidInstallmentsCount,
                'open_installments_count' => $openCount,
                'open_installments_cents' => $openCents,
                'open_installments_reais' => reaisOfCents($openCents),
                'effective_paid_methods' => $effectivePaidMethods,
                'effective_paid_by_method_cents' => $effectivePaidByMethodCents,
                'effective_paid_by_method_reais' => $effectivePaidByMethodReais,
                'configured_installment_methods' => $configuredMethods,
                'paid_method_categories' => $paidMethodCategories,
                'payment_needs_review' => $paymentNeedsReview,
                'financial_review_reasons' => $reviewReasons,
            ],
            'installments' => $isSummaryOnly ? [] : $installmentsOut,
            'participant_count' => $pvd->participantsCount(),
            'participants_registration' => [
                'count' => $pvd->participantsCount(),
                'completed' => $pvd->isCompleted(),
                'completed_at_brt' => formatBrt($order->participants_completed_at),
                'completed_source' => $order->participants_completed_source ?: null,
                'status_label' => $pvd->completionLabel(),
                'customer_can_edit_now' => $canEditNow,
                'customer_access_label' => $accessLabel,
                'edit_lock_reason' => $editLockReason,
                'temporary_access_state' => $tempAccessState,
                'temporary_access_label' => $tempAccessLabel,
                'kinship_age_anomalies_count' => count($kinshipAgeAnomalies),
                'kinship_age_anomalies' => $kinshipAgeAnomalies,
            ],
            'participants' => $isSummaryOnly ? [] : $participantsOut,
        ];
    }

    return $projected;
}

function normalizeParticipantKey(?string $name): string
{
    $ascii = Str::ascii(mb_strtolower(trim((string) $name)));
    return preg_replace('/\s+/', ' ', $ascii) ?? '';
}

function buildParticipantCrossOrderAudit(array $projectedOrders): array
{
    $groups = [];
    $kinshipAgeAnomalies = [];
    foreach ($projectedOrders as $ord) {
        foreach ($ord['participants_registration']['kinship_age_anomalies'] ?? [] as $anom) {
            $kinshipAgeAnomalies[] = $anom;
        }
        foreach ($ord['participants'] ?? [] as $p) {
            $key = normalizeParticipantKey($p['name'] ?? '');
            if ($key === '') {
                continue;
            }
            $groups[$key][] = [
                'order_id' => $ord['order_id'],
                'order_uuid' => $ord['order_uuid'],
                'crm_order_url' => $ord['crm_order_url'],
                'session_at' => $ord['session_at'],
                'status_key' => $ord['status_key'],
                'participant_id' => $p['participant_id'],
                'name' => $p['name'],
                'birth_date' => $p['birth_date'],
                'kinship' => $p['kinship'],
                'age_at_session' => $p['age_at_session'],
                'age_today' => $p['age_today'],
            ];
        }
    }

    $birthDiscrepancies = [];
    $kinshipDiscrepancies = [];
    $profiles = [];

    foreach ($groups as $normKey => $occurrences) {
        $births = array_values(array_unique(array_filter(array_column($occurrences, 'birth_date'))));
        $kinships = array_values(array_unique(array_filter(array_column($occurrences, 'kinship'))));
        $displayName = $occurrences[count($occurrences) - 1]['name'] ?? $normKey;

        $hasBirthConflict = count($births) > 1;
        $hasKinshipConflict = count($kinships) > 1;

        if ($hasBirthConflict) {
            $datesSorted = $births;
            sort($datesSorted);
            $diffDays = null;
            try {
                $d1 = CarbonImmutable::createFromFormat('Y-m-d', $datesSorted[0], 'America/Sao_Paulo');
                $d2 = CarbonImmutable::createFromFormat('Y-m-d', $datesSorted[count($datesSorted) - 1], 'America/Sao_Paulo');
                $diffDays = (int) $d1->diffInDays($d2);
            } catch (Throwable) {
                $diffDays = null;
            }
            $birthDiscrepancies[] = [
                'participant_name' => $displayName,
                'distinct_birth_dates' => $births,
                'difference_days' => $diffDays,
                'difference_years_approx' => $diffDays !== null ? round($diffDays / 365.25, 1) : null,
                'occurrences' => $occurrences,
                'advisory' => 'Divergência histórica de data de nascimento entre pedidos distintos da família. Conferir com o titular antes de qualquer correção manual; não sobrescrever automaticamente.',
            ];
        }

        if ($hasKinshipConflict) {
            $kinshipDiscrepancies[] = [
                'participant_name' => $displayName,
                'distinct_kinships' => $kinships,
                'occurrences' => $occurrences,
            ];
        }

        $profiles[] = [
            'participant_name' => $displayName,
            'orders_appeared_count' => count($occurrences),
            'distinct_birth_dates' => $births,
            'distinct_kinships' => $kinships,
            'has_birth_date_discrepancy' => $hasBirthConflict,
            'occurrences' => $occurrences,
        ];
    }

    return [
        'unique_named_participants_count' => count($profiles),
        'has_discrepancies' => $birthDiscrepancies !== [] || $kinshipDiscrepancies !== [] || $kinshipAgeAnomalies !== [],
        'birth_date_discrepancies_count' => count($birthDiscrepancies),
        'birth_date_discrepancies' => $birthDiscrepancies,
        'kinship_discrepancies' => $kinshipDiscrepancies,
        'kinship_age_anomalies_count' => count($kinshipAgeAnomalies),
        'kinship_age_anomalies' => $kinshipAgeAnomalies,
        'participants_timeline' => $profiles,
    ];
}

$action = (string) ($payload['action'] ?? '');
$fullProfile = !empty($payload['full_profile']);
$requestedDetailLevel = isset($payload['detail_level']) && in_array($payload['detail_level'], ['resumo', 'padrao', 'forense'], true)
    ? (string) $payload['detail_level']
    : null;

if ($action === 'orders.detail') {
    $uuid = isset($payload['uuid']) ? trim((string) $payload['uuid']) : '';
    $orderId = isset($payload['order_id']) ? (int) $payload['order_id'] : 0;

    $query = Order::query();
    if ($uuid !== '') {
        $query->where('uuid', $uuid);
    } elseif ($orderId > 0) {
        $query->where('id', $orderId);
    } else {
        echo json_encode(['error' => 'missing_order_locator']);
        exit(0);
    }

    $order = $query->first();
    if (!$order) {
        echo json_encode(['error' => 'order_not_found']);
        exit(0);
    }

    $effDetailLevel = $requestedDetailLevel ?? 'forense';
    $batch = projectOrdersBatch(new Collection([$order]), $fullProfile, $cardSvc, $todayBrt, $effDetailLevel);
    echo json_encode([
        'source' => 'CRM_FORENSIC_READ_ONLY_BRIDGE',
        'detail_level' => $effDetailLevel,
        'order' => $batch[0],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit(0);
}

if ($action === 'orders.search') {
    $filters = is_array($payload['filters'] ?? null) ? $payload['filters'] : [];
    $limit = min(25, max(1, (int) ($payload['limit'] ?? 10)));
    $page = max(1, (int) ($payload['page'] ?? 1));
    $effDetailLevel = $requestedDetailLevel ?? 'padrao';

    $totalOrdersInCrm = Order::query()->count();
    $q = Order::query();

    if (!empty($filters['order_id'])) {
        $q->where('orders.id', (int) $filters['order_id']);
    }
    if (!empty($filters['order_uuid'])) {
        $q->where('orders.uuid', trim((string) $filters['order_uuid']));
    }
    if (!empty($filters['customer_uuid'])) {
        $q->whereHas('customer', static fn ($cq) => $cq->where('uuid', trim((string) $filters['customer_uuid'])));
    }
    if (!empty($filters['customer_name'])) {
        $nameTerm = trim((string) $filters['customer_name']);
        $q->whereHas('customer', static fn ($cq) => $cq->where('name', 'like', "%{$nameTerm}%"));
    }
    if (!empty($filters['customer_whatsapp'])) {
        $digits = preg_replace('/\D/', '', (string) $filters['customer_whatsapp']);
        if ($digits !== '') {
            $tail = strlen($digits) >= 8 ? substr($digits, -8) : $digits;
            $q->whereHas('customer', static function ($cq) use ($digits, $tail): void {
                $cq->where('whatsapp', 'like', "%{$digits}%")
                    ->orWhere('phone', 'like', "%{$digits}%")
                    ->orWhere('whatsapp', 'like', "%{$tail}%");
            });
        }
    }
    if (!empty($filters['product_slug'])) {
        $slug = trim((string) $filters['product_slug']);
        $q->whereHas('items.product', static fn ($pq) => $pq->where('slug', 'like', "%{$slug}%"));
    }
    if (!empty($filters['created_start'])) {
        $q->whereDate('orders.created_at', '>=', (string) $filters['created_start']);
    }
    if (!empty($filters['created_end'])) {
        $q->whereDate('orders.created_at', '<=', (string) $filters['created_end']);
    }
    if (!empty($filters['session_start'])) {
        $q->whereDate('orders.schedule_1', '>=', (string) $filters['session_start']);
    }
    if (!empty($filters['session_end'])) {
        $q->whereDate('orders.schedule_1', '<=', (string) $filters['session_end']);
    }
    if (!empty($filters['order_status'])) {
        $st = trim((string) $filters['order_status']);
        $q->whereRaw('(SELECT status FROM orders_status WHERE order_id = orders.id ORDER BY id DESC LIMIT 1) = ?', [$st]);
    }
    if (!empty($filters['payment_method_name'])) {
        $pmTerm = trim((string) $filters['payment_method_name']);
        $q->whereHas('installments.paymentMethod', static fn ($pmq) => $pmq->where('name', 'like', "%{$pmTerm}%"));
    }
    if (array_key_exists('has_open_balance', $filters) && $filters['has_open_balance'] !== null) {
        $wantOpen = (bool) $filters['has_open_balance'];
        $openCondSql = 'EXISTS (SELECT 1 FROM orders_installments oi WHERE oi.order_id = orders.id AND oi.payment_at IS NULL AND oi.total > 0)';
        $q->whereRaw($wantOpen ? $openCondSql : "NOT {$openCondSql}");
    }

    $totalMatching = (clone $q)->count();
    $totalPages = max(1, (int) ceil($totalMatching / $limit));
    $rows = $q->orderByDesc('orders.id')
        ->skip(($page - 1) * $limit)
        ->take($limit)
        ->get();

    $ordersOut = projectOrdersBatch($rows, $fullProfile, $cardSvc, $todayBrt, $effDetailLevel);

    echo json_encode([
        'source' => 'CRM_FORENSIC_READ_ONLY_BRIDGE',
        'scope' => 'PAGINATED_FORENSIC_ORDER_LIST',
        'detail_level' => $effDetailLevel,
        'ordering' => 'order_id_desc_most_recent_first',
        'applied_filters' => $filters,
        'pagination' => [
            'page' => $page,
            'per_page' => $limit,
            'returned_count' => count($ordersOut),
            'total_matching_orders' => $totalMatching,
            'total_orders_in_crm' => $totalOrdersInCrm,
            'total_pages' => $totalPages,
            'has_more' => ($page * $limit) < $totalMatching,
        ],
        'returned_count' => count($ordersOut),
        'orders' => $ordersOut,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit(0);
}

function buildCustomerQuery(array $locator): \Illuminate\Database\Eloquent\Builder
{
    $q = Customer::query()->with('city.state')->withCount('orders');

    if (!empty($locator['customer_uuid'])) {
        return $q->where('uuid', trim((string) $locator['customer_uuid']));
    }
    if (!empty($locator['customer_id'])) {
        return $q->where('id', (int) $locator['customer_id']);
    }
    if (!empty($locator['documento'])) {
        $doc = preg_replace('/\D/', '', (string) $locator['documento']);
        if ($doc !== '') {
            return $q->where('document', $doc);
        }
    }
    if (!empty($locator['email'])) {
        $em = trim((string) $locator['email']);
        return $q->where('email', 'like', "%{$em}%");
    }
    if (!empty($locator['telefone'])) {
        $digits = preg_replace('/\D/', '', (string) $locator['telefone']);
        if (str_starts_with($digits, '55') && in_array(strlen($digits), [12, 13], true)) {
            $digits = substr($digits, 2);
        }
        $e164 = '+55' . $digits;
        $tail8 = strlen($digits) >= 8 ? substr($digits, -8) : $digits;
        $ddd = strlen($digits) >= 10 ? substr($digits, 0, 2) : '';
        return $q->where(static function ($sub) use ($digits, $e164, $tail8, $ddd): void {
            $sub->where('whatsapp', $digits)
                ->orWhere('phone', $digits)
                ->orWhere('whatsapp_e164', $e164)
                ->orWhere('phone_e164', $e164);
            if ($ddd !== '' && strlen($tail8) === 8) {
                $sub->orWhere('whatsapp', $ddd . $tail8)
                    ->orWhere('whatsapp', $ddd . '9' . $tail8)
                    ->orWhere('phone', $ddd . $tail8)
                    ->orWhere('phone', $ddd . '9' . $tail8);
            }
        });
    }
    if (!empty($locator['busca'])) {
        $term = trim((string) $locator['busca']);
        $digits = preg_replace('/\D/', '', $term);
        return $q->where(static function ($sub) use ($term, $digits): void {
            $sub->where('name', 'like', "%{$term}%")
                ->orWhere('email', 'like', "%{$term}%");
            if (strlen($digits) >= 4) {
                $sub->orWhere('whatsapp', 'like', "%{$digits}%")
                    ->orWhere('phone', 'like', "%{$digits}%")
                    ->orWhere('document', 'like', "%{$digits}%");
            }
        });
    }
    if (!empty($locator['nome_cliente'])) {
        $name = trim((string) $locator['nome_cliente']);
        return $q->where('name', 'like', "%{$name}%");
    }

    return $q;
}

if ($action === 'customers.search') {
    $limit = min(25, max(1, (int) ($payload['limit'] ?? 10)));
    $page = max(1, (int) ($payload['page'] ?? 1));
    $onlyZeroOrders = !empty($payload['only_without_orders']);
    $onlyIncomplete = !empty($payload['only_incomplete_registration']);

    $q = buildCustomerQuery($payload);
    if ($onlyZeroOrders) {
        $q->doesntHave('orders');
    }
    if ($onlyIncomplete) {
        $q->where(static function ($sub): void {
            $sub->whereNull('email')->orWhere('email', '')
                ->orWhereNull('document')->orWhere('document', '')
                ->orWhereNull('zipcode')->orWhere('zipcode', '')
                ->orWhereNull('street')->orWhere('street', '')
                ->orWhereNull('district')->orWhere('district', '')
                ->orWhereNull('city_id');
        });
    }

    $totalCustomersInCrm = Customer::query()->count();
    $totalMatching = (clone $q)->count();
    $rows = $q->orderByDesc('id')
        ->skip(($page - 1) * $limit)
        ->take($limit)
        ->get();

    $customersOut = $rows->map(static function (Customer $c) use ($fullProfile, $cardSvc): array {
        $proj = projectCustomer($c, $fullProfile, $cardSvc);
        $ordersCount = (int) ($c->orders_count ?? 0);
        $proj['orders_count'] = $ordersCount;
        $proj['lifecycle_stage'] = $ordersCount === 0 ? 'lead' : ($ordersCount === 1 ? 'first_time' : 'recurring');
        return $proj;
    })->values()->all();

    echo json_encode([
        'source' => 'CRM_FORENSIC_READ_ONLY_BRIDGE',
        'pagination' => [
            'page' => $page,
            'per_page' => $limit,
            'returned_count' => count($customersOut),
            'total_matching_customers' => $totalMatching,
            'total_customers_in_crm' => $totalCustomersInCrm,
            'total_pages' => max(1, (int) ceil($totalMatching / $limit)),
            'has_more' => ($page * $limit) < $totalMatching,
        ],
        'customers' => $customersOut,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit(0);
}

if ($action === 'customers.forensic360') {
    $q = buildCustomerQuery($payload);
    $matches = $q->orderByDesc('id')->limit(10)->get();

    // If searching by name and there is an exact case-insensitive match among multiple LIKE hits, prefer exact match(es)
    if ($matches->count() > 1 && !empty($payload['nome_cliente'])) {
        $targetAscii = Str::ascii(mb_strtolower(trim((string) $payload['nome_cliente'])));
        $exact = $matches->filter(static fn (Customer $c) => Str::ascii(mb_strtolower(trim((string) $c->name))) === $targetAscii)->values();
        if ($exact->isNotEmpty()) {
            $matches = $exact;
        }
    }

    if ($matches->isEmpty()) {
        echo json_encode([
            'source' => 'CRM_FORENSIC_READ_ONLY_BRIDGE',
            'lookup' => ['status' => 'not_found', 'match_count' => 0],
            'customer' => null,
            'orders' => [],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit(0);
    }

    if ($matches->count() > 1) {
        echo json_encode([
            'source' => 'CRM_FORENSIC_READ_ONLY_BRIDGE',
            'lookup' => [
                'status' => 'ambiguous',
                'match_count' => $matches->count(),
                'candidates' => $matches->map(static function (Customer $c) use ($fullProfile, $cardSvc): array {
                    $p = projectCustomer($c, $fullProfile, $cardSvc);
                    $p['orders_count'] = (int) ($c->orders_count ?? 0);
                    return $p;
                })->values()->all(),
            ],
            'customer' => null,
            'orders' => [],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit(0);
    }

    /** @var Customer $customer */
    $customer = $matches->first();
    $custOut = projectCustomer($customer, $fullProfile, $cardSvc);

    $allOrders = Order::query()
        ->where('customer_id', $customer->id)
        ->orderByDesc('id')
        ->get();

    $ordersProjected = projectOrdersBatch($allOrders, $fullProfile, $cardSvc, $todayBrt);

    $validOrdersCount = 0;
    $reversedOrAbortedCount = 0;
    $completedSessionsCount = 0;
    $contractedValidCents = 0;
    $receivedAllCents = 0;
    $remainingValidCents = 0;
    $receivedByMethodCents = [];
    $yearsAttended = [];
    $ordersNeedingReview = [];

    foreach ($ordersProjected as $ord) {
        $stKey = $ord['status_key'];
        $isReversed = in_array($stKey, ['order_aborted', 'payment_chargeback', 'payment_refunded'], true);
        $isWaiting = ($stKey === 'waiting_payment');

        $receivedAllCents += (int) $ord['received_cents'];
        foreach ($ord['installments'] as $inst) {
            if (!empty($inst['is_paid']) && (int) $inst['paid_cents'] > 0) {
                $mk = $inst['method_name'] ?? 'Método não informado';
                $receivedByMethodCents[$mk] = ($receivedByMethodCents[$mk] ?? 0) + (int) $inst['paid_cents'];
            }
        }

        if ($isReversed) {
            $reversedOrAbortedCount++;
        } elseif (!$isWaiting) {
            $validOrdersCount++;
            $contractedValidCents += (int) $ord['total_cents'];
            $remainingValidCents += (int) $ord['remaining_cents'];
            if (in_array($stKey, ['session_schedule_confirmed', 'selection_schedule', 'selection_schedule_confirmed', 'waiting_product_retrieve', 'product_retrieve_confirmed', 'order_completed'], true)) {
                $completedSessionsCount++;
            }
            $refDateStr = $ord['session_at'] ?: $ord['created_at_brt'];
            if ($refDateStr && preg_match('/^(\d{4})-/', $refDateStr, $ym)) {
                $yearsAttended[] = (int) $ym[1];
            }
        }

        if (!empty($ord['payment_summary']['payment_needs_review'])) {
            $ordersNeedingReview[] = [
                'order_id' => $ord['order_id'],
                'order_uuid' => $ord['order_uuid'],
                'reasons' => $ord['payment_summary']['financial_review_reasons'],
            ];
        }
    }

    $yearsAttended = array_values(array_unique($yearsAttended));
    sort($yearsAttended);

    $receivedByMethodReais = [];
    foreach ($receivedByMethodCents as $mk => $mc) {
        $receivedByMethodReais[$mk] = reaisOfCents($mc);
    }

    $lifecycleStage = count($ordersProjected) === 0
        ? 'lead'
        : ($validOrdersCount <= 1 ? 'first_time' : 'recurring');
    $custOut['orders_count'] = count($ordersProjected);
    $custOut['lifecycle_stage'] = $lifecycleStage;

    $participantAudit = $fullProfile
        ? buildParticipantCrossOrderAudit($ordersProjected)
        : ['unique_named_participants_count' => 0, 'has_discrepancies' => false, 'birth_date_discrepancies' => []];

    $page = max(1, (int) ($payload['page'] ?? 1));
    $perPage = min(20, max(1, (int) ($payload['per_page'] ?? 10)));
    $pagedOrders = array_slice($ordersProjected, ($page - 1) * $perPage, $perPage);

    echo json_encode([
        'source' => 'CRM_FORENSIC_READ_ONLY_BRIDGE',
        'lookup' => ['status' => 'matched', 'match_count' => 1],
        'customer' => $custOut,
        'kpis' => [
            'lifecycle_stage' => $lifecycleStage,
            'total_orders_registered' => count($ordersProjected),
            'valid_orders_count' => $validOrdersCount,
            'reversed_or_aborted_orders_count' => $reversedOrAbortedCount,
            'completed_sessions_count' => $completedSessionsCount,
            'lifetime_contracted_valid_cents' => $contractedValidCents,
            'lifetime_contracted_valid_reais' => reaisOfCents($contractedValidCents),
            'lifetime_received_cents' => $receivedAllCents,
            'lifetime_received_reais' => reaisOfCents($receivedAllCents),
            'lifetime_remaining_valid_cents' => $remainingValidCents,
            'lifetime_remaining_valid_reais' => reaisOfCents($remainingValidCents),
            'average_ticket_valid_cents' => $validOrdersCount > 0 ? (int) round($contractedValidCents / $validOrdersCount) : 0,
            'average_ticket_valid_reais' => $validOrdersCount > 0 ? round(($contractedValidCents / 100) / $validOrdersCount, 2) : 0,
            'years_attended' => $yearsAttended,
        ],
        'financial_audit_summary' => [
            'received_by_effective_method_cents' => $receivedByMethodCents,
            'received_by_effective_method_reais' => $receivedByMethodReais,
            'orders_needing_financial_review_count' => count($ordersNeedingReview),
            'orders_needing_financial_review' => $ordersNeedingReview,
        ],
        'participants_cross_order_audit' => $participantAudit,
        'current_order' => $ordersProjected[0] ?? null,
        'history' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => count($ordersProjected),
            'has_more' => ($page * $perPage) < count($ordersProjected),
        ],
        'orders' => $pagedOrders,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit(0);
}

fwrite(STDERR, json_encode(['error' => 'unknown_forensic_action']) . "\n");
exit(4);
