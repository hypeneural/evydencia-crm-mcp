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
