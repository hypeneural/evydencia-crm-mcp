<?php
declare(strict_types=1);
/**
 * P25 schema-only forensics. INCLUDED by scripts/crm-forensic-bridge.php only
 * after Laravel bootstrap + MySQL session READ ONLY + query guard. This file
 * is intentionally NOT registered as a LIVE MCP action by the draft PR.
 * No PII values, rows, hashes, contact names, phone or emails are emitted.
 */
if (!isset($payload, $forensicStartedMs) || !function_exists('emitForensicJson')) {
    fwrite(STDERR, "META_AUDIENCE_SCHEMA_PREFLIGHT_BLOCKED: bridge_context_missing\n");
    exit(4);
}
if (($payload['action'] ?? null) !== 'meta.audience.schema.preflight' ||
    ($payload['year'] ?? null) !== 2026) {
    emitForensicJson(['error' => 'invalid_meta_audience_preflight_request'], $forensicStartedMs);
}
$expectedTables = [
    'customers' => ['id', 'uuid', 'name', 'email', 'whatsapp', 'phone', 'whatsapp_e164', 'phone_e164'],
    'orders' => ['id', 'customer_id', 'created_at'],
    'orders_status' => ['id', 'order_id', 'status', 'created_at'],
    'orders_installments' => ['id', 'order_id', 'payment_at', 'payment_total'],
    'orders_items' => ['id', 'order_id', 'product_id'],
    'products' => ['id', 'slug'],
    'proposal_flows' => ['id', 'slug', 'with_name_campaign_id', 'without_name_campaign_id'],
    'proposal_dispatches' => ['id', 'proposal_flow_id', 'phone_e164', 'phone_lookup_hash', 'resolved_customer_id', 'created_at'],
    'campaign_scheduleds' => ['id', 'campaign_id', 'created_at', 'communication_class', 'suppression_scope_key', 'suppression_snapshot'],
    'campaign_scheduled_contacts' => ['id', 'campaign_scheduled_id', 'lead_id', 'whatsapp', 'created_at'],
    'leads' => ['id', 'whatsapp', 'status'],
    'communication_suppressions' => ['id', 'phone_lookup_hash', 'channel', 'communication_class', 'scope_type',
        'scope_key', 'starts_at', 'ends_at', 'revoked_at'],
];
$tables = [];
$missing = [];
try {
    $schema = \Illuminate\Support\Facades\Schema::class;
    foreach ($expectedTables as $table => $columns) {
        $exists = $schema::hasTable($table);
        $missingColumns = [];
        if ($exists) {
            foreach ($columns as $col) {
                if (!$schema::hasColumn($table, $col)) $missingColumns[] = $col;
            }
        } else {
            $missingColumns = $columns;
        }
        $tables[$table] = [
            'exists' => $exists,
            'required_columns_count' => count($columns),
            'missing_columns' => $missingColumns,
        ];
        if (!$exists || $missingColumns !== []) $missing[] = $table;
    }
    // This query returns only index names and column names, never row contents.
    $names = array_keys($expectedTables);
    $indexRows = \Illuminate\Support\Facades\DB::table('information_schema.statistics')
        ->where('table_schema', \Illuminate\Support\Facades\DB::connection()->getDatabaseName())
        ->whereIn('table_name', $names)
        ->orderBy('table_name')->orderBy('index_name')->orderBy('seq_in_index')
        ->get(['table_name','index_name','seq_in_index','column_name']);
    $indexes = [];
    foreach ($indexRows as $index) {
        $key = (string)$index->table_name;
        $idx = (string)$index->index_name;
        $indexes[$key][$idx][] = (string)$index->column_name;
    }
    $indexChecks = [];
    foreach ([
        'customers' => [['whatsapp_e164'], ['phone_e164']],
        'orders' => [['customer_id'], ['created_at']],
        'proposal_dispatches' => [['proposal_flow_id','created_at'], ['phone_lookup_hash']],
        'communication_suppressions' => [['phone_lookup_hash']],
        'campaign_scheduled_contacts' => [['campaign_scheduled_id']],
    ] as $table => $patterns) {
        foreach ($patterns as $prefix) {
            $found = false;
            foreach ($indexes[$table] ?? [] as $idxColumns) {
                if (array_slice($idxColumns,0,count($prefix)) === $prefix) { $found = true; break; }
            }
            $indexChecks[] = ['table'=>$table,'index_prefix'=>$prefix,'exists'=>$found];
        }
    }
    emitForensicJson([
        'source' => 'CRM_META_AUDIENCE_SCHEMA_PREFLIGHT_READ_ONLY',
        'schema_version' => 'p25-preflight-v1',
        'target_year' => 2026,
        'tables' => $tables,
        'index_checks' => $indexChecks,
        'all_required_tables_and_columns_exist' => $missing === [],
        // A good schema is NOT proof of commercial semantics or lawful basis.
        'purchase_rule_any_product_2026_verified' => false,
        'proposal_asked_quote_semantics_verified' => false,
        'marketing_permission_source_verified' => false,
        'buyer_household_collision_reconciliation_verified' => false,
        'export_enabled' => false,
        'next_step' => 'validate_commercial_semantics_and_privacy_before_wiring_export_tool',
    ], $forensicStartedMs);
} catch (\Throwable) {
    emitForensicJson([
        'source' => 'CRM_META_AUDIENCE_SCHEMA_PREFLIGHT_READ_ONLY',
        'schema_version' => 'p25-preflight-v1',
        'target_year' => 2026,
        'coverage' => 'unavailable',
        'export_enabled' => false,
        'error' => 'meta_audience_schema_probe_unavailable',
    ], $forensicStartedMs);
}
