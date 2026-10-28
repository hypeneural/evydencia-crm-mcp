// Independent per-order steps. Persisted CRM events and broker receipts, rather
// than conversation memory, decide which effects are still missing.
import {randomUUID} from 'node:crypto';
const MODES=new Set(['so_baixa','so_imprime','baixa_e_imprime']);
const READY_STATES=new Set(['session_schedule','session_schedule_confirmed','selection_schedule_confirmed']);
const PRINT_STATES=new Set(['queued','claimed','spooled']);
const reason=e=>/^[a-z0-9_]+$/.test(String(e?.message||''))?e.message:'malotes_result_unknown';
export const malotesAuthenticationFailure=e=>/unauthorized|permission_denied|insufficient_operator|token_revoked|http_401|http_403/.test(reason(e));
export function requiredMalotesModeScopes(modo,pedidos){
 if(modo==='misto'){
  if(!Array.isArray(pedidos)||!pedidos.length)throw Error('malotes_invalid_batch_mode');
  const requirements=pedidos.map(p=>requiredMalotesModeScopes(p?.modo));
  return Object.freeze({requiresReady:requirements.some(r=>r.requiresReady),requiresPrint:requirements.some(r=>r.requiresPrint)});
 }
 if(!MODES.has(modo))throw Error('malotes_invalid_batch_mode');
 return Object.freeze({requiresReady:modo!=='so_imprime',requiresPrint:modo!=='so_baixa'});
}
export function validateMalotesBatch(modo,pedidos){
 if((modo!=='misto'&&!MODES.has(modo))||!Array.isArray(pedidos)||pedidos.length<1||pedidos.length>20)
  throw Error('malotes_invalid_batch');
 const seen=new Set();
 return pedidos.map(p=>{
  const mode=modo==='misto'?p?.modo:modo;
  const req=requiredMalotesModeScopes(mode);
  if(!Number.isSafeInteger(p?.order_id)||p.order_id<1||seen.has(p.order_id)||
   (req.requiresReady&&(!Number.isSafeInteger(p.expected_status_event_id)||p.expected_status_event_id<1))||
   (modo!=='misto'&&p.modo!==undefined&&p.modo!==modo))throw Error('malotes_duplicate_or_invalid_order');
  seen.add(p.order_id);return {...p,modo:mode,...req};
 });
}
export function checkedPrintReceipt(receipt,orderId){
 if(!receipt||typeof receipt!=='object'||receipt.order_id!==undefined&&receipt.order_id!==orderId)
  throw Error('printserver_receipt_invalid');
 if(receipt.job&&receipt.job.order_id!==orderId)throw Error('printserver_receipt_invalid');
 if(receipt.needs_reconciliation||['unknown','failed','expired','not_verified'].includes(receipt.state))
  throw Error('printserver_manual_reconciliation_required');
 if(receipt.state==='not_requested'&&receipt.job==null)return receipt;
 if(PRINT_STATES.has(receipt.state)&&typeof receipt.job?.job_id==='string'&&receipt.job.state===receipt.state)return receipt;
 throw Error('printserver_receipt_invalid');
}
export async function processMalotes({modo,pedidos,load,markReady,printLabel,lookupPrint}){
 const inputs=validateMalotesBatch(modo,pedidos),results=[];let halted=false;
 const read=async id=>{
  const o=await load(id);
  if(!o||o.order_id!==id)throw Error('malotes_order_not_found');
  return o;
 };
 for(const input of inputs){
  const {order_id,expected_status_event_id,requiresReady,requiresPrint}=input;
  const entry={order_id,modo:input.modo,baixa:'not_requested',impressao:'not_requested',
   status_event_id:null,job_id:null,baixa_request_id:null,impressao_request_id:null,
   printed_physically:false,notification_delivery_verified:false};
  if(halted){results.push({...entry,state:'not_attempted',reason:'malotes_authentication_required'});continue}
  try{
   let o=await read(order_id);entry.status_event_id=o.status_event_id??null;
   if(requiresReady){
    try{
     if(o.status_key==='waiting_product_retrieve')entry.baixa='already_ready';
     else{
      if(o.status_event_id!==expected_status_event_id)throw Error('malotes_status_conflict');
      if(!READY_STATES.has(o.status_key))throw Error('crm_malotes_status_not_eligible');
      if(o.remaining_cents!==0||o.payment_summary?.payment_needs_review===true)throw Error('crm_malotes_financial_not_verified');
      entry.baixa_request_id=randomUUID();
      const change=await markReady({order_id,expected_status_event_id,request_id:entry.baixa_request_id});
      if(change?.status_key!=='waiting_product_retrieve'||!['ready','already_ready'].includes(change.state))throw Error('malotes_write_result_unknown');
      entry.baixa=change.state;
      entry.status_event_id=change.status_event_id??entry.status_event_id;
      entry.baixa_status_event_id=change.status_event_id??null;
     }
     o=await read(order_id);
     if(o.status_key!=='waiting_product_retrieve')throw Error('malotes_post_write_status_unverified');
     entry.status_event_id=o.status_event_id??null;
     entry.baixa_refresh_verified=true;
    }catch(e){
     if(malotesAuthenticationFailure(e))throw e;
     if(['ready','already_ready'].includes(entry.baixa)){
      // A durable canonical confirmation survives a subsequent read failure.
      entry.baixa_refresh_verified=false;entry.baixa_refresh_reason=reason(e);
     }else{
      entry.baixa='blocked';entry.baixa_reason=reason(e);
     }
     if(entry.baixa==='blocked'&&/(?:result_unknown|(?:^|_)timeout)$/.test(entry.baixa_reason)){
      entry.baixa='unknown';
      // Reconcile an ambiguous commit by reading, never by a second POST.
      try{
       o=await read(order_id);entry.status_event_id=o.status_event_id??null;
       if(o.status_key==='waiting_product_retrieve'){
        entry.baixa='already_ready';entry.baixa_reconciled=true;
       }
      }catch(reconcile){if(malotesAuthenticationFailure(reconcile))throw reconcile}
     }
    }
   }
   if(requiresPrint){
    try{
     o=await read(order_id);entry.status_event_id=o.status_event_id??null;
     if(typeof lookupPrint!=='function')throw Error('printserver_receipt_unavailable');
     const receipt=checkedPrintReceipt(await lookupPrint(order_id),order_id);
     if(receipt.state!=='not_requested'){
      entry.impressao=receipt.state;entry.job_id=receipt.job.job_id;entry.impressao_replay=true;
      entry.impressao_request_id=receipt.job.request_id??null;
     }else{
      entry.impressao_request_id=randomUUID();
      const printed=await printLabel({order_id,order:o,request_id:entry.impressao_request_id});
      entry.impressao=printed?.state??'unknown';entry.job_id=printed?.job_id??null;
      entry.impressao_replay=Boolean(printed?.replay);
      entry.impressao_request_id=printed?.request_id??entry.impressao_request_id;
      if(!PRINT_STATES.has(entry.impressao)||!entry.job_id)throw Error('malotes_print_result_unknown');
     }
    }catch(e){
     if(malotesAuthenticationFailure(e))throw e;
     entry.impressao='unknown';entry.impressao_reason=reason(e);
    }
   }
   const readyOk=!requiresReady||['ready','already_ready'].includes(entry.baixa);
   const printOk=!requiresPrint||PRINT_STATES.has(entry.impressao);
   entry.state=readyOk&&printOk?'processed':'needs_manual_reconciliation';
   if(entry.state!=='processed')entry.reason=entry.baixa_reason??entry.impressao_reason;
  }catch(e){
   entry.state='needs_manual_reconciliation';entry.reason=reason(e);
   halted=malotesAuthenticationFailure(e);
  }
  results.push(entry);
 }
 return {source:'CRM_MALOTES_BATCH',modo,attempted_count:inputs.length,
  processed_count:results.filter(r=>r.state==='processed').length,
  needs_reconciliation_count:results.filter(r=>r.state!=='processed').length,
  changes_applied:results.some(r=>r.baixa==='ready'),halted,
  printed_physically:false,notification_delivery_verified:false,results};
}
