// Offline validation of MANUAL Meta Customer List CSV. Never prints PII.
// Reads no file here; safe for use by CLI and tests. Not a Meta API payload.
import {createHash} from 'node:crypto';
import {formatMetaPhone,normalizeEmail} from './meta-audience-csv.mjs';
const HEADER='email,phone,fn,ln,country';
const MAX_BYTES=20*1024*1024;
export function validateMetaCustomerListCsv(csv,{minRows=100,maxRows=100_000}={}) {
  if(typeof csv!=='string'||Buffer.byteLength(csv,'utf8')>MAX_BYTES||csv.includes('\uFEFF')) {
    throw Error('META_CSV_INVALID_ENCODING_OR_SIZE');
  }
  if(!csv.startsWith(HEADER+'\r\n')||!csv.endsWith('\r\n')||csv.includes('\u0000')) {
    throw Error('META_CSV_INVALID_HEADER_OR_LINE_ENDINGS');
  }
  const lines=csv.slice(0,-2).split('\r\n');
  if(lines.some(line=>line.includes('\n')||line.includes('\r')))throw Error('META_CSV_INVALID_LINE_ENDINGS');
  if(lines.length-1<minRows)throw Error('META_CSV_BELOW_MINIMUM_ROWS');
  if(lines.length-1>maxRows)throw Error('META_CSV_TOO_MANY_ROWS');
  const seen=new Set();
  let withEmail=0;
  for(let i=1;i<lines.length;i++){
    const cols=lines[i].split(',');
    if(cols.length!==5)throw Error('META_CSV_INVALID_COLUMN_COUNT');
    const [email,phone,fn,ln,country]=cols;
    if(!phone||!/^55\d{10,11}$/.test(phone)||formatMetaPhone(phone)!==phone) {
      throw Error('META_CSV_INVALID_PHONE');
    }
    if(seen.has(phone))throw Error('META_CSV_DUPLICATE_PHONE');
    seen.add(phone);
    if(email && normalizeEmail(email)!==email)throw Error('META_CSV_INVALID_EMAIL');
    if(email)withEmail++;
    if(!/^[a-z ]*$/.test(fn)||!/^[a-z ]*$/.test(ln)||country!=='br') {
      throw Error('META_CSV_INVALID_NAME_OR_COUNTRY');
    }
  }
  return {ready:true,rows:lines.length-1,unique_phones:seen.size,rows_with_email:withEmail,
    sha256:createHash('sha256').update(csv).digest('hex'),format:'manual_csv',
    phone_format:'55 + DDD + number, digits only',contains_personal_data:true};
}
