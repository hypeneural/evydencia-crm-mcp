import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMetaAudienceCsv,normalizePhone,formatMetaPhone,normalizeEmail,
  assertMetaAudienceUploadReady} from '../src/meta-audience-csv.mjs';
import {validateMetaCustomerListCsv} from '../src/meta-audience-csv-validator.mjs';

const coverage=(customers=1,proposals=0)=>({
  snapshot_id:'snapshot-20261029',as_of:'2026-10-29T19:00:00-03:00',
  target_year:2026,purchase_rule:'ANY_VALID_PURCHASE_2026',
  customers_complete:true,proposals_complete:true,purchases_2026_complete:true,
  suppression_complete:true,marketing_permission_complete:true,
  identity_crosscheck_complete:true,source_counts:{customers,proposals},
});
const row=(over={})=>({
  source:'customer',source_id:'customer-1',phone:'+5548999999999',
  email:'first@example.com',name:'João da Silva',
  bought_2026:false,purchase_check_status:'verified',
  suppressed:false,suppression_check_status:'verified',
  marketing_allowed:true,marketing_permission_status:'verified',
  identity_status:'verified',...over,
});
const build=(rows,meta=coverage(rows.filter(r=>r.source==='customer').length,
  rows.filter(r=>r.source==='proposal_2026').length))=>
  buildMetaAudienceCsv({records:rows,coverage:meta});

