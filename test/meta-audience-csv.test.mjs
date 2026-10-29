import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMetaAudienceCsv,normalizePhone,normalizeEmail} from '../src/meta-audience-csv.mjs';
const coverage=(customers=1,proposals=0)=>({snapshot_id:'snapshot-20261029',as_of:'2026-10-29T19:00:00-03:00',
  target_year:2026,purchase_rule:'ANY_VALID_PURCHASE_2026',customers_complete:true,proposals_complete:true,
  purchases_2026_complete:true,suppression_complete:true,marketing_permission_complete:true,
  identity_crosscheck_complete:true,source_counts:{customers,proposals}});
const row=(over={})=>({source:'customer',source_id:'customer-1',phone:'+5548999999999',
  email:'first@example.com',name:'Pessoa Exemplo',bought_2026:false,purchase_check_status:'verified',
  suppressed:false,suppression_check_status:'verified',marketing_allowed:true,
  marketing_permission_status:'verified',identity_status:'verified',...over});
const run=(rs,c=coverage(rs.filter(x=>x.source==='customer').length,rs.filter(x=>x.source==='proposal_2026').length))=>buildMetaAudienceCsv({records:rs,coverage:c});
test('BR numbers strict E164; no guess missing ninth digit; DDD55 not country',()=>{
  assert.equal(normalizePhone('(48) 99999-9999'),'+5548999999999');
  assert.equal(normalizePhone('5548999999999'),'+5548999999999');
  assert.equal(normalizePhone('55999999999'),'+5555999999999');
  assert.equal(normalizePhone('4899999999'),'+554899999999');
  assert.equal(normalizePhone('+1 212 555 1234'),null);
  assert.equal(normalizePhone('99999999'),null);
  assert.equal(normalizeEmail(' Foo@Example.Com '),'foo@example.com');
  assert.equal(normalizeEmail('=evil@site.com'),null);
});
test('CSV is minimal and uses matched phone+email pair',()=>{
  const x=run([row()]);
  assert.equal(x.counts.eligible_people,1);
  assert.equal(x.counts.export_rows,1);
  assert.match(x.csv,/email,phone,fn,ln,country\r\n/);
  assert.match(x.csv,/first@example.com,\+5548999999999,Pessoa,Exemplo,br/);
  assert.doesNotMatch(x.csv,/customer-1|bought_2026/);
});
test('buyer anywhere in 2026 excludes entire connected graph including proposal',()=>{
  const x=run([row({bought_2026:true}),row({source:'proposal_2026',source_id:'p2',phone:'48999999999',email:'lead@example.com'})]);
  assert.equal(x.counts.eligible_people,0);
  assert.equal(x.counts.excluded_2026_buyer,1);
});
test('global or season suppression in any linked record blocks component',()=>{
  const x=run([row(),row({source:'proposal_2026',source_id:'p3',phone:'',email:'first@example.com',suppressed:true})]);
  assert.equal(x.counts.excluded_suppressed,1);
});
test('missing marketing lawful basis excludes person',()=>{
  const x=run([row({marketing_allowed:false})]);
  assert.equal(x.counts.excluded_no_marketing_permission,1);
});
test('partial coverage, source count mismatch and unverified flags fail closed',()=>{
  const r=[row()];const a=coverage();a.proposals_complete=false;
  assert.throws(()=>run(r,a),/INCOMPLETE/);
  const b=coverage(2);assert.throws(()=>run(r,b),/SOURCE_COUNT_MISMATCH/);
  assert.throws(()=>run([row({purchase_check_status:'unavailable'})]),/UNVERIFIED/);
  const c=coverage();c.identity_crosscheck_complete=false;
  assert.throws(()=>run(r,c),/INCOMPLETE/);
});
test('distinct customers sharing a phone are ambiguous, even without buyers',()=>{
  const x=run([row({source_id:'c1',email:'a@example.com'}),row({source_id:'c2',email:'b@example.com'})]);
  assert.equal(x.counts.excluded_conflicting_customer_ids,1);
  assert.equal(x.counts.eligible_people,0);
});
test('same customer with multiple verified identities emits only original pairings',()=>{
  const x=run([row({source_id:'c1',phone:'48999999999',email:'a@example.com'}),
    row({source_id:'c1',phone:'48988888888',email:'b@example.com'})]);
  assert.equal(x.counts.eligible_people,1);
  assert.equal(x.counts.export_rows,2);
  assert.match(x.csv,/a@example.com,\+554899999999/);
  assert.match(x.csv,/b@example.com,\+554898888888/);
  assert.doesNotMatch(x.csv,/a@example.com,\+554898888888/);
});
test('last eight digits do not deduplicate 8/9-digit variants',()=>{
  const x=run([row({source_id:'c1',phone:'48999999999',email:'a@example.com'}),
    row({source_id:'c2',phone:'4899999999',email:'b@example.com'})]);
  assert.equal(x.counts.eligible_people,2);
});
test('empty contact, unknown identity and untrusted spreadsheet values blocked',()=>{
  const a=run([row({phone:'abc',email:'broken'})]);assert.equal(a.counts.invalid_or_missing_identity,1);
  const b=run([row({identity_status:'unknown'})]);assert.equal(b.counts.excluded_ambiguous_or_unknown,1);
  const c=run([row({name:'=HYPERLINK(1)'})]);assert.match(c.csv,/first@example.com,\+5548999999999,,,br/);
});
test('identical linked row de-duplicated exactly',()=>{
  const x=run([row(),row({source:'proposal_2026',source_id:'dispatch-1'})]);
  assert.equal(x.counts.eligible_people,1);assert.equal(x.counts.export_rows,1);
  assert.equal(x.counts.duplicate_identity_rows,1);
});
