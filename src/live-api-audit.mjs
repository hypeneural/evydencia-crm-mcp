// Operator-only inspection of existing Laravel REST APIs. Never registered on MCP stdio.
// Extension: Sanctum read/preview. Legacy: privileged static key, GET-only and explicit opt-in.
import {crmClient,baseURL,phone,slug,day} from './core.mjs';
const errors=code=>{throw Error('live_probe_'+code)};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LEGACY_READ_ENDPOINTS=Object.freeze({
 orders:'/api/orders/search',
 detail:'/api/orders/{uuid}/detail',
 sold_items:'/api/reports/sold-items',
 christmas_without_participants:'/api/reports/christmas-orders-without-participants',
 buyers:'/api/reports/customers-with-christmas-orders',
 non_buyers:'/api/reports/customers-without-christmas-orders',
 campaign_schedule_search:'/api/campaigns/schedule/search'
});
export const EXTENSION_READ_ENDPOINTS=Object.freeze({
 bootstrap:'GET /api/v1/extension/bootstrap',
 customer:'GET /api/v1/extension/customer-context?phone=...',
 history:'GET /api/v1/extension/customer-360?phone=...&page=1&per_page=5',
 preview:'POST /api/v1/extension/proposals/preview (worker-probe side effect; requires additional opt-in)'
});
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const SAFE_FIELDS=new Set(('data meta links status message code success id uuid name phone customer customers operator token abilities expires_at '+ 
 'features proposals natal_2026 server timezone api_version minimum_extension_version enabled reference_year product_slug '+ 
 'lookup match_count match_source normalized_e164 current_order history kpis orders participants items installments '+ 
 'customer_since display_name first_name purchased mode loyalty_level years_attended recommended_action '+ 
 'active_order_uuid package_name session_at created_at updated_at balance_pending gallery_available '+ 
 'lifecycle_stage orders_count completed_sessions_count lifetime_value average_ticket page per_page total has_more '+ 
 'campaign_key title status_label total_amount payment_status session_date age_label relationship '+ 
 'ready phone_status delivery_scope availability_message selection summary existing_proposal message_preview '+ 
 'status_key status_code status_id label scheduled_at coupon observation inner childs_data '+ 
 'discounts received remaining amount counts totals data_status as_of generated_at source is_live '+ 
 'period years year type error errors current_page last_page from to count results products '+ 
 'reference slug durationMinutes slotsByDate date slots time pagination googleCalendar checked hasError '+ 
 'financial cash_today financial_situation kpis_2026 contracted_cents paid_cents balance_due_cents '+ 
 'signed_at note value year tags key stage proposal_preview proposal_schedule allowed reason').split(/\s+/));

