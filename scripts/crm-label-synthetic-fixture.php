<?php
declare(strict_types=1);
/**
 * One synthetic Christmas label rendered by THE CRM OrderLabelRenderer.
 * No real orders, no database writes, no WhatsApp, no printer calls.
 * Output stays in the gitignored /private folder of the MCP checkout.
 */
$root = getenv('EVYD_CRM_APP_PATH') ?: '/var/www/evydencia/current';
if (!is_file(rtrim($root, '/\\') . '/vendor/autoload.php') ||
    !is_file(rtrim($root, '/\\') . '/bootstrap/app.php')) {
    fwrite(STDERR, "crm_label_fixture_crm_unavailable\n");
    exit(2);
}
require rtrim($root, '/\\') . '/vendor/autoload.php';
$app = require rtrim($root, '/\\') . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

try {
    $preset = config('order_label.legacy_presets.natal');
    if (!is_array($preset) || !is_file((string) ($preset['source_asset'] ?? ''))) {
        throw new RuntimeException('fixture_source_asset_missing');
    }
    $config = config('order_label');
    $config['background'] = 'natal/bkpbackground.jpg';
    $config['use_background'] = true;
    $config['fit_mode'] = 'stretch';
    $config['dpi'] = 300;
    $config['width_mm'] = 100;
    $config['height_mm'] = 40;
    $config['overlay_config'] = \App\DataTransferObjects\OrderLabelOverlayConfig::fromArray(
        (array) $preset['overlay']
    );
    $payload = new \App\DataTransferObjects\OrderLabelPayload(
        orderId:'999999',
        orderUuid:'11111111-aaaa-4111-8111-000000000999',
        customerName:'HOMOLOGACAO SINTETICA',
        displayName:'HOMOLOGACAO SINTETICA',
        firstName:'HOMOLOGACAO',
        packageName:'Experiencia Ho-Ho-Ho',
        sessionDate:'28/10/26',
        whatsappDigits:'48999999999',
        whatsappDdd:'(48)',
        whatsappNumber:'99999-9999'
    );
    $result = (new \App\Services\OrderLabelRenderer($config))->render($payload);
    if ($result->mimeType !== 'image/png' || $result->widthPx !== 1181 || $result->heightPx !== 472) {
        throw new RuntimeException('fixture_dimension_mismatch');
    }
    $destination = dirname(__DIR__) . '/private';
    if (!is_dir($destination) && !mkdir($destination, 0700, true) && !is_dir($destination)) {
        throw new RuntimeException('fixture_directory_unavailable');
    }
    $file = $destination . '/crm-label-natal-synthetic.png';
    if (file_put_contents($file, $result->content, LOCK_EX) !== strlen($result->content)) {
        throw new RuntimeException('fixture_write_failed');
    }
    chmod($file, 0600);
    echo json_encode([
      'synthetic' => true,'order_id' => 999999,
      'png_filename' => 'private/crm-label-natal-synthetic.png',
      'width_px' => $result->widthPx,'height_px' => $result->heightPx,
      'sha256' => hash('sha256', $result->content),'printed' => false,
    ],JSON_UNESCAPED_SLASHES) . "\n";
} catch (Throwable $e) {
    fwrite(STDERR, "crm_label_fixture_unavailable\n");
    exit(1);
}
