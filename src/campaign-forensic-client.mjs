// Read-only client for CRM #469. Fixed endpoints only: never accept arbitrary URLs,
// SQL, provider hosts, webhook replays or write operations from MCP tool inputs.
import {baseURL} from './core.mjs';

const MAX_BYTES=768*1024;
const KINDS=new Set(['items','events','attempts','callbacks','decisions']);
const contractError=()=>Error('crm_campaign_audit_contract_invalid');

async function boundedJson(response){
 const length=response.headers?.get?.('content-length');
 if(length!==null&&length!==undefined&&length!==''&&Number(length)>MAX_BYTES)throw Error('crm_campaign_audit_response_too_large');
 const ct=response.headers?.get?.('content-type')||'';
 if(!/application\/(?:[\w.+-]*\+)?json\b/i.test(ct))throw Error('crm_campaign_audit_invalid_content_type');
 const stream=response.body?.getReader?.();
 let text='';
 if(stream){
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let bytes=0;
  try{
   while(true){
    const {done,value}=await stream.read();
    if(done)break;
    bytes+=value.byteLength;
    if(bytes>MAX_BYTES){await stream.cancel();throw Error('crm_campaign_audit_response_too_large')}
    text+=decoder.decode(value,{stream:true});
   }
   text+=decoder.decode();
  }finally{stream.releaseLock()}
 }else{
  text=await response.text();
  if(Buffer.byteLength(text,'utf8')>MAX_BYTES)throw Error('crm_campaign_audit_response_too_large');
 }
 try{return JSON.parse(text)}catch{throw Error('crm_campaign_audit_invalid_json')}
}

export function createCampaignForensicClient({baseUrl,token,fetchFn=fetch,timeoutMs=7000}={}){
 const root=baseURL(baseUrl);
 if(typeof token!=='string'||token.length<1)throw Error('crm_campaign_audit_missing_token');
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000)throw Error('crm_campaign_audit_invalid_timeout');
 async function get(path,params={}){
  // Fixed prefixes and validated path parameters; no arbitrary URL or redirect.
  if(!/^\/api\/v1\/extension\/campaign-audit\/activities\/[1-9][0-9]*(?:\/evidence)?$/.test(path))
   throw Error('crm_campaign_audit_invalid_path');
  const url=new URL(root+path);
  for(const [key,value] of Object.entries(params)){
   if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));
  }
  const ctrl=new AbortController();
  const timeout=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
   let response;
   try{
    response=await fetchFn(url,{method:'GET',redirect:'error',signal:ctrl.signal,
     headers:{Accept:'application/json',Authorization:'Bearer '+token}});
   }catch(e){
    if(ctrl.signal.aborted||e?.name==='AbortError')throw Error('crm_campaign_audit_timeout');
    throw Error('crm_campaign_audit_transport_unavailable');
   }
   if(response.redirected)throw Error('crm_campaign_audit_redirect_forbidden');
   if(response.status===401||response.status===403)throw Error('crm_campaign_audit_forbidden');
   if(response.status===404)throw Error('crm_campaign_audit_not_found');
   if(response.status===429)throw Error('crm_campaign_audit_rate_limited');
   if(response.status===503)throw Error('crm_campaign_audit_disabled_or_unavailable');
   if(!response.ok)throw Error('crm_campaign_audit_http_'+response.status);
   const json=await boundedJson(response);
   if(json?.schema_version!=='1.0'||!json.data||
      json.data.contract_version!=='campaign-audit.v1'||
      typeof json.data.contact_id!=='number'||
      !Number.isSafeInteger(json.data.contact_id)||
      typeof json.generated_at!=='string'||!Number.isFinite(Date.parse(json.generated_at)))
    throw contractError();
   return json.data;
  }finally{clearTimeout(timeout)}
 }

 function id(n){
  if(!Number.isSafeInteger(n)||n<1)throw Error('crm_campaign_audit_invalid_contact_id');
  return n;
 }
 async function activity(contactId){
  const n=id(contactId),r=await get('/api/v1/extension/campaign-audit/activities/'+n);
  if(r.contact_id!==n||!r.plan||!r.progress||!r.coverage||!Array.isArray(r.channels))
   throw contractError();
  return r;
 }
 async function evidence(contactId,{kind,limit=50,cursor,channel}={}){
  const n=id(contactId);
  if(!KINDS.has(kind)||(channel!==undefined&&!['whatsapp','sms','email','voice'].includes(channel))
   ||(channel!==undefined&&kind==='decisions')||!Number.isInteger(limit)||limit<1||limit>100
   ||(cursor!==undefined&&(!/^[1-9]\d*$/.test(String(cursor))||!Number.isSafeInteger(Number(cursor)))))
   throw Error('crm_campaign_audit_invalid_filters');
  const r=await get('/api/v1/extension/campaign-audit/activities/'+n+'/evidence',
   {kind,limit,cursor,channel});
  if(r.contact_id!==n||r.kind!==kind||(r.channel??null)!==(channel??null)||!Array.isArray(r.rows)||
    typeof r.has_more!=='boolean'||(r.has_more&&(!r.next_cursor||!/^[1-9]\d*$/.test(r.next_cursor))))
   throw contractError();
  if(r.rows.length>limit)throw contractError();
  return r;
 }
 return {activity,evidence};
}
