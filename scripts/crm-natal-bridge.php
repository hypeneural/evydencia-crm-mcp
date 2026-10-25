<?php
declare(strict_types=1);

/**
 * Read-only CLI bridge for the canonical Natal statistics & operational intelligence engine on the CRM host.
 * Invokes App\Services\Reports\NatalForensicStatisticsService and NatalValidOrdersQuery
 * (same services backing /gestao/natal/estatisticas) and emits a structured JSON payload.
 * Never performs any write or mutation.
 */

$appBase = getenv('EVYD_CRM_APP_PATH') ?: '/var/www/evydencia/current';
$autoload = rtrim($appBase, '/\\') . '/vendor/autoload.php';
$bootstrap = rtrim($appBase, '/\\') . '/bootstrap/app.php';

if (!is_file($autoload) || !is_file($bootstrap)) {
    fwrite(STDERR, json_encode(['error' => 'crm_natal_bridge_unavailable']) . "\n");
    exit(2);
}

$targetMmDd = isset($argv[1]) && preg_match('/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/', (string) $argv[1])
    ? (string) $argv[1]
    : '';

require $autoload;
$app = require $bootstrap;
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$refYear = (int) config('natal.reference_year', 2026);
$ctx = App\Services\Reports\NatalAnalyticsContext::forYear($refYear);
$svc = app(App\Services\Reports\NatalForensicStatisticsService::class);
$validQuery = app(App\Services\Reports\NatalValidOrdersQuery::class);
$now = Carbon\CarbonImmutable::now('America/Sao_Paulo');

$immutable = $svc->getHistoricalImmutableData();
$kpis = $svc->getDynamic2026Data(false, $ctx);
$pacingForecast = $svc->getRealtimePacingForecastData(null, false, $ctx);

$cutoffMmDd = $targetMmDd !== '' ? $targetMmDd : $ctx->asOf->format('m-d');
$calendarMatrix = $immutable['calendar_matrix'] ?? [];
$dailyTimeline2026 = $kpis['daily_timeline'] ?? [];

$actualExtrasCents = (int) ($kpis['actual_photo_extras_cents'] ?? 0);
$promotionalExtrasCents = (int) ($kpis['promotional_photo_extras_collected_cents'] ?? 0);
$unallocatedCouponExtrasCents = (int) ($kpis['photo_extra_coupon_unallocated_collected_cents'] ?? 0);
$contractedCents = (int) ($kpis['contracted_cents'] ?? 0);
$basePackagesCents = max(0, $contractedCents - $actualExtrasCents - $promotionalExtrasCents - $unallocatedCouponExtrasCents);

$evolution = array_values(array_filter($immutable['evolution'] ?? [], static fn ($item) => (int) ($item['year'] ?? 0) !== 2026));
$evolution[] = [
    'year' => 2026,
    'orders' => (int) ($kpis['total_orders'] ?? 0),
    'unique_customers' => (int) ($kpis['total_customers'] ?? 0),
    'base_packages_revenue' => round($basePackagesCents / 100, 2),
    'extras_revenue' => round($actualExtrasCents / 100, 2),
    'promotional_photo_extras_revenue' => round($promotionalExtrasCents / 100, 2),
    'unallocated_coupon_photo_extras_revenue' => round($unallocatedCouponExtrasCents / 100, 2),
    'extras_projected_revenue' => (float) ($kpis['projected_extras_revenue'] ?? 0),
    'contracted_revenue' => (float) ($kpis['contracted_revenue'] ?? 0),
    'total_projected_revenue' => (float) ($kpis['total_projected_revenue'] ?? 0),
    'paid_revenue' => (float) ($kpis['paid_revenue'] ?? 0),
    'balance_due' => (float) ($kpis['balance_due'] ?? 0),
    'ticket_medio' => (float) ($kpis['ticket_medio_order'] ?? 0),
    'ticket_medio_customer' => (float) ($kpis['ticket_medio_customer'] ?? 0),
    'scheduled_sessions' => (int) ($kpis['scheduled_sessions'] ?? 0),
];

