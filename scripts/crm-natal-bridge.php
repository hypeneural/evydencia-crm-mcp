<?php
declare(strict_types=1);

// Read-only CLI bridge for canonical Natal statistics (NatalForensicStatisticsService).
// Executed via execFile('php', ...) with no shell and read-only filesystem protection.

$appPath = getenv('EVYD_CRM_APP_PATH') ?: '/var/www/evydencia/current';
$mmdd = isset($argv[1]) && preg_match('/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/', (string) $argv[1])
    ? (string) $argv[1]
    : '';

require $appPath . '/vendor/autoload.php';
$app = require $appPath . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$refYear = (int) config('natal.reference_year', 2026);
$svc = app(App\Services\Reports\NatalForensicStatisticsService::class);
$ctx = App\Services\Reports\NatalAnalyticsContext::forYear($refYear);
$ov = $svc->getOverviewData(false, $ctx);

$targetMmDd = $mmdd !== '' ? $mmdd : (string) ($ov['ytd_comparison']['as_of_mmdd'] ?? date('m-d'));
$sim = $svc->getSalesSimulatorData($targetMmDd, $ctx);
$k26 = $ov['kpis_2026'] ?? [];
$im = $svc->getHistoricalImmutableData();
$cal = $im['calendar_matrix'] ?? [];

// Build monthly cumulative series up to targetMmDd for 2021-2026 from canonical calendar_matrix & 2026 daily_timeline
$monthEnds = [
    '01' => '01-31', '02' => '02-28', '03' => '03-31', '04' => '04-30',
    '05' => '05-31', '06' => '06-30', '07' => '07-31', '08' => '08-31',
    '09' => '09-30', '10' => '10-31', '11' => '11-30', '12' => '12-31',
];
$targetMonth = substr($targetMmDd, 0, 2);
$monthlyAccumByYear = [];
foreach ([2021, 2022, 2023, 2024, 2025] as $y) {
    $yrStr = (string) $y;
    $series = [];
    foreach ($monthEnds as $m => $endKey) {
        if ($m > $targetMonth) {
            break;
        }
        $key = ($m === $targetMonth) ? $targetMmDd : $endKey;
        $series[$key] = (int) ($cal[$yrStr][$key]['accum_orders'] ?? 0);
    }
    $monthlyAccumByYear[$yrStr] = $series;
}

// Compute 2026 cumulative from kpis_2026.daily_timeline
$timeline2026 = is_array($k26['daily_timeline'] ?? null) ? $k26['daily_timeline'] : [];
ksort($timeline2026);
$series2026 = [];
foreach ($monthEnds as $m => $endKey) {
    if ($m > $targetMonth) {
        break;
    }
    $cutoffKey = ($m === $targetMonth) ? $targetMmDd : $endKey;
    $sum = 0;
    foreach ($timeline2026 as $dayKey => $info) {
        if ((string) $dayKey <= $cutoffKey) {
            $sum += (int) ($info['orders'] ?? 0);
        }
    }
    $series2026[$cutoffKey] = $sum;
}
$monthlyAccumByYear['2026'] = $series2026;

// Build YTD comparison table combining ytd_comparison & simulator totals
$orders2026AtCutoff = (int) ($sim['totals']['2026']['accum_orders'] ?? $k26['total_orders'] ?? 0);
$rev2026AtCutoff = (float) ($sim['totals']['2026']['accum_revenue'] ?? $k26['contracted_revenue'] ?? 0);
$ytdByYear = [];
foreach ([2026, 2025, 2024, 2023, 2022, 2021] as $y) {
    $yrStr = (string) $y;
    $s = $sim['totals'][$yrStr] ?? $sim['totals'][$y] ?? [];
    $accumOrders = (int) ($s['accum_orders'] ?? 0);
    $accumRev = (float) ($s['accum_revenue'] ?? 0);
    $diffOrders = $y === 2026 ? 0 : ($orders2026AtCutoff - $accumOrders);
    $diffPct = ($y !== 2026 && $accumOrders > 0) ? round(($diffOrders / $accumOrders) * 100, 2) : null;
    $ytdByYear[$yrStr] = [
        'year' => $y,
        'accum_orders' => $accumOrders,
        'accum_revenue_reais' => $accumRev,
        'day_orders' => (int) ($s['day_orders'] ?? 0),
        'day_revenue_reais' => (float) ($s['day_revenue'] ?? 0),
        'ticket_medio_reais' => $accumOrders > 0 ? round($accumRev / $accumOrders, 2) : 0.0,
        'diff_orders_2026_vs_year' => $diffOrders,
        'diff_pct_2026_vs_year' => $diffPct,
        'full_year_orders' => (int) ($s['total_year_orders'] ?? 0),
        'full_year_revenue_reais' => (float) ($s['total_year_rev'] ?? 0),
    ];
}

