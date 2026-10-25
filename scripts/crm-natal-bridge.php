<?php
declare(strict_types=1);

/**
 * Read-only CLI bridge for the canonical Natal statistics engine on the CRM host.
 * Invokes App\Services\Reports\NatalForensicStatisticsService (same service backing
 * /gestao/natal/estatisticas) and emits a compact, PII-free JSON payload.
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

$recentOrders = [];
foreach (array_slice($kpis['recent_orders'] ?? [], 0, 15) as $ro) {
    $recentOrders[] = [
        'order_id' => (int) ($ro['id'] ?? 0),
        'uuid' => (string) ($ro['uuid'] ?? ''),
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
    ];
}

$out = [
    'source' => 'CRM_CANONICAL_NATAL_STATISTICS',
    'canonical_dashboard_url' => 'https://evydencia.com/gestao/natal/estatisticas',
    'as_of' => $ctx->asOf->toIso8601String(),
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
    'ytd_comparison_at_cutoff' => $ytdByYear,
    'monthly_cumulative_to_cutoff' => $monthlyCumulative,
    'annual_evolution_full_season' => $evolution,
    'packages_matrix_by_year' => $packagesMatrix,
    'pacing_forecast' => $pacingForecast,
    'conversion_funnel_2026' => $kpis['conversion_funnel'] ?? null,
    'recent_valid_natal_orders_2026' => $recentOrders,
    'methodology_note' => 'Fonte oficial da Central de Inteligência Comercial (/gestao/natal/estatisticas). Conta exclusivamente pedidos de Natal válidos (NatalValidOrdersQuery / evidência comercial confirmada), eliminando duplicidades de itens ou pedidos cancelados/aguardando pagamento. Para 2021–2025, packages_matrix_by_year exibe o fechamento da temporada completa daquele ano, enquanto ytd_comparison_at_cutoff e monthly_cumulative_to_cutoff exibem o acumulado exato até a data de corte (ex.: 25/10: 101 em 2026, 142 em 2025, 124 em 2024, 67 em 2023, 80 em 2022, 128 em 2021).',
];

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
