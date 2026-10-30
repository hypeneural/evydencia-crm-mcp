<?php
declare(strict_types=1);

/**
 * Read-only canonical order-label renderer used by the LIVE MCP gateway.
 * It boots THE deployed Laravel CRM and reuses OrderLabelService, the active
 * product/global template, the QR resolver, and the exact production PNG.
 * This file does not expose any HTTP endpoint or modify Laravel source.
 */
$root = getenv('EVYD_CRM_APP_PATH') ?: '/var/www/evydencia/current';
$autoload = rtrim($root, '/\\') . '/vendor/autoload.php';
$bootstrap = rtrim($root, '/\\') . '/bootstrap/app.php';
$fail = static function (string $code, int $exit = 1): never {
    echo json_encode(['error' => $code], JSON_UNESCAPED_SLASHES) . "\n";
    exit($exit);
};
if (!is_file($autoload) || !is_file($bootstrap)) {
    $fail('crm_label_bridge_unavailable', 2);
}
$input = stream_get_contents(STDIN, 513);
if (!is_string($input) || strlen($input) > 512) {
    $fail('crm_label_invalid_input', 3);
}
$args = json_decode($input, true);
$uuid = is_array($args) ? ($args['order_uuid'] ?? '') : '';
if (!is_string($uuid) ||
    preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $uuid) !== 1) {
    $fail('crm_label_invalid_uuid', 3);
}
require $autoload;
$app = require $bootstrap;
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

try {
    // Never write to CRM DB; prevent cache side effects from rendering.
    \Illuminate\Support\Facades\DB::statement('SET SESSION TRANSACTION READ ONLY');
    $conn = \Illuminate\Support\Facades\DB::connection();
    if (method_exists($conn, 'beforeExecuting')) {
        $conn->beforeExecuting(static function (string $sql): void {
            if (!preg_match('/^\s*(select|show|describe|explain|set\s+session\s+transaction\s+read\s+only)\b/i', $sql)) {
                throw new RuntimeException('crm_label_write_blocked');
            }
        });
    }
    config(['cache.default' => 'array', 'logging.default' => 'null']);
    $result = app(\App\Services\OrderLabelService::class)->generate($uuid);
    if ($result->context->fallbackReason !== null) {
        $fail('crm_label_template_fallback_' . $result->context->fallbackReason);
    }
    if ($result->mimeType !== 'image/png' ||
        $result->context->widthMm !== 100 ||
        $result->context->heightMm !== 40 ||
        $result->bytes > 3 * 1024 * 1024 ||
        !str_starts_with($result->content, "\x89PNG\r\n\x1A\n")) {
        $fail('crm_label_invalid_render');
    }
    echo json_encode([
        'order_id' => (int) $result->context->payload->orderId,
        'order_uuid' => $result->context->payload->orderUuid,
        'width_mm' => $result->context->widthMm,
        'height_mm' => $result->context->heightMm,
        'width_px' => $result->widthPx,
        'height_px' => $result->heightPx,
        'render_source' => $result->context->source,
        'png_sha256' => hash('sha256', $result->content),
        'png_base64' => base64_encode($result->content)
    ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
} catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
    $fail('crm_label_order_not_found');
} catch (\Throwable $e) {
    // No stack, SQL, storage path, customer name, QR URL or secret in stdout/stderr.
    $fail('crm_label_render_unavailable');
}
