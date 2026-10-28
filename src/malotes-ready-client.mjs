// Dedicated operator Sanctum route. No static legacy token, session cookie or
// shared unrestricted CRM secret. Timeouts are ambiguous: never blind retry.
const fail=code=>{throw Error('crm_malotes_'+code)};
export function readyForPickupClient({baseUrl,operatorToken,fetchFn=fetch,timeoutMs=12000}){
 const u=new URL(baseUrl);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash
  ||(u.protocol==='http:'&&!['localhost','127.0.0.1'].includes(u.hostname)))fail('invalid_origin');
 if(typeof operatorToken!=='string'||operatorToken.length<12||/\s/.test(operatorToken))fail('invalid_operator_token');
 return async({order_id,expected_status_event_id,operator_id,request_id,confirmed_by_operator})=>{
  if(!Number.isSafeInteger(order_id)||order_id<1||
     !Number.isSafeInteger(expected_status_event_id)||expected_status_event_id<1||
     !/^[1-9]\d{0,9}$/.test(String(operator_id))||
     !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(request_id||'')||
     confirmed_by_operator!==true)fail('invalid_input');
  const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),timeoutMs);
  try{
   const origin=u.origin;
   const response=await fetchFn(origin+'/api/v1/extension/orders/'+order_id+'/ready-for-pickup',{
    method:'POST',redirect:'error',signal:abort.signal,
    headers:{Authorization:'Bearer '+operatorToken,'Accept':'application/json','Content-Type':'application/json'},
    body:JSON.stringify({expected_status_event_id,operator_id:Number(operator_id),request_id,confirmed_by_operator})
   });
   if(response.redirected)fail('result_unknown');
   if([401,403].includes(response.status))fail('upstream_permission_denied');
   if(response.status===503)fail('upstream_disabled');
   if(response.status===409){
    // The canonical route uses 409 for domain refusals as well as a stale
    // snapshot. Preserve its allowlisted reason without changing the guard.
    const rejection=await response.json().catch(()=>null);
    const reasons={FINANCIAL_NOT_VERIFIED:'financial_not_verified',FINANCE_UNKNOWN:'finance_unknown',
     STATUS_NOT_ELIGIBLE:'status_not_eligible',HISTORY_MISSING:'history_missing',STATUS_CONFLICT:'conflict_refresh_required'};
    fail(Object.hasOwn(reasons,rejection?.code)?reasons[rejection.code]:'conflict_refresh_required');
   }
   if(response.status===422)fail('invalid_input');
   if(response.status>=500)fail('result_unknown');
   if(!response.ok)fail('upstream_unavailable');
   const body=await response.json();
   if(body?.success!==true||body?.order_id!==order_id||body?.status_key!=='waiting_product_retrieve'||
      !Number.isSafeInteger(body.status_event_id)||!['ready','already_ready'].includes(body.state))fail('invalid_response');
   return Object.freeze({source:'CRM_EXTENSION_CANONICAL',order_id,status_key:body.status_key,
    status_event_id:body.status_event_id,state:body.state,
    changes_applied:body.changes_applied===true,replay:body.replay===true,
    notification_delivery_verified:false,printed_physically:false});
  }catch(e){
   if(e?.name==='AbortError'||e instanceof TypeError)fail('result_unknown');
   throw e;
  }finally{clearTimeout(timeout)}
 };
}
