// Static contract regression tests. Only repository code, never production data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const php=readFileSync(new URL('../scripts/crm-natal-bridge.php',import.meta.url),'utf8');
const gateway=readFileSync(new URL('../src/live-gateway.mjs',import.meta.url),'utf8');

test('expanded financial goal exposes 40000000 cents as 400000 reais',()=>{
 assert.match(php,/'goal_total_expanded_revenue_cents'\s*=>\s*40000000/);
 assert.match(php,/'goal_total_expanded_revenue_reais'\s*=>\s*400000\.0/);
 assert.doesNotMatch(php,/'goal_total_expanded_revenue_reais'\s*=>\s*\(float\)\s*\(\$kpis\['goal_revenue'\]/);
});

test('Natals output schema accepts the canonical PHP loaded_sections field',()=>{
 assert.match(php,/\$out\['loaded_sections'\]/);
 assert.match(gateway,/loaded_sections:z\.array\(z\.string\(\)\)\.nullish\(\)/);
});

test('operator confirmation is still mandatory for proposal dispatch',()=>{
 assert.match(gateway,/confirmado_pelo_operador/);
 assert.match(gateway,/operator_confirmation_required|confirmado_pelo_operador: true/);
});

test('minimal KPI read path executes before expensive historical aggregation',()=>{
 const profilePos=php.indexOf("if ($responseProfile === 'kpi_minimal')");
 const historicalPos=php.indexOf('$immutable = $svc->getHistoricalImmutableData();');
 assert.ok(profilePos>0 && historicalPos>profilePos);
 assert.match(php,/contracted_equals_paid_plus_balance/);
 assert.match(php,/canonical_financial_balance_mismatch/);
 assert.match(php,/invalid_natal_kpi_missing_field/);
 assert.match(gateway,/perfil_resposta:z\.enum\(\['default','kpi_minimal'\]\)/);
});

test('minimal KPI profile is opt-in and emits provenance without identities',()=>{
 assert.match(php,/\$opts\['response_profile'\] \?\? 'default'/);
 assert.match(php,/'source' => 'CRM_CANONICAL_NATAL_STATISTICS'/);
 assert.match(php,/'data_status' => \$reconciledQuick/);
 assert.match(php,/'methodology_note' => 'NatalValidOrdersQuery/);
 assert.match(php,/exit\(0\);/);
});

test('expanded goal rejects accidental base-goal value in reais',()=>{
 const expanded=/'goal_total_expanded_revenue_cents'\s*=>\s*(\d+)[\s\S]{0,100}'goal_total_expanded_revenue_reais'\s*=>\s*([\d.]+)/.exec(php);
 assert.ok(expanded);
 assert.equal(Number(expanded[1])/100,Number(expanded[2]));
});

test('aging and purchase-time figures are explicitly marked as non-canonical in the bridge',()=>{
 assert.match(php,/financial_aging_vs_canonical/);
 assert.match(php,/NEEDS_REVIEW_DIFFERENT_PAYMENT_BASIS_OR_SCOPE/);
 assert.match(php,/purchase_timing_semantics/);
 assert.match(php,/'basis' => 'order_created_at'/);
 assert.match(php,/'confirmed_sale_time_available' => false/);
});
