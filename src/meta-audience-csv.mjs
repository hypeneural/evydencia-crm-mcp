// Pure/offline Meta Customer List CSV formatter. No DB, files, network or logs.
// CRITICAL: source adapter alone must prove globally complete purchase/suppression
// inventory, identity, and a legitimate lawful basis for Meta audience uploads.
import {createHash} from 'node:crypto';

const DDD = new Set(('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99').split(' '));
const MAX_RECORDS = 100_000;
const MAX_CSV_BYTES = 20 * 1024 * 1024;
const REQUIRED_COVERAGE = ['customers_complete','proposals_complete','purchases_2026_complete',
  'suppression_complete','marketing_permission_complete','identity_crosscheck_complete'];
const CONTROL = /[\u0000-\u001f\u007f]/g;

export function normalizePhone(raw) {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const s = raw.trim().replace(/[\s()+.\-]/g, '');
  if (!/^\d{10,13}$/.test(s)) return null;
  const n = s.length >= 12 && s.startsWith('55') ? s.slice(2) : s;
  if (![10,11].includes(n.length) || !DDD.has(n.slice(0,2))) return null;
  const subscriber = n.slice(2);
  if (subscriber.length === 9 && !/^9\d{8}$/.test(subscriber)) return null;
  if (subscriber.length === 8 && !/^[2-9]\d{7}$/.test(subscriber)) return null;
  // Never guess the missing ninth digit / match by the last eight digits.
  return '+55' + n;
}
export function normalizeEmail(raw) {
  if (typeof raw !== 'string' || raw.length > 254) return null;
  const email=raw.trim().normalize('NFC').toLowerCase();
  // Leading spreadsheet formula markers are rejected, not escaped in-place (matching integrity).
  if (/^[=+\-@]/.test(email) || /[\r\n",;\u0000-\u001f]/.test(email)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
function safeName(raw){
  if(typeof raw!=='string')return '';
  const v=raw.normalize('NFC').replace(CONTROL,' ').replace(/\s+/g,' ').trim().slice(0,100);
  return /^[=+\-@]/.test(v)?'':v;
}
function csvEscape(raw){
  const s=String(raw??'');
  return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
}
function nameParts(name){const a=name.split(/\s+/).filter(Boolean);return {fn:a[0]||'',ln:a.slice(1).join(' ')};}
function validateCoverage(c){
  if(!c || typeof c!=='object' || c.target_year!==2026
      || c.purchase_rule!=='ANY_VALID_PURCHASE_2026'
      || !/^[A-Za-z0-9_-]{8,96}$/.test(String(c.snapshot_id||''))
      || typeof c.as_of!=='string' || !Number.isFinite(Date.parse(c.as_of))
      || !REQUIRED_COVERAGE.every(k=>c[k]===true)
      || !c.source_counts || !Number.isSafeInteger(c.source_counts.customers)
      || !Number.isSafeInteger(c.source_counts.proposals)
      || c.source_counts.customers<0 || c.source_counts.proposals<0)
    throw Error('EXPORT_BLOCKED_INCOMPLETE_OR_UNVERIFIED_COVERAGE');
}
/**
 * Strict transformation ONLY. The bridge MUST provide all records (including
 * all verified buyers, disqualified recipients and proposal-only contacts) from
 * one consistent authorized snapshot. A 'verified' flag here is no substitute
 * for checking actual evidence at the bridge; never manufacture it from absence.
 */
export function buildMetaAudienceCsv({records,coverage}={}){
  validateCoverage(coverage);
  if(!Array.isArray(records) || records.length>MAX_RECORDS) throw Error('EXPORT_BLOCKED_INVALID_RECORDS');
  const counts={input:records.length,customer_records:0,proposal_records:0,
    duplicate_identity_rows:0,excluded_2026_buyer:0,excluded_suppressed:0,
    excluded_no_marketing_permission:0,excluded_ambiguous_or_unknown:0,
    excluded_conflicting_customer_ids:0,invalid_or_missing_identity:0,
    eligible_people:0,export_rows:0};
  const normalized=[];
  for(const r of records){
    if(!r || typeof r!=='object' || !['customer','proposal_2026'].includes(r.source)
       || !/^[A-Za-z0-9:_-]{1,100}$/.test(String(r.source_id||''))
       || !['verified','ambiguous','unknown'].includes(r.identity_status)
       || !['verified','unavailable'].includes(r.purchase_check_status)
       || !['verified','unavailable'].includes(r.suppression_check_status)
       || !['verified','unavailable'].includes(r.marketing_permission_status)
       || typeof r.bought_2026!=='boolean' || typeof r.suppressed!=='boolean'
       || typeof r.marketing_allowed!=='boolean'
       || (r.name!==null&&r.name!==undefined&&typeof r.name!=='string')
       || (r.phone!==null&&r.phone!==undefined&&typeof r.phone!=='string')
       || (r.email!==null&&r.email!==undefined&&typeof r.email!=='string'))
      throw Error('EXPORT_BLOCKED_INVALID_RECORD_CONTRACT');
    if(r.purchase_check_status!=='verified'||r.suppression_check_status!=='verified'
        ||r.marketing_permission_status!=='verified')
      throw Error('EXPORT_BLOCKED_RECORD_HAS_UNVERIFIED_ELIGIBILITY');
    counts[r.source==='customer'?'customer_records':'proposal_records']++;
    normalized.push({source:r.source,source_id:r.source_id,
      name:safeName(r.name),phone:normalizePhone(r.phone),email:normalizeEmail(r.email),
      bought_2026:r.bought_2026,suppressed:r.suppressed,
      marketing_allowed:r.marketing_allowed,identity_status:r.identity_status});
  }
  if(counts.customer_records!==coverage.source_counts.customers
      || counts.proposal_records!==coverage.source_counts.proposals)
    throw Error('EXPORT_BLOCKED_SOURCE_COUNT_MISMATCH');

  // Deterministic undirected graph over exact identifiers: if a buyer/opt-out
  // touches any associated identifier, suppress the ENTIRE connected component.
  const parent=normalized.map((_,i)=>i);
  function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
  function union(a,b){a=root(a);b=root(b);if(a!==b)parent[b]=a;}
  const seen=new Map();
  for(let i=0;i<normalized.length;i++){
    const r=normalized[i];
    for(const key of [r.phone&&'phone:'+r.phone,r.email&&'email:'+r.email,
                      'source:'+r.source+':'+r.source_id].filter(Boolean)){
      const j=seen.get(key); if(j!==undefined)union(i,j);else seen.set(key,i);
    }
  }
  const groups=new Map();
  for(let i=0;i<normalized.length;i++){const k=root(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(normalized[i]);}
  const exportRows=[];
  for(const entries of groups.values()){
    counts.duplicate_identity_rows+=entries.length-1;
    if(entries.some(r=>r.bought_2026)){counts.excluded_2026_buyer++;continue;}
    if(entries.some(r=>r.suppressed)){counts.excluded_suppressed++;continue;}
    if(entries.some(r=>!r.marketing_allowed)){counts.excluded_no_marketing_permission++;continue;}
    if(entries.some(r=>r.identity_status!=='verified')){counts.excluded_ambiguous_or_unknown++;continue;}
    // Two distinct Customer IDs connected through a shared phone/email may be a
    // family, not the same person. Fail-closed instead of choosing an arbitrary name.
    const ownerIds=new Set(entries.filter(r=>r.source==='customer').map(r=>r.source_id));
    if(ownerIds.size>1){counts.excluded_conflicting_customer_ids++;continue;}
    const pairs=new Map();
    for(const r of entries){
      if(!r.phone&&!r.email)continue;
      const pair=(r.phone||'')+'\u0000'+(r.email||'');
      // Preserve only phone/email pairings actually observed on individual
      // records; never fabricate email-A + phone-B from unordered arrays.
      const prev=pairs.get(pair);
      if(!prev || (r.source==='customer' && prev.source!=='customer'))pairs.set(pair,r);
    }
    if(!pairs.size){counts.invalid_or_missing_identity++;continue;}
    counts.eligible_people++;
    for(const r of pairs.values())exportRows.push(r);
  }
  exportRows.sort((a,b)=>(a.phone||'').localeCompare(b.phone||'') || (a.email||'').localeCompare(b.email||''));
  const lines=['email,phone,fn,ln,country'];
  for(const r of exportRows){const n=nameParts(r.name);lines.push([r.email||'',r.phone||'',n.fn,n.ln,'br'].map(csvEscape).join(','));}
  const csv=lines.join('\r\n')+'\r\n';
  if(Buffer.byteLength(csv,'utf8')>MAX_CSV_BYTES)throw Error('EXPORT_BLOCKED_OVERSIZED_CSV');
  counts.export_rows=exportRows.length;
  return {schema:'evyd-meta-audience-export-v2',as_of:coverage.as_of,
    snapshot_id:coverage.snapshot_id,purchase_rule:coverage.purchase_rule,counts,
    sha256:createHash('sha256').update(csv).digest('hex'),csv,
    contains_personal_data:true,source:'CRM_SNAPSHOT_VERIFIED_BY_UPSTREAM_NOT_BY_FORMATTER'};
}
