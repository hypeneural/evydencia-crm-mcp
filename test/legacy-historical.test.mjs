import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeLegacyHistory,readLegacyHistoryFile,HISTORICAL_YEARS} from '../src/legacy-historical.mjs';

const dates=Array.from({length:366},(_,i)=>{
 const day=new Date(Date.UTC(2000,0,1+i));
 return String(day.getUTCMonth()+1).padStart(2,'0')+'-'+String(day.getUTCDate()).padStart(2,'0');
});
function makeYear(){
 let orders=0,base=0,extra=0,revenue=0,customers=0;
 return Object.fromEntries(dates.map(date=>{
  const count=date>='08-01'&&date<='12-31'?1:0;
  orders+=count;base+=10*count;extra+=2*count;revenue+=12*count;customers+=count;
  return [date,{day_orders:count,day_revenue_base:10*count,day_revenue_extras:2*count,
   day_revenue_total:12*count,day_new_customers:count,accum_orders:orders,
   accum_revenue_base:base,accum_revenue_extras:extra,accum_revenue_total:revenue,
   accum_new_customers:customers}];
 }));
}
const source=()=>Object.fromEntries(HISTORICAL_YEARS.map(year=>[year,makeYear()]));
test('snapshot legado sintético reúne 2021-25 e separa janela 01/08 de temporada inteira',()=>{
 const x=normalizeLegacyHistory(source(),{cutoff:'10-25',sourceSha256:'a'.repeat(64)});
 assert.equal(x.canonical_comparison_allowed,false);
 assert.equal(x.source,'LEGACY_GIT_CALENDAR');
 assert.equal(Object.keys(x.years).length,5);
 const y=x.years['2021'];
 assert.equal(y.archived_ytd_orders_aug01_to_cutoff,86);
 assert.equal(y.archived_ytd_gross_cents_aug01_to_cutoff,103200);
 assert.equal(y.archived_full_year_orders,153);
 assert.equal(y.data_status,'LEGACY_UNVERIFIED');
 assert.ok(!JSON.stringify(x).includes('customer_phone'));
});
test('não aceita PII, campos extras ou ausência de datas no arquivo privado',()=>{
 const x=source();x['2025']['10-25'].customer_name='DADO-PRIVADO';
 assert.throws(()=>normalizeLegacyHistory(x),/legacy_history_field_unexpected/);
 const y=source();delete y['2024']['02-29'];
 assert.throws(()=>normalizeLegacyHistory(y),/legacy_history_days_invalid/);
 const z=source();z['2021'].customer_email='x';
 assert.throws(()=>normalizeLegacyHistory(z),/legacy_history_days_invalid/);
});
test('bloqueia arquivos com valores incoerentes, dia fora de janela ou tipos incorretos',()=>{
 const x=source();x['2022']['10-25'].accum_orders=9000;
 assert.throws(()=>normalizeLegacyHistory(x),/legacy_history_accumulation_invalid/);
 const y=source();y['2023']['10-25'].day_revenue_total=88;
 assert.throws(()=>normalizeLegacyHistory(y),/legacy_history_revenue_sum_invalid/);
 const z=source();z['2021']['10-25'].day_orders='1';
 assert.throws(()=>normalizeLegacyHistory(z),/legacy_history_counts_invalid/);
 assert.throws(()=>normalizeLegacyHistory(source(),{cutoff:'07-31'}),/legacy_history_cutoff_invalid/);
});
test('importa arquivo local fora do repositório, nunca expõe conteúdo bruto',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evyd-history-offline-'));
 try{
  const path=join(dir,'history.json');
  await writeFile(path,JSON.stringify(source()));
  const x=await readLegacyHistoryFile(path,{cutoff:'10-25'});
  assert.equal(x.source_sha256.length,64);
  assert.equal(x.years['2025'].archived_ytd_orders_aug01_to_cutoff,86);
  await assert.rejects(()=>readLegacyHistoryFile('history.json'),/legacy_history_path_invalid/);
  await assert.rejects(()=>readLegacyHistoryFile(join(process.cwd(),'data','history.json')),/legacy_history_repository_path_forbidden/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('o MCP anônimo não registra leitor legado como ferramenta',async()=>{
 const {readFile}=await import('node:fs/promises');
 const s=await readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
 assert.ok(!s.includes('legacy-historical.mjs'));
 assert.ok(!s.includes('crm_history_live'));
});
