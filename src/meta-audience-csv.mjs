// Manual Meta Customer List CSV — pure/offline v3, PHONE REQUIRED.
// NO database, HTTP, filesystem, console logging, Meta upload or CRM mutation.
// Source adapter must prove complete purchase/suppression/permission coverage.
// This module MUST NOT be called with unresolved contacts or partial snapshots.
import {createHash} from 'node:crypto';

const DDD = new Set(('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99').split(' '));
const MAX_RECORDS = 100_000;
const MAX_CSV_BYTES = 20 * 1024 * 1024;
const REQUIRED_COVERAGE = ['customers_complete','proposals_complete','purchases_2026_complete',
  'suppression_complete','marketing_permission_complete','identity_crosscheck_complete'];
const HEADER = 'email,phone,fn,ln,country';
const CONTROL = /[\u0000-\u001f\u007f]/g;

export function normalizePhone(raw) {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const value = raw.trim();
  if (!value || /[^0-9+()\s.\-]/.test(value) || (value.includes('+') && (!value.startsWith('+') || (value.match(/\+/g)||[]).length !== 1))) return null;
  let digits = value.replace(/[\s()+.\-]/g, '');
  if (value.startsWith('+') && !digits.startsWith('55')) return null;
  if (digits.startsWith('00')) {
    if (!digits.startsWith('0055')) return null;
    digits = digits.slice(2);
  }
  const national = [12,13].includes(digits.length) && digits.startsWith('55')
    ? digits.slice(2) : digits;
  if (![10,11].includes(national.length) || !DDD.has(national.slice(0,2))) return null;
  const subscriber = national.slice(2);
  // Brazilian mobile: nine digits beginning 9. Fixed line: eight digits 2–5.
  // An old mobile lacking the ninth digit is ambiguous: do NOT guess it.
  if (subscriber.length === 9 && !/^9\d{8}$/.test(subscriber)) return null;
  if (subscriber.length === 8 && !/^[2-5]\d{7}$/.test(subscriber)) return null;
  return '+55' + national;  // E.164 for exact internal joins.
}

export function formatMetaPhone(raw) {
  const e164 = normalizePhone(raw);
  return e164 === null ? null : e164.slice(1); // Meta CSV: DIGITS ONLY, e.g. 5548999999999.
}

export function normalizeEmail(raw) {
  if (typeof raw !== 'string' || raw.length > 254) return null;
  const email = raw.trim().normalize('NFC').toLowerCase();
  if (/^[=+\-@]/.test(email) || /[\r\n",;\u0000-\u001f]/.test(email)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizeName(raw) {
  if (typeof raw !== 'string') return '';
  // Meta FN/LN: lowercase roman letters, without accents/punctuation, for matching.
  const v = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ß]/gi,'ss').replace(/[æ]/gi,'ae').replace(/[œ]/gi,'oe')
    .toLowerCase().replace(CONTROL,' ').replace(/[^a-z ]/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,100);
  return v;
}
function nameParts(name) {
  const parts = name.split(' ').filter(Boolean);
  return {fn:parts[0]||'',ln:parts.slice(1).join(' ')};
}
function csvEscape(raw) {
  const s = String(raw??'');
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s;
}
function validateCoverage(c) {
  if (!c || typeof c !== 'object' || c.target_year !== 2026
      || c.purchase_rule !== 'ANY_VALID_PURCHASE_2026'
      || !/^[A-Za-z0-9_-]{8,96}$/.test(String(c.snapshot_id||''))
      || typeof c.as_of !== 'string' || !Number.isFinite(Date.parse(c.as_of))
      || !REQUIRED_COVERAGE.every(k=>c[k]===true)
      || !c.source_counts || !Number.isSafeInteger(c.source_counts.customers)
      || !Number.isSafeInteger(c.source_counts.proposals)
      || c.source_counts.customers < 0 || c.source_counts.proposals < 0) {
    throw Error('EXPORT_BLOCKED_INCOMPLETE_OR_UNVERIFIED_COVERAGE');
  }
}

/** Snapshot must contain ALL customer/proposal rows and buyer/opt-out evidence.
 *  Each record is either a customer or verified Natal 2026 proposal recipient.
 *  Phone-less records still participate in email-linked buyer/opt-out exclusion;
 *  they NEVER appear in the exported CSV.
 */