$orders2026 = max(1, (int) ($kpis['total_orders'] ?? 0));
$rev2026 = max(1.0, (float) ($kpis['contracted_revenue'] ?? 0));
$pkg2026 = ['year' => 2026, 'total_orders' => (int) ($kpis['total_orders'] ?? 0), 'total_revenue' => (float) ($kpis['contracted_revenue'] ?? 0)];
foreach (['entao_e_natal', 'ho_ho_ho', 'boas_festas'] as $pkgKey) {
    $po = (int) ($kpis['packages'][$pkgKey]['orders'] ?? 0);
    $pr = (float) ($kpis['packages'][$pkgKey]['revenue'] ?? 0.0);
    $pkg2026[$pkgKey] = [
        'orders' => $po,
        'revenue' => $pr,
        'paid' => (float) ($kpis['packages'][$pkgKey]['paid'] ?? 0.0),
        'balance' => (float) ($kpis['packages'][$pkgKey]['balance'] ?? 0.0),
        'ticket_medio' => $po > 0 ? round($pr / $po, 2) : 0.0,
        'pct_orders' => round(($po / $orders2026) * 100, 1),
        'pct_revenue' => round(($pr / $rev2026) * 100, 1),
    ];
}
$packagesMatrix = array_values(array_filter($immutable['packages_matrix'] ?? [], static fn ($p) => (int) ($p['year'] ?? 0) !== 2026));
$packagesMatrix[] = $pkg2026;

$metaByYear = [
    2026 => [
        'open_note' => 'Primeira venda efetiva registrada no CRM',
        'total_year_orders' => (int) ($kpis['total_orders'] ?? 0),
        'total_year_rev' => (float) ($kpis['contracted_revenue'] ?? 0),
    ],
];
foreach ($evolution as $evoRow) {
    $yr = (int) ($evoRow['year'] ?? 0);
    if ($yr < 2021 || $yr > 2025) {
        continue;
    }
    $firstSale = null;
    foreach ($calendarMatrix[(string) $yr] ?? [] as $d => $day) {
        if ((int) ($day['day_orders'] ?? 0) > 0 && ($firstSale === null || (string) $d < $firstSale)) {
            $firstSale = (string) $d;
        }
    }
    $metaByYear[$yr] = [
        'open_note' => $firstSale !== null
            ? 'Primeira venda registrada: ' . substr($firstSale, 3, 2) . '/' . substr($firstSale, 0, 2)
            : 'Primeira venda não informada',
        'total_year_orders' => isset($evoRow['orders']) ? (int) $evoRow['orders'] : null,
        'total_year_rev' => isset($evoRow['contracted_revenue']) ? (float) $evoRow['contracted_revenue'] : null,
    ];
}

