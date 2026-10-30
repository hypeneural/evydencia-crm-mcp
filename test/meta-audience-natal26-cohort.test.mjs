import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMetaAudienceCsv,assertMetaAudienceUploadReady} from '../src/meta-audience-csv.mjs';
function mk(rule,bought=false,source='customer') {
 return {records:[{source,source_id:source+'-1',phone:'+5548999990000',
 email:'test@example.invalid',name:'Teste Cliente',bought_2026:bought,suppressed:false,
 marketing_allowed:true,identity_status:'verified',purchase_check_status:'verified',
 suppression_check_status:'verified',marketing_permission_status:'verified'}],
 coverage:{target_year:2026,purchase_rule:rule,snapshot_id:'test-snapshot-20261030',
 as_of:'2026-10-30T13:30:00-03:00',customers_complete:true,proposals_complete:true,
 purchases_2026_complete:true,suppression_complete:true,marketing_permission_complete:true,
 identity_crosscheck_complete:true,source_counts:{customers:source==='customer'?1:0,proposals:source==='proposal_2026'?1:0}}};
}
test('Natal-only accepts valid nonbuyer, preserving CSV contract',()=>{
 const r=buildMetaAudienceCsv(mk('NO_VALID_NATAL_2026_PURCHASE'));assert.equal(r.counts.export_rows,1);
 assert.equal(r.purchase_rule,'NO_VALID_NATAL_2026_PURCHASE');
 assert.match(r.csv,/^email,phone,fn,ln,country\r\n/);
});
test('Natal-only excludes buyer across linked phone and proposal',()=>{
 const x=mk('NO_VALID_NATAL_2026_PURCHASE',true);
 x.records.push({...x.records[0],source:'proposal_2026',source_id:'proposal-5',bought_2026:false,email:null});
 x.coverage.source_counts.proposals=1;
 const r=buildMetaAudienceCsv(x);assert.equal(r.counts.export_rows,0);
 assert.equal(r.counts.excluded_2026_buyer,1);
});
test('Original ANY-2026 contract unchanged',()=>{
 const r=buildMetaAudienceCsv(mk('ANY_VALID_PURCHASE_2026',true));
 assert.equal(r.counts.export_rows,0);
});
test('Unknown purchase rule fails closed',()=>{
 assert.throws(()=>buildMetaAudienceCsv(mk('ANY_2025_PURCHASE')),/EXPORT_BLOCKED/);
});
test('Natal-only opt-out excludes phone',()=>{
 const x=mk('NO_VALID_NATAL_2026_PURCHASE');x.records[0].suppressed=true;
 assert.equal(buildMetaAudienceCsv(x).counts.export_rows,0);
});
