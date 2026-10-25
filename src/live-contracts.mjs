// No credentials committed or printed. Offline JSON contract assertions for real CRM responses.
import {readFile} from 'node:fs/promises';
import {realpath,stat} from 'node:fs/promises';
import {resolve,dirname,isAbsolute,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {customerProjection,historyProjection,proposalProjection} from './core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const within=(p)=>{const r=relative(root,p);return r===''||(!r.startsWith('..')&&!isAbsolute(r))};
const fail=code=>{throw Error('live_contract_'+code)};
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const envelope=x=>obj(x)&&obj(x.data)&&typeof x.schema_version==='string'&&typeof x.generated_at==='string';
export function validateRealContract(type,raw){
 if(!envelope(raw))fail('envelope');
 const d=raw.data;
 switch(type){
  case 'bootstrap':{
   if(!obj(d.operator)||!obj(d.server)||!obj(d.token)||!Array.isArray(d.token.abilities))fail('bootstrap');
   return {kind:type,valid:true,abilities:d.token.abilities.filter(x=>typeof x==='string'),operator_present:true,token_expiry_present:!!d.token.expires_at};
  }
  case 'customer-context':{
   if(!obj(d.lookup)||!['matched','not_found','ambiguous'].includes(d.lookup.status))fail('lookup');
   if(d.lookup.status==='matched'&&(!obj(d.customer)||!d.customer.uuid))fail('customer');
   const p=customerProjection(raw);
   return {kind:type,valid:true,lookup_status:d.lookup.status,has_customer:!!p.customer,has_current_order:!!p.current_order,has_history:!!p.history};
  }
  case 'customer-360':{
   if(!obj(d.lookup)||!['matched','not_found','ambiguous'].includes(d.lookup.status))fail('lookup');
   if(d.lookup.status==='matched'&&(!obj(d.customer)||!Array.isArray(d.orders)||!obj(d.kpis)||!obj(d.history)))fail('history');
   const p=historyProjection(raw);
   return {kind:type,valid:true,lookup_status:d.lookup.status,has_customer:!!p.customer,orders_in_page:p.orders.length,has_more:p.history?.has_more===true};
  }
  case 'proposal-preview':{
   if(typeof d.ready!=='boolean'||!obj(d.selection)||!obj(d.summary))fail('preview');
   const p=proposalProjection(raw);
   return {kind:type,valid:true,ready:p.ready,delivery_scope:p.delivery_scope,has_message_preview:typeof p.message_preview==='string'};
  }
  default:fail('unknown_type');
 }
}
export async function validatePrivateResponseFile(type,path){
 if(typeof path!=='string'||!isAbsolute(path))fail('path');
 const loc=resolve(path);
 if(within(loc))fail('git_path');
 const real=await realpath(loc).catch(()=>fail('missing'));
 if(within(real))fail('git_path');
 const s=await stat(real);
 if(!s.isFile()||s.size>1024*1024)fail('size');
 if(process.platform!=='win32'&&(s.mode&0o077)!==0)fail('mode');
 let data;try{data=JSON.parse(await readFile(real,'utf8'))}catch{fail('json')}
 return validateRealContract(type,data);
}