test('format phone digits with country code 55 for Meta, E164 for joins',()=>{
  assert.equal(normalizePhone('(48) 99999-9999'),'+5548999999999');
  assert.equal(formatMetaPhone('(48) 99999-9999'),'5548999999999');
  assert.equal(formatMetaPhone('5548999999999'),'5548999999999');
  assert.equal(formatMetaPhone('005548999999999'),'5548999999999');
  assert.equal(formatMetaPhone('55999999999'),'5555999999999'); // DDD 55, not DDI
  assert.equal(formatMetaPhone('4832223333'),'554832223333'); // landline
  assert.equal(normalizeEmail('  Foo@Example.COM  '),'foo@example.com');
});
test('reject no DDD, foreign number, incomplete/ambiguous 8-digit mobile',()=>{
  for(const x of ['',null,'99999999','4899999999','+14155550100','001234567',
    '12345678901','48-99999-999','abc48999999999','00000000000']){
    assert.equal(formatMetaPhone(x),null);
  }
});
test('valid record produces exact Meta header and normalized CSV',()=>{
  const x=build([row()]);
  assert.equal(x.counts.eligible_people,1);
  assert.equal(x.counts.export_rows,1);
  assert.match(x.csv,/^email,phone,fn,ln,country\r\n/);
  assert.match(x.csv,/first@example.com,5548999999999,joao,da silva,br\r\n/);
  assert.doesNotMatch(x.csv,/customer-1|suppressed|\+55/);
  const check=validateMetaCustomerListCsv(x.csv,{minRows:1});
  assert.equal(check.rows,1);
  assert.equal(check.rows_with_email,1);
});
test('email-only source never exported even when email valid',()=>{
  const x=build([row({phone:'',email:'only@example.com'})]);
  assert.equal(x.counts.input_missing_phone,1);
  assert.equal(x.counts.excluded_no_valid_phone,1);
  assert.equal(x.counts.export_rows,0);
  assert.doesNotMatch(x.csv,/only@example.com/);
});
test('invalid phone source removed even with good email',()=>{
  const x=build([row({phone:'not a phone',email:'good@example.com'})]);
  assert.equal(x.counts.input_invalid_phone,1);
  assert.equal(x.counts.excluded_no_valid_phone,1);
  assert.equal(x.counts.export_rows,0);
});
test('2026 buyer blocks any linked proposal, including email-only buyer',()=>{
  const x=build([
    row({source_id:'buyer-1',phone:'',email:'common@example.com',bought_2026:true}),
    row({source:'proposal_2026',source_id:'pro-1',phone:'48999999999',email:'common@example.com'}),
  ]);
  assert.equal(x.counts.excluded_2026_buyer,1);
  assert.equal(x.counts.export_rows,0);
});
test('opt-out blocks even if it is in an email-only linked source',()=>{
  const x=build([row(),row({source:'proposal_2026',source_id:'p2',
    phone:'',email:'first@example.com',suppressed:true})]);
  assert.equal(x.counts.excluded_suppressed,1);
  assert.equal(x.counts.export_rows,0);
});
test('no legal basis and ambiguous identity excluded',()=>{
  assert.equal(build([row({marketing_allowed:false})]).counts.excluded_no_marketing_permission,1);
  assert.equal(build([row({identity_status:'unknown'})]).counts.excluded_ambiguous_or_unknown,1);
});
test('distinct CRM customer IDs sharing phone are quarantined',()=>{
  const x=build([row({source_id:'customer-A'}),row({source_id:'customer-B',email:'b@example.com'})]);
  assert.equal(x.counts.excluded_conflicting_customer_ids,1);
  assert.equal(x.counts.export_rows,0);
});
test('one person two phones emits unique phones and only observed email pair',()=>{
  const x=build([
    row({source_id:'same',phone:'48999999999',email:'a@example.com'}),
    row({source_id:'same',phone:'48988888888',email:'b@example.com'}),
  ]);
  assert.equal(x.counts.eligible_people,1);
  assert.equal(x.counts.export_rows,2);
  assert.match(x.csv,/a@example.com,5548999999999/);
  assert.match(x.csv,/b@example.com,5548988888888/);
  assert.doesNotMatch(x.csv,/a@example.com,5548988888888/);
});
test('same phone appears once across deduped customer and proposal',()=>{
  const x=build([row(),row({source:'proposal_2026',source_id:'dispatch',
    email:'other@example.com'})]);
  assert.equal(x.counts.duplicate_phone_rows_collapsed,1);
  assert.equal(x.counts.export_rows,1);
  assert.equal(validateMetaCustomerListCsv(x.csv,{minRows:1}).unique_phones,1);
});
test('email-only row in eligible group drops without extra CSV row',()=>{
  const x=build([row(),row({source:'proposal_2026',source_id:'p2',
    phone:'',email:'first@example.com'})]);
  assert.equal(x.counts.dropped_phone_less_rows_in_eligible_groups,1);
  assert.equal(x.counts.export_rows,1);
});
test('missing/partial coverage and unverified purchases fail closed',()=>{
  const a=coverage();a.purchases_2026_complete=false;
  assert.throws(()=>build([row()],a),/INCOMPLETE/);
  const b=coverage(2,0);assert.throws(()=>build([row()],b),/SOURCE_COUNT_MISMATCH/);
  assert.throws(()=>build([row({purchase_check_status:'unavailable'})]),/UNVERIFIED/);
});
test('Meta upload gate requires 100 records, valid digest and unique digits-only phones',()=>{
  const rows=Array.from({length:100},(_,i)=>row({
    source_id:'customer-'+i,phone:'489'+String(10000000+i),email:'p'+i+'@example.com',
  }));
  const result=build(rows);
  const check=assertMetaAudienceUploadReady(result);
  assert.equal(check.rows,100);
  assert.equal(validateMetaCustomerListCsv(result.csv).unique_phones,100);
  assert.throws(()=>assertMetaAudienceUploadReady(build([row()])),/NOT_READY/);
});
test('independent CSV validator blocks forged + prefix, duplicate phones, invalid country',()=>{
  const original=build([row()]).csv;
  assert.throws(()=>validateMetaCustomerListCsv(original.replace('5548999999999','+5548999999999'),{minRows:1}),/INVALID_PHONE/);
  assert.throws(()=>validateMetaCustomerListCsv(original.replace(',br',',us'),{minRows:1}),/INVALID_NAME_OR_COUNTRY/);
  assert.throws(()=>validateMetaCustomerListCsv(original.replace('br\r\n','br\r\n'+original.split('\r\n')[1]+'\r\n'),{minRows:1}),/DUPLICATE_PHONE/);
});
test('all spreadsheet formula-looking names removed, no CPF/order metadata leak',()=>{
  const x=build([row({name:'=HYPERLINK("x")'})]);
  assert.match(x.csv,/first@example.com,5548999999999,,,br\r\n/);
  assert.doesNotMatch(x.csv,/document|cpf|order_|source_id/);
});

test('two plus signs are invalid and prefer a linked row with verified email',()=>{
  assert.equal(formatMetaPhone('+55+48999999999'),null);
  const out=build([
    row({source_id:'c1',email:''}),
    row({source:'proposal_2026',source_id:'p1',email:'quote@example.com'}),
  ]);
  assert.equal(out.counts.export_rows,1);
  assert.match(out.csv,/quote@example.com,5548999999999/);
});
test('performance: 3000 synthetic unique contacts remain linear enough',()=>{
  const batch=Array.from({length:3000},(_,i)=>row({
    source_id:'c'+i,phone:'489'+String(10000000+i),
    email:'synthetic'+i+'@example.invalid',
  }));
  const begin=performance.now();
  const result=build(batch);
  const elapsedMs=performance.now()-begin;
  assert.equal(result.counts.export_rows,3000);
  assert.equal(result.counts.eligible_people,3000);
  assert.equal(validateMetaCustomerListCsv(result.csv).unique_phones,3000);
  // Generous performance guard: no slow per-contact SQL or O(N^2) formatter loops.
  assert.ok(elapsedMs<10_000,'aggregate formatter took unexpectedly long');
});


