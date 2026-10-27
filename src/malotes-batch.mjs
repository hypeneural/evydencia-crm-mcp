// Serial per-order saga. CRM status commits before print enqueue.
// Never claims cross-system atomicity; errors/ambiguous outcomes stay per-order.
const ALLOWED_MODES=new Set(['so_baixa','so_imprime','baixa_e_imprime']);
export async function processMalotes({modo,pedidos,load,markReady,printLabel}){
 if(!ALLOWED_MODES.has(modo)||!Array.isArray(pedidos)||pedidos.length<1||pedidos.length>20)
  throw Error('malotes_invalid_batch');
 const seen=new Set(),results=[];
 for(const input of pedidos){
  const id=input?.order_id,expected=input?.expected_status_event_id;
  if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(expected)||expected<1||seen.has(id))
   throw Error('malotes_duplicate_or_invalid_order');
  seen.add(id);
 }
 for(const {order_id,expected_status_event_id} of pedidos){
  const entry={order_id,baixa:'not_requested',impressao:'not_requested',status_event_id:null,
   job_id:null,printed_physically:false,notification_delivery_verified:false};
  try{
   let o=await load(order_id);
   if(!o||o.order_id!==order_id)throw Error('malotes_order_not_found');
   if(o.status_event_id!==expected_status_event_id)throw Error('malotes_status_conflict');
   if(modo!=='so_imprime'){
    if(o.status_key==='waiting_product_retrieve'){
     entry.baixa='already_ready';
    }else{
     const change=await markReady({order_id,expected_status_event_id});
     if(change?.status_key!=='waiting_product_retrieve')throw Error('malotes_write_result_unknown');
     entry.baixa=change.state;
    }
   }
   if(modo!=='so_baixa'){
    // Query again after commit; NEVER rely on the pre-mutation cached status
    // to authorize an external irreversible printer action.
    o=await load(order_id);
    if(!o||o.order_id!==order_id||o.status_key!=='waiting_product_retrieve'||
       o.remaining_cents!==0)throw Error('malotes_print_finance_or_status_blocked');
    const printed=await printLabel({order_id,order:o});
    entry.impressao=printed?.state??'unknown';
    entry.job_id=printed?.job_id??null;
    if(!['queued','claimed','spooled'].includes(entry.impressao))
     throw Error('malotes_print_result_unknown');
   }
   const final=await load(order_id);
   if(final?.order_id===order_id)entry.status_event_id=final.status_event_id??null;
   entry.state='processed';
  }catch(e){
   // No retry for 409, network timeout or uncertain physical output.
   entry.state='needs_manual_reconciliation';
   entry.reason=/^[a-z_]+$/.test(String(e?.message||''))?e.message:'malotes_result_unknown';
  }
  results.push(entry);
 }
 return {source:'CRM_MALOTES_BATCH',modo,attempted_count:pedidos.length,
  processed_count:results.filter(r=>r.state==='processed').length,
  needs_reconciliation_count:results.filter(r=>r.state!=='processed').length,
  changes_applied:results.some(r=>r.baixa==='ready'),
  printed_physically:false,notification_delivery_verified:false,
  results};
}
