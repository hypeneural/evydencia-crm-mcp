// Dedicated read-only Z-API instance diagnostics & connection history adapter (LIVE gateway only).
// Queries fixed https://api.z-api.io endpoints (/status, /device, /me) using operator-bound private
// secrets and projects strictly allowlisted, sanitized fields (never raw /me, never tokens/proxy/URLs with secrets).
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {chmodSync,existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {deriveKeys,operatorTagger} from './oauth-gateway.mjs';
import {maskDispatchId} from './zapi-mcp-tools.mjs';

export const ZAPI_DIAG_TOOL_NAME='zapi_instancia_diagnostico';
export const ZAPI_HIST_TOOL_NAME='zapi_instancia_historico';
export const ZAPI_INSTANCE_TOOL_NAMES=Object.freeze([ZAPI_DIAG_TOOL_NAME,ZAPI_HIST_TOOL_NAME]);

const TZ='America/Sao_Paulo';
const MAX_RESPONSE_BYTES=262144;
const CACHE_TTL_MS=10000;
const ALLOWED_ENDPOINTS=new Set(['status','device','me']);
const INSTANCE_ALIAS_RE=/^[a-zA-Z0-9_-]{1,40}$/;

const KNOWN_ME_KEYS=new Set([
 'id','name','connected','due','paymentStatus','created','token','proxyUrl','useProxy',
 'receiveCallbackSentByMe','callRejectAuto','callRejectMessage','autoReadMessage','announcementGuard',
 'connectedCallbackUrl','disconnectedCallbackUrl','receivedCallbackUrl','deliveryCallbackUrl',
 'messageStatusCallbackUrl','receivedAndDeliveryCallbackUrl','presenceChatCallbackUrl','receivedStatusCallbackUrl'
]);

const SECRET_ME_KEYS=new Set(['token','proxyUrl','proxy','clientToken','password','secret']);

function formatBrtIso(ms){
 const d=new Date(ms);
 const parts=new Intl.DateTimeFormat('en-CA',{
  timeZone:TZ,
  year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',
  hour12:false,
  timeZoneName:'longOffset'
 }).formatToParts(d);
 const m={};
 for(const p of parts)m[p.type]=p.value;
 const hour=m.hour==='24'?'00':m.hour;
 let offset='-03:00';
 if(typeof m.timeZoneName==='string'){
  const om=m.timeZoneName.match(/GMT([+-]\d{2}:\d{2})/);
  if(om)offset=om[1];
  else if(m.timeZoneName==='GMT')offset='+00:00';
 }
 return `${m.year}-${m.month}-${m.day}T${hour}:${m.minute}:${m.second}${offset}`;
}

export function parseVerifiedZapiTimestamp(raw,origin){
 if(raw===null||raw===undefined||raw===''){
  return {present:false,valid:false,iso_brt:null,iso_utc:null,timezone:TZ,raw_format:null,origin};
 }
 let ms=NaN,rawFormat=null;
 if(typeof raw==='number'||(typeof raw==='string'&&/^-?\d+(\.\d+)?$/.test(raw.trim()))){
  const n=Number(raw);
  if(!Number.isFinite(n)||n<=0){
   return {present:true,valid:false,iso_brt:null,iso_utc:null,timezone:TZ,raw_format:'invalid_numeric',origin};
  }
  if(n>=100_000_000_000&&n<100_000_000_000_000){
   ms=Math.trunc(n);rawFormat='unix_ms';
  }else if(n>=1_000_000_000&&n<100_000_000_000){
   ms=Math.trunc(n*1000);rawFormat='unix_s';
  }else{
   return {present:true,valid:false,iso_brt:null,iso_utc:null,timezone:TZ,raw_format:'numeric_out_of_range',origin};
  }
 }else if(typeof raw==='string'){
  const s=raw.trim();
  if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)){
   return {present:true,valid:false,iso_brt:null,iso_utc:null,timezone:TZ,raw_format:'invalid_string',origin};
  }
  const normalized=/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)?s.replace(' ','T'):s.replace(' ','T')+'Z';
  ms=Date.parse(normalized);
  rawFormat='iso8601';
 }else{
  return {present:true,valid:false,iso_brt:null,iso_utc:null,timezone:TZ,raw_format:'unsupported_type',origin};
 }
 if(!Number.isFinite(ms)){
  return {present:true,valid:false,iso_brt:null,iso_utc:null,timezone:TZ,raw_format:rawFormat||'invalid',origin};
 }
 const year=new Date(ms).getUTCFullYear();
 if(year<2000||year>2100){
  return {present:true,valid:false,iso_brt:null,iso_utc:null,timezone:TZ,raw_format:'year_out_of_range',origin};
 }
 return {
  present:true,
  valid:true,
  iso_brt:formatBrtIso(ms),
  iso_utc:new Date(ms).toISOString(),
  timezone:TZ,
  raw_format:rawFormat,
  origin
 };
}

