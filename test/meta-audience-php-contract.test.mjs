// Static P0 regression checks are NOT a substitute for PHP lint or MySQL tests.
// They guard against reintroducing specific defects found in Antigravity e5a5beb.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=async rel=>await readFile(resolve(root,rel),'utf8');

test('P0: php policy uses CRM canonical suppression hasher, not proposal hash',async()=>{
 const s=await source('scripts/crm-meta-audience-read.php');
 assert.match(s,/CommunicationSuppressionHasher::class/);
 assert.match(s,/CommunicationSuppressionEvaluator::class/);
 assert.doesNotMatch(s,/hash_hmac\('sha256',\s*\$p,\s*\$hashKey\)/);
 assert.doesNotMatch(s,/\$hashKey\s*=\s*\(string\)\s*config\('proposals\.hash_key'/);
});

test('P0: 2026 paid older orders resolved before merging into order ID set',async()=>{
 const s=await source('scripts/crm-meta-audience-read.php');
 const missing=s.indexOf('$missingOrderIds = array_diff');
 const merging=s.indexOf('$allCandidateOrderIds[$oId] = true;',missing);
 assert.ok(missing>0 && merging>missing);
 assert.match(s,/paid_2026_orders_missing_referential_integrity/);
 assert.match(s,/orders2026Ids/);
});

test('P0: business status keys from Laravel OrderStatus include refunded and chargeback',async()=>{
 const reader=await source('scripts/crm-meta-audience-read.php');
 const classifier=await source('scripts/crm-meta-audience-purchase-classifier.php');
 assert.match(classifier,/'payment_refunded'/);
 assert.match(classifier,/'payment_chargeback'/);
 assert.match(classifier,/\$ambiguous\s*=\s*true/);
 assert.match(reader,/evyMetaAudienceClassifyPurchases2026/);
 assert.match(reader,/unexpected_transaction_isolation/);
});

test('P25.5: CRM audience uses one approved-purpose code and keeps opt-out checks',async()=>{
 const s=await source('scripts/crm-meta-audience-read.php');
 assert.match(s,/unsupported_audience_purpose/);
 assert.match(s,/legitimate_interest_customer_reactivation_with_optout_check/);
 assert.doesNotMatch(s,/EVYD_META_AUDIENCE_LGPD_APPROVED/);
 assert.doesNotMatch(s,/EVYD_META_AUDIENCE_LGPD_POLICY_REF/);
 assert.match(s,/CommunicationSuppressionEvaluator::class/);
 const check=s.indexOf('if (!$legalBasisVerified)');
 const customers=s.indexOf("DB::table('customers')");
 assert.ok(check>0&&customers>check);
});

test('P0: MCP export never silently regenerates missing preview or exposes server path',async()=>{
 const s=await source('src/live-gateway.mjs');
 assert.match(s,/crm_meta_audience_snapshot_missing_or_expired/);
 assert.match(s,/crm_meta_audience_snapshot_changed_review_again/);
 assert.match(s,/private_gateway_storage_only/);
 assert.doesNotMatch(s,/arquivo_privado_path:filePath/);
 assert.match(s,/purgeExpiredAudienceExports/);
});

test('P0: OAuth dedicated audience permission is default deny',async()=>{
 const s=await source('src/oauth-gateway.mjs');
 assert.match(s,/metaAudienceEnabled:env\.EVYD_META_AUDIENCE_ENABLED==='1'/);
 assert.match(s,/audienceExportEnabled:env\.EVYD_META_AUDIENCE_ENABLED==='1'&&env\.EVYD_AUDIENCE_EXPORT_ENABLED==='1'/);
 assert.doesNotMatch(s,/EVYD_AUDIENCE_ALLOWED_OPERATORS\|\|env\.EVYD_ALLOWED_OPERATOR_IDS/);
 assert.match(s,/SCOPE_AUDIENCE_EXPORT/);
});

test('P0: only eligible scheduled dispatches enter Meta, not legacy scheduled-only recipients',async()=>{
 const s=await source('scripts/crm-meta-audience-read.php');
 assert.match(s,/->where\('status', 'scheduled'\)/);
 assert.match(s,/->whereIn\('eligibility_status', \['allowed', 'eligible'\]\)/);
 assert.match(s,/scheduled_only_not_exported/);
 assert.doesNotMatch(s,/'source_id' => 'scheduled-' \./);
});
test('P0: persisted CRM suppression HMAC must be validated',async()=>{
 const s=await source('scripts/crm-meta-audience-read.php');
 assert.match(s,/hash_equals\(\$hash, \$hasher->hash\(\$persistedPhone\)\)/);
 assert.match(s,/meta_audience_suppression_hash_mismatch/);
});
test('P0: official MCP v2 scope challenge returns ScopeChallenge object with scoped array',async()=>{
 const s=await source('src/live-gateway.mjs');
 assert.match(s,/\?undefined:\{scopes:\[\.\.\.requiredScopes\],errorDescription:/);
 assert.doesNotMatch(s,/Object\.assign\(\[\/\*\?undefined/);
 assert.doesNotMatch(s,/\?undefined:\[\.\.\.requiredScopes\]/);
});


test('P25.4: CSV containing PII may never be written inside the Git checkout',async()=>{
 const code=await source('src/live-gateway.mjs');
 const preflight=await source('scripts/antigravity/meta-audience-release-preflight.mjs');
 assert.match(code,/realpath\(PRIVATE_EXPORTS_DIR\),realpath\(REPO_ROOT\)/);
 assert.match(code,/crm_meta_audience_private_directory_inside_checkout/);
 assert.match(preflight,/outsideCheckout/);
});
test('P25.4: large Meta bridge is isolated from unrelated forensic readers',async()=>{
 const code=await source('src/legacy-api-read.mjs');
 assert.match(code,/MAX_META_AUDIENCE_STDOUT_BYTES=24\*1024\*1024/);
 assert.match(code,/MAX_BRIDGE_STDOUT_BYTES=8\*1024\*1024/);
 assert.match(code,/payload\?\.action==='meta\.audience\.read'/);
 assert.match(code,/audience\?MAX_META_AUDIENCE_STDOUT_BYTES:MAX_BRIDGE_STDOUT_BYTES/);
});


test('P25.4: SQL keeps buyer status joins bounded and selects only latest operational status',async()=>{
 const s=await source('scripts/crm-meta-audience-read.php');
 assert.match(s,/array_chunk\(\$missingOrderIds, 1000\)/);
 assert.match(s,/array_chunk\(array_keys\(\$allCandidateOrderIds\), 1000\)/);
 assert.match(s,/MAX\(id\) AS id/);
 assert.match(s,/->joinSub\(\$latestIds, 'latest'/);
 assert.doesNotMatch(s,/->orderBy\('id', 'asc'\)\s*->get\(\['id', 'order_id', 'status'\]\)/);
});
