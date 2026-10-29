import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMetaAudienceCsv,normalizePhone,normalizeEmail} from '../src/meta-audience-csv.mjs';

const coverage=()=>({
  snapshot_id:'snap-audit-20261029',
  as_of:'2026-10-29T19:00:00-03:00',
  target_year:2026,
  purchase_rule:'ANY_VALID_PURCHASE_2026',
  customers_complete:true,proposals_complete:true,purchases_2026_complete:true,
  suppression_complete:true,marketing_permission_complete:true
});
const row=(overrides={})=>({
  source:'customer',source_id:'customer-101',phone:'+5548999999999',
  email:'first@example.com',name:'Pessoa Exemplo',
  bought_2026:false,purchase_check_status:'verified',
  suppressed:false,suppression_check_status:'verified',
  marketing_allowed:true,marketing_permission_status:'verified',
  identity_status:'verified',...overrides
});
test('phone parses strict BR E164 without adding 9 or guessing last-8',()=>{
 assert.equal(normalizePhone('(48) 99999-9999'),'+5548999999999');
 assert.equal(normalizePhone('5548999999999'),'+5548999999999');
 assert.equal(normalizePhone('55999999999'),'+5555999999999'); // national DDD 55
 assert.equal(normalizePhone('+1 212 555 1234'),null);
 assert.equal(normalizePhone('99999999'),null);
 assert.equal(normalizeEmail('  USer@EXample.Com '),'user@example.com');
});
test('meta csv contains minimal identifiers, country and no CRM metadata',()=>{
 const x=buildMetaAudienceCsv({records:[row()],coverage:coverage()});
 assert.equal(x.counts.eligible_people,1);
 assert.equal(x.counts.export_rows,1);
 assert.match(x.csv,/email,phone,fn,ln,country\r\n/);
 assert.match(x.csv,/first@example.com,\+5548999999999,Pessoa,Exemplo,br/);
 assert.doesNotMatch(x.csv,/customer-101|suppressed|proposal_2026/);
});
test('global buyers excluded even when also appear as proposal-only contacts',()=>{
 const a=row({source_id:'c-1',phone:'+5548999999999',bought_2026:true});
 const b=row({source:'proposal_2026',source_id:'p-2',phone:'48999999999',email:'other@example.com'});
 const x=buildMetaAudienceCsv({records:[a,b],coverage:coverage()});
 assert.equal(x.counts.eligible_people,0);
 assert.equal(x.counts.excluded_2026_buyer,1);
 assert.equal(x.counts.duplicate_identity_rows,1);
});
test('opt-out in any linked record blocks whole group',()=>{
 const a=row({source_id:'c-1'});
 const b=row({source:'proposal_2026',source_id:'p-2',email:'first@example.com',
              phone:'',suppressed:true});
 const x=buildMetaAudienceCsv({records:[a,b],coverage:coverage()});
 assert.equal(x.counts.eligible_people,0);
 assert.equal(x.counts.excluded_suppressed,1);
});
test('missing legal basis permission blocks prospect',()=>{
 const x=buildMetaAudienceCsv({records:[row({marketing_allowed:false})],coverage:coverage()});
 assert.equal(x.counts.eligible_people,0);
 assert.equal(x.counts.excluded_no_marketing_permission,1);
});
test('ambiguity blocks even with a second verified linked record',()=>{
 const x=buildMetaAudienceCsv({records:[row(),row({source:'proposal_2026',
 source_id:'dispatch-1',email:'',identity_status:'ambiguous'})],coverage:coverage()});
 assert.equal(x.counts.eligible_people,0);
 assert.equal(x.counts.excluded_ambiguous_or_unknown,1);
});
test('fail-closed for partial source coverage and purchase lookup errors',()=>{
 const e=coverage();e.proposals_complete=false;
 assert.throws(()=>buildMetaAudienceCsv({records:[row()],coverage:e}),/INCOMPLETE/);
 assert.throws(()=>buildMetaAudienceCsv({records:[row({purchase_check_status:'unknown'})],coverage:coverage()}),/UNVERIFIED/);
});
test('independent phone records are not merged just because last 8 digits match',()=>{
 const x=buildMetaAudienceCsv({records:[
 row({source_id:'c1',phone:'48999999999',email:'a@example.com'}),
 row({source_id:'c2',phone:'4899999999',email:'b@example.com'})
 ],coverage:coverage()});
 assert.equal(x.counts.eligible_people,2);
});
test('invalid/empty email and phone are skipped, never exported',()=>{
 const x=buildMetaAudienceCsv({records:[row({phone:'abc',email:'notanemail'})],coverage:coverage()});
 assert.equal(x.counts.invalid_or_missing_identity,1);
 assert.equal(x.counts.export_rows,0);
});
test('same verified customer may include multiple contact identifiers',()=>{
 const x=buildMetaAudienceCsv({records:[
 row({source_id:'same-1',phone:'48999999999',email:'foo@example.com'}),
 row({source_id:'same-1',phone:'48888888888',email:'bar@example.com'})
 ],coverage:coverage()});
 assert.equal(x.counts.eligible_people,1);
 assert.equal(x.counts.export_rows,2);
});