$computeAtMmDd = static function (string $mmdd) use ($calendarMatrix, $dailyTimeline2026, $metaByYear): array {
    $totals = [];
    foreach ([2026, 2025, 2024, 2023, 2022, 2021] as $yr) {
        $yrStr = (string) $yr;
        if ($yr === 2026) {
            $accumOrders = 0;
            $accumRev = 0.0;
            $dayOrders = 0;
            $dayRev = 0.0;
            foreach ($dailyTimeline2026 as $d => $info) {
                if ((string) $d <= $mmdd) {
                    $accumOrders += (int) ($info['orders'] ?? 0);
                    $accumRev += (float) ($info['revenue'] ?? 0.0);
                }
                if ((string) $d === $mmdd) {
                    $dayOrders = (int) ($info['orders'] ?? 0);
                    $dayRev = (float) ($info['revenue'] ?? 0.0);
                }
            }
            $accumRev = round($accumRev, 2);
            $dayRev = round($dayRev, 2);
        } else {
            $dayData = $calendarMatrix[$yrStr][$mmdd] ?? [];
            $dayOrders = (int) ($dayData['day_orders'] ?? 0);
            $dayRev = (float) ($dayData['day_revenue'] ?? $dayData['day_revenue_total'] ?? 0.0);
            $accumOrders = (int) ($dayData['accum_orders'] ?? 0);
            $accumRev = (float) ($dayData['accum_revenue'] ?? $dayData['accum_revenue_total'] ?? 0.0);
        }
        $meta = $metaByYear[$yr] ?? [];
        $totals[$yrStr] = [
            'year' => $yr,
            'is_current' => $yr === 2026,
            'day_orders' => $dayOrders,
            'day_revenue' => $dayRev,
            'accum_orders' => $accumOrders,
            'accum_revenue' => $accumRev,
            'open_note' => $meta['open_note'] ?? '',
            'total_year_orders' => $meta['total_year_orders'] ?? null,
            'total_year_rev' => $meta['total_year_rev'] ?? null,
        ];
    }
    $c2026 = $totals['2026'] ?? ['accum_orders' => 0, 'accum_revenue' => 0.0];
    foreach ($totals as $yrStr => &$row) {
        $o = (int) ($row['accum_orders'] ?? 0);
        $r = (float) ($row['accum_revenue'] ?? 0.0);
        $row['ticket_medio'] = $o > 0 ? round($r / $o, 2) : 0.0;
        if ((int) $yrStr !== 2026) {
            $row['diff_orders_2026_vs_year'] = (int) $c2026['accum_orders'] - $o;
            $row['diff_revenue_2026_vs_year'] = round((float) $c2026['accum_revenue'] - $r, 2);
            $row['pct_orders_2026_vs_year'] = $o > 0
                ? round((((int) $c2026['accum_orders'] - $o) / $o) * 100, 1)
                : null;
        }
    }
    unset($row);
    return $totals;
};

$ytdByYear = $computeAtMmDd($cutoffMmDd);

$monthCheckpoints = [
    '01-31' => 'Jan',
    '02-28' => 'Fev',
    '03-31' => 'Mar',
    '04-30' => 'Abr',
    '05-31' => 'Mai',
    '06-30' => 'Jun',
    '07-31' => 'Jul',
    '08-31' => 'Ago',
    '09-30' => 'Set',
    '10-31' => 'Out',
    '11-30' => 'Nov',
    '12-31' => 'Dez',
];
$monthlyCumulative = [];
foreach ($monthCheckpoints as $mEnd => $label) {
    if ($mEnd < $cutoffMmDd) {
        $mSim = $computeAtMmDd($mEnd);
        $point = ['mmdd' => $mEnd, 'label' => $label, 'by_year' => []];
        foreach (['2021', '2022', '2023', '2024', '2025', '2026'] as $y) {
            $point['by_year'][$y] = [
                'accum_orders' => (int) ($mSim[$y]['accum_orders'] ?? 0),
                'accum_revenue' => (float) ($mSim[$y]['accum_revenue'] ?? 0),
            ];
        }
        $monthlyCumulative[] = $point;
    }
}
$cutoffFmt = substr($cutoffMmDd, 3, 2) . '/' . substr($cutoffMmDd, 0, 2);
$cutoffPoint = ['mmdd' => $cutoffMmDd, 'label' => $cutoffFmt, 'by_year' => []];
foreach (['2021', '2022', '2023', '2024', '2025', '2026'] as $y) {
    $cutoffPoint['by_year'][$y] = [
        'accum_orders' => (int) ($ytdByYear[$y]['accum_orders'] ?? 0),
        'accum_revenue' => (float) ($ytdByYear[$y]['accum_revenue'] ?? 0),
    ];
}
$monthlyCumulative[] = $cutoffPoint;

