// Official Z-API MCP Streamable HTTP client, per-operator session pool, discovery, deduplication and status adapter.
// Consumes https://mcp.z-api.io/mcp via @modelcontextprotocol/client v2.4.0 without rebuilding message/group REST endpoints.
import {createHash,randomBytes} from 'node:crypto';
import {
 Client,
 InsufficientScopeError,
 ProtocolError,
 SdkError,
 SdkErrorCode,
 SdkHttpError,
 StreamableHTTPClientTransport,
 UnauthorizedError
} from '@modelcontextprotocol/client';
import {operatorTagger} from './oauth-gateway.mjs';
import {createZapiInstanceDiagnostics} from './zapi-instance-diagnostics.mjs';
import {createZapiAuthManager} from './zapi-mcp-auth.mjs';
import {
 canonicalJson,
 classifyDiscoveredTools,
 maskDispatchId,
 redactSensitiveText,
 validateZapiMediaArgs,
 ZAPI_STATUS_TOOL_NAME
} from './zapi-mcp-tools.mjs';

const DEDUP_ACCEPTED_TTL_MS=15000;
const DEDUP_AMBIGUOUS_TTL_MS=30000;

function extractDispatchId(result){
 const candidates=[];
 if(result?.structuredContent&&typeof result.structuredContent==='object'){
  candidates.push(result.structuredContent);
 }
 if(Array.isArray(result?.content)){
  for(const block of result.content){
   if(block?.type==='text'&&typeof block.text==='string'){
    try{
     const parsed=JSON.parse(block.text);
     if(parsed&&typeof parsed==='object')candidates.push(parsed);
    }catch{}
   }
  }
 }
 for(const obj of candidates){
  const id=obj.messageId??obj.zaapId??obj.id??obj.result?.messageId??obj.result?.zaapId??null;
  if(id!==null&&id!==undefined&&String(id).trim())return String(id).trim();
 }
 return null;
}

function sanitizeContentBlocks(content){
 if(!Array.isArray(content))return [];
 return content.map(block=>{
  if(!block||typeof block!=='object')return block;
  if(block.type==='text'&&typeof block.text==='string'){
   return {...block,text:redactSensitiveText(block.text)};
  }
  return block;
 });
}

