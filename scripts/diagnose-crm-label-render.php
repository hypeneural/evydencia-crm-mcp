<?php
declare(strict_types=1);

/**
 * Manual, read-only Laravel label preflight. NEVER print, enqueue or alter orders.
 * One JSON object {"order_uuid":"..."} on STDIN. Output only redacted metadata.
 * Must be run as the actual MCP gateway service user on the approved MCP host.
 */
header_remove();
$stage = 'input';
$emit = static function (array $row, int $exit): never {
    echo json_encode($row, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
    exit($exit);
};
$input = stream_get_contents(STDIN, 513);
$data = is_string($input) && strlen($input) <= 512 ? json_decode($input, true) : null;
$uuid = is_array($data) ? ($data['order_uuid'] ?? null) : null;
if (!is_string($uuid) ||
    preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $uuid) !== 1) {
    $emit(['source'=>'CRM_LABEL_READONLY_PREFLIGHT','ok'=>false,'stage'=>'input','error_code'=>'invalid_uuid','changes_applied'=>false,'print_job_created'=>false], 2);
}
$root = rtrim(getenv('EVYD_CRM_APP_PATH') ?: '/var/www/evydencia/current', '/\\');
$autoload = $root . '/vendor/autoload.php';
$bootstrap = $root . '/bootstrap/app.php';
if (PHP_SAPI !== 'cli' || !is_readable($autoload) || !is_readable($bootstrap)) {
    $emit(['source'=>'CRM_LABEL_READONLY_PREFLIGHT','ok'=>false,'stage'=>'filesystem','error_code'=>'bootstrap_not_readable','changes_applied'=>false,'print_job_created'=>false], 2);
}
try {
    $stage = 'autoload';
    require $autoload;
    $stage = 'bootstrap';
    $app = require $bootstrap;
    $app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

    $stage = 'db_read_only';
    $conn = \Illuminate\Support\Facades\DB::connection();
    $conn->statement('SET SESSION TRANSACTION READ ONLY');
    // Defense in depth. Production should also use a least-privilege DB user.
    if (!method_exists($conn, 'beforeExecuting')) {
        throw new RuntimeException('unsupported_read_only_guard');
    }
    $conn->beforeExecuting(static function (string $sql): void {
        if (!preg_match('/^\s*(select|show|describe|explain|set\s+session\s+transaction\s+read\s+only)\b/i', $sql)) {
            throw new RuntimeException('readonly_guard_rejected_query');
        }
    });
    config(['cache.default'=>'array']);

    $stage = 'extensions';
    if (!extension_loaded('gd') || !extension_loaded('pdo_mysql')) {
        throw new RuntimeException('required_php_extension_missing');
    }
    $stage = 'configuration';
    if (!app(\App\Services\Configurations\OrderLabelConfiguration::class)->isEnabled()) {
        throw new RuntimeException('label_generation_disabled');
    }
    $stage = 'order_lookup';
    $payload = app(\App\Services\OrderLabelDataResolver::class)->resolveByUuid($uuid);
    $stage = 'template_lookup';
    $template = app(\App\Services\OrderLabelTemplateResolver::class)->resolve($payload);
    $stage = 'dimension_guard';
    app(\App\Services\OrderLabelDimensionGuard::class)->assertWithinLimits(
        $template->widthMm, $template->heightMm, $template->dpi
    );
    if ($template->widthMm !== 100 || $template->heightMm !== 40) {
        throw new RuntimeException('label_dimensions_not_100x40');
    }

    $stage = 'service_generate';
    $result = app(\App\Services\OrderLabelService::class)->generate($uuid);
    $stage = 'contract';
    if ($result->mimeType !== 'image/png' ||
        $result->context->widthMm !== 100 || $result->context->heightMm !== 40 ||
        $result->bytes > 3 * 1024 * 1024 ||
        !str_starts_with($result->content, "\x89PNG\r\n\x1A\n")) {
        throw new RuntimeException('canonical_png_contract_invalid');
    }
    $emit([
        'source'=>'CRM_LABEL_READONLY_PREFLIGHT','ok'=>true,'stage'=>'complete',
        'width_mm'=>$result->context->widthMm,'height_mm'=>$result->context->heightMm,
        'width_px'=>$result->widthPx,'height_px'=>$result->heightPx,
        'png_bytes'=>$result->bytes,'sha256'=>hash('sha256',$result->content),
        'changes_applied'=>false,'print_job_created'=>false,'physical_print_verified'=>false
    ],0);
} catch (\Throwable $error) {
    // Never print the exception message/trace: these may contain SQL, PII or paths.
    $category = $error instanceof \Illuminate\Database\Eloquent\ModelNotFoundException ? 'not_found'
        : ($error instanceof \Illuminate\Database\QueryException || $error instanceof \PDOException ? 'database'
        : ($error instanceof \Error ? 'php_runtime' : 'application'));
    $emit([
        'source'=>'CRM_LABEL_READONLY_PREFLIGHT','ok'=>false,'stage'=>$stage,
        'error_code'=>'label_preflight_failed','error_category'=>$category,
        'changes_applied'=>false,'print_job_created'=>false
    ],1);
}