export function shapeOnly(value,{maxDepth=4,maxKeys=30}={}){
 function walk(v,depth){
  if(v===null)return 'null';
  if(Array.isArray(v))return {kind:'array',item:v.length>0&&depth<maxDepth?walk(v[0],depth+1):'unknown',length_bucket:v.length===0?'empty':'nonempty'};
  if(isPlain(v)){
   if(depth>=maxDepth)return 'object';
   const names=Object.keys(v).sort();
   const allowed=names.filter(k=>SAFE_FIELDS.has(k)).slice(0,maxKeys);
   return {kind:'object',fields:Object.fromEntries(allowed.map(k=>[k,walk(v[k],depth+1)])),
    redacted_dynamic_keys:names.length-names.filter(k=>SAFE_FIELDS.has(k)).length,
    truncated:allowed.length<names.filter(k=>SAFE_FIELDS.has(k)).length};
  }
  return typeof v;
 }
 return walk(value,0);
}
export function legacyOrderProjection(raw){
 const statusById={1:'order_aborted',2:'payment_chargeback',3:'order_created',4:'waiting_payment',
  5:'payment_confirmed',6:'session_schedule',7:'session_schedule_confirmed',8:'selection_schedule',
  9:'selection_schedule_confirmed',10:'waiting_product_retrieve',11:'product_retrieve_confirmed',
  12:'order_completed',13:'payment_refunded'};
 if(!isPlain(raw)||typeof raw.uuid!=='string'||!UUID.test(raw.uuid))errors('legacy_contract');
 const status=raw.status?.id;
 const total=raw.summary?.total,received=raw.summary?.received,remaining=raw.summary?.remaining;
 const money=x=>typeof x==='number'&&Number.isFinite(x)&&Number.isSafeInteger(Math.round(x*100))?Math.round(x*100):null;
 return {
  uuid:raw.uuid,id:Number.isSafeInteger(raw.id)?raw.id:null,
  status_key:statusById[status]??'unknown',status_label:statusById[status]?raw.status?.name??null:null,
  created_at:typeof raw.created_at==='string'?raw.created_at:null,
  session_at:typeof raw.schedule_1==='string'?raw.schedule_1:null,
  customer:{uuid:typeof raw.customer?.uuid==='string'?raw.customer.uuid:null,display_name:typeof raw.customer?.name==='string'?raw.customer.name:null},
  finance:{currency:'BRL',contracted_cents:money(total),received_cents:money(received),balance_cents:money(remaining)},
  item_count:Array.isArray(raw.items)?raw.items.length:0,
  participants_count:Array.isArray(raw.participants)?raw.participants.length:0
 };
}
export function extractLegacyOrders(raw,{maxResults=5}={}){
 const list=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
 if(!list)errors('legacy_list_contract');
 return {source:'CRM_LEGACY_ORDER_SEARCH',sample_size:Math.min(list.length,maxResults),
  result_count_unverified:true,orders:list.slice(0,maxResults).map(legacyOrderProjection)};
}
async function readBounded(response,maxBytes=1048576){
 if(response.redirected)errors('redirect_forbidden');
 if(!response.ok)errors('http_'+response.status);
 const contentType=response.headers?.get?.('content-type');
 if(contentType&&!/\bjson\b/i.test(contentType))errors('content_type_invalid');
 const reader=response.body?.getReader?.();
 let data;
 if(reader){
  const chunks=[];let bytes=0;
  try{
   while(true){
    const {done,value}=await reader.read();if(done)break;
    bytes+=value.byteLength;
    if(bytes>maxBytes){await reader.cancel();errors('response_too_large')}
    chunks.push(value);
   }
  }finally{reader.releaseLock()}
  data=Buffer.concat(chunks.map(c=>Buffer.from(c))).toString('utf8');
 }else{
  data=await response.text();
  if(Buffer.byteLength(data)>maxBytes)errors('response_too_large');
 }
 try{return JSON.parse(data)}catch{errors('json_invalid')}
}
export function legacyReadClient({baseUrl,token,allowPrivilegedGet=false,fetchFn=fetch,timeoutMs=7000}){
 if(!allowPrivilegedGet)errors('legacy_requires_explicit_optin');
 if(typeof token!=='string'||token.length<12||/[\r\n]/.test(token))errors('legacy_token_missing');
 if(!Number.isInteger(timeoutMs)||timeoutMs<300||timeoutMs>30000)errors('timeout_invalid');
 const origin=baseURL(baseUrl);
 if(new URL(origin).pathname!=='/')errors('legacy_base_requires_origin');
 async function get(action,{uuid,year=2026,page=1}={}){
  if(!Object.hasOwn(LEGACY_READ_ENDPOINTS,action))errors('legacy_endpoint_forbidden');
  let route=LEGACY_READ_ENDPOINTS[action];
  if(action==='detail'){
   if(typeof uuid!=='string'||!UUID.test(uuid))errors('invalid_uuid');
   route=route.replace('{uuid}',uuid);
  }
  if(!Number.isInteger(page)||page<1||page>10)errors('invalid_page');
  if(![2025,2026].includes(year))errors('invalid_year');
  const uri=new URL(origin+route);
  if(action==='orders'){
   uri.searchParams.set('product[slug]','natal');
   uri.searchParams.set('order[created-start]',year+'-01-01');
   uri.searchParams.set('order[created-end]',year+'-12-31');
   uri.searchParams.set('page',String(page));
  }
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
   const response=await fetchFn(uri,{method:'GET',redirect:'error',signal:ctrl.signal,
    headers:{Accept:'application/json',Authorization:token}});
   const raw=await readBounded(response);
   if(action==='orders')return extractLegacyOrders(raw);
   if(action==='detail')return {source:'CRM_LEGACY_ORDER_DETAIL',order:legacyOrderProjection(raw.data??raw)};
   return {source:'CRM_LEGACY_'+action.toUpperCase(),structure:shapeOnly(raw)};
  }finally{clearTimeout(timer)}
 }
 return {get};
}
export async function auditExtension({baseUrl,token,action='bootstrap',phoneValue,consent=false,previewConsent=false,fetchFn=fetch}){
 if(!['bootstrap','customer','history','preview','status','campaign','availability'].includes(action))errors('unknown_action');
 if(['customer','history','preview'].includes(action)&&!consent)errors('customer_probe_consent_required');
 if(action==='preview'&&!previewConsent)errors('preview_probe_consent_required');
 if(typeof token!=='string'||!token.trim())errors('sanctum_token_missing');
 const client=crmClient({baseUrl,token,privateEnabled:true,fetchFn});
 let result;
 switch(action){
  case 'bootstrap':result=await client.bootstrap();break;
  case 'customer':result=await client.customer(phone(phoneValue));break;
  case 'history':result=await client.history(phone(phoneValue));break;
  case 'preview':result=await client.preview(phone(phoneValue));break;
  case 'status':result=await client.status();break;
  case 'campaign':result=await client.campaign('natal');break;
  case 'availability':result=await client.availability('natal','ho-ho-ho',day('2026-10-25'),day('2026-10-25'));break;
 }
 const abilities=action==='bootstrap'?result.token?.abilities:[];
 return {mode:'SANCTUM_EXTENSION',action,verified_contract:true,structure:shapeOnly(result),
  broad_write_abilities:Array.isArray(abilities)&&abilities.some(v=>/write|^\\*$/.test(v)),
  emitted_personal_values:false, preview_can_probe_worker:action==='preview'};
}
export async function auditLegacy({baseUrl,token,action='orders',uuid,allowPrivilegedGet=false,fetchFn=fetch}){
 const client=legacyReadClient({baseUrl,token,allowPrivilegedGet,fetchFn});
 const result=await client.get(action,{uuid});
 return {mode:'LEGACY_SHARED_TOKEN',action,verified_contract:true,
  structure:shapeOnly(result),shared_key_has_write_capabilities:true,
  cannot_be_exposed_to_anonymous_chatgpt:true,emitted_personal_values:false};
}
