// Independent offline integrity check for the CSV already downloaded by the
// authenticated operator. No PII, file paths or raw customer records in output.
import {validateMetaCustomerListCsv} from './meta-audience-csv-validator.mjs';

export function auditLocalMetaCsv(csv,receipt){
 if(!receipt || typeof receipt!=='object'
    || !/^[a-f0-9]{64}$/i.test(String(receipt.sha256||''))
    || !Number.isSafeInteger(receipt.rows)||receipt.rows<100
    || !Number.isSafeInteger(receipt.eligible_people)
    || receipt.eligible_people<100||receipt.eligible_people>receipt.rows
    || !Number.isSafeInteger(receipt.rows_with_email)
    || receipt.rows_with_email<0||receipt.rows_with_email>receipt.rows){
   throw Error('META_CSV_AUDIT_INVALID_RECEIPT');
 }
 const check=validateMetaCustomerListCsv(csv,{minRows:100});
 if(check.sha256!==receipt.sha256.toLowerCase()){
  throw Error('META_CSV_AUDIT_SHA256_MISMATCH');
 }
 if(check.rows!==receipt.rows||check.unique_phones!==receipt.rows
    ||check.rows_with_email!==receipt.rows_with_email){
  throw Error('META_CSV_AUDIT_COUNTS_MISMATCH');
 }
 return {
  status:'PASS',rows:check.rows,unique_phones:check.unique_phones,
  eligible_people_reported:receipt.eligible_people,
  rows_with_email:check.rows_with_email,sha256_verified:true,
  contains_personal_data:false
 };
}