$statusLabels = [
    'order_created' => 'Pedido Criado',
    'waiting_payment' => 'Aguardando Pagamento',
    'payment_confirmed' => 'Pagamento Confirmado (Sem Data Agendada)',
    'session_schedule' => 'Sessão Agendada',
    'session_schedule_confirmed' => 'Sessão Realizada / Confirmada',
    'selection_schedule' => 'Seleção de Fotos',
    'selection_schedule_confirmed' => 'Seleção Confirmada',
    'waiting_product_retrieve' => 'Aguardando Retirada',
    'product_retrieve_confirmed' => 'Produto Entregue',
    'order_completed' => 'Pedido Concluído',
];

// Detailed 2026 valid orders operational breakdown (statuses, waiting_product_retrieve, missing participants, next session, realized sessions)
$start2026 = Carbon\CarbonImmutable::parse('2026-01-01 00:00:00', 'America/Sao_Paulo');
$end2026 = Carbon\CarbonImmutable::parse('2026-12-31 23:59:59', 'America/Sao_Paulo');
$cutoffDt2026 = Carbon\CarbonImmutable::parse("2026-{$cutoffMmDd} 23:59:59", 'America/Sao_Paulo');

$validRows2026 = $validQuery->validNatalOrders($now, $start2026, $end2026, 'natal')
    ->join('customers as c', 'c.id', '=', 'o.customer_id')
    ->select('o.id', 'o.uuid', 'o.schedule_1', 'o.created_at', 'current_status.status as status_key', 'c.name as customer_name')
    ->get();

$validIds2026 = $validRows2026->pluck('id')->map(static fn ($v) => (int) $v)->all();
$eloquentOrders2026 = App\Models\Order::with(['participants.relation', 'items.product'])
    ->whereIn('id', $validIds2026)
    ->get()
    ->keyBy('id');

$formatParticipants = static function ($orderModel): array {
    if (!$orderModel || !$orderModel->relationLoaded('participants')) {
        return [];
    }
    $list = [];
    foreach ($orderModel->participants as $p) {
        $list[] = [
            'name' => trim((string) ($p->name ?? '')),
            'birth_date' => $p->birth ? (string) $p->birth : null,
            'age' => method_exists($p, 'ageLabel') ? ($p->ageLabel() ?: null) : null,
            'kinship' => $p->relation?->name ? trim((string) $p->relation->name) : null,
        ];
    }
    return $list;
};

$formatPackageName = static function ($orderModel): ?string {
    if (!$orderModel || !$orderModel->relationLoaded('items')) {
        return null;
    }
    foreach ($orderModel->items as $it) {
        if (($it->product?->slug ?? null) === 'natal' && !empty($it->product?->name)) {
            return (string) $it->product->name;
        }
    }
    return $orderModel->items->first()?->product?->name ?? null;
};

$byStatus2026 = [];
$waitingRetrieveOrders = [];
$activeWithoutParticipants = [];
$completedWithoutParticipants = [];
$upcomingSessions2026 = [];
$realizedSessions2026 = [];