// Sanitize recent 2026 Natal orders (top 10 most recent)
$rawOrders2026 = is_array($k26['raw_orders'] ?? null) ? $k26['raw_orders'] : [];
usort($rawOrders2026, static fn (array $a, array $b): int => ((int) ($b['order_id'] ?? 0)) <=> ((int) ($a['order_id'] ?? 0)));
$recent2026 = array_map(static function (array $r): array {
    return [
        'order_id' => (int) ($r['order_id'] ?? 0),
        'order_uuid' => (string) ($r['order_uuid'] ?? ''),
        'customer_name' => (string) ($r['customer_name'] ?? ''),
        'customer_phone_masked' => (string) ($r['customer_whatsapp'] ?? ''),
        'package_name' => (string) ($r['package_name'] ?? ''),
        'order_total_reais' => (float) ($r['order_total'] ?? 0),
        'order_received_reais' => (float) ($r['order_received'] ?? 0),
        'order_status' => (string) ($r['order_status'] ?? ''),
        'order_created_at' => (string) ($r['order_created_at'] ?? ''),
        'session_scheduled_date' => $r['session_scheduled_date'] ?? null,
    ];
}, array_slice($rawOrders2026, 0, 10));

$out = [
    'source' => 'CRM_CANONICAL_NATAL_STATISTICS',
    'canonical_dashboard_url' => 'https://evydencia.com/gestao/natal/estatisticas',
    'as_of' => $ov['as_of'] ?? null,
    'reference_year' => $refYear,
    'cutoff_mmdd' => $targetMmDd,
    'cutoff_formatted' => $sim['target_date_formatted'] ?? ($ov['ytd_comparison']['as_of_date'] ?? $targetMmDd),
    'kpis_2026' => [
        'valid_orders' => (int) ($k26['total_orders'] ?? 0),
        'unique_customers' => (int) ($k26['total_customers'] ?? 0),
        'new_customers' => (int) ($k26['new_customers'] ?? 0),
        'recurring_customers' => (int) ($k26['recurring_customers'] ?? 0),
        'fidelity_rate_pct' => (float) ($k26['fidelity_rate_pct'] ?? 0),
        'scheduled_sessions' => (int) ($k26['scheduled_sessions'] ?? 0),
        'unscheduled_sessions' => (int) ($k26['unscheduled_sessions'] ?? 0),
        'scheduled_pct' => (float) ($k26['scheduled_pct'] ?? 0),
        'contracted_revenue_reais' => (float) ($k26['contracted_revenue'] ?? 0),
        'paid_revenue_reais' => (float) ($k26['paid_revenue'] ?? 0),
        'balance_due_reais' => (float) ($k26['balance_due'] ?? 0),
        'projected_extras_revenue_reais' => (float) ($k26['projected_extras_revenue'] ?? 0),
        'total_projected_revenue_reais' => (float) ($k26['total_projected_revenue'] ?? 0),
        'ticket_medio_order_reais' => (float) ($k26['ticket_medio_order'] ?? 0),
        'ticket_medio_customer_reais' => (float) ($k26['ticket_medio_customer'] ?? 0),
        'goal_orders' => (int) ($k26['goal_orders'] ?? 500),
        'goal_revenue_reais' => (float) ($ov['pacing_forecast']['target_revenue'] ?? 400000),
        'goal_orders_progress_pct' => (float) ($k26['goal_orders_progress_pct'] ?? 0),
        'goal_revenue_progress_pct' => (float) ($k26['goal_revenue_progress_pct'] ?? 0),
        'packages_2026' => $k26['packages'] ?? [],
    ],
    'ytd_comparison_at_cutoff' => $ytdByYear,
    'monthly_cumulative_orders_up_to_cutoff' => $monthlyAccumByYear,
    'annual_evolution_2021_2026' => $ov['evolution'] ?? [],
    'packages_matrix_2021_2026' => $ov['packages_matrix'] ?? [],
    'pacing_forecast' => $ov['pacing_forecast'] ?? [],
    'conversion_funnel' => [
        'funnel_steps_2026' => $ov['lead_times']['funnel_steps'] ?? [],
        'historical_conversion_2021_2026' => $ov['lead_times']['evolution'] ?? [],
        'summary' => $ov['lead_times']['summary'] ?? [],
    ],
    'recent_natal_2026_orders' => $recent2026,
    'note' => 'Fonte canônica oficial da Central de Inteligência Comercial — Natal 2026 (/gestao/natal/estatisticas). Expurga cancelados, chargebacks e abortados.',
];

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
