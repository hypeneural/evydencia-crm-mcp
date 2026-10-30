import test from 'node:test';
import assert from 'node:assert/strict';
import {currentNatalPickupProjection,classifyPickupStatus} from '../src/order-readiness.mjs';
const matched=(status='waiting_product_retrieve')=>({
 lookup:{status:'matched'},current_order:{uuid:'11111111-aaaa-4111-8111-000000000101',
  status:{code:status,label:'Etiqueta'},package_name:'Então é Natal',session_at:'2026-10-25T10:00:00-03:00'},
 orders:[{uuid:'22222222-bbbb-4222-8222-000000000102',status:'order_completed'}]
});
test('pedido atual aguardando retirada é único estado positivo',()=>{
 const r=currentNatalPickupProjection(matched());assert.equal(r.pickup_state,'READY_FOR_PICKUP');
 assert.equal(r.ready_for_pickup,true);assert.equal(r.order_scope,'CURRENT_NATAL_OPERATIONAL');
 assert.ok(!JSON.stringify(r).includes('orders'));
});
test('pedido entregue não é sinalizado como disponível para retirada',()=>{
 const r=currentNatalPickupProjection(matched('product_retrieve_confirmed'));
 assert.equal(r.pickup_state,'COLLECTED');assert.equal(r.ready_for_pickup,false);
});
test('pedido concluído, desconhecido ou sem status não viram fotos prontas',()=>{
 for(const code of ['order_completed','status_inventado']){
  const r=currentNatalPickupProjection(matched(code));
  assert.equal(r.pickup_state,'UNKNOWN');assert.equal(r.ready_for_pickup,null);
 }
 assert.throws(()=>currentNatalPickupProjection({lookup:{status:'matched'},current_order:{uuid:'id'}}),/order_status_unavailable/);
});
test('ambiguidade, cliente não localizado e último histórico sem pedido ativo',()=>{
 const a=currentNatalPickupProjection({lookup:{status:'ambiguous'}});
 assert.equal(a.pickup_state,'NOT_DETERMINED');assert.equal(a.ready_for_pickup,null);
 const b=currentNatalPickupProjection({lookup:{status:'not_found'}});
 assert.equal(b.pickup_state,'NOT_DETERMINED');
 const c=currentNatalPickupProjection({lookup:{status:'matched'},current_order:null,orders:[{status:'waiting_product_retrieve'}]});
 assert.equal(c.pickup_state,'ORDER_NOT_RESOLVED');assert.equal(c.ready_for_pickup,null);
});
test('pagamento, agendamento e sessões concluídas ainda não comprovam retirada',()=>{
 for(const code of ['payment_confirmed','session_schedule','session_schedule_confirmed','selection_schedule_confirmed']){
  assert.equal(classifyPickupStatus(code).pickup_state,'NOT_YET_READY');
 }
 for(const code of ['order_aborted','payment_chargeback','payment_refunded']){
  assert.equal(classifyPickupStatus(code).pickup_state,'TERMINAL_EXCEPTION');
 }
});
