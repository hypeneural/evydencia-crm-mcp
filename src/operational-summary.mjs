// Operator-side status report from a COMPLETE and fresh legacy order inventory.
// Never mistake a page of 5/200 for the complete company portfolio.
const orderStages={
 order_aborted:'excluded',payment_chargeback:'excluded',order_created:'unconfirmed',
 waiting_payment:'unconfirmed',payment_confirmed:'session_unconfirmed',
 session_schedule:'session_scheduled_unfinished',session_schedule_confirmed:'session_completed',
 selection_schedule:'selection_pending',selection_schedule_confirmed:'selection_completed',
 waiting_product_retrieve:'ready_for_pickup',product_retrieve_confirmed:'delivered',
 order_completed:'completed_unknown_delivery',payment_refunded:'excluded'
};
export function operationalStatusSummary(orders,{complete=false,asOf}={}){
 if(!complete)throw Error('operational_partial_inventory');
 if(!Array.isArray(orders)||orders.length>100000)throw Error('operational_invalid_rows');
 if(typeof asOf!=='string'||!Number.isFinite(Date.parse(asOf)))throw Error('operational_invalid_as_of');
 const seen=new Set();
 const groups=Object.fromEntries([...new Set(Object.values(orderStages))].map(k=>[k,0]));
 let unknown=0;
 for(const order of orders){
  if(!order||typeof order.uuid!=='string'||!order.uuid||seen.has(order.uuid))throw Error('operational_duplicate_or_invalid');
  seen.add(order.uuid);
  const key=order.status_key;
  if(!Object.hasOwn(orderStages,key)){unknown++;continue}
  groups[orderStages[key]]++;
 }
 return {
  source:'CRM_LEGACY_FULL_INVENTORY',as_of:asOf,complete:true,orders_analyzed:orders.length,
  stages:groups,unknown_statuses:unknown,
  waiting_pickup:groups.ready_for_pickup,already_delivered:groups.delivered,
  photo_session_pending_evidence:groups.session_unconfirmed+groups.session_scheduled_unfinished,
  photo_session_pending_exact:null, // needs an independent completed-session proof
  delivery_pending_exact:null, // order_completed status does not prove delivery
  warning:'Contagens de status corrente, NÃO equivalem a sessão ainda por fazer ou entrega não realizada sem conciliação operacional.'
 };
}