export function createZapiBridge(cfg,{operators,fetchFn=fetch,now=()=>Date.now(),log=()=>{},reservedToolNames=[],gatewayVersion='0.12.0',onToolsUpdated=()=>{},diagnostics=null}={}){
 const tag=operatorTagger(cfg.key);
 const sessions=new Map();
 const dedupMap=new Map();
 const reservedSet=new Set([...reservedToolNames,ZAPI_STATUS_TOOL_NAME]);
 const restDiag=diagnostics||createZapiInstanceDiagnostics(cfg,{fetchFn,now,log});

 const auth=createZapiAuthManager(cfg,{
  operators,
  fetchFn,
  now,
  log,
  onAuthorizedDiscover:op=>discoverTools(op,{forceRefresh:true}),
  onDisconnected:async op=>{
   await closeSession(op);
   onToolsUpdated();
  }
 });

 function pruneDedup(){
  const t=now();
  if(dedupMap.size<500)return;
  for(const [k,v] of dedupMap){
   if(v.state!=='in_flight'&&v.until<=t)dedupMap.delete(k);
  }
 }

 function touchIdleTimer(op,entry){
  if(entry.idleTimer)clearTimeout(entry.idleTimer);
  entry.idleTimer=setTimeout(()=>{closeSession(op).catch(()=>{})},cfg.zapiSessionIdleMs);
  entry.idleTimer.unref?.();
 }

 async function closeSession(operatorId){
  const op=String(operatorId||'');
  const entry=sessions.get(op);
  if(!entry)return;
  sessions.delete(op);
  if(entry.idleTimer)clearTimeout(entry.idleTimer);
  try{
   const resolved=await entry.promise.catch(()=>null);
   if(resolved?.client)await resolved.client.close().catch(()=>{});
   else if(resolved?.transport)await resolved.transport.close().catch(()=>{});
  }catch{}
 }

 async function openFreshSession(op){
  const authProvider={
   token:()=>auth.ensureValidAccessToken(op),
   onUnauthorized:()=>auth.ensureValidAccessToken(op,{forceRefresh:true}).then(()=>{})
  };
  const transport=new StreamableHTTPClientTransport(new URL(cfg.zapiMcpUrl),{
   authProvider,
   fetch:fetchFn,
   reconnectionOptions:{
    maxRetries:0,
    initialReconnectionDelay:250,
    maxReconnectionDelay:1000,
    reconnectionDelayGrowFactor:1
   },
   onInsufficientScope:'throw'
  });
  const client=new Client(
   {name:'evydencia-crm-mcp-live',version:gatewayVersion},
   {listMaxPages:16}
  );
  transport.onclose=()=>{
   const cur=sessions.get(op);
   if(cur?.transport===transport){
    if(cur.idleTimer)clearTimeout(cur.idleTimer);
    sessions.delete(op);
   }
  };
  transport.onerror=()=>{};
  await client.connect(transport,{timeout:cfg.zapiTimeoutMs});
  log({evt:'zapi_mcp_session_connected',op:tag(op),protocol:client.getNegotiatedProtocolVersion()||'unknown'});
  return {client,transport};
 }

 async function getOrConnectSession(operatorId){
  const op=String(operatorId||'');
  const existing=sessions.get(op);
  if(existing){
   try{
    const conn=await existing.promise;
    existing.lastUsedAt=now();
    touchIdleTimer(op,existing);
    return conn;
   }catch{
    sessions.delete(op);
   }
  }
  const entry={promise:null,transport:null,idleTimer:null,lastUsedAt:now()};
  entry.promise=openFreshSession(op).then(conn=>{
   entry.transport=conn.transport;
   touchIdleTimer(op,entry);
   return conn;
  }).catch(err=>{
   if(sessions.get(op)===entry)sessions.delete(op);
   throw err;
  });
  sessions.set(op,entry);
  return entry.promise;
 }

 async function discoverTools(operatorId,{forceRefresh=false,signal}={}){
  const op=String(operatorId||'');
  const prevState=auth.getOperatorState(op);
  const prevNames=JSON.stringify((prevState.record?.discovered_tools||[]).map(t=>t.gatewayName));
  let listRes,conn;
  try{
   conn=await getOrConnectSession(op);
   listRes=await conn.client.listTools(undefined,{
    cacheMode:forceRefresh?'refresh':'use',
    signal,
    timeout:cfg.zapiTimeoutMs
   });
  }catch(e){
   // Safe single reconnect for read-only discovery if pooled session expired upstream (HTTP 404 / closed).
   const isStaleSession=(SdkHttpError.isInstance(e)&&e.status===404)||(SdkError.isInstance(e)&&e.code===SdkErrorCode.ConnectionClosed);
   if(!isStaleSession){
    if(UnauthorizedError.isInstance(e)||(SdkHttpError.isInstance(e)&&e.status===401))auth.markRevoked(op);
    await closeSession(op);
    throw e;
   }
   await closeSession(op);
   conn=await getOrConnectSession(op);
   listRes=await conn.client.listTools(undefined,{
    cacheMode:'refresh',
    signal,
    timeout:cfg.zapiTimeoutMs
   });
  }

  const classified=classifyDiscoveredTools(listRes?.tools||[],reservedSet);
  for(const sk of classified.skipped){
   log({evt:'zapi_tool_skipped',op:tag(op),reason:sk.reason});
  }
  const snapshot={
   discovered_tools:classified.approved,
   unexposed_tools:classified.skipped.map(s=>({upstream_name:s.upstream_name,reason:s.reason})),
   official_status_tool:classified.officialStatusTool,
   server_info:conn.client.getServerVersion()||null,
   protocol_version:conn.client.getNegotiatedProtocolVersion()||null
  };
  auth.saveDiscoverySnapshot(op,snapshot);
  log({evt:'zapi_tools_discovered',op:tag(op),approved:classified.approved.length,skipped:classified.skipped.length});
  if(JSON.stringify(classified.approved.map(t=>t.gatewayName))!==prevNames){
   onToolsUpdated();
  }
  return snapshot;
 }

 async function ensureOperatorTools(operatorId){
  const op=String(operatorId||'');
  const st=auth.getOperatorState(op);
  if(Array.isArray(st.record?.discovered_tools)&&st.record.discovered_tools.length>0){
   return st.record.discovered_tools;
  }
  if(st.oauth_status==='authorized'){
   try{
    const snap=await discoverTools(op,{forceRefresh:true});
    return snap.discovered_tools||[];
   }catch{
    return [];
   }
  }
  return [];
 }

 async function checkWhatsappConnectivity(operatorId,record,{signal}={}){
  const op=String(operatorId||'');
  // 1. If real upstream MCP ever exposes an official read-only status tool, prefer it.
  if(record?.official_status_tool?.upstreamName){
   try{
    const conn=await getOrConnectSession(op);
    const r=await conn.client.callTool({name:record.official_status_tool.upstreamName,arguments:{}},{signal,timeout:cfg.zapiTimeoutMs});
    if(!r?.isError){
     return {
      verifiable:true,
      source:'zapi_official_mcp_tool',
      status:'reported_by_mcp',
      detail:'Status retornado pela ferramenta oficial do MCP Z-API.',
      upstream:sanitizeContentBlocks(r.content)
     };
    }
   }catch{}
  }
  // 2. Optional complementary GET /instances/{instanceId}/token/{token}/status via shared diagnostics adapter.
  const quick=await restDiag.checkQuickStatus(op,{signal});
  if(quick)return quick;
  // 3. No shared/unverified REST access: report faithfully without inventing health.
  return {
   verifiable:false,
   source:'official_mcp_only',
   status:'not_verifiable_via_official_mcp',
   detail:'status WhatsApp não verificável pelo MCP oficial'
  };
 }

 async function getConnectionStatus(operatorId,{refreshTools=false,includeManageLink=false,signal}={}){
  const op=String(operatorId||'');
  let st=auth.getOperatorState(op);
  let effectiveOauthStatus=st.oauth_status;

  if(st.oauth_status==='authorized'){
   try{
    await auth.ensureValidAccessToken(op);
    if(refreshTools||!Array.isArray(st.record?.discovered_tools)||st.record.discovered_tools.length===0){
     await discoverTools(op,{forceRefresh:true,signal});
    }
    st=auth.getOperatorState(op);
    effectiveOauthStatus=st.oauth_status;
   }catch(e){
    st=auth.getOperatorState(op);
    if(st.oauth_status==='expired'||st.oauth_status==='revoked'){
     effectiveOauthStatus=st.oauth_status;
    }else if(UnauthorizedError.isInstance(e)||(SdkHttpError.isInstance(e)&&e.status===401)){
     auth.markRevoked(op);
     st=auth.getOperatorState(op);
     effectiveOauthStatus='revoked';
    }else{
     effectiveOauthStatus='unavailable';
    }
   }
  }

  const tools=Array.isArray(st.record?.discovered_tools)?st.record.discovered_tools:[];
  const unexposed=Array.isArray(st.record?.unexposed_tools)?st.record.unexposed_tools:[];
  const whatsapp=await checkWhatsappConnectivity(op,st.record,{signal});
  const needsAuthLink=effectiveOauthStatus!=='authorized'||Boolean(includeManageLink);
  const manageUrl=needsAuthLink?auth.mintConnectUrl(op):null;

  return {
   service:'zapi-official-mcp-bridge',
   upstream_mcp_endpoint:cfg.zapiMcpUrl,
   operator_isolated:true,
   oauth_status:effectiveOauthStatus,
   authorized_at:st.record?.authorized_at?new Date(st.record.authorized_at*1000).toISOString():null,
   last_verified_at:st.record?.last_verified_at?new Date(st.record.last_verified_at*1000).toISOString():null,
   protocol_version:st.record?.protocol_version||null,
   discovered_tools_count:tools.length,
   exposed_tools:tools.map(t=>({gateway_tool:t.gatewayName,upstream_tool:t.upstreamName,read_only:Boolean(t.annotations?.readOnlyHint)})),
   unexposed_upstream_tools_count:unexposed.length,
   whatsapp_connection:whatsapp,
   ...(manageUrl?{authorization_url:manageUrl}:{}),
   guidance:effectiveOauthStatus==='authorized'
    ?'Instância Z-API vinculada ao operador autenticado. As ferramentas zapi_* estão prontas para uso.'
    :(effectiveOauthStatus==='unavailable'
     ?'Servidor Z-API MCP temporariamente indisponível; credenciais preservadas.'
     :'Abra authorization_url no navegador para autorizar e selecionar a instância WhatsApp na Z-API.')
  };
 }

 function authRequiredToolResult(op,oauthStatus,code){
  const authorizationUrl=auth.mintConnectUrl(op);
  const payload={
   ok:false,
   error:code,
   oauth_status:oauthStatus,
   authorization_url:authorizationUrl,
   message:oauthStatus==='expired'
    ?'A autorização OAuth da Z-API expirou. Acesse authorization_url no navegador para reconectar sua instância.'
    :(oauthStatus==='revoked'
     ?'A autorização OAuth da Z-API foi revogada no provedor. Acesse authorization_url no navegador para vincular novamente.'
     :'Nenhuma instância Z-API vinculada a este operador. Acesse authorization_url no navegador para selecionar e autorizar sua instância WhatsApp.')
  };
  return {
   isError:true,
   content:[{type:'text',text:JSON.stringify(payload)}]
  };
 }

 async function callTool(operatorId,toolEntry,rawArgs,{signal}={}){
  const op=String(operatorId||'');
  const t0=performance.now();
  const correlationId='zcorr_'+randomBytes(8).toString('hex');
  const args=rawArgs&&typeof rawArgs==='object'?rawArgs:{};
  const isMutating=toolEntry.annotations?.readOnlyHint===false;

  const st=auth.getOperatorState(op);
  if(st.oauth_status!=='authorized'){
   log({evt:'zapi_tool',tool:toolEntry.gatewayName,ok:false,err:'zapi_'+st.oauth_status,op:tag(op),correlation_id:correlationId,ms:Math.round(performance.now()-t0)});
   return authRequiredToolResult(op,st.oauth_status,'zapi_'+st.oauth_status);
  }

  try{
   validateZapiMediaArgs(toolEntry,args);
  }catch(e){
   const code=e?.message||'zapi_invalid_arguments';
   log({evt:'zapi_tool',tool:toolEntry.gatewayName,ok:false,err:code,op:tag(op),correlation_id:correlationId,ms:Math.round(performance.now()-t0)});
   return {
    isError:true,
    content:[{type:'text',text:JSON.stringify({ok:false,error:code,correlation_id:correlationId})}]
   };
  }

  let dedupKey=null;
  if(isMutating){
   pruneDedup();
   dedupKey=createHash('sha256').update(`${op}\0${toolEntry.gatewayName}\0${canonicalJson(args)}`).digest('base64url');
   const hit=dedupMap.get(dedupKey);
   const curNow=now();
   if(hit){
    if(hit.state==='in_flight'){
     log({evt:'zapi_tool_dedup',tool:toolEntry.gatewayName,reason:'in_flight',op:tag(op),correlation_id:correlationId});
     return {
      isError:true,
      content:[{type:'text',text:JSON.stringify({
       ok:false,
       error:'zapi_duplicate_inflight_blocked',
       original_correlation_id:hit.correlationId,
       message:'Este exato comando já está em execução na Z-API; aguarde o retorno para evitar envio duplicado.'
      })}]
     };
    }
    if(hit.until>curNow&&hit.state==='accepted'){
     log({evt:'zapi_tool_dedup',tool:toolEntry.gatewayName,reason:'recent_accepted',op:tag(op),correlation_id:correlationId});
     return {
      isError:true,
      content:[{type:'text',text:JSON.stringify({
       ok:false,
       error:'zapi_duplicate_recent_dispatch_blocked',
       original_correlation_id:hit.correlationId,
       dispatch_id_masked:hit.dispatchIdMasked,
       message:'Envio idêntico já submetido há poucos segundos; bloqueado preventivamente contra duplicidade acidental.'
      })}]
     };
    }
    if(hit.until>curNow&&hit.state==='ambiguous'){
     log({evt:'zapi_tool_dedup',tool:toolEntry.gatewayName,reason:'recent_ambiguous',op:tag(op),correlation_id:correlationId});
     return {
      isError:true,
      content:[{type:'text',text:JSON.stringify({
       ok:false,
       error:'zapi_duplicate_after_ambiguous_failure_blocked',
       retry_unsafe:true,
       original_correlation_id:hit.correlationId,
       message:'A tentativa anterior deste exato envio sofreu falha ambígua/timeout e pode ter sido aceita pelo provedor. Verifique antes de reenviar.'
      })}]
     };
    }
    dedupMap.delete(dedupKey);
   }
   dedupMap.set(dedupKey,{state:'in_flight',correlationId,until:curNow+cfg.zapiTimeoutMs+5000});
  }

  let timeoutFired=false;
  const timeoutAc=new AbortController();
  const timeoutHandle=setTimeout(()=>{timeoutFired=true;timeoutAc.abort()},cfg.zapiTimeoutMs);
  const combinedSignal=signal?AbortSignal.any([signal,timeoutAc.signal]):timeoutAc.signal;
  let dispatchedToSession=false;

  try{
   let conn=await getOrConnectSession(op);
   dispatchedToSession=true;
   let res;
   try{
    res=await conn.client.callTool(
     {name:toolEntry.upstreamName,arguments:args},
     {signal:combinedSignal,timeout:cfg.zapiTimeoutMs}
    );
   }catch(innerErr){
    const isStaleRead=!isMutating&&((SdkHttpError.isInstance(innerErr)&&innerErr.status===404)||(SdkError.isInstance(innerErr)&&innerErr.code===SdkErrorCode.ConnectionClosed));
    if(!isStaleRead)throw innerErr;
    await closeSession(op);
    conn=await getOrConnectSession(op);
    res=await conn.client.callTool(
     {name:toolEntry.upstreamName,arguments:args},
     {signal:combinedSignal,timeout:cfg.zapiTimeoutMs}
    );
   }

   const cleanContent=sanitizeContentBlocks(res?.content);
   if(res?.isError){
    if(dedupKey)dedupMap.delete(dedupKey);
    log({evt:'zapi_tool',tool:toolEntry.gatewayName,upstream_tool:toolEntry.upstreamName,ok:false,err:'zapi_upstream_tool_error',op:tag(op),correlation_id:correlationId,ms:Math.round(performance.now()-t0)});
    return {
     isError:true,
     content:cleanContent.length?cleanContent:[{type:'text',text:JSON.stringify({ok:false,error:'zapi_upstream_tool_error',correlation_id:correlationId})}],
     ...(res.structuredContent!==undefined?{structuredContent:res.structuredContent}:{})
    };
   }

   const dispatchId=extractDispatchId(res);
   const dispatchIdMasked=maskDispatchId(dispatchId);
   if(dedupKey){
    dedupMap.set(dedupKey,{
     state:'accepted',
     correlationId,
     dispatchIdMasked,
     until:now()+DEDUP_ACCEPTED_TTL_MS
    });
   }

   log({
    evt:'zapi_tool',
    tool:toolEntry.gatewayName,
    upstream_tool:toolEntry.upstreamName,
    ok:true,
    op:tag(op),
    correlation_id:correlationId,
    ...(dispatchIdMasked?{dispatch_id_masked:dispatchIdMasked}:{}),
    ms:Math.round(performance.now()-t0)
   });

   let structuredContent=res?.structuredContent;
   if(structuredContent===undefined&&!toolEntry.outputSchema){
    let parsedText=null;
    if(cleanContent[0]?.type==='text'&&typeof cleanContent[0].text==='string'){
     try{parsedText=JSON.parse(cleanContent[0].text)}catch{}
    }
    structuredContent={
     provider:'z-api-mcp',
     upstream_tool:toolEntry.upstreamName,
     correlation_id:correlationId,
     delivery_semantics:isMutating?'accepted_by_provider_not_final_delivery':'query_result',
     ...(parsedText&&typeof parsedText==='object'&&!Array.isArray(parsedText)?{upstream_result:parsedText}:{})
    };
   }

   return {
    content:cleanContent.length?cleanContent:[{type:'text',text:JSON.stringify(structuredContent||{ok:true,correlation_id:correlationId})}],
    ...(structuredContent!==undefined?{structuredContent}:{})
   };
  }catch(e){
   const ms=Math.round(performance.now()-t0);
   const msg=String(e?.message||'');

   // 1. Authorization / revocation / expiration failures (definitely not executed).
   if(msg==='zapi_expired'||msg==='zapi_revoked'||msg==='zapi_authorization_required'||UnauthorizedError.isInstance(e)||(SdkHttpError.isInstance(e)&&e.status===401)){
    if(dedupKey)dedupMap.delete(dedupKey);
    if(UnauthorizedError.isInstance(e)||(SdkHttpError.isInstance(e)&&e.status===401))auth.markRevoked(op);
    await closeSession(op);
    const curStatus=auth.getOperatorState(op).oauth_status;
    const errCode='zapi_'+(curStatus==='authorized'?'revoked':curStatus);
    log({evt:'zapi_tool',tool:toolEntry.gatewayName,ok:false,err:errCode,op:tag(op),correlation_id:correlationId,ms});
    return authRequiredToolResult(op,curStatus==='authorized'?'revoked':curStatus,errCode);
   }

   // 2. HTTP 403 / 429 / 4xx / 5xx from upstream transport.
   if(InsufficientScopeError.isInstance(e)||(SdkHttpError.isInstance(e)&&e.status===403)){
    if(dedupKey)dedupMap.delete(dedupKey);
    await closeSession(op);
    log({evt:'zapi_tool',tool:toolEntry.gatewayName,ok:false,err:'zapi_http_403',op:tag(op),correlation_id:correlationId,ms});
    return {isError:true,content:[{type:'text',text:JSON.stringify({ok:false,error:'zapi_http_403',correlation_id:correlationId})}]};
   }

   if(SdkHttpError.isInstance(e)){
    const status=e.status;
    const isAmbiguousGateway5xx=isMutating&&dispatchedToSession&&(status===502||status===504);
    if(dedupKey){
     if(isAmbiguousGateway5xx)dedupMap.set(dedupKey,{state:'ambiguous',correlationId,until:now()+DEDUP_AMBIGUOUS_TTL_MS});
     else dedupMap.delete(dedupKey);
    }
    if(status>=500||status===404)await closeSession(op);
    const code=`zapi_http_${status}`;
    log({evt:'zapi_tool',tool:toolEntry.gatewayName,ok:false,err:code,op:tag(op),correlation_id:correlationId,ms});
    return {
     isError:true,
     content:[{type:'text',text:JSON.stringify({
      ok:false,
      error:code,
      http_status:status,
      correlation_id:correlationId,
      retry_unsafe:isAmbiguousGateway5xx
     })}]
    };
   }

   // 3. JSON-RPC protocol error (e.g. invalid params / method not found upstream).
   if(ProtocolError.isInstance(e)){
    if(dedupKey)dedupMap.delete(dedupKey);
    log({evt:'zapi_tool',tool:toolEntry.gatewayName,ok:false,err:'zapi_protocol_error',rpc_code:e.code,op:tag(op),correlation_id:correlationId,ms});
    return {
     isError:true,
     content:[{type:'text',text:JSON.stringify({
      ok:false,
      error:'zapi_protocol_error',
      rpc_code:e.code,
      detail:redactSensitiveText(e.message).slice(0,240),
      correlation_id:correlationId
     })}]
    };
   }

   // 4. Timeout, cancellation or mid-flight network drop: NEVER auto-retry mutating calls!
   await closeSession(op);
   const callerCancelled=Boolean(signal?.aborted&&!timeoutFired);
   const isTimeout=timeoutFired||(SdkError.isInstance(e)&&e.code===SdkErrorCode.RequestTimeout);
   if(dedupKey){
    if(dispatchedToSession){
     dedupMap.set(dedupKey,{state:'ambiguous',correlationId,until:now()+DEDUP_AMBIGUOUS_TTL_MS});
    }else{
     dedupMap.delete(dedupKey);
    }
   }
   const code=callerCancelled?'zapi_request_cancelled':(isTimeout?'zapi_timeout':(msg==='zapi_oauth_unavailable'?'zapi_oauth_unavailable':'zapi_network_error'));
   log({evt:'zapi_tool',tool:toolEntry.gatewayName,ok:false,err:code,op:tag(op),correlation_id:correlationId,ms});
   return {
    isError:true,
    content:[{type:'text',text:JSON.stringify({
     ok:false,
     error:code,
     correlation_id:correlationId,
     retry_unsafe:Boolean(isMutating&&dispatchedToSession),
     delivery_status:isMutating&&dispatchedToSession?'unknown_do_not_auto_retry':'not_sent',
     guidance:isMutating&&dispatchedToSession
      ?'Falha ambígua de rede ou timeout após envio da requisição: não reenvie automaticamente sem conferir se a mensagem já entrou na fila da Z-API.'
      :'Não foi possível estabelecer conexão com o servidor MCP da Z-API.'
    })}]
   };
  }finally{
   clearTimeout(timeoutHandle);
  }
 }

 async function close(){
  const ops=[...sessions.keys()];
  await Promise.all(ops.map(op=>closeSession(op)));
  dedupMap.clear();
 }

 return {
  auth,
  discoverTools,
  ensureOperatorTools,
  getConnectionStatus,
  callTool,
  handleHttp:(req,path)=>auth.handleHttp(req,path),
  close
 };
}
