// Validates private, operator-exported Natal aggregates only. Not registered as an MCP tool.
// No CRM HTTP/SQL, no cookies, no shell execution; reject PII, stale or altered schemas.
import {lstat,readFile,realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const SCHEMA='evyd-natal-digest-v1';
export const YEARS=Object.freeze(['2022','2023','2024','2025','2026']);
const topKeys=['schema_version','source','is_live','reference_year','product_slug','population_scope','as_of','captured_at','financial_status','financial_scope','season','comparison'];
const seasonKeys=['orders','customers','new_customers','recurring_customers','scheduled','unscheduled','contracted_cents','received_cents','balance_cents','cash_today_cents','new_sales_today_cents'];
const comparisonKeys=['window','years'];
const yearKeys=['orders','contracted_cents','received_cents','data_status','period_start','period_as_of'];
const statuses=['OK','UNCONFIRMED','DATA_UNAVAILABLE'];
const own=(x,k)=>Object.hasOwn(x,k);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const invalid=code=>{throw Error('natal_snapshot_'+code)};
function keys(x,wanted){
 if(!plain(x)||Object.keys(x).length!==wanted.length||Object.keys(x).some(k=>!wanted.includes(k))||wanted.some(k=>!own(x,k)))invalid('schema_invalid');
}
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const signed=n=>Number.isSafeInteger(n);
const validDateTime=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
function validateSnapshot(raw,{now=Date.now(),maxAgeMs=300000}={}){
 keys(raw,topKeys);
 if(raw.schema_version!==SCHEMA||raw.source!=='LIVE_MYSQL'||raw.is_live!==true||
    raw.reference_year!==2026||raw.product_slug!=='natal'||raw.population_scope!=='NATAL_2026')invalid('source_invalid');
 if(!['RECORDED_GROSS','UNCONFIRMED'].includes(raw.financial_status)||
    raw.financial_scope!=='CURRENT_ITEMS_RECORDED_PAYMENTS')invalid('finance_scope_invalid');
 if(!validDateTime(raw.as_of)||!validDateTime(raw.captured_at))invalid('time_invalid');
 if(!Number.isFinite(now)||!Number.isFinite(maxAgeMs)||maxAgeMs<=0||maxAgeMs>300000)invalid('freshness_policy_invalid');
 const captured=Date.parse(raw.captured_at),asOf=Date.parse(raw.as_of);
 if(captured>now+30000||asOf>captured+30000||now-captured>maxAgeMs||
    now-asOf>maxAgeMs+30000)invalid('stale_or_future');
 keys(raw.season,seasonKeys);
 for(const k of seasonKeys)if(!(k==='balance_cents'?signed(raw.season[k]):nat(raw.season[k])))invalid('number_invalid');
 if(raw.season.orders!==raw.season.scheduled+raw.season.unscheduled ||
    raw.season.customers!==raw.season.new_customers+raw.season.recurring_customers ||
    raw.season.balance_cents!==raw.season.contracted_cents-raw.season.received_cents)invalid('invariant_invalid');
 keys(raw.comparison,comparisonKeys);
 if(raw.comparison.window!=='AUG01_TO_AS_OF_EQUIVALENT')invalid('window_invalid');
 keys(raw.comparison.years,YEARS);
 for(const y of YEARS){
  const x=raw.comparison.years[y];keys(x,yearKeys);
  if(!nat(x.orders)||!nat(x.contracted_cents)||!nat(x.received_cents)||!statuses.includes(x.data_status)||
    !validDate(x.period_start)||!validDateTime(x.period_as_of)||
    !x.period_start.startsWith(y+'-')||!x.period_as_of.startsWith(y+'-'))invalid('comparison_invalid');
  if(x.period_start!==y+'-08-01'||Date.parse(x.period_as_of)>captured+30000)invalid('comparison_window_invalid');
 }
 if(raw.comparison.years['2026'].orders>raw.season.orders)invalid('comparison_exceeds_season');
 const current=raw.comparison.years['2026'];
 const prior=raw.comparison.years['2025'];
 const historyConfirmed=current.data_status==='OK'&&prior.data_status==='OK';
 const delta=historyConfirmed?current.orders-prior.orders:null;
 const percent=historyConfirmed&&prior.orders>0?Number((100*delta/prior.orders).toFixed(2)):null;
 return Object.freeze({
  schema_version:SCHEMA,source:'LIVE_MYSQL',is_live:true,as_of:raw.as_of,captured_at:raw.captured_at,
  freshness_seconds:Math.max(0,Math.floor((now-captured)/1000)),
  reference_year:2026,financial_status:raw.financial_status,
  finance_certified:raw.financial_status==='RECORDED_GROSS',
  season:{...raw.season},
  ytd:{window:raw.comparison.window,current:{...current},prior:{...prior},
    comparison_confirmed:historyConfirmed,delta_orders:delta,delta_orders_pct:percent,
    warning:historyConfirmed?'Comparação por período equivalente confirmada.':'Histórico não confirmado; não afirmar crescimento/queda ou percentual auditado.'}
 });
}
export {validateSnapshot};
const inside=(parent,path)=>{const rel=relative(parent,path);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel))};
export async function loadPrivateSnapshot(path,options={}){
 if(typeof path!=='string'||!isAbsolute(path)||!path.endsWith('.json'))invalid('path_invalid');
 const resolved=resolve(path);
 if(inside(ROOT,resolved))invalid('path_in_repository');
 let stat;
 try{stat=await lstat(resolved)}catch{invalid('unavailable')}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768||stat.size===0)invalid('file_invalid');
 const real=await realpath(resolved);
 if(inside(ROOT,real))invalid('path_in_repository');
 // POSIX users must not make commercial snapshots world/group-readable.
 if(process.platform!=='win32'&&(stat.mode&0o077)!==0)invalid('permissions_invalid');
 let data;
 try{data=JSON.parse(await readFile(resolved,'utf8'))}catch{invalid('json_invalid')}
 return validateSnapshot(data,options);
}
