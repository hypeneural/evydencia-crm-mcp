// Optional printserver bridge. Never holds the Windows agent credential.
// Each POST is made only after an authenticated MCP operator verifies CRM status 10.
const safeUrl=(raw)=>{
 let u;try{u=new URL(raw)}catch{throw Error('printserver_config_url')}
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.protocol!=='https:')throw Error('printserver_config_url');
 return u.origin;
};
export function printserverConfig(env){
 if(env.EVYD_PRINTSERVER_ENABLED!=='1')return Object.freeze({enabled:false});
 const origin=safeUrl(env.EVYD_PRINTSERVER_URL||'');
 const token=String(env.EVYD_PRINTSERVER_MCP_TOKEN||'');
 if(token.length<32||token.length>256||/\s/.test(token))throw Error('printserver_config_token');
 return Object.freeze({enabled:true,origin,token});
}
export function printserverClient(cfg,{fetchFn=fetch,timeoutMs=12000}={}){
 if(!cfg?.enabled)throw Error('printserver_not_configured');
 async function send(path,method,body){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeoutMs);
  try{
   const r=await fetchFn(cfg.origin+path,{
    method,redirect:'error',signal:ac.signal,
    headers:{Authorization:'Bearer '+cfg.token,'Accept':'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},
    ...(method==='POST'?{body:JSON.stringify(body)}:{})
   });
   if(r.redirected)throw Error('printserver_result_unknown');
   const txt=await r.text();
   let data;try{data=JSON.parse(txt)}catch{throw Error('printserver_result_unknown')}
   if(r.status===401||r.status===403)throw Error('printserver_unauthorized');
   if(r.status===409)throw Error('printserver_manual_reconciliation_required');
   if(r.status===422)throw Error('printserver_invalid_request');
   if(r.status===429||r.status>=500)throw Error('printserver_result_unknown');
   if(!r.ok)throw Error('printserver_unavailable');
   return data;
  }catch(e){
   if(e?.name==='AbortError'||e instanceof TypeError)throw Error('printserver_result_unknown');
   throw e;
  }finally{clearTimeout(timer)}
 }
 return Object.freeze({
  enqueue:data=>send('/v1/jobs','POST',data),
  status:jobId=>{
   if(!/^[0-9a-fA-F-]{36}$/.test(jobId))throw Error('printserver_invalid_job_id');
   return send('/v1/jobs/'+encodeURIComponent(jobId),'GET');
  }
 });
}
