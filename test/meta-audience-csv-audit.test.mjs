import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMetaAudienceCsv} from '../src/meta-audience-csv.mjs';
import {auditLocalMetaCsv} from '../src/meta-audience-csv-audit.mjs';

const coverage=(n)=>({
 snapshot_id:'snapshot-offline-test-20261030',as_of:'2026-10-30T00:51:18-03:00',
 target_year:2026,purchase_rule:'ANY_VALID_PURCHASE_2026',
 customers_complete:true,proposals_complete:true,purchases_2026_complete:true,
 suppression_complete:true,marketing_permission_complete:true,identity_crosscheck_complete:true,
 source_counts:{customers:n,proposals:0},
});
const makeRows=()=>Array.from({length:101},(_,i)=>({
 source:'customer',source_id:'customer-'+i,
 phone:'489'+String(10000000+i),
 email:'synthetic-'+i+'@example.invalid',name:'Pessoa Teste',
 bought_2026:false,purchase_check_status:'verified',
 suppressed:false,suppression_check_status:'verified',
 marketing_allowed:true,marketing_permission_status:'verified',
 identity_status:'verified',
}));
const fixture=()=>{
 const rows=makeRows();
 const result=buildMetaAudienceCsv({records:rows,coverage:coverage(rows.length)});
 return {result,receipt:{sha256:result.sha256,rows:result.counts.export_rows,
  eligible_people:result.counts.eligible_people,
  rows_with_email:result.counts.export_rows}};
};
test('P25.6: SFTP downloaded CSV matches SHA-256, rows, phones and email coverage',()=>{
 const {result,receipt}=fixture();
 const audit=auditLocalMetaCsv(result.csv,receipt);
 assert.equal(audit.status,'PASS');
 assert.equal(audit.sha256_verified,true);
 assert.equal(audit.rows,101);
 assert.equal(audit.contains_personal_data,false);
 assert.equal(JSON.stringify(audit).includes('synthetic-0'),false);
});
test('P25.6: tampered CSV with a valid phone but changed email is rejected by SHA-256',()=>{
 const {result,receipt}=fixture();
 const edited=result.csv.replace('synthetic-0@example.invalid','tampered-0@example.invalid');
 assert.throws(()=>auditLocalMetaCsv(edited,receipt),/SHA256_MISMATCH/);
});
test('P25.6: impossible identity count and mismatched email totals fail closed',()=>{
 const {result,receipt}=fixture();
 assert.throws(()=>auditLocalMetaCsv(result.csv,{...receipt,eligible_people:102}),/INVALID_RECEIPT/);
 assert.throws(()=>auditLocalMetaCsv(result.csv,{...receipt,rows_with_email:100}),/COUNTS_MISMATCH/);
});
test('P25.6: multiple phones for one identity remain distinguishable from unique people',()=>{
 const rows=makeRows();
 rows.push({...rows[0],phone:'48910002330'});
 const result=buildMetaAudienceCsv({records:rows,coverage:coverage(rows.length)});
 const receipt={sha256:result.sha256,rows:result.counts.export_rows,
  eligible_people:result.counts.eligible_people,rows_with_email:result.counts.export_rows};
 const audit=auditLocalMetaCsv(result.csv,receipt);
 assert.equal(audit.rows,102);
 assert.equal(audit.eligible_people_reported,101);
});
