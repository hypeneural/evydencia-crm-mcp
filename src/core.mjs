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
export function phone(s){const d=String(s??'').replace(/\D/g,'');if(!/^(?:55)?[1-9][0-9]9[0-9]{8}$/.test(d))throw Error('invalid_mobile');return d}
export function day(s){if(typeof s!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)||isNaN(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw Error('invalid_date');return s}
export function dates(a,b){day(a);day(b);const days=(Date.parse(b)-Date.parse(a))/86400000;if(days<0||days>=14)throw Error('invalid_date_range');return [a,b]}
export function customerProjection(raw){
  const d=data(raw)||{};
  if(d.lookup?.status!=='matched')return {lookup:select(d.lookup,['status','match_count']),customer:null,orders:[]};
  return {lookup:select(d.lookup,['status','match_count']),customer:select(d.customer,['uuid','display_name','first_name','customer_since','lifecycle_stage']),current_order:select(d.current_order,['uuid','package_name','session_at','created_at','balance_pending']),natal_2026:select(d.natal_2026,['purchased']),history:select(d.history,['orders_count','completed_sessions_count','lifetime_value','years_attended'])};
}
export function historyProjection(raw){
 const d=data(raw)||{};
 if(d.lookup?.status!=='matched')return {lookup:select(d.lookup,['status','match_count']),orders:[]};
 return {customer:select(d.customer,['uuid','display_name','first_name']),kpis:select(d.kpis,['orders_count','completed_sessions_count','lifetime_value']),history:select(d.history,['page','per_page','total','has_more']),orders:(d.orders||[]).slice(0,5).map(x=>({...select(x,['uuid','package_name','status_label','total_amount','balance_pending','session_date','payment_status']),participants_count:x.participants?.length??null}))};
}
export function proposalProjection(raw){const d=data(raw)||{};return {ready:d.ready===true,delivery_scope:d.delivery_scope??null,availability_message:d.availability_message??null,customer:select(d.customer,['status','label','first_name']),suggested_name:d.suggested_name??null,selection:select(d.selection,['variant','label']),existing_proposal:select(d.existing_proposal,['status','scheduled_at']),message_preview:d.message_preview??null};}
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
   availability:async(c,p,a,b)=>{dates(a,b);const r=await request('/api/public/v1/agenda/campaigns/'+slug(c)+'/availability',{params:{package:slug(p),dateFrom:a,dateTo:b,perPage:14}});const d=data(r)||{};return {campaign:select(d.campaign,['slug','name']),package:select(d.product,['slug','name']),days:(d.slotsByDate||[]).slice(0,14).map(x=>({date:x.date,times:(x.slots||[]).slice(0,30).map(y=>y.time)}))}},
   bootstrap:async()=>select(data(await request('/api/v1/extension/bootstrap',{auth:true})),['operator','server']),
   customer:async s=>customerProjection(await request('/api/v1/extension/customer-context',{auth:true,params:{phone:phone(s)}})),
   history:async(s,page=1)=>{if(!Number.isInteger(page)||page<1||page>100)throw Error('invalid_page');return historyProjection(await request('/api/v1/extension/customer-360',{auth:true,params:{phone:phone(s),page,per_page:5}}))},
   preview:async(s,name)=>proposalProjection(await request('/api/v1/extension/proposals/preview',{auth:true,method:'POST',body:{phone:phone(s),...(name?{name}: {})}}))
 }
}