foreach ($validRows2026 as $r) {
    $oid = (int) $r->id;
    $uuid = (string) $r->uuid;
    $stKey = (string) $r->status_key;
    $stLabel = $statusLabels[$stKey] ?? $stKey;
    $crmUrl = "https://evydencia.com/gestao/pedidos/{$uuid}/detalhes";
    $om = $eloquentOrders2026->get($oid);
    $parts = $formatParticipants($om);
    $partsCount = count($parts);
    $pkgName = $formatPackageName($om);
    $schedStr = $r->schedule_1 ? (string) $r->schedule_1 : null;
    $createdBrt = $r->created_at
        ? Carbon\CarbonImmutable::parse((string) $r->created_at, 'UTC')->setTimezone('America/Sao_Paulo')->format('Y-m-d H:i:s')
        : null;

    $summaryItem = [
        'order_id' => $oid,
        'uuid' => $uuid,
        'crm_order_url' => $crmUrl,
        'customer_name' => (string) $r->customer_name,
        'package_name' => $pkgName,
        'status_key' => $stKey,
        'status_label' => $stLabel,
        'session_at' => $schedStr,
        'created_at_brt' => $createdBrt,
        'participants_count' => $partsCount,
        'participants' => $parts,
    ];

    if (!isset($byStatus2026[$stKey])) {
        $byStatus2026[$stKey] = [
            'status_key' => $stKey,
            'status_label' => $stLabel,
            'count' => 0,
            'orders' => [],
        ];
    }
    $byStatus2026[$stKey]['count']++;
    $byStatus2026[$stKey]['orders'][] = $summaryItem;

    if ($stKey === 'waiting_product_retrieve') {
        $waitingRetrieveOrders[] = $summaryItem;
    }

    if ($partsCount === 0) {
        if (in_array($stKey, ['payment_confirmed', 'session_schedule'], true)) {
            $activeWithoutParticipants[] = $summaryItem;
        } else {
            $completedWithoutParticipants[] = $summaryItem;
        }
    }

    if ($schedStr !== null) {
        $schedDt = Carbon\CarbonImmutable::parse($schedStr, 'America/Sao_Paulo');
        if ($schedDt->greaterThanOrEqualTo($now)) {
            $upcomingSessions2026[] = $summaryItem;
        }
        if ($schedDt->lessThanOrEqualTo($cutoffDt2026) && $schedDt->lessThanOrEqualTo($now)) {
            $realizedSessions2026[] = $summaryItem;
        }
    }
}

usort($upcomingSessions2026, static fn ($a, $b) => strcmp((string) $a['session_at'], (string) $b['session_at']));
usort($realizedSessions2026, static fn ($a, $b) => strcmp((string) $b['session_at'], (string) $a['session_at']));
usort($activeWithoutParticipants, static fn ($a, $b) => strcmp((string) $a['customer_name'], (string) $b['customer_name']));

// Historical realized sessions up to cutoff MM-DD (2021-2025 cached in Laravel Cache for 1h + live 2026)
$histRealizedCacheKey = "natal_mcp_hist_realized_v1:{$cutoffMmDd}";
$histRealized = Illuminate\Support\Facades\Cache::remember($histRealizedCacheKey, 3600, static function () use ($validQuery, $cutoffMmDd): array {
    $res = [];
    foreach ([2021, 2022, 2023, 2024, 2025] as $yr) {
        $yrStart = Carbon\CarbonImmutable::parse("{$yr}-01-01 00:00:00", 'America/Sao_Paulo');
        $yrEnd = Carbon\CarbonImmutable::parse("{$yr}-12-31 23:59:59", 'America/Sao_Paulo');
        $cutoffDt = Carbon\CarbonImmutable::parse("{$yr}-{$cutoffMmDd} 23:59:59", 'America/Sao_Paulo');
        $rows = $validQuery->validNatalOrders($yrEnd, $yrStart, $yrEnd, 'natal')
            ->select('o.id', 'o.schedule_1', 'current_status.status as status_key')
            ->get();
        $realizedAtCutoff = 0;
        $fullYearScheduled = 0;
        foreach ($rows as $row) {
            if (!empty($row->schedule_1)) {
                $fullYearScheduled++;
                $sdt = Carbon\CarbonImmutable::parse((string) $row->schedule_1, 'America/Sao_Paulo');
                if ($sdt->year === $yr && $sdt->lessThanOrEqualTo($cutoffDt)) {
                    $realizedAtCutoff++;
                }
            }
        }
        $res[(string) $yr] = [
            'year' => $yr,
            'is_current' => false,
            'realized_sessions_up_to_cutoff' => $realizedAtCutoff,
            'full_year_scheduled_sessions' => $fullYearScheduled,
            'full_year_valid_orders' => count($rows),
        ];
    }
    return $res;
});

