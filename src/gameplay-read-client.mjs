// Shared read-only Gameplay Catalog adapter; usable by the OAuth MCP gateway
// and local management dashboards via their own authenticated server-side bridge.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class GameplayReadError extends Error {
 constructor(code){super(code);this.name='GameplayReadError';}
}
export function gameplayReadConfig(env){
 if(env.EVYD_GAMEPLAY_READ_ENABLED!=='1')return null;
 let url;try{url=new URL(env.EVYD_GAMEPLAY_READ_ORIGIN||'')}catch{throw new GameplayReadError('gameplay_origin_invalid')}
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||
    (url.protocol!=='https:'&&!(loopback&&url.protocol==='http:')))throw new GameplayReadError('gameplay_origin_invalid');
 const secret=env.EVYD_GAMEPLAY_READ_TOKEN;
 if(typeof secret!=='string'||secret.length<32||/\s/.test(secret))throw new GameplayReadError('gameplay_secret_invalid');
 return Object.freeze({origin:url.origin,secret,timeoutMs:5000});
}
export function createGameplayReadClient(config,{fetchFn=fetch}={}){
 if(!config)throw new GameplayReadError('gameplay_not_configured');
 return {
  async lookup(uuids){
   if(!Array.isArray(uuids)||uuids.length<1||uuids.length>50||
      !uuids.every(x=>typeof x==='string'&&UUID.test(x)))throw new GameplayReadError('gameplay_uuid_invalid');
   const orderIds=[...new Set(uuids.map(x=>x.toLowerCase()))];
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),config.timeoutMs);
   try{
    const response=await fetchFn(config.origin+'/internal/v1/sessions/lookup-batch',{
      method:'POST',redirect:'error',signal:controller.signal,
      headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+config.secret},
      body:JSON.stringify({crm_order_uuids:orderIds})
    });
    if(!response.ok)throw new GameplayReadError('gameplay_http_'+response.status);
    const length=Number(response.headers.get('content-length')||0);
    if(length>65536)throw new GameplayReadError('gameplay_response_oversized');
    const raw=await response.text();
    if(Buffer.byteLength(raw)>65536)throw new GameplayReadError('gameplay_response_oversized');
    let body;try{body=JSON.parse(raw)}catch{throw new GameplayReadError('gameplay_invalid_json')}
    if(body?.schema_version!==1||!Array.isArray(body.results)||
       body.results.length!==orderIds.length)throw new GameplayReadError('gameplay_contract_invalid');
    const map=new Map();
    for(const row of body.results){
     if(!row||typeof row.crm_order_uuid!=='string'||
        !orderIds.includes(row.crm_order_uuid)||map.has(row.crm_order_uuid)||
        !['not_found','revoked','not_published','partial','published_unverified'].includes(row.state))
       throw new GameplayReadError('gameplay_contract_invalid');
     for(const key of ['hub_url','gallery_url']){
      const value=row[key];
      if(value!==null&&value!==undefined){
       let u;try{u=new URL(value)}catch{throw new GameplayReadError('gameplay_url_invalid')}
       if(u.origin!==config.origin||u.username||u.password||u.search||u.hash||
          !/^\/s\/[A-Za-z0-9_-]+(?:\/fotos)?$/.test(u.pathname))
          throw new GameplayReadError('gameplay_url_invalid');
      }
     }
     if(row.state!=='published_unverified'&&(row.hub_url||row.gallery_url))
      throw new GameplayReadError('gameplay_contract_invalid');
     map.set(row.crm_order_uuid,row);
    }
    return {source:'gameplay_catalog',verified_at:body.verified_at,results:orderIds.map(x=>map.get(x))};
   }catch(e){
    if(e instanceof GameplayReadError)throw e;
    throw new GameplayReadError('gameplay_unavailable');
   }finally{clearTimeout(timeout)}
  }
 };
}
