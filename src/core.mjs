// Segurança: endpoints fixos, sem SQL, URL arbitrária ou ferramentas de escrita.
const select = (o, keys) => Object.fromEntries(keys.filter(k => o && Object.hasOwn(o,k)).map(k=>[k,o[k]]));
const data = x => x && typeof x === 'object' && 'data' in x ? x.data : x;
export function baseURL(s) {
  const u=new URL(s);
  if(u.username||u.password||u.hash||u.search) throw Error('crm_url_invalid');
  if(u.protocol!=='https:' && !(u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname))) throw Error('crm_https_required');
  return u.origin+u.pathname.replace(/\/$/,'');
}
export function slug(s){if(typeof s!=='string'|| !/^[a-z0-9][a-z0-9-]{0,79}$/.test(s))throw Error('invalid_slug');return s}
// Mesmo conjunto de DDDs e normalização de celulares legados do BrazilMobilePhone.php do CRM.
const VALID_DDDS=new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
export function phone(s){
 const raw=String(s??'').trim();
 if(raw.length>30)throw Error('invalid_mobile');
 let d=raw.replace(/\D/g,'');
 if(raw.startsWith('+')&&!d.startsWith('55'))throw Error('invalid_mobile');
 if(d.startsWith('55')&&[12,13].includes(d.length))d=d.slice(2);
 if(![10,11].includes(d.length)||!VALID_DDDS.has(d.slice(0,2)))throw Error('invalid_mobile');
 const n=d.slice(2);
 if(/^9\d{8}$/.test(n))return d;
 if(/^[6-9]\d{7}$/.test(n))return d.slice(0,2)+'9'+n;
 throw Error('invalid_mobile');
}
export function day(s){if(typeof s!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)||isNaN(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw Error('invalid_date');return s}
export function dates(a,b){day(a);day(b);const days=(Date.parse(b)-Date.parse(a))/86400000;if(days<0||days>=14)throw Error('invalid_date_range');return [a,b]}
export function customerProjection(raw){
  const d=data(raw)||{};
  if(d.lookup?.status!=='matched')return {lookup:select(d.lookup,['status','match_count']),customer:null,orders:[]};
  return {lookup:select(d.lookup,['status','match_count']),customer:select(d.customer,['uuid','display_name','first_name','customer_since','lifecycle_stage']),current_order:d.current_order?{...select(d.current_order,['uuid','package_name','session_at','created_at','balance_pending','participants_count','gallery_available']),status:select(d.current_order.status,['code','label','stage'])}:null,natal_2026:select(d.natal_2026,['purchased','mode']),history:select(d.history,['lifecycle_stage','orders_count','completed_sessions_count','lifetime_value','average_ticket','years_attended']),capabilities:{proposal_preview:select(d.capabilities?.proposal_preview,['allowed','reason']),proposal_schedule:select(d.capabilities?.proposal_schedule,['allowed','reason'])}};
}
export function historyProjection(raw){
 const d=data(raw)||{};
 if(d.lookup?.status!=='matched')return {lookup:select(d.lookup,['status','match_count']),orders:[]};
 return {customer:select(d.customer,['uuid','display_name','first_name']),kpis:select(d.kpis,['orders_count','completed_sessions_count','lifetime_value','average_ticket','years_attended']),natal_2026:select(d.natal_2026,['purchased','mode','recommended_action']),history:select(d.history,['page','per_page','total','has_more']),orders:(Array.isArray(d.orders)?d.orders:[]).slice(0,5).map(x=>({...select(x,['uuid','package_name','status_label','total_amount','balance_pending','session_date','payment_status']),participants_count:Array.isArray(x.participants)?x.participants.length:null}))};
}
export function proposalProjection(raw){const d=data(raw)||{};return {ready:d.ready===true,phone_status:d.phone_status??null,delivery_scope:d.delivery_scope??null,availability_message:d.availability_message??null,customer:select(d.customer,['status','label','first_name']),suggested_name:d.suggested_name??null,selection:select(d.selection,['variant','label','name_source']),summary:select(d.summary,['status','total_sessions_purchased','customer_since','last_purchase','package_display_name']),existing_proposal:select(d.existing_proposal,['status','scheduled_at']),message_preview:d.message_preview??null,scheduled:false};}
export function crmClient({baseUrl,token='',privateEnabled=false,timeoutMs=7000,fetchFn=fetch}){
 const base=baseURL(baseUrl);
 if(privateEnabled&&!token)throw Error('crm_missing_token');
 async function request(path,{body,auth=false,method='GET',params={}}={}){
   if(auth&&!privateEnabled)throw Error('crm_private_disabled');
   if(!/^\/[a-z0-9/_-]+$/i.test(path))throw Error('crm_invalid_path');
   if(!['GET','POST'].includes(method)|| (method==='POST'&&path!=='/api/v1/extension/proposals/preview'))throw Error('crm_method_forbidden');
   const u=new URL(base+path);for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);
   try{
     const r=await fetchFn(u,{method,redirect:'error',signal:controller.signal,headers:{Accept:'application/json',...(auth?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
     if(!r.ok)throw Error('crm_http_'+r.status);
     if(Number(r.headers?.get?.('content-length')??0)>1048576)throw Error('crm_response_too_large');
     const text=await r.text();if(Buffer.byteLength(text,'utf8')>1048576)throw Error('crm_response_too_large');
     return JSON.parse(text);
   }finally{clearTimeout(timeout)}
 }
 return {
   status:async()=>select(await request('/health/live'),['status','ok','message']),
   campaign:async s=>{const r=await request('/api/public/v1/agenda/campaigns/'+slug(s));const d=data(r)||{};return {campaign:select(d,['slug','name','period']),products:(d.products||[]).slice(0,12).map(x=>select(x,['slug','code','name','durationMinutes']))}},
   availability:async(c,p,a,b)=>{dates(a,b);const r=await request('/api/public/v1/agenda/campaigns/'+slug(c)+'/availability',{params:{package:slug(p),dateFrom:a,dateTo:b,perPage:14}});const d=data(r)||{};return {campaign:select(d.campaign,['slug','name','timezone']),package:select(d.product,['slug','code','name','durationMinutes']),days:(Array.isArray(d.slotsByDate)?d.slotsByDate:[]).slice(0,14).map(x=>({date:x.date,times:(Array.isArray(x.slots)?x.slots:[]).slice(0,30).map(y=>y.time)})),calendar:select(d.googleCalendar??r.meta?.googleCalendar,['checked','hasError']),pagination:select(d.pagination,['currentPage','totalDays','hasNextPage'])}},
   bootstrap:async()=>{const d=data(await request('/api/v1/extension/bootstrap',{auth:true}))||{};return {operator:select(d.operator,['id','name']),server:select(d.server,['timezone','api_version','minimum_extension_version']),features:{proposals:select(d.features?.proposals,['enabled']),natal_2026:select(d.features?.natal_2026,['enabled','reference_year'])},token:select(d.token,['abilities','expires_at'])}},
   customer:async s=>customerProjection(await request('/api/v1/extension/customer-context',{auth:true,params:{phone:phone(s)}})),
   history:async(s,page=1)=>{if(!Number.isInteger(page)||page<1||page>100)throw Error('invalid_page');return historyProjection(await request('/api/v1/extension/customer-360',{auth:true,params:{phone:phone(s),page,per_page:5}}))},
   preview:async(s,name)=>proposalProjection(await request('/api/v1/extension/proposals/preview',{auth:true,method:'POST',body:{phone:phone(s),...(name?{name}: {})}}))
 }
}
