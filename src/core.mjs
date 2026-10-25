// Adaptador mínimo da API Laravel. Sem SQL, URL arbitrária ou endpoints de envio.
const select=(o,keys)=>Object.fromEntries(keys.filter(k=>o&&typeof o==='object'&&Object.hasOwn(o,k)).map(k=>[k,o[k]]));
const data=x=>x&&typeof x==='object'&&'data' in x?x.data:x;
const MAX_RESPONSE_BYTES=1024*1024;

export function baseURL(s){
 let u;try{u=new URL(s)}catch{throw Error('crm_url_invalid')}
 if(u.username||u.password||u.hash||u.search)throw Error('crm_url_invalid');
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('crm_https_required');
 return u.origin+u.pathname.replace(/\/$/,'');
}
export function slug(s){if(typeof s!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(s))throw Error('invalid_slug');return s}
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
 // CustomerContextRequest e ProposalPreviewRequest usam fromProposalInput(): legado vira 9 dígitos.
 if(/^[6-9]\d{7}$/.test(n))return d.slice(0,2)+'9'+n;
 throw Error('invalid_mobile');
}
export function proposalName(s){
 if(s===undefined||s===null)return undefined;
 if(typeof s!=='string'||s.length>160||/[\x00-\x1f\x7f;]/u.test(s))throw Error('invalid_name');
 const n=s.trim().replace(/\s+/gu,' ');
 if(!n)return undefined;
 if(!/\p{L}/u.test(n)||[...n].length>80)throw Error('invalid_name');
 return n;
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
 return {customer:select(d.customer,['uuid','display_name','first_name']),kpis:select(d.kpis,['orders_count','completed_sessions_count','lifetime_value','average_ticket','years_attended']),natal_2026:select(d.natal_2026,['purchased','mode','loyalty_level','years_attended','recommended_action','active_order_uuid']),current_order:d.current_order?{...select(d.current_order,['uuid','package_name','session_at','created_at','balance_pending','participants_count','gallery_available']),status:select(d.current_order.status,['code','label','stage'])}:null,history:select(d.history,['page','per_page','total','has_more']),orders:(Array.isArray(d.orders)?d.orders:[]).slice(0,5).map(x=>({...select(x,['uuid','campaign_key','title','package_name','status','status_label','total_amount','balance_pending','session_date','created_at','payment_status']),participants_count:Array.isArray(x.participants)?x.participants.length:null}))};
}
export function proposalProjection(raw){
 const d=data(raw)||{};
 return {ready:d.ready===true,phone_status:d.phone_status??null,delivery_scope:d.delivery_scope??null,availability_message:d.availability_message??null,customer:select(d.customer,['status','label','first_name']),suggested_name:d.suggested_name??null,selection:select(d.selection,['variant','label','name_source']),summary:select(d.summary,['status','total_sessions_purchased','customer_since','last_purchase','package_display_name']),existing_proposal:select(d.existing_proposal,['status','scheduled_at']),message_preview:d.message_preview??null,scheduled:false};
}
function requireLookup(raw,withOrders=false){
 const d=data(raw);
 if(!d||!d.lookup||!['matched','not_found','ambiguous'].includes(d.lookup.status))throw Error('crm_contract_invalid');
 if(d.lookup.status==='matched'&&(!d.customer||typeof d.customer.uuid!=='string'||!d.customer.uuid))throw Error('crm_contract_invalid');
 if(withOrders&&d.lookup.status==='matched'&&(!Array.isArray(d.orders)||!d.kpis||!d.history))throw Error('crm_contract_invalid');
 return raw;
}
async function readJsonBounded(r){
 const contentLength=r.headers?.get?.('content-length');
 if(contentLength!==null&&contentLength!==undefined&&contentLength!==''&&Number(contentLength)>MAX_RESPONSE_BYTES)throw Error('crm_response_too_large');
 const contentType=r.headers?.get?.('content-type');
 if(contentType&&!/\bjson\b/i.test(contentType))throw Error('crm_invalid_content_type');
 let text;
 if(r.body&&typeof r.body.getReader==='function'){
   const reader=r.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true}),chunks=[];
   let size=0;
   try{
     while(true){
       const {done,value}=await reader.read();
       if(done)break;
       size+=value.byteLength;
       if(size>MAX_RESPONSE_BYTES){await reader.cancel();throw Error('crm_response_too_large')}
       chunks.push(decoder.decode(value,{stream:true}));
     }
     chunks.push(decoder.decode());
     text=chunks.join('');
   }finally{reader.releaseLock()}
 }else{
   text=await r.text();
   if(Buffer.byteLength(text,'utf8')>MAX_RESPONSE_BYTES)throw Error('crm_response_too_large');
 }
 try{return JSON.parse(text)}catch{throw Error('crm_invalid_json')}
}
export function crmClient({baseUrl,token='',privateEnabled=false,timeoutMs=7000,fetchFn=fetch}){
 const base=baseURL(baseUrl);
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000)throw Error('crm_timeout_invalid');
 if(privateEnabled&&!token)throw Error('crm_missing_token');
 async function request(path,{body,auth=false,method='GET',params={}}={}){
   if(auth&&!privateEnabled)throw Error('crm_private_disabled');
   if(!/^\/[a-z0-9/_-]+$/i.test(path))throw Error('crm_invalid_path');
   if(!['GET','POST'].includes(method)||(method==='POST'&&path!=='/api/v1/extension/proposals/preview'))throw Error('crm_method_forbidden');
   const u=new URL(base+path);
   for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
   try{
     const r=await fetchFn(u,{method,redirect:'error',signal:controller.signal,headers:{Accept:'application/json',...(auth?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
     if(r.redirected)throw Error('crm_redirect_forbidden');
     if(!r.ok)throw Error('crm_http_'+r.status);
     return await readJsonBounded(r);
   }finally{clearTimeout(timeout)}
 }
 return {
   status:async()=>select(await request('/health/live'),['status','ok','message']),
   campaign:async s=>{
     const r=await request('/api/public/v1/agenda/campaigns/'+slug(s)),d=data(r);
     if(!d||!Array.isArray(d.products))throw Error('crm_contract_invalid');
     return {campaign:select(d,['slug','name','period']),products:d.products.slice(0,12).map(x=>select(x,['slug','code','name','durationMinutes']))};
   },
   availability:async(c,p,a,b)=>{
     dates(a,b);
     const r=await request('/api/public/v1/agenda/campaigns/'+slug(c)+'/availability',{params:{package:slug(p),dateFrom:a,dateTo:b,perPage:14}}),d=data(r);
     if(!d||!Array.isArray(d.slotsByDate)||!d.campaign||!d.product)throw Error('crm_contract_invalid');
     return {campaign:select(d.campaign,['slug','name','timezone']),package:select(d.product,['slug','code','name','durationMinutes']),days:d.slotsByDate.slice(0,14).map(x=>({date:x.date,times:(Array.isArray(x.slots)?x.slots:[]).slice(0,30).map(y=>y.time)})),calendar:select(d.googleCalendar??r.meta?.googleCalendar,['checked','hasError']),pagination:select(d.pagination,['currentPage','totalDays','hasNextPage'])};
   },
   bootstrap:async()=>{
     const d=data(await request('/api/v1/extension/bootstrap',{auth:true}));
     if(!d||!d.operator||!d.server)throw Error('crm_contract_invalid');
     return {operator:select(d.operator,['id','name']),server:select(d.server,['timezone','api_version','minimum_extension_version']),features:{proposals:select(d.features?.proposals,['enabled']),natal_2026:select(d.features?.natal_2026,['enabled','reference_year'])},token:select(d.token,['abilities','expires_at'])};
   },
   customer:async s=>customerProjection(requireLookup(await request('/api/v1/extension/customer-context',{auth:true,params:{phone:phone(s)}}))),
   history:async(s,page=1)=>{
     if(!Number.isInteger(page)||page<1||page>100)throw Error('invalid_page');
     return historyProjection(requireLookup(await request('/api/v1/extension/customer-360',{auth:true,params:{phone:phone(s),page,per_page:5}}),true));
   },
   preview:async(s,name)=>{
     const n=proposalName(name);
     const r=await request('/api/v1/extension/proposals/preview',{auth:true,method:'POST',body:{phone:phone(s),...(n!==undefined?{name:n}:{})}});
     if(typeof data(r)?.ready!=='boolean')throw Error('crm_contract_invalid');
     return proposalProjection(r);
   }
 };
}