function scrubSecrets(text,entry){
 if(typeof text!=='string'||!text)return null;
 let s=text.slice(0,300);
 for(const sec of [entry?.token,entry?.clientToken,entry?.instanceId]){
  if(typeof sec==='string'&&sec.length>=4){
   s=s.split(sec).join('[REDACTED]');
  }
 }
 s=s.replace(/\/instances\/[^/\s]+\/token\/[^/\s]+/gi,'/instances/[REDACTED]/token/[REDACTED]');
 s=s.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [REDACTED]');
 return s.trim()||null;
}

function sanitizeProfileImageUrl(rawUrl,entry){
 if(typeof rawUrl!=='string'||!rawUrl.trim())return null;
 let u;
 try{u=new URL(rawUrl.trim())}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.hash)return null;
 const href=u.toString();
 if(entry?.token&&href.includes(entry.token))return null;
 if(entry?.clientToken&&href.includes(entry.clientToken))return null;
 const host=u.hostname.toLowerCase();
 if(host==='pps.whatsapp.net'||host.endsWith('.whatsapp.net')||host.endsWith('.z-api.io')){
  return href.length<=1024?href:null;
 }
 // Any other HTTPS image CDN: strip query parameters to avoid leaking signed secrets.
 u.search='';
 const clean=u.toString();
 return clean.length<=512?clean:null;
}

function projectWebhookUrl(rawUrl){
 if(rawUrl===null||rawUrl===undefined)return {status:'not_configured',configured:false,https:null,target_host:null};
 if(typeof rawUrl!=='string')return {status:'invalid_url',configured:false,https:null,target_host:null};
 const trimmed=rawUrl.trim();
 if(!trimmed)return {status:'not_configured',configured:false,https:null,target_host:null};
 let u;
 try{u=new URL(trimmed)}catch{return {status:'invalid_url',configured:false,https:null,target_host:null}}
 if((u.protocol!=='https:'&&u.protocol!=='http:')||!u.hostname){
  return {status:'invalid_url',configured:false,https:null,target_host:null};
 }
 return {
  status:'configured',
  configured:true,
  https:u.protocol==='https:',
  target_host:u.hostname.toLowerCase()
 };
}

function normalizePhoneDigits(rawPhone){
 if(typeof rawPhone!=='string'&&typeof rawPhone!=='number')return null;
 const digits=String(rawPhone).replace(/\D+/g,'');
 return digits.length>=8&&digits.length<=15?digits:null;
}

function maskPhoneDigits(digits){
 if(typeof digits!=='string'||digits.length<6)return null;
 return `${digits.slice(0,4)}*****${digits.slice(-2)}`;
}