export function buildMetaAudienceCsv({records,coverage}={}) {
  validateCoverage(coverage);
  if (!Array.isArray(records) || records.length > MAX_RECORDS) {
    throw Error('EXPORT_BLOCKED_INVALID_RECORDS');
  }
  const counts={
    input:records.length, customer_records:0, proposal_records:0,
    input_missing_phone:0, input_invalid_phone:0,
    duplicate_identity_rows:0, duplicate_phone_rows_collapsed:0,
    excluded_2026_buyer:0, excluded_suppressed:0,
    excluded_no_marketing_permission:0, excluded_ambiguous_or_unknown:0,
    excluded_conflicting_customer_ids:0, excluded_no_valid_phone:0,
    dropped_phone_less_rows_in_eligible_groups:0,
    eligible_people:0, export_rows:0,
  };
  const normalized=[];
  for (const r of records) {
    if (!r || typeof r!=='object' || !['customer','proposal_2026'].includes(r.source)
        || !/^[A-Za-z0-9:_-]{1,100}$/.test(String(r.source_id||''))
        || !['verified','ambiguous','unknown'].includes(r.identity_status)
        || !['verified','unavailable'].includes(r.purchase_check_status)
        || !['verified','unavailable'].includes(r.suppression_check_status)
        || !['verified','unavailable'].includes(r.marketing_permission_status)
        || typeof r.bought_2026!=='boolean' || typeof r.suppressed!=='boolean'
        || typeof r.marketing_allowed!=='boolean'
        || (r.name!=null&&typeof r.name!=='string')
        || (r.phone!=null&&typeof r.phone!=='string')
        || (r.email!=null&&typeof r.email!=='string')) {
      throw Error('EXPORT_BLOCKED_INVALID_RECORD_CONTRACT');
    }
    if (r.purchase_check_status!=='verified' || r.suppression_check_status!=='verified'
        || r.marketing_permission_status!=='verified') {
      throw Error('EXPORT_BLOCKED_RECORD_HAS_UNVERIFIED_ELIGIBILITY');
    }
    counts[r.source==='customer'?'customer_records':'proposal_records']++;
    const phone = normalizePhone(r.phone);
    if (!r.phone || !String(r.phone).trim()) counts.input_missing_phone++;
    else if (phone === null) counts.input_invalid_phone++;
    normalized.push({
      source:r.source,source_id:r.source_id,
      phone,email:normalizeEmail(r.email),name:normalizeName(r.name),
      bought_2026:r.bought_2026,suppressed:r.suppressed,
      marketing_allowed:r.marketing_allowed,identity_status:r.identity_status,
    });
  }
  if (counts.customer_records!==coverage.source_counts.customers
      || counts.proposal_records!==coverage.source_counts.proposals) {
    throw Error('EXPORT_BLOCKED_SOURCE_COUNT_MISMATCH');
  }

  // Union-find: O(N alpha(N)). Exact phone/email and verified source ID joins.
  // Excluding a buyer/opt-out excludes the entire associated component.
  const parent=normalized.map((_,i)=>i);
  const size=normalized.map(()=>1);
  function root(i) {while(parent[i]!==i) {parent[i]=parent[parent[i]];i=parent[i];}return i;}
  function union(i,j) {
    let a=root(i),b=root(j);
    if(a===b)return;
    if(size[a]<size[b]) [a,b]=[b,a];
    parent[b]=a;size[a]+=size[b];
  }
  const seen=new Map();
  for(let i=0;i<normalized.length;i++) {
    const r=normalized[i];
    for(const key of [r.phone&&'p:'+r.phone,r.email&&'e:'+r.email,
                       's:'+r.source+':'+r.source_id].filter(Boolean)) {
      const prev=seen.get(key);
      if(prev!==undefined)union(prev,i);
      else seen.set(key,i);
    }
  }
  const groups=new Map();
  for(let i=0;i<normalized.length;i++) {
    const id=root(i);
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push(normalized[i]);
  }
  const exportRows=[];
  for(const entries of groups.values()) {
    counts.duplicate_identity_rows+=entries.length-1;
    if(entries.some(r=>r.bought_2026)){counts.excluded_2026_buyer++;continue;}
    if(entries.some(r=>r.suppressed)){counts.excluded_suppressed++;continue;}
    if(entries.some(r=>!r.marketing_allowed)){counts.excluded_no_marketing_permission++;continue;}
    if(entries.some(r=>r.identity_status!=='verified')){counts.excluded_ambiguous_or_unknown++;continue;}
    const ids=new Set(entries.filter(r=>r.source==='customer').map(r=>r.source_id));
    if(ids.size>1){counts.excluded_conflicting_customer_ids++;continue;}

    const valid = entries.filter(r=>r.phone!==null);
    if(!valid.length){counts.excluded_no_valid_phone++;continue;}
    counts.dropped_phone_less_rows_in_eligible_groups+=entries.length-valid.length;

    // Unique normalized phone in output. For duplicates select the best
    // observed phone-email pair (prefer verified customer, then valid email).
    // Never manufacture email-A + phone-B by zipping unrelated arrays.
    const phones=new Map();
    for(const r of valid) {
      const previous=phones.get(r.phone);
      const score=x=>(x.email?4:0)+(x.source==='customer'?2:0)+(x.name?1:0);
      if(!previous) phones.set(r.phone,r);
      else {
        counts.duplicate_phone_rows_collapsed++;
        if(score(r)>score(previous)) phones.set(r.phone,r);
      }
    }
    counts.eligible_people++;
    for(const r of phones.values())exportRows.push(r);
  }
  exportRows.sort((a,b)=>a.phone<b.phone?-1:a.phone>b.phone?1:0);
  const lines=[HEADER];
  for(const r of exportRows) {
    const n=nameParts(r.name);
    lines.push([r.email||'',r.phone.slice(1),n.fn,n.ln,'br'].map(csvEscape).join(','));
  }
  const csv=lines.join('\r\n')+'\r\n';
  if(Buffer.byteLength(csv,'utf8')>MAX_CSV_BYTES)throw Error('EXPORT_BLOCKED_OVERSIZED_CSV');
  counts.export_rows=exportRows.length;
  return {
    schema:'evyd-meta-audience-export-v3',
    as_of:coverage.as_of,snapshot_id:coverage.snapshot_id,
    purchase_rule:coverage.purchase_rule,counts,
    sha256:createHash('sha256').update(csv).digest('hex'),
    csv,contains_personal_data:true,
    source:'CRM_SNAPSHOT_VERIFIED_BY_UPSTREAM_NOT_BY_FORMATTER',
  };
}

export function assertMetaAudienceUploadReady(result,{minRows=100}={}) {
  if(!result || result.schema!=='evyd-meta-audience-export-v3'
      || typeof result.csv!=='string' || result.contains_personal_data!==true
      || !Number.isSafeInteger(result.counts?.export_rows)
      || result.counts.export_rows<minRows
      || result.csv.split('\r\n')[0]!==HEADER
      || createHash('sha256').update(result.csv).digest('hex')!==result.sha256) {
    throw Error('META_CSV_NOT_READY_FOR_UPLOAD');
  }
  return {ready:true,rows:result.counts.export_rows,sha256:result.sha256};
}
