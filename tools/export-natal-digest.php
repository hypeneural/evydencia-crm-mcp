<?php
/**
 * Export *only* canonical commercial aggregates from the existing Laravel CRM.
 * This is a standalone CLI script in the MCP repo; it does NOT edit Laravel.
 * Do not execute on production until the owner approves the run and benchmarks the query.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit(1);
}
$options = [];
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--help') {
        fwrite(STDOUT, "Usage: php tools/export-natal-digest.php --crm-root=ABSOLUTE_CRM_PATH --output=ABSOLUTE_PRIVATE_PATH.json\n");
        exit(0);
    }
    if (!preg_match('/^--(crm-root|output)=(.+)$/D', $arg, $matches) || isset($options[$matches[1]])) {
        fwrite(STDERR, "EXPORT_BLOCKED: invalid_argument\n");
        exit(2);
    }
    $options[$matches[1]] = $matches[2];
}
if (count($options) !== 2 || !isset($options['crm-root'], $options['output'])) {
    fwrite(STDERR, "EXPORT_BLOCKED: missing_paths\n");
    exit(2);
}
function absolutePath(string $path): bool {
    return str_starts_with($path, '/') || (bool) preg_match('/^[A-Za-z]:[\\\\\/]/', $path);
}
function below(string $path, string $parent): bool {
    $path = str_replace('\\', '/', rtrim($path, '/\\'));
    $parent = str_replace('\\', '/', rtrim($parent, '/\\'));
    if (PHP_OS_FAMILY === 'Windows') {
        $path = strtolower($path);
        $parent = strtolower($parent);
    }
    return $path === $parent || str_starts_with($path, $parent.'/');
}
$repoRoot = realpath(dirname(__DIR__));
$crmRoot = realpath($options['crm-root']);
$output = $options['output'];
if (!$repoRoot || !$crmRoot || !absolutePath($options['crm-root']) || !absolutePath($output) ||
    !is_file($crmRoot.'/bootstrap/app.php') || !is_file($crmRoot.'/vendor/autoload.php') ||
    !str_ends_with(strtolower($output), '.json') || is_link($output)) {
    fwrite(STDERR, "EXPORT_BLOCKED: invalid_location_or_missing_CRM_dependencies\n");
    exit(2);
}
$parent = realpath(dirname($output));
if (!$parent || !is_dir($parent) || !is_writable($parent) ||
    below($parent, $repoRoot) || below($parent, $crmRoot) ||
    below($crmRoot, $repoRoot) || below($repoRoot, $crmRoot)) {
    fwrite(STDERR, "EXPORT_BLOCKED: output_must_be_private_outside_repositories\n");
    exit(2);
}
if (is_file($output) && !is_writable($output)) {
    fwrite(STDERR, "EXPORT_BLOCKED: output_not_writable\n");
    exit(2);
}
try {
    chdir($crmRoot);
    require_once $crmRoot.'/vendor/autoload.php';
    $app = require $crmRoot.'/bootstrap/app.php';
    $kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();
    $timezone = (string) config('app.timezone', 'America/Sao_Paulo');
    if ((string) config('natal.product_slug', 'natal') !== 'natal' ||
        (int) config('natal.reference_year', 2026) !== 2026 ||
        \Illuminate\Support\Facades\DB::connection()->getDriverName() !== 'mysql') {
        throw new \RuntimeException('unexpected_crm_configuration');
    }
    $query = $app->make(\App\Services\Reports\NatalValidOrdersQuery::class);
    $raw = $query->getSeasonDigestMetrics(\Carbon\CarbonImmutable::now($timezone), 2026, 'natal');
    $years = [];
    foreach ([2022, 2023, 2024, 2025, 2026] as $year) {
        $years[(string)$year] = [
            'orders' => (int) $raw["sales_{$year}_orders"],
            'contracted_cents' => (int) $raw["sales_{$year}_contracted_cents"],
            'received_cents' => (int) $raw["sales_{$year}_received_cents"],
            'data_status' => (string) $raw["data_status_{$year}"],
            'period_start' => substr((string)$raw["natal_period_start_{$year}"], 0, 10),
            'period_as_of' => (string)$raw["natal_period_as_of_{$year}"],
        ];
    }
    $snapshot = [
        'schema_version' => 'evyd-natal-digest-v1',
        'source' => 'LIVE_MYSQL',
        'is_live' => true,
        'reference_year' => 2026,
        'product_slug' => 'natal',
        'population_scope' => 'NATAL_2026',
        'as_of' => (string)$raw['as_of'],
        'captured_at' => \Carbon\CarbonImmutable::now($timezone)->toIso8601String(),
        'financial_status' => (string)$raw['financial_status'],
        'financial_scope' => (string)$raw['financial_scope'],
        'season' => [
            'orders' => (int)$raw['orders'],
            'customers' => (int)$raw['customers'],
            'new_customers' => (int)$raw['new_customers'],
            'recurring_customers' => (int)$raw['recurring_customers'],
            'scheduled' => (int)$raw['scheduled'],
            'unscheduled' => (int)$raw['unscheduled'],
            'contracted_cents' => (int)$raw['contracted_cents'],
            'received_cents' => (int)$raw['received_cents'],
            'balance_cents' => (int)$raw['balance_cents'],
            'cash_today_cents' => (int)$raw['cash_today_cents'],
            'new_sales_today_cents' => (int)$raw['new_sales_today_cents'],
        ],
        'comparison' => ['window' => 'AUG01_TO_AS_OF_EQUIVALENT', 'years' => $years],
    ];
    $bytes = json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";
    if (strlen($bytes) > 32768) {
        throw new \RuntimeException('snapshot_too_large');
    }
    // Atomic same-directory publication. No file or secret is committed to Git.
    $tmp = $parent.'/.evyd-digest-'.bin2hex(random_bytes(12)).'.tmp';
    if (file_put_contents($tmp, $bytes, LOCK_EX) !== strlen($bytes)) {
        throw new \RuntimeException('snapshot_write_failed');
    }
    if (PHP_OS_FAMILY !== 'Windows') {
        if (!@chmod($tmp, 0600) || ((fileperms($tmp) & 0077) !== 0)) {
            @unlink($tmp);
            throw new \\RuntimeException('snapshot_permissions_failed');
        }
    } else {
        // On Windows, configure private NTFS ACL on the parent directory before use.
        @chmod($tmp, 0600);
    }
    if (!rename($tmp, $output)) {
        @unlink($tmp);
        throw new \RuntimeException('snapshot_publish_failed');
    }
    fwrite(STDOUT, "NATAL_DIGEST_EXPORTED schema=evyd-natal-digest-v1 year=2026 (private file; no PII)\n");
} catch (\Throwable $e) {
    // Do not log exception text: DB exceptions can contain private SQL/connection information.
    fwrite(STDERR, "EXPORT_BLOCKED: CRM query/bootstrap or private export failed; examine locally without sharing secrets\n");
    exit(1);
}
