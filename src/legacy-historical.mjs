// Legacy 2021–2025 aggregate archives. Standalone and offline; NOT an anonymous MCP tool.
// Never claim legacy order/revenue figures are canonical CRM metrics.
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,isAbsolute,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const HISTORICAL_YEARS=Object.freeze(['2021','2022','2023','2024','2025']);
export const ARCHIVE_SCHEMA='evyd-legacy-history-v1';
const FIELDS=Object.freeze(['day_orders','day_revenue_base','day_revenue_extras','day_revenue_total','day_new_customers','accum_orders','accum_revenue_base','accum_revenue_extras','accum_revenue_total','accum_new_customers']);
const expectedDays=Object.freeze(Array.from({length:366},(_,i)=>{
 const dt=new Date(Date.UTC(2000,0,1+i));
 return String(dt.getUTCMonth()+1).padStart(2,'0')+'-'+String(dt.getUTCDate()).padStart(2,'0');
}));
const isPlain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const bad=code=>{throw Error('legacy_history_'+code)};
const inside=(parent,p)=>{const rel=relative(parent,p);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel))};
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const money=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&Number.isSafeInteger(Math.round(x*100))&&Math.abs(x-Math.round(x*100)/100)<0.0000005;
const cents=x=>Math.round(x*100);
const close=(x,y)=>Math.abs(x-y)<=1; // 1 cent for legacy decimal arithmetic
const dates=new Set(expectedDays);

export function normalizeLegacyHistory(raw,{cutoff='10-25',sourceSha256='0'.repeat(64)}={}){
 if(!isPlain(raw)||Object.keys(raw).length!==5||HISTORICAL_YEARS.some(y=>!Object.hasOwn(raw,y)))bad('years_invalid');
 if(typeof cutoff!=='string'||!dates.has(cutoff)||cutoff<'08-01'||cutoff>'12-31')bad('cutoff_invalid');
 if(typeof sourceSha256!=='string'||!/^[0-9a-f]{64}$/.test(sourceSha256))bad('hash_invalid');
 const result={};
 for(const year of HISTORICAL_YEARS){
  const calendar=raw[year];
  if(!isPlain(calendar)||Object.keys(calendar).length!==366||expectedDays.some(d=>!Object.hasOwn(calendar,d)))bad('days_invalid');
  let previous=null;
  for(const date of expectedDays){
   const row=calendar[date];
   if(!isPlain(row)||Object.keys(row).length!==FIELDS.length||FIELDS.some(k=>!Object.hasOwn(row,k)))bad('field_unexpected');
   if(!integer(row.day_orders)||!integer(row.day_new_customers)||!integer(row.accum_orders)||!integer(row.accum_new_customers))bad('counts_invalid');
   for(const k of FIELDS.filter(k=>k.includes('revenue')))if(!money(row[k]))bad('money_invalid');
   if(!close(cents(row.day_revenue_base)+cents(row.day_revenue_extras),cents(row.day_revenue_total))||
      !close(cents(row.accum_revenue_base)+cents(row.accum_revenue_extras),cents(row.accum_revenue_total)))bad('revenue_sum_invalid');
   if(previous){
    if(row.accum_orders-previous.accum_orders!==row.day_orders||
       row.accum_new_customers-previous.accum_new_customers!==row.day_new_customers||
       !close(cents(row.accum_revenue_total)-cents(previous.accum_revenue_total),cents(row.day_revenue_total)))bad('accumulation_invalid');
   } else if(row.accum_orders!==row.day_orders||row.accum_new_customers!==row.day_new_customers||
            !close(cents(row.accum_revenue_total),cents(row.day_revenue_total)))bad('initial_accumulation_invalid');
   previous=row;
  }
  const selected=calendar[cutoff],before=calendar['07-31'],yearEnd=calendar['12-31'];
  const orderDelta=selected.accum_orders-before.accum_orders;
  const baseDelta=cents(selected.accum_revenue_base)-cents(before.accum_revenue_base);
  const extraDelta=cents(selected.accum_revenue_extras)-cents(before.accum_revenue_extras);
  const grossDelta=cents(selected.accum_revenue_total)-cents(before.accum_revenue_total);
  if(orderDelta<0||baseDelta<0||extraDelta<0||!close(baseDelta+extraDelta,grossDelta))bad('window_invalid');
  result[year]={
   historical_year:Number(year),
   archived_full_year_orders:yearEnd.accum_orders,
   archived_full_year_gross_revenue_cents:cents(yearEnd.accum_revenue_total),
   archived_ytd_orders_aug01_to_cutoff:orderDelta,
   archived_ytd_base_cents_aug01_to_cutoff:baseDelta,
   archived_ytd_extras_cents_aug01_to_cutoff:extraDelta,
   archived_ytd_gross_cents_aug01_to_cutoff:grossDelta,
   data_status:'LEGACY_UNVERIFIED'
  };
 }
 return {
  schema_version:ARCHIVE_SCHEMA,source:'LEGACY_GIT_CALENDAR',
  source_sha256:sourceSha256,cutoff_mm_dd:cutoff,
  years:result,canonical_comparison_allowed:false,
  disclaimer:'Histórico legado não auditado contra NatalValidOrdersQuery. Não comparar automaticamente com vendas/receita canônicas de 2026; valores não significam recebido em caixa.'
 };
}
export async function readLegacyHistoryFile(path,{cutoff='10-25'}={}){
 if(typeof path!=='string'||!isAbsolute(path)||!path.toLowerCase().endsWith('.json'))bad('path_invalid');
 const resolved=resolve(path);
 if(inside(ROOT,resolved))bad('repository_path_forbidden');
 const file=await lstat(resolved).catch(()=>bad('file_unavailable'));
 if(!file.isFile()||file.isSymbolicLink()||file.size<10||file.size>1500000)bad('file_invalid');
 const actual=await realpath(resolved);
 if(inside(ROOT,actual))bad('repository_path_forbidden');
 let source;try{source=await readFile(actual)}catch{bad('file_unavailable')}
 const sourceSha256=createHash('sha256').update(source).digest('hex');
 let parsed;try{parsed=JSON.parse(source.toString('utf8'))}catch{bad('json_invalid')}
 return normalizeLegacyHistory(parsed,{cutoff,sourceSha256});
}