function createObservationStore(filePath,masterKey,{now=()=>Date.now()}={}){
 if(!filePath){
  const mem=new Map();
  return {
   get:(op,instHash)=>mem.get(`${op}:${instHash}`)||[],
   record:(op,instHash,obs)=>{
    const k=`${op}:${instHash}`;
    const list=mem.get(k)||[];
    const last=list[0];
    if(last&&last.connected===obs.connected&&last.smartphone_connected===obs.smartphone_connected)return false;
    const transition=!last?'initial_observation':(last.connected!==obs.connected?(obs.connected?'observed_connected':'observed_disconnected'):'observed_smartphone_changed');
    const next=[{...obs,transition},...list].slice(0,50);
    mem.set(k,next);
    return true;
   }
  };
 }
 const {zapiDiagObs}=deriveKeys(masterKey);
 const enc=(aad,obj)=>{
  const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',zapiDiagObs,iv);
  c.setAAD(Buffer.from(aad,'utf8'));
  const ct=Buffer.concat([c.update(JSON.stringify(obj),'utf8'),c.final()]);
  return Buffer.concat([iv,ct,c.getAuthTag()]).toString('base64url');
 };
 const dec=(aad,tok)=>{
  if(typeof tok!=='string'||tok.length<29)return null;
  try{
   const raw=Buffer.from(tok,'base64url');if(raw.length<29)return null;
   const d=createDecipheriv('aes-256-gcm',zapiDiagObs,raw.subarray(0,12));
   d.setAAD(Buffer.from(aad,'utf8'));
   d.setAuthTag(raw.subarray(raw.length-16));
   return JSON.parse(Buffer.concat([d.update(raw.subarray(12,raw.length-16)),d.final()]).toString('utf8'));
  }catch{return null}
 };
 const loadAll=()=>{
  if(!existsSync(filePath))return {};
  try{
   const outer=JSON.parse(readFileSync(filePath,'utf8'));
   const inner=dec('zapi-diag-obs-file-v1',outer?.envelope);
   return inner&&typeof inner.items==='object'&&inner.items?inner.items:{};
  }catch{return {}}
 };
 const saveAll=items=>{
  const dir=dirname(filePath);
  if(!existsSync(dir))mkdirSync(dir,{recursive:true,mode:0o700});
  const tmp=`${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const payload=JSON.stringify({v:1,updated_at:Math.floor(now()/1000),envelope:enc('zapi-diag-obs-file-v1',{items})});
  writeFileSync(tmp,payload,{encoding:'utf8',mode:0o600});
  try{chmodSync(tmp,0o600)}catch{}
  renameSync(tmp,filePath);
  try{chmodSync(filePath,0o600)}catch{}
 };
 return {
  get(op,instHash){
   const items=loadAll();
   const aad=`zapi-diag-obs-v1:${op}:${instHash}`;
   const arr=dec(aad,items[`${op}:${instHash}`]);
   return Array.isArray(arr)?arr:[];
  },
  record(op,instHash,obs){
   const items=loadAll();
   const key=`${op}:${instHash}`;
   const aad=`zapi-diag-obs-v1:${op}:${instHash}`;
   const list=dec(aad,items[key]);
   const arr=Array.isArray(list)?list:[];
   const last=arr[0];
   if(last&&last.connected===obs.connected&&last.smartphone_connected===obs.smartphone_connected)return false;
   const transition=!last?'initial_observation':(last.connected!==obs.connected?(obs.connected?'observed_connected':'observed_disconnected'):'observed_smartphone_changed');
   const next=[{...obs,transition},...arr].slice(0,50);
   items[key]=enc(aad,next);
   try{saveAll(items)}catch{}
   return true;
  }
 };
}

export function createZapiInstanceDiagnostics(cfg,{
 fetchFn=fetch,
 now=()=>Date.now(),
 log=()=>{},
 getMcpOauthState=null
}={}){
 const tag=operatorTagger(cfg.key);
 const cache=new Map();
 const obsStore=createObservationStore(cfg.zapiDiagObsPath,cfg.key,{now});
 const instances=Array.isArray(cfg.zapiDiagInstances)?cfg.zapiDiagInstances:(cfg.zapiRestStatus?[cfg.zapiRestStatus]:[]);

 function listForOperator(operatorId){
  const op=String(operatorId||'');
  return instances.filter(i=>i.operatorId===op);
 }

 function resolveInstance(operatorId,rawSelector){
  const opList=listForOperator(operatorId);
  if(opList.length===0){
   return {status:'NOT_CONFIGURED',entry:null,availableAliases:[]};
  }
  const availableAliases=opList.map(i=>i.alias);
  if(rawSelector===undefined||rawSelector===null||rawSelector===''){
   return {status:'OK',entry:opList[0],availableAliases};
  }
  const trimmed=String(rawSelector).trim();
  const normalized=trimmed.startsWith('#')?trimmed.slice(1):trimmed;
  if(!INSTANCE_ALIAS_RE.test(normalized)||/https?:\/\/|[/:?&@.\\]/i.test(trimmed)){
   throw Error('invalid_zapi_instance_selector');
  }
  const hit=opList.find(i=>i.alias.toLowerCase()===normalized.toLowerCase()||(i.label&&i.label.replace(/^#/,'').toLowerCase()===normalized.toLowerCase()));
  if(!hit){
   throw Error('zapi_instance_not_authorized');
  }
  return {status:'OK',entry:hit,availableAliases};
 }

 async function fetchEndpoint(entry,endpoint,{forceRefresh=false,signal}={}){
  if(!ALLOWED_ENDPOINTS.has(endpoint))throw Error('zapi_endpoint_not_allowlisted');
  const expectedLocal=cfg.insecureLocal&&(entry.baseUrl.startsWith('http://127.0.0.1')||entry.baseUrl.startsWith('http://localhost'));
  if(entry.baseUrl!=='https://api.z-api.io'&&!expectedLocal){
   throw Error('zapi_host_not_allowlisted');
  }
  const cacheKey=`${entry.operatorId}:${entry.alias}:${endpoint}`;
  if(!forceRefresh){
   const hit=cache.get(cacheKey);
   if(hit&&hit.until>now())return {...hit.result,fromCache:true};
  }

  const url=`${entry.baseUrl}/instances/${encodeURIComponent(entry.instanceId)}/token/${encodeURIComponent(entry.token)}/${endpoint}`;
  const ac=new AbortController();
  const timeoutMs=cfg.zapiDiagTimeoutMs||8000;
  const timer=setTimeout(()=>ac.abort(new Error('zapi_rest_timeout')),timeoutMs);
  const combinedSignal=signal?AbortSignal.any([signal,ac.signal]):ac.signal;

  try{
   const res=await fetchFn(url,{
    method:'GET',
    redirect:'manual',
    signal:combinedSignal,
    headers:{
     Accept:'application/json',
     'Client-Token':entry.clientToken
    }
   });
   if(res.redirected||(res.status>=300&&res.status<400)){
    return {ok:false,endpoint,httpStatus:res.status,errorCode:'redirect_blocked'};
   }
   if(res.status===401||res.status===403){
    return {ok:false,endpoint,httpStatus:res.status,errorCode:'unauthorized'};
   }
   if(res.status===429){
    return {ok:false,endpoint,httpStatus:429,errorCode:'rate_limited'};
   }
   if(!res.ok){
    return {ok:false,endpoint,httpStatus:res.status,errorCode:`http_${res.status}`};
   }

   let rawText='';
   if(res.body&&typeof res.body.getReader==='function'){
    const reader=res.body.getReader();
    const dec=new TextDecoder();
    let total=0;
    while(true){
     const {done,value}=await reader.read();
     if(done)break;
     total+=value.byteLength;
     if(total>MAX_RESPONSE_BYTES){
      try{await reader.cancel()}catch{}
      return {ok:false,endpoint,httpStatus:res.status,errorCode:'oversize_response'};
     }
     rawText+=dec.decode(value,{stream:true});
    }
    rawText+=dec.decode();
   }else{
    rawText=await res.text();
    if(Buffer.byteLength(rawText,'utf8')>MAX_RESPONSE_BYTES){
     return {ok:false,endpoint,httpStatus:res.status,errorCode:'oversize_response'};
    }
   }

   let parsed;
   try{parsed=JSON.parse(rawText)}catch{
    return {ok:false,endpoint,httpStatus:res.status,errorCode:'invalid_json'};
   }
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){
    return {ok:false,endpoint,httpStatus:res.status,errorCode:'invalid_contract'};
   }

   const okResult={ok:true,endpoint,httpStatus:res.status,data:parsed,fromCache:false};
   if(cache.size>=200)cache.delete(cache.keys().next().value);
   cache.set(cacheKey,{result:okResult,until:now()+CACHE_TTL_MS});
   return okResult;
  }catch(e){
   const isTimeout=ac.signal.aborted||e?.message==='zapi_rest_timeout'||e?.name==='TimeoutError';
   return {ok:false,endpoint,httpStatus:null,errorCode:isTimeout?'timeout':'network_error'};
  }finally{
   clearTimeout(timer);
  }
 }

 function recordObservedStatus(entry,connected,smartphoneConnected,checkedMs){
  const instHash=createHash('sha256').update(entry.instanceId).digest('base64url').slice(0,16);
  obsStore.record(entry.operatorId,instHash,{
   event_source:'gateway_poll_observation',
   state:connected?'connected':'disconnected',
   connected,
   smartphone_connected:smartphoneConnected,
   poll_detected_at_brt:formatBrtIso(checkedMs),
   poll_detected_at_utc:new Date(checkedMs).toISOString(),
   timestamp_origin:'gateway_poll_detected_at',
   instance_id_masked:maskDispatchId(entry.instanceId)
  });
 }

 async function checkQuickStatus(operatorId,{instancia,forceRefresh=false,signal}={}){
  const resolved=resolveInstance(operatorId,instancia);
  if(resolved.status==='NOT_CONFIGURED'){
   return null;
  }
  const {entry}=resolved;
  const masked=maskDispatchId(entry.instanceId);
  const res=await fetchEndpoint(entry,'status',{forceRefresh,signal});
  if(!res.ok){
   return {
    verifiable:true,
    source:'zapi_rest_status_adapter',
    status:'unavailable',
    ...(res.httpStatus?{http_status:res.httpStatus}:{}),
    error_code:res.errorCode,
    instance_alias:entry.alias,
    instance_id_masked:masked,
    detail:res.errorCode==='unauthorized'
     ?'Credenciais REST de diagnóstico rejeitadas pela Z-API (HTTP 401/403).'
     :'Adaptador REST de status indisponível no momento; estado classificado como desconhecido.'
   };
  }
  const connected=res.data.connected===true;
  const smartphoneConnected=typeof res.data.smartphoneConnected==='boolean'?res.data.smartphoneConnected:null;
  recordObservedStatus(entry,connected,smartphoneConnected,now());
  return {
   verifiable:true,
   source:'zapi_rest_status_adapter',
   status:connected?'connected':'disconnected',
   connected,
   smartphoneConnected,
   instance_alias:entry.alias,
   instance_id_masked:masked,
   detail:connected
    ?(smartphoneConnected===false
     ?'Sessão conectada na Z-API, porém smartphoneConnected=false (aparelho principal sem conexão ativa).'
     :'Instância WhatsApp conectada na Z-API.')
    :'Instância WhatsApp desconectada (verifique QR Code no painel Z-API).'
  };
 }

 async function diagnose(operatorId,{
  instancia,
  nivel_detalhe='resumo',
  escopo='completo',
  atualizar=false,
  signal
 }={}){
  const t0=performance.now();
  const checkedMs=now();
  const checkedBrt=formatBrtIso(checkedMs);
  const detailLevel=nivel_detalhe==='completo'?'completo':'resumo';
  const scope=['status_rapido','perfil_dispositivo','assinatura_configuracoes','completo'].includes(escopo)?escopo:'completo';
  const mcpState=typeof getMcpOauthState==='function'?getMcpOauthState(String(operatorId||'')):null;

  const resolved=resolveInstance(operatorId,instancia);
  if(resolved.status==='NOT_CONFIGURED'){
   return {
    source:'ZAPI_REST_NOT_CONFIGURED',
    configured:false,
    checked_at:checkedBrt,
    checked_at_utc:new Date(checkedMs).toISOString(),
    timezone:TZ,
    detail_level:detailLevel,
    scope,
    instance:null,
    webhooks:null,
    diagnostics:{
     status:'NOT_CONFIGURED',
     api_reachable:null,
     credentials_valid:null,
     status_source:null,
     device_source:null,
     settings_source:null,
     partial_failure:false
    },
    ...(mcpState?{mcp_oauth:{oauth_status:mcpState.oauth_status,discovered_tools_count:mcpState.discovered_tools_count??0}}:{}),
    warnings:[{
     code:'ZAPI_REST_DIAGNOSTICS_NOT_CONFIGURED',
     message:'Credenciais REST de diagnóstico Z-API não estão provisionadas para este operador no ambiente privado do gateway.'
    }]
   };
  }

  const {entry,availableAliases}=resolved;
  const maskedId=maskDispatchId(entry.instanceId);
  const needDevice=scope==='completo'||scope==='perfil_dispositivo';
  const needMe=scope==='completo'||scope==='assinatura_configuracoes';

  const tasks=[
   fetchEndpoint(entry,'status',{forceRefresh:Boolean(atualizar),signal}),
   needDevice?fetchEndpoint(entry,'device',{forceRefresh:Boolean(atualizar),signal}):Promise.resolve(null),
   needMe?fetchEndpoint(entry,'me',{forceRefresh:Boolean(atualizar),signal}):Promise.resolve(null)
  ];
  const [statusRes,deviceRes,meRes]=await Promise.all(tasks);

  const warnings=[];
  const called=[statusRes,deviceRes,meRes].filter(Boolean);
  const anyOk=called.some(r=>r.ok);
  const anyUnauth=called.some(r=>!r.ok&&r.errorCode==='unauthorized');
  const partialFailure=anyOk&&called.some(r=>!r.ok);

  let connectionState='unknown';
  let connected=null;
  let smartphoneConnected=null;
  let statusError=null;
  let providerStatusNote=null;
  let statusCheckedProviderAt=null;

  if(statusRes.ok){
   connected=statusRes.data.connected===true;
   connectionState=connected?'connected':'disconnected';
   smartphoneConnected=typeof statusRes.data.smartphoneConnected==='boolean'?statusRes.data.smartphoneConnected:null;
   recordObservedStatus(entry,connected,smartphoneConnected,checkedMs);

   const rawErr=typeof statusRes.data.error==='string'?statusRes.data.error.trim():'';
   if(rawErr){
    if(connected&&/^you are already connected\.?$/i.test(rawErr)){
     providerStatusNote='You are already connected.';
    }else{
     statusError=scrubSecrets(rawErr,entry);
    }
   }
   if(statusRes.data.created!==undefined&&statusRes.data.created!==null){
    const stTs=parseVerifiedZapiTimestamp(statusRes.data.created,'status.created');
    if(stTs.valid)statusCheckedProviderAt=stTs.iso_brt;
   }
   if(connected&&smartphoneConnected===false){
    warnings.push({
     code:'SMARTPHONE_DISCONNECTED',
     message:'A instância consta conectada na Z-API (/status.connected=true), porém smartphoneConnected=false no aparelho principal.'
    });
   }
  }else{
   warnings.push({
    code:'STATUS_UNAVAILABLE_CONNECTION_UNKNOWN',
    message:`Endpoint /status indisponível (${statusRes.errorCode}); a conexão foi classificada como unknown (desconhecida), nunca como desconectada.`
   });
  }

  // Project /device safely without object spread.
  let confirmedPhone=null,confirmedPhoneE164=null,profileName=null,profileImageUrl=null,about=null;
  let isBusiness=null,deviceModel=null,sessionName=null,originalDevice=null,sessionId=null;
  let lastKnownProfile=null;

  if(deviceRes){
   if(deviceRes.ok){
    const d=deviceRes.data;
    const rawDigits=normalizePhoneDigits(d.phone);
    const rawName=typeof d.name==='string'&&d.name.trim()?d.name.trim().slice(0,120):null;
    const rawImg=sanitizeProfileImageUrl(d.imgUrl,entry);
    const rawAbout=typeof d.about==='string'&&d.about.trim()?d.about.trim().slice(0,300):null;
    isBusiness=typeof d.isBusiness==='boolean'?d.isBusiness:null;
    deviceModel=typeof d.device?.device_model==='string'&&d.device.device_model.trim()?d.device.device_model.trim().slice(0,80):null;
    sessionName=typeof d.device?.sessionName==='string'&&d.device.sessionName.trim()?d.device.sessionName.trim().slice(0,80):null;
    originalDevice=typeof d.originalDevice==='string'&&d.originalDevice.trim()?d.originalDevice.trim().slice(0,40):null;
    sessionId=Number.isInteger(d.sessionId)?d.sessionId:null;

    if(connected===true){
     confirmedPhone=rawDigits;
     confirmedPhoneE164=rawDigits?`+${rawDigits}`:null;
     profileName=rawName;
     profileImageUrl=rawImg;
     about=rawAbout;
    }else if(rawDigits||rawName||rawImg){
     lastKnownProfile={
      phone:rawDigits,
      phone_masked:maskPhoneDigits(rawDigits),
      profile_name:rawName,
      profile_image_url:rawImg,
      about:rawAbout,
      attribution:'last_known_profile_unconfirmed_while_not_connected'
     };
     warnings.push({
      code:'DEVICE_PROFILE_UNCONFIRMED_NOT_CONNECTED',
      message:'A conexão não está confirmada como ativa em /status; os dados retornados por /device foram movidos para last_known_profile e não devem ser tratados como número conectado no momento.'
     });
    }
   }else{
    warnings.push({
     code:'DEVICE_ENDPOINT_FAILED',
     message:`Falha parcial ao consultar /device (${deviceRes.errorCode}); o estado de /status foi preservado.`
    });
   }
  }

  // Project /me safely with strict field allowlist (NEVER expose token, proxyUrl, or full webhook URLs).
  let instanceName=entry.label||null;
  let meConnected=null,paymentStatus=null,createdAt=null,dueAt=null,timestampsMeta=null;
  let webhooks=null,webhookTargets=null,settings=null,unknownMeFieldsIgnoredCount=0;

  if(meRes){
   if(meRes.ok){
    const m=meRes.data;
    for(const k of Object.keys(m)){
     if(SECRET_ME_KEYS.has(k))continue;
     if(!KNOWN_ME_KEYS.has(k))unknownMeFieldsIgnoredCount++;
    }
    if(typeof m.name==='string'&&m.name.trim())instanceName=m.name.trim().slice(0,80);
    if(typeof m.connected==='boolean')meConnected=m.connected;
    if(typeof m.paymentStatus==='string'&&m.paymentStatus.trim())paymentStatus=m.paymentStatus.trim().slice(0,40);

    const createdParsed=parseVerifiedZapiTimestamp(m.created,'me.created');
    if(createdParsed.present&&!createdParsed.valid){
     warnings.push({code:'INVALID_ME_CREATED_TIMESTAMP',message:'Campo /me.created possui formato de data inválido e foi omitido como null.'});
    }
    createdAt=createdParsed.valid?createdParsed.iso_brt:null;

    const dueParsed=parseVerifiedZapiTimestamp(m.due,'me.due');
    if(dueParsed.present&&!dueParsed.valid){
     warnings.push({code:'INVALID_ME_DUE_TIMESTAMP',message:'Campo /me.due possui formato de timestamp inválido e foi omitido como null.'});
    }
    dueAt=dueParsed.valid?dueParsed.iso_brt:null;

    timestampsMeta={
     ...(createdParsed.valid?{created_at:{iso_brt:createdParsed.iso_brt,iso_utc:createdParsed.iso_utc,timezone:TZ,raw_format:createdParsed.raw_format,origin:'me.created'}}:{}),
     ...(dueParsed.valid?{due_at:{iso_brt:dueParsed.iso_brt,iso_utc:dueParsed.iso_utc,timezone:TZ,raw_format:dueParsed.raw_format,origin:'me.due'}}:{})
    };

    if(statusRes.ok&&meConnected!==null&&connected!==meConnected){
     warnings.push({
      code:'STATUS_VS_ME_CONNECTED_MISMATCH',
      message:`Divergência detectada entre /status.connected (${connected}) e /me.connected (${meConnected}); prevalece /status.connected como referência primária.`
     });
    }

    const whMap={
     connected:projectWebhookUrl(m.connectedCallbackUrl),
     disconnected:projectWebhookUrl(m.disconnectedCallbackUrl),
     received:projectWebhookUrl(m.receivedCallbackUrl),
     delivery:projectWebhookUrl(m.deliveryCallbackUrl),
     message_status:projectWebhookUrl(m.messageStatusCallbackUrl),
     received_and_delivery:projectWebhookUrl(m.receivedAndDeliveryCallbackUrl),
     presence_chat:projectWebhookUrl(m.presenceChatCallbackUrl),
     received_status:projectWebhookUrl(m.receivedStatusCallbackUrl)
    };
    webhooks={
     connected:whMap.connected.status,
     disconnected:whMap.disconnected.status,
     received:whMap.received.status,
     delivery:whMap.delivery.status,
     message_status:whMap.message_status.status,
     received_and_delivery:whMap.received_and_delivery.status,
     presence_chat:whMap.presence_chat.status,
     received_status:whMap.received_status.status,
     sent_by_me_enabled:typeof m.receiveCallbackSentByMe==='boolean'?m.receiveCallbackSentByMe:null
    };
    if(detailLevel==='completo'||scope==='assinatura_configuracoes'){
     webhookTargets=whMap;
     settings={
      call_reject_auto:typeof m.callRejectAuto==='boolean'?m.callRejectAuto:null,
      call_reject_message:typeof m.callRejectMessage==='string'&&m.callRejectMessage.trim()?scrubSecrets(m.callRejectMessage,entry):null,
      auto_read_message:typeof m.autoReadMessage==='boolean'?m.autoReadMessage:null,
      announcement_guard:typeof m.announcementGuard==='boolean'?m.announcementGuard:null,
      receive_callback_sent_by_me:typeof m.receiveCallbackSentByMe==='boolean'?m.receiveCallbackSentByMe:null,
      use_proxy:typeof m.useProxy==='boolean'?m.useProxy:null
     };
    }
   }else{
    warnings.push({
     code:'ME_ENDPOINT_FAILED',
     message:`Falha parcial ao consultar /me (${meRes.errorCode}); o estado de /status foi preservado.`
    });
   }
  }

  const subBlocked=paymentStatus?['UNPAID','EXPIRED','BLOCKED','CANCELED','CANCELLED'].includes(paymentStatus.toUpperCase()):false;
  if(subBlocked){
   warnings.push({
    code:'PAYMENT_STATUS_ATTENTION',
    message:`A assinatura da instância reporta paymentStatus="${paymentStatus}".`
   });
  }

  const mcpAuthorized=mcpState?mcpState.oauth_status==='authorized':null;
  const readyForSubmission=connected===true&&!subBlocked&&(mcpAuthorized===null?true:mcpAuthorized);

  const ms=Math.round(performance.now()-t0);
  log({
   evt:'zapi_diag',
   op:tag(operatorId),
   alias:entry.alias,
   scope,
   detail_level:detailLevel,
   conn:connectionState,
   partial:partialFailure,
   ms
  });

  return {
   source:'ZAPI_REST_LIVE',
   configured:true,
   checked_at:checkedBrt,
   checked_at_utc:new Date(checkedMs).toISOString(),
   timezone:TZ,
   detail_level:detailLevel,
   scope,
   available_instances:availableAliases,
   instance:{
    alias:entry.alias,
    id:maskedId,
    name:instanceName,
    connection_state:connectionState,
    connected,
    smartphone_connected:smartphoneConnected,
    ...(meConnected!==null?{me_connected:meConnected}:{}),
    phone:confirmedPhone,
    ...(confirmedPhoneE164?{phone_e164:confirmedPhoneE164}:{}),
    profile_name:profileName,
    profile_image_url:profileImageUrl,
    about,
    is_business:isBusiness,
    device_model:deviceModel,
    session_name:sessionName,
    ...(detailLevel==='completo'||scope==='perfil_dispositivo'?{
     original_device:originalDevice,
     session_id:sessionId
    }:{}),
    created_at:createdAt,
    due_at:dueAt,
    payment_status:paymentStatus,
    ...(statusError?{status_error:statusError}:{}),
    ...(providerStatusNote&&detailLevel==='completo'?{provider_status_note:providerStatusNote}:{})
   },
   ...(lastKnownProfile?{last_known_profile:lastKnownProfile}:{}),
   ...(timestampsMeta&&(detailLevel==='completo'||scope==='assinatura_configuracoes')?{timestamps_provenance:timestampsMeta}:{}),
   webhooks,
   ...(webhookTargets?{webhook_targets:webhookTargets}:{}),
   ...(settings?{settings}:{}),
   send_readiness:{
    ready_for_api_submission:readyForSubmission,
    whatsapp_session_connected:connected===true,
    smartphone_online:smartphoneConnected,
    subscription_status:paymentStatus,
    ...(mcpState?{
     mcp_oauth_status:mcpState.oauth_status,
     mcp_tools_discovered_count:mcpState.discovered_tools_count??0
    }:{}),
    note:'Indica prontidão técnica da sessão e autorização para submeter envios à Z-API; a entrega final depende também do número/aparelho destinatário.'
   },
   diagnostics:{
    api_reachable:anyOk,
    credentials_valid:anyUnauth?false:(anyOk?true:null),
    status_source:statusRes.ok?'status':`error:${statusRes.errorCode}`,
    device_source:deviceRes?(deviceRes.ok?'device':`error:${deviceRes.errorCode}`):'not_requested',
    settings_source:meRes?(meRes.ok?'me':`error:${meRes.errorCode}`):'not_requested',
    ...(statusCheckedProviderAt?{status_provider_timestamp_brt:statusCheckedProviderAt}:{}),
    ...(unknownMeFieldsIgnoredCount>0?{unknown_me_fields_ignored_count:unknownMeFieldsIgnoredCount}:{}),
    partial_failure:partialFailure
   },
   warnings
  };
 }

 async function history(operatorId,{
  instancia,
  limite=20,
  readWebhookHistory=null
 }={}){
  const checkedMs=now();
  const checkedBrt=formatBrtIso(checkedMs);
  const max=Math.min(50,Math.max(1,Number(limite)||20));
  const resolved=resolveInstance(operatorId,instancia);
  if(resolved.status==='NOT_CONFIGURED'){
   return {
    source:'ZAPI_HISTORY_NOT_CONFIGURED',
    configured:false,
    checked_at:checkedBrt,
    timezone:TZ,
    instance:null,
    webhook_history:{
     available:false,
     reason:'zapi_rest_instance_not_configured',
     events:[]
    },
    gateway_poll_observations:{
     available:false,
     events:[]
    },
    limitations:'Nenhuma instância Z-API REST autorizada está configurada para este operador no gateway.'
   };
  }

  const {entry}=resolved;
  const maskedId=maskDispatchId(entry.instanceId);
  const instHash=createHash('sha256').update(entry.instanceId).digest('base64url').slice(0,16);
  const pollEvents=obsStore.get(entry.operatorId,instHash).slice(0,max);

  let webhookBlock={
   available:false,
   reason:'crm_webhook_history_source_not_connected',
   last_connected:null,
   last_disconnected:null,
   total_matching_events:0,
   events:[]
  };

  if(typeof readWebhookHistory==='function'){
   const wh=await readWebhookHistory({instanceId:entry.instanceId,limit:max});
   if(wh&&wh.available===true){
    webhookBlock={
     available:true,
     source:wh.source||'CRM_PROVIDER_WEBHOOK_EVENTS_READ_ONLY',
     total_matching_events:Number.isInteger(wh.total_matching_events)?wh.total_matching_events:0,
     returned_count:Number.isInteger(wh.returned_count)?wh.returned_count:0,
     has_more:Boolean(wh.has_more),
     last_connected:wh.last_connected||null,
     last_disconnected:wh.last_disconnected||null,
     ...(wh.integration_account?{integration_account:wh.integration_account}:{}),
     events:Array.isArray(wh.events)?wh.events:[]
    };
   }else{
    webhookBlock={
     available:false,
     reason:wh?.reason||'crm_webhook_history_unavailable',
     last_connected:null,
     last_disconnected:null,
     total_matching_events:0,
     events:[]
    };
   }
  }

  return {
   source:webhookBlock.available?'ZAPI_CRM_WEBHOOK_HISTORY_AND_POLL_LOG':'ZAPI_GATEWAY_POLL_LOG_ONLY',
   configured:true,
   checked_at:checkedBrt,
   checked_at_utc:new Date(checkedMs).toISOString(),
   timezone:TZ,
   instance:{
    alias:entry.alias,
    id:maskedId,
    label:entry.label||null
   },
   webhook_history:webhookBlock,
   gateway_poll_observations:{
    available:true,
    source:'GATEWAY_ENCRYPTED_POLL_OBSERVATIONS',
    returned_count:pollEvents.length,
    events:pollEvents
   },
   timestamp_semantics:{
    occurred_at_brt:'Horário real do evento reportado pela Z-API no campo momment do webhook (ConnectedCallback / DisconnectedCallback).',
    webhook_received_at_brt:'Horário em que o CRM recebeu e persistiu o webhook da Z-API.',
    poll_detected_at_brt:'Horário em que uma sondagem GET /status do gateway observou o estado (NÃO representa o instante exato em que a queda ocorreu).'
   },
   limitations:webhookBlock.available
    ?'Histórico oficial lido em modo READ ONLY de provider_webhook_events (webhooks ConnectedCallback e DisconnectedCallback recebidos pelo CRM), complementado por observações deduplicadas de sondagem do gateway.'
    :'Histórico anterior de webhooks não está acessível neste ambiente; apenas observações futuras deduplicadas de sondagem do gateway estão disponíveis (poll_detected_at_brt indica detecção em sondagem, não o horário exato do evento).'
  };
 }

 return {
  listForOperator,
  checkQuickStatus,
  diagnose,
  history
 };
}
