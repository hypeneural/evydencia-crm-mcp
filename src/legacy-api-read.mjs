// Operator-only direct CRM integration READ adapter (replaces intermediary api.evydencia.com.br).
// NEVER register on anonymous MCP. Requires authenticated OAuth + Sanctum operator session.
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import { promisify } from 'node:util';
import {baseURL,day,phone} from './core.mjs';

const execFileAsync=promisify(execFile);
const BRIDGE_SCRIPT=resolve(dirname(fileURLToPath(import.meta.url)),'..','scripts','crm-natal-bridge.php');
const allowedStatuses=new Set(['order_aborted','payment_chargeback','order_created','waiting_payment',
 'payment_confirmed','session_schedule','session_schedule_confirmed','selection_schedule',
 'selection_schedule_confirmed','waiting_product_retrieve','product_retrieve_confirmed',
 'order_completed','payment_refunded']);
const fail=x=>{throw Error('legacy_read_'+x)};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const name=x=>{if(typeof x!=='string'||x.trim().length<2||x.trim().length>100||/[\x00-\x1f<>]/.test(x))fail('invalid_name');return x.trim()};
const money=x=>typeof x==='number'&&Number.isFinite(x)?Math.round(x*100):null;
const value=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const maskPhone=x=>{if(typeof x!=='string')return null;const d=x.replace(/\D/g,'');return d.length>=4?'(**) *****-'+d.slice(-4):null};
const toBrt=iso=>{
 if(typeof iso!=='string'||!iso)return null;
 const ms=Date.parse(iso);if(!Number.isFinite(ms))return iso;
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date(ms));
 const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}:${m.second}`;
};
const allKeys=new Set(['customer.name','customer.whatsapp','order.uuid','order.id','order.status',
 'order.created-start','order.created-end','order.session-start','order.session-end','product.slug']);

export function legacyFilters(filters={}){
 if(!filters||typeof filters!=='object'||Array.isArray(filters)||!Object.keys(filters).length||
    Object.keys(filters).some(k=>!allKeys.has(k)))fail('filters_not_allowlisted');
 const params=new URLSearchParams();
 for(const [key,raw] of Object.entries(filters)){
  let v;
  if(key==='customer.name')v=name(raw);
  else if(key==='customer.whatsapp')v=phone(raw);
  else if(key==='order.status'){if(!allowedStatuses.has(raw))fail('invalid_status');v=raw}
  else if(key==='order.uuid'){if(!uuid(raw))fail('invalid_uuid');v=raw}
  else if(key==='order.id'){if(!Number.isSafeInteger(raw)||raw<1)fail('invalid_id');v=String(raw)}
  else if(key==='product.slug'){if(typeof raw!=='string'||!/^[a-z0-9-]{1,60}$/.test(raw))fail('invalid_slug');v=raw}
  else v=day(raw);
  params.set(key.replace('.', '[').replace(/^([^[]+)\[([^[]+)$/, '$1[$2]'),v);
 }
 return params;
}

export function legacyOrderProjection(raw){
 const x=value(raw),s=value(x.status),c=value(x.customer),sum=value(x.summary);
 const statusId=Number.isInteger(s.id)?s.id:null;
 const rawItems=Array.isArray(x.items)?x.items:[];
 const items=rawItems.slice(0,5).map(it=>{
  const p=value(it?.product);
  const itemName=typeof p.name==='string'?p.name:typeof it?.name==='string'?it.name:null;
  const slug=typeof p.slug==='string'?p.slug:typeof it?.slug==='string'?it.slug:null;
  const ref=typeof p.reference==='string'?p.reference:typeof it?.reference==='string'?it.reference:null;
  const qty=Number(it?.quantity);
  const tot=Number(it?.total??it?.amount);
  return {name:itemName?itemName.slice(0,100):null,slug:slug?slug.slice(0,60):null,reference:ref?ref.slice(0,40):null,
   quantity:Number.isFinite(qty)?qty:1,total_reais:Number.isFinite(tot)?tot:null};
 }).filter(it=>it.name);
 const rawInst=Array.isArray(x.installments)?x.installments:[];
 const paymentMethods=[...new Set(rawInst.map(i=>{
  const m=value(i?.method),t=value(m.type);
  return typeof t.name==='string'?t.name:typeof m.name==='string'?m.name:null;
 }).filter(Boolean))];
 const totalCents=money(sum.total),receivedCents=money(sum.received),remainingCents=money(sum.remaining);
 return {order_id:Number.isSafeInteger(x.id)?x.id:null,
  order_uuid:uuid(x.uuid)?x.uuid:null,
  customer_name:typeof c.name==='string'?c.name.slice(0,100):null,
  customer_phone_masked:maskPhone(c.whatsapp||c.phone),
  status_id:statusId,
  status_label:typeof s.name==='string'?s.name.slice(0,70):null,
  created_at:typeof x.created_at==='string'?x.created_at:null,
  created_at_brt:toBrt(x.created_at),
  session_at:typeof x.schedule_1==='string'?x.schedule_1:null,
  package_name:items[0]?.name||null,
  items,
  payment_methods:paymentMethods,
  total_reais:typeof sum.total==='number'&&Number.isFinite(sum.total)?sum.total:null,
  received_reais:typeof sum.received==='number'&&Number.isFinite(sum.received)?sum.received:null,
  remaining_reais:typeof sum.remaining==='number'&&Number.isFinite(sum.remaining)?sum.remaining:null,
  total_cents:totalCents,received_cents:receivedCents,remaining_cents:remainingCents,
  item_count:Array.isArray(x.items)?x.items.length:null,
  participant_count:Array.isArray(x.participants)?x.participants.length:null};
}

export function legacyReadClient({baseUrl,token,fetchFn=fetch,timeoutMs=7000}){
 const base=baseURL(baseUrl);if(typeof token!=='string'||token.length<12)fail('missing_token');
 async function get(path,params){
  const url=new URL(base+path);
  if(params)url.search=params.toString();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetchFn(url,{method:'GET',redirect:'error',signal:controller.signal,
    headers:{Authorization:token,Accept:'application/json'}});
   if(response.redirected||response.status>=300&&response.status<400)fail('redirect');
   if(!response.ok)fail('http_'+response.status);
   const len=Number(response.headers.get('content-length')||0);if(len>1048576)fail('oversize');
   const chunks=[];let size=0;
   if(response.body&&typeof response.body.getReader==='function'){
    const reader=response.body.getReader();
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>1048576)fail('oversize');chunks.push(value)}}
    finally{reader.releaseLock()}
   }else{const text=await response.text();if(Buffer.byteLength(text)>1048576)fail('oversize');chunks.push(Buffer.from(text))}
   const bytes=Buffer.concat(chunks.map(x=>Buffer.from(x)));
   try{return JSON.parse(bytes.toString('utf8'))}catch{fail('invalid_json')}
  }finally{clearTimeout(timeout)}
 }
 return {
  async search(filters={},opts={}){
   const max=Math.min(20,Math.max(1,Number(opts?.limit)||10));
   const eff=(!filters||typeof filters!=='object'||Array.isArray(filters)||!Object.keys(filters).length)
    ?{'order.created-start':new Date(Date.now()-30*86400000).toISOString().slice(0,10)}
    :filters;
   const raw=await get('/api/orders/search',legacyFilters(eff));
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows)fail('invalid_list_contract');
   const sorted=[...rows].sort((a,b)=>(Number(b?.id)||0)-(Number(a?.id)||0));
   return {source:'LEGACY_SINGLE_AUTH_READ',scope:'PAGINATED_ORDER_SAMPLE',
    sort:'order_id_desc_most_recent_first',
    total_in_page:rows.length,
    sampled_count:Math.min(sorted.length,max),has_more:sorted.length>max||raw?.links?.next!=null,
    orders:sorted.slice(0,max).map(legacyOrderProjection),
    warning:'Ordenado do pedido mais recente para o mais antigo (horário de emissão em created_at_brt America/Sao_Paulo).'};
  },
  async resolvePhoneByName(customerName){
   const q=name(customerName);
   const raw=await get('/api/orders/search',legacyFilters({'customer.name':q}));
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows||!rows.length)fail('customer_not_found');
   const sorted=[...rows].sort((a,b)=>(Number(b?.id)||0)-(Number(a?.id)||0));
   for(const r of sorted){
    const w=r?.customer?.whatsapp||r?.customer?.phone;
    if(typeof w==='string'&&w.replace(/\D/g,'').length>=10){
     try{return phone(w)}catch{}
    }
   }
   fail('customer_phone_unavailable');
  },
  async detail(id){
   if(!uuid(id))fail('invalid_uuid');
   const raw=await get('/api/orders/'+id+'/detail');
   const entry=raw?.data??raw;
   if(!entry||typeof entry!=='object'||!entry.uuid)fail('invalid_order_contract');
   return {source:'LEGACY_SINGLE_AUTH_READ',order:legacyOrderProjection(entry)};
  },
  async natalStatistics({cutoffMmDd}={}){
   let mmdd='';
   if(cutoffMmDd!==undefined&&cutoffMmDd!==null&&cutoffMmDd!==''){
    if(typeof cutoffMmDd!=='string'||!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(cutoffMmDd))fail('invalid_mmdd');
    mmdd=cutoffMmDd;
   }
   const crmAppPath=process.env.EVYD_CRM_APP_PATH||'/var/www/evydencia/current';
   if(fetchFn===fetch&&existsSync(crmAppPath+'/vendor/autoload.php')&&existsSync(BRIDGE_SCRIPT)){
    try{
     const {stdout}=await execFileAsync('php',[BRIDGE_SCRIPT,...(mmdd?[mmdd]:[])],{
      timeout:Math.max(timeoutMs,15000),maxBuffer:2097152,env:{...process.env,EVYD_CRM_APP_PATH:crmAppPath}
     });
     return JSON.parse(stdout);
    }catch{fail('natal_stats_unavailable')}
   }
   const params=new URLSearchParams();
   if(mmdd)params.set('date',mmdd);
   return await get('/api/reports/natal-statistics',params);
  },
  async soldItems({start,end,slug:itemSlug,search}={}){
   if(!start&&!end)fail('missing_period');
   const params=new URLSearchParams();
   if(start)params.set('order[created-start]',day(start));
   if(end)params.set('order[created-end]',day(end));
   if(itemSlug){if(typeof itemSlug!=='string'||!/^[a-z0-9-]{1,60}$/.test(itemSlug))fail('invalid_slug');params.set('item[slug]',itemSlug)}
   if(search)params.set('buscar',name(search));
   const raw=await get('/api/reports/sold-items',params);
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows)fail('invalid_report_contract');
   return {source:'CRM_DIRECT_SOLD_ITEMS',total_rows:rows.length,
    warning:'Relatório de unidades de itens vendidos por data de criação (orders_items). Para números canônicos de pedidos de Natal (101 em 2026, 142 em 2025, 124 em 2024 até 25/10), use SEMPRE crm_estatisticas_natal.',
    items:rows.slice(0,30).map(r=>({
    item:typeof r?.item==='string'?r.item.slice(0,120):null,
    reference:r?.reference!=null?String(r.reference).slice(0,40):null,
    year:Number.isInteger(r?.year)?r.year:null,
    month:Number.isInteger(r?.month)?r.month:null,
    solds:typeof r?.solds==='number'&&Number.isFinite(r.solds)?r.solds:null
   }))};
  },
  async christmasWithoutParticipants({limit=20}={}){
   const max=Math.min(50,Math.max(1,Number(limit)||20));
   const raw=await get('/api/reports/christmas-orders-without-participants');
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows)fail('invalid_report_contract');
   return {source:'CRM_DIRECT_CHRISTMAS_WITHOUT_PARTICIPANTS',total_orders:rows.length,
    sampled_count:Math.min(rows.length,max),has_more:rows.length>max,
    orders:rows.slice(0,max).map(r=>({
     order_uuid:uuid(r?.order_uuid)?r.order_uuid:null,
     customer_name:typeof r?.customer_name==='string'?r.customer_name.slice(0,100):null,
     customer_phone_masked:maskPhone(r?.customer_whatsapp),
     current_status:typeof r?.current_status==='string'?r.current_status:null,
     participants_count:Number.isInteger(r?.participants)?r.participants:0
    }))};
  },
  async christmasCustomers({bought=true,search='',limit=20}={}){
   const max=Math.min(50,Math.max(1,Number(limit)||20));
   const q=search?name(search).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase():'';
   const route=bought?'/api/reports/customers-with-christmas-orders':'/api/reports/customers-without-christmas-orders';
   const raw=await get(route);
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows)fail('invalid_report_contract');
   const filtered=q?rows.filter(r=>typeof r?.name==='string'&&r.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)):rows;
   return {source:bought?'CRM_DIRECT_CHRISTMAS_BUYERS':'CRM_DIRECT_CHRISTMAS_NON_BUYERS',
    total_matching:filtered.length,sampled_count:Math.min(filtered.length,max),has_more:filtered.length>max,
    customers:filtered.slice(0,max).map(r=>({
     name:typeof r?.name==='string'?r.name.slice(0,100):null,
     phone_masked:maskPhone(r?.whatsapp)
    }))};
  }
 };
}