$realized2026Count = count($realizedSessions2026);
$realizedComparison = $histRealized;
$realizedComparison['2026'] = [
    'year' => 2026,
    'is_current' => true,
    'realized_sessions_up_to_cutoff' => $realized2026Count,
    'full_year_scheduled_sessions' => (int) ($kpis['scheduled_sessions'] ?? 0),
    'full_year_valid_orders' => (int) ($kpis['total_orders'] ?? 0),
    'remaining_scheduled_future_sessions' => count($upcomingSessions2026),
    'unscheduled_valid_orders' => (int) ($kpis['unscheduled_sessions'] ?? 0),
];
foreach ($realizedComparison as $yrStr => &$rRow) {
    if ((int) $yrStr !== 2026) {
        $prev = (int) ($rRow['realized_sessions_up_to_cutoff'] ?? 0);
        $rRow['diff_2026_vs_year'] = $realized2026Count - $prev;
        $rRow['pct_2026_vs_year'] = $prev > 0 ? round((($realized2026Count - $prev) / $prev) * 100, 1) : null;
    }
}
unset($rRow);

$recentOrders = [];
foreach (array_slice($kpis['recent_orders'] ?? [], 0, 15) as $ro) {
    $oid = (int) ($ro['id'] ?? 0);
    $uuid = (string) ($ro['uuid'] ?? '');
    $om = $eloquentOrders2026->get($oid);
    $recentOrders[] = [
        'order_id' => $oid,
        'uuid' => $uuid,
        'crm_order_url' => $uuid !== '' ? "https://evydencia.com/gestao/pedidos/{$uuid}/detalhes" : null,
        'customer_name' => (string) ($ro['customer_name'] ?? ''),
        'package' => (string) ($ro['package'] ?? ''),
        'total_reais' => (float) ($ro['total'] ?? 0),
        'paid_reais' => (float) ($ro['paid'] ?? 0),
        'balance_reais' => (float) ($ro['balance'] ?? 0),
        'status_key' => (string) ($ro['status'] ?? ''),
        'status_label' => (string) ($ro['status_label'] ?? ''),
        'is_scheduled' => (bool) ($ro['is_scheduled'] ?? false),
        'session_date' => $ro['session_date'] ?? null,
        'created_at_brt' => (string) ($ro['created_at'] ?? ''),
        'participants' => $formatParticipants($om),
    ];
}

