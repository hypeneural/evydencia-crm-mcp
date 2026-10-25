// Operator-only legacy integration READ adapter. NEVER register on anonymous MCP.
// The SingleAuthentication key ALSO authorizes writes upstream, so use only with explicit opt-in.
import {baseURL,day,phone} from './core.mjs';
const allowedStatuses=new Set(['order_aborted','payment_chargeback','order_created','waiting_payment',
 'payment_confirmed','session_schedule','session_schedule_confirmed','selection_schedule',
 'selection_schedule_confirmed','waiting_product_retrieve','product_retrieve_confirmed',
 'order_completed','payment_refunded']);
const fail=x=>{throw Error('legacy_read_'+x)};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const name=x=>{if(typeof x!=='string'||x.trim().length<2||x.trim().length>100||/[\x00-\x1f<>]/.test(x))fail('invalid_name');return x.trim()};
const money=x=>typeof x==='number'&&Number.isFinite(x)?Math.round(x*100):null;
const value=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
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
 return {order_id:Number.isSafeInteger(x.id)?x.id:null,
  order_uuid:uuid(x.uuid)?x.uuid:null,
  customer_name:typeof c.name==='string'?c.name.slice(0,100):null,
  status_id:statusId,
  status_label:typeof s.name==='string'?s.name.slice(0,70):null,
  created_at:typeof x.created_at==='string'?x.created_at:null,
  session_at:typeof x.schedule_1==='string'?x.schedule_1:null,
  total_cents:money(sum.total),received_cents:money(sum.received),remaining_cents:money(sum.remaining),
  item_count:Array.isArray(x.items)?x.items.length:null,
  participant_count:Array.isArray(x.participants)?x.participants.length:null};
}
export function legacyReadClient({baseUrl,token,fetchFn=fetch}){
 const base=baseURL(baseUrl);if(typeof token!=='string'||token.length<12)fail('missing_token');
 async function get(path,params){
  const url=new URL(base+path);
  if(params)url.search=params.toString();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),7000);
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
  async search(filters){
   const raw=await get('/api/orders/search',legacyFilters(filters));
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows)fail('invalid_list_contract');
   return {source:'LEGACY_SINGLE_AUTH_READ',scope:'PAGINATED_ORDER_SAMPLE',
    sampled_count:Math.min(rows.length,5),has_more:rows.length>5||raw?.links?.next!=null,
    orders:rows.slice(0,5).map(legacyOrderProjection),
    warning:'Amostra de no máximo 5 resultados. Não representa contagem total nem números canônicos de Natal.'};
  },
  async detail(id){
   if(!uuid(id))fail('invalid_uuid');
   const raw=await get('/api/orders/'+id+'/detail');
   const entry=raw?.data??raw;
   if(!entry||typeof entry!=='object'||!entry.uuid)fail('invalid_order_contract');
   return {source:'LEGACY_SINGLE_AUTH_READ',order:legacyOrderProjection(entry)};
  }
 };
}
