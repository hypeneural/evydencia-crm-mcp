// Pure interpretation of the existing sanitized Customer360/current_order projection.
// Does NOT query a database or expose a tool. No unauthorized lookup by name/phone.
const statusKeys=new Set(['waiting_product_retrieve','product_retrieve_confirmed',
 'order_completed','session_schedule','session_schedule_confirmed',
 'selection_schedule','selection_schedule_confirmed','payment_confirmed',
 'waiting_payment','order_created','order_aborted','payment_chargeback','payment_refunded']);
const summary=(item)=>({
 order_uuid:typeof item?.uuid==='string'?item.uuid:null,
 package_name:typeof item?.package_name==='string'?item.package_name:null,
 status_code:typeof item?.status?.code==='string'?item.status.code:
   (typeof item?.status==='string'?item.status:null),
 status_label:typeof item?.status?.label==='string'?item.status.label:
   (typeof item?.status_label==='string'?item.status_label:null),
 session_at:item?.session_at??item?.session_date??null
});
export function classifyPickupStatus(code){
 if(code==='waiting_product_retrieve')return {pickup_state:'READY_FOR_PICKUP',ready_for_pickup:true,already_collected:false,
  explanation:'Pedido na etapa Aguardando Retirar; confirme identidade e unidade antes da entrega.'};
 if(code==='product_retrieve_confirmed')return {pickup_state:'COLLECTED',ready_for_pickup:false,already_collected:true,
  explanation:'CRM informa Entrega Realizada; não oferecer nova retirada.'};
 if(code==='order_aborted'||code==='payment_refunded'||code==='payment_chargeback')
  return {pickup_state:'TERMINAL_EXCEPTION',ready_for_pickup:false,already_collected:false,
   explanation:'Pedido cancelado ou estornado; não presumir disponibilidade.'};
 if(!statusKeys.has(code)||code==='order_completed')
  return {pickup_state:'UNKNOWN',ready_for_pickup:null,already_collected:null,
   explanation:'Status não confirma disponibilidade nem prova de retirada.'};
 return {pickup_state:'NOT_YET_READY',ready_for_pickup:false,already_collected:false,
  explanation:'Etapa de pedido ainda não indica fotos prontas para retirada.'};
}
export function currentNatalPickupProjection(projection){
 if(!projection||typeof projection!=='object'||!projection.lookup ||
   !['matched','not_found','ambiguous'].includes(projection.lookup.status))
  throw Error('customer_contract_invalid');
 const status=projection.lookup.status;
 if(status!=='matched')return {lookup_status:status,pickup_state:'NOT_DETERMINED',ready_for_pickup:null,
  warning:status==='ambiguous'?'Há múltiplos clientes; confirme o telefone cadastrado.':'Cliente não identificado; não afirmar que não existe pedido.'};
 const item=projection.current_order;
 if(!item||typeof item.uuid!=='string'||!item.uuid)
  return {lookup_status:status,pickup_state:'ORDER_NOT_RESOLVED',ready_for_pickup:null,
   warning:'Não há pedido operacional de Natal identificado; o último pedido histórico não deve ser usado como substituto automático.'};
 const obj=summary(item);
 if(!obj.status_code)throw Error('order_status_unavailable');
 const result=classifyPickupStatus(obj.status_code);
 return {lookup_status:'matched',order_scope:'CURRENT_NATAL_OPERATIONAL',
  ...obj,...result,warning:'Resultado do status do pedido operacional de Natal; não representa automaticamente o pedido mais recente por criação.'};
}