$out = [
    'source' => 'CRM_CANONICAL_NATAL_STATISTICS',
    'canonical_dashboard_url' => 'https://evydencia.com/gestao/natal/estatisticas',
    'as_of' => $now->toIso8601String(),
    'reference_year' => $refYear,
    'cutoff_mmdd' => $cutoffMmDd,
    'cutoff_formatted' => $cutoffFmt,
    'kpis_2026' => [
        'valid_orders' => (int) ($kpis['total_orders'] ?? 0),
        'unique_customers' => (int) ($kpis['total_customers'] ?? 0),
        'new_customers' => (int) ($kpis['new_customers'] ?? 0),
        'recurring_customers' => (int) ($kpis['recurring_customers'] ?? 0),
        'fidelity_rate_pct' => (float) ($kpis['fidelity_rate_pct'] ?? 0),
        'scheduled_sessions' => (int) ($kpis['scheduled_sessions'] ?? 0),
        'unscheduled_sessions' => (int) ($kpis['unscheduled_sessions'] ?? 0),
        'scheduled_pct' => (float) ($kpis['scheduled_pct'] ?? 0),
        'realized_sessions_to_date' => $realized2026Count,
        'upcoming_scheduled_sessions' => count($upcomingSessions2026),
        'waiting_product_retrieve_orders' => count($waitingRetrieveOrders),
        'active_orders_without_participants' => count($activeWithoutParticipants),
        'total_valid_orders_without_participants' => count($activeWithoutParticipants) + count($completedWithoutParticipants),
        'contracted_revenue_reais' => (float) ($kpis['contracted_revenue'] ?? 0),
        'paid_revenue_reais' => (float) ($kpis['paid_revenue'] ?? 0),
        'balance_due_reais' => (float) ($kpis['balance_due'] ?? 0),
        'projected_extras_revenue_reais' => (float) ($kpis['projected_extras_revenue'] ?? 0),
        'total_projected_revenue_reais' => (float) ($kpis['total_projected_revenue'] ?? 0),
        'ticket_medio_order_reais' => (float) ($kpis['ticket_medio_order'] ?? 0),
        'ticket_medio_customer_reais' => (float) ($kpis['ticket_medio_customer'] ?? 0),
        'goal_orders' => (int) ($kpis['goal_orders'] ?? 500),
        'goal_revenue_reais' => (float) ($kpis['goal_revenue'] ?? 400000),
        'goal_orders_progress_pct' => (float) ($kpis['goal_orders_progress_pct'] ?? 0),
        'goal_revenue_progress_pct' => (float) ($kpis['goal_revenue_progress_pct'] ?? 0),
        'packages_2026' => $kpis['packages'] ?? [],
    ],
    'operational_stages_2026' => [
        'waiting_product_retrieve_count' => count($waitingRetrieveOrders),
        'waiting_product_retrieve_orders' => $waitingRetrieveOrders,
        'by_status' => $byStatus2026,
    ],
    'orders_without_participants_2026' => [
        'active_pending_count' => count($activeWithoutParticipants),
        'completed_without_participants_count' => count($completedWithoutParticipants),
        'total_valid_without_participants_count' => count($activeWithoutParticipants) + count($completedWithoutParticipants),
        'sessions_with_participants_count' => count($validRows2026) - (count($activeWithoutParticipants) + count($completedWithoutParticipants)),
        'active_pending_orders' => $activeWithoutParticipants,
        'completed_without_participants_orders' => $completedWithoutParticipants,
    ],
    'sessions_schedule_2026' => [
        'as_of_brt' => $now->format('Y-m-d H:i:s'),
        'next_session' => $upcomingSessions2026[0] ?? null,
        'upcoming_sessions_count' => count($upcomingSessions2026),
        'upcoming_sessions_next_15' => array_slice($upcomingSessions2026, 0, 15),
        'realized_sessions_2026_count' => $realized2026Count,
        'realized_sessions_2026_orders' => $realizedSessions2026,
    ],
    'realized_sessions_comparison_at_cutoff' => [
        'cutoff_mmdd' => $cutoffMmDd,
        'cutoff_formatted' => $cutoffFmt,
        'rule' => 'Ensaios válidos de Natal (excluindo cancelados/order_aborted, payment_chargeback, payment_refunded e waiting_payment via NatalValidOrdersQuery) cuja data/hora da sessão (schedule_1) ocorreu até ' . $cutoffFmt . ' de cada ano.',
        'by_year' => $realizedComparison,
    ],
    'ytd_comparison_at_cutoff' => $ytdByYear,
    'monthly_cumulative_to_cutoff' => $monthlyCumulative,
    'annual_evolution_full_season' => $evolution,
    'packages_matrix_by_year' => $packagesMatrix,
    'pacing_forecast' => $pacingForecast,
    'conversion_funnel_2026' => $kpis['conversion_funnel'] ?? null,
    'recent_valid_natal_orders_2026' => $recentOrders,
    'methodology_note' => 'Fonte oficial da Central de Inteligência Comercial (/gestao/natal/estatisticas). Todos os indicadores excluem cancelados (order_aborted), chargeback, estornados e aguardando pagamento (NatalValidOrdersQuery). Inclui estágios operacionais (aguardando retirada), pedidos sem participantes, próxima sessão de Natal agendada, comparativo histórico de ensaios realizados até a mesma data (2021-2026) e comparativo de vendas acumuladas.',
];

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
