// Pure, offline CRM -> Meta Customer List CSV transformer.
// The LIVE MCP reader/authorization/export transport is NOT wired in this module.
// Customer PII is never logged, sent to GitHub, or persisted by this module.
import {createHash} from 'node:crypto';

const DDD = new Set(('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99').split(' '));
const MAX_RECORDS = 100_000;
const REQUIRED_COVERAGE = [
  'customers_complete', 'proposals_complete', 'purchases_2026_complete',
  'suppression_complete', 'marketing_permission_complete'
];
const REQUIRED_RECORD_FLAGS = ['bought_2026', 'suppressed', 'marketing_allowed'];
const STRIP_CONTROL = /[\u0000-\u001f\u007f]/g;

export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[\s()+.\-]/g, '');
  if (!/^(?:55)?\d{10,11}$/.test(digits)) return null;
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  if (![10, 11].includes(national.length) || !DDD.has(national.slice(0,2))) return null;
  const subscriber = national.slice(2);
  if (subscriber.length === 9 && !/^9\d{8}$/.test(subscriber)) return null;
  if (subscriber.length === 8 && !/^[2-9]\d{7}$/.test(subscriber)) return null;
  // Do not infer legacy 8-digit <-> 9-digit identity from the last eight digits.
  return '+55' + national;
}
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) return null;
  return email;
}
function safeName(raw) {
  if (typeof raw !== 'string') return '';
  let x = raw.replace(STRIP_CONTROL,' ').replace(/\s+/g,' ').trim().slice(0,100);
  // Neutralize spreadsheet formula interpretation without corrupting good names.
  if (/^[=+@\-]/.test(x)) x = '';
  return x;
}
function csvEscape(raw) {
  const s=String(raw ?? '');
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s;
}
function nameParts(raw) {
  const parts=safeName(raw).split(' ').filter(Boolean);
  return {fn:parts[0]||'',ln:parts.length>1?parts.slice(1).join(' '):''};
}
function validateCoverage(e) {
  if (!e || typeof e!=='object' || typeof e.snapshot_id!=='string'
      || !/^[a-zA-Z0-9_-]{8,96}$/.test(e.snapshot_id)
      || !Number.isFinite(Date.parse(e.as_of || ''))
      || !REQUIRED_COVERAGE.every(k=>e[k]===true)
      || e.target_year!==2026
      || e.purchase_rule!=='ANY_VALID_PURCHASE_2026') {
    throw new Error('EXPORT_BLOCKED_INCOMPLETE_OR_UNVERIFIED_COVERAGE');
  }
}

/**
 * Adapters must supply globally enumerated records (customers and proposal-only
 * recipients) from ONE consistent, authorized, full snapshot. Every record needs
 * verified purchase, suppression, identity and marketing permission decisions.
 * No unknown status silently becomes false.
 */
export function buildMetaAudienceCsv({records,coverage}={}) {
  validateCoverage(coverage);
  if (!Array.isArray(records) || records.length > MAX_RECORDS) throw new Error('INVALID_OR_OVERSIZED_RECORDS');
  const prepared=[];
  const counters={input:records.length,customer_records:0,proposal_records:0,
    invalid_or_missing_identity:0,excluded_2026_buyer:0,excluded_suppressed:0,
    excluded_no_marketing_permission:0,excluded_ambiguous_or_unknown:0,
    duplicate_identity_rows:0,eligible_people:0,export_rows:0};
  for (const row of records) {
    if (!row || typeof row!=='object'
        || !['customer','proposal_2026'].includes(row.source)
        || !/^[a-zA-Z0-9:_-]{1,100}$/.test(String(row.source_id || ''))
        || !REQUIRED_RECORD_FLAGS.every(k=>typeof row[k]==='boolean')
        || row.purchase_check_status!=='verified'
        || row.suppression_check_status!=='verified'
        || row.marketing_permission_status!=='verified'
        || !['verified','ambiguous','unknown'].includes(row.identity_status)) {
      throw new Error('EXPORT_BLOCKED_RECORD_HAS_UNVERIFIED_ELIGIBILITY');
    }
    counters[row.source==='customer'?'customer_records':'proposal_records']++;
    const phone=normalizePhone(row.phone);
    const email=normalizeEmail(row.email);
    prepared.push({source:row.source,source_id:row.source_id,
      phone,email,name:safeName(row.name),bought_2026:row.bought_2026,
      suppressed:row.suppressed,marketing_allowed:row.marketing_allowed,
      identity_status:row.identity_status});
  }
  const parent=prepared.map((_,i)=>i);
  function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
  function union(i,j){const a=root(i),b=root(j);if(a!==b)parent[b]=a;}
  const identifierToIndex=new Map();
  for(let i=0;i<prepared.length;i++){
    const r=prepared[i];
    for(const key of [r.phone?'p:'+r.phone:null,r.email?'e:'+r.email:null,'s:'+r.source+':'+r.source_id].filter(Boolean)){
      if(identifierToIndex.has(key)) union(i,identifierToIndex.get(key));
      else identifierToIndex.set(key,i);
    }
  }
  const groups=new Map();
  for(let i=0;i<prepared.length;i++){const k=root(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(prepared[i]);}
  const lines=['email,phone,fn,ln,country'];
  const eligible=[];
  for(const rows of groups.values()){
    counters.duplicate_identity_rows+=rows.length-1;
    if(rows.some(r=>r.bought_2026)){counters.excluded_2026_buyer++;continue;}
    if(rows.some(r=>r.suppressed)){counters.excluded_suppressed++;continue;}
    if(rows.some(r=>!r.marketing_allowed)){counters.excluded_no_marketing_permission++;continue;}
    if(rows.some(r=>r.identity_status!=='verified')){counters.excluded_ambiguous_or_unknown++;continue;}
    const phones=[...new Set(rows.map(r=>r.phone).filter(Boolean))];
    const emails=[...new Set(rows.map(r=>r.email).filter(Boolean))];
    if(!phones.length&&!emails.length){counters.invalid_or_missing_identity++;continue;}
    const name=rows.find(r=>r.name)?.name||'';
    // Different phones/emails joined through verified customer identity can
    // represent one customer. Emit one row per complete identifier pair.
    // Do not mix unverified alternate phones or last-eight-digit matches.
    const max=Math.max(phones.length,emails.length,1);
    for(let i=0;i<max;i++){
      eligible.push({email:emails[i]||'',phone:phones[i]||'',name});
    }
    counters.eligible_people++;
  }
  eligible.sort((a,b)=>(a.phone+'|'+a.email).localeCompare(b.phone+'|'+b.email,'en'));
  for(const x of eligible){const n=nameParts(x.name);lines.push([x.email,x.phone,n.fn,n.ln,'br'].map(csvEscape).join(','));}
  counters.export_rows=eligible.length;
  const csv=lines.join('\r\n')+'\r\n';
  return {schema:'evyd-meta-audience-export-v1',as_of:coverage.as_of,
    snapshot_id:coverage.snapshot_id,purchase_rule:coverage.purchase_rule,
    counts:counters,sha256:createHash('sha256').update(csv).digest('hex'),
    csv,contains_personal_data:true,
    source:'CRM_SNAPSHOT_VERIFIED_BY_UPSTREAM_NOT_BY_THIS_PURE_TRANSFORMER'};
}
