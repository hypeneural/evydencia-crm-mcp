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