test('100 phone rows from only 50 people do NOT satisfy Meta audience readiness',()=>{
  const records=[];
  for(let i=0;i<50;i++){
    const same='customer-'+i;
    records.push(row({source_id:same,phone:'489'+String(10000000+i),email:'c'+i+'@example.com'}));
    records.push(row({source_id:same,phone:'489'+String(10001000+i),email:'c'+i+'@example.com'}));
  }
  const result=build(records);
  assert.equal(result.counts.export_rows,100);
  assert.equal(result.counts.eligible_people,50);
  assert.throws(()=>assertMetaAudienceUploadReady(result),/NOT_READY/);
});


test('uncertain buyer is quarantined individually, unrelated verified contact remains exportable',()=>{
 const group=[
  row({source_id:'customer-uncertain',phone:'48999990111',email:'uncertain@example.com',
   purchase_check_status:'unavailable',identity_status:'ambiguous'}),
  row({source_id:'customer-clear',phone:'48999990222',email:'clear@example.com'}),
 ];
 const result=build(group);
 assert.equal(result.counts.excluded_ambiguous_or_unknown,1);
 assert.equal(result.counts.eligible_people,1);
 assert.equal(result.counts.export_rows,1);
 assert.doesNotMatch(result.csv,/uncertain@example\.com|5548999990111/);
 assert.match(result.csv,/clear@example\.com,5548999990222/);
});


test('P25.6: same-phone proposals with tied quality have deterministic CSV regardless of extraction order',()=>{
 const a=row({source:'proposal_2026',source_id:'dispatch-z',phone:'48999991234',
   email:'zeta@example.com',name:'Pessoa Exemplo'});
 const b=row({source:'proposal_2026',source_id:'dispatch-a',phone:'48999991234',
   email:'alpha@example.com',name:'Pessoa Exemplo'});
 const c=row({source_id:'customer-independent',phone:'48999991235',email:'unrelated@example.com'});
 const first=build([a,b,c]);
 const reverse=build([c,b,a]);
 assert.equal(first.sha256,reverse.sha256);
 assert.equal(first.csv,reverse.csv);
 assert.equal(first.counts.duplicate_phone_rows_collapsed,1);
 assert.match(first.csv,/alpha@example\.com,5548999991234/);
 assert.doesNotMatch(first.csv,/zeta@example\.com/);
});
test('P25.6: 2331 phone rows may represent exactly 2330 distinct identity groups',()=>{
 const rows=Array.from({length:2330},(_,i)=>row({
  source_id:'customer-'+i,
  phone:'489'+String(10000000+i),
  email:'mail'+i+'@example.invalid',
 }));
 rows.push(row({source_id:'customer-0',phone:'48910002330',email:'mail0@example.invalid'}));
 const out=build(rows);
 assert.equal(out.counts.export_rows,2331);
 assert.equal(out.counts.eligible_people,2330);
 assert.equal(validateMetaCustomerListCsv(out.csv).unique_phones,2331);
 assert.equal(assertMetaAudienceUploadReady(out).ready,true);
});
test('P25.6: transitive buyer/opt-out exclusion unaffected by permutation of source rows',()=>{
 const buyer=row({source_id:'customer-buyer',phone:'',email:'buyer@example.com',bought_2026:true});
 const linked=row({source:'proposal_2026',source_id:'dispatch-link',phone:'48999990191',email:'buyer@example.com'});
 const optout=row({source:'customer',source_id:'optout',phone:'48999990192',email:'optout@example.com',suppressed:true});
 const independent=row({source_id:'independent',phone:'48999990193',email:'good@example.com'});
 const input=[buyer,linked,optout,independent];
 for(const arranged of [input,[...input].reverse(),[input[2],input[0],input[3],input[1]]]){
  const out=build(arranged);
  assert.equal(out.counts.export_rows,1);
  assert.equal(out.counts.excluded_2026_buyer,1);
  assert.equal(out.counts.excluded_suppressed,1);
  assert.match(out.csv,/good@example\.com/);
  assert.doesNotMatch(out.csv,/buyer@example|optout@example/);
 }
});
