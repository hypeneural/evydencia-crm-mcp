import test from 'node:test';
import assert from 'node:assert/strict';
import {processMalotes,requiredMalotesModeScopes} from '../src/malotes-batch.mjs';
import {printserverClient} from '../src/printserver-client.mjs';

const row=(id=7001)=>({order_id:id,status_event_id:id+100,status_key:'session_schedule',remaining_cents:900});
const emptyReceipt=async()=>({state:'not_requested',job:null,needs_reconciliation:false});
const pending=[{order_id:7001,expected_status_event_id:7101}];

test('a canonical committed status/event remains proven when its subsequent refresh times out',async()=>{
 let reads=0;
 const r=await processMalotes({modo:'so_baixa',pedidos:pending,
  load:async()=>{if(reads++)throw Error('crm_timeout');return {...row(),remaining_cents:0}},
  markReady:async()=>({state:'ready',status_key:'waiting_product_retrieve',status_event_id:7102})});
 assert.equal(r.results[0].baixa,'ready');assert.equal(r.results[0].status_event_id,7102);
 assert.equal(r.results[0].baixa_refresh_verified,false);assert.equal(r.changes_applied,true);
});

test('HTML authentication denial from broker halts all later commercial writes',async()=>{
 let writes=0;
 const broker=printserverClient({enabled:true,origin:'https://printer.example.test',token:'x'.repeat(48)},
  {fetchFn:async()=>new Response('<html>Forbidden</html>',{status:403})});
 const r=await processMalotes({modo:'misto',pedidos:[{order_id:7001,modo:'so_imprime'},
  {order_id:7002,modo:'so_baixa',expected_status_event_id:7102}],
  load:async id=>({...row(id),remaining_cents:0}),lookupPrint:id=>broker.lookupOrder(id),
  markReady:async()=>{writes++}});
 assert.equal(r.halted,true);assert.equal(writes,0);assert.equal(r.results[1].state,'not_attempted');
});

test('print-only accepts every identified commercial state and never calls status write',async()=>{
 for(const status_key of ['session_schedule','selection_schedule','order_aborted','chargeback','order_completed',null]){
  let writes=0,prints=0;
  const r=await processMalotes({modo:'so_imprime',pedidos:[{order_id:7001}],
   load:async()=>({...row(),status_key,remaining_cents:null}),lookupPrint:emptyReceipt,
   markReady:async()=>{writes++;throw Error('unexpected_write')},
   printLabel:async({order})=>{prints++;assert.equal(order.status_key,status_key);return {state:'queued',job_id:'synthetic-job'}}});
  assert.equal(writes,0);assert.equal(prints,1);assert.equal(r.processed_count,1);
 }
});

test('both actions keep a rejected financial status pending and still print',async()=>{
 let writes=0,prints=0;
 const r=await processMalotes({modo:'baixa_e_imprime',pedidos:pending,load:async()=>row(),lookupPrint:emptyReceipt,
  markReady:async()=>{writes++;throw Error('crm_malotes_financial_not_verified')},
  printLabel:async()=>{prints++;return {state:'queued',job_id:'job-one'}}});
 assert.equal(prints,1);assert.equal(writes,0,'known open balance must not invoke commercial endpoint');
 assert.equal(r.results[0].baixa,'blocked');assert.equal(r.results[0].impressao,'queued');
 assert.equal(r.results[0].baixa_reason,'crm_malotes_financial_not_verified');
 assert.equal(r.results[0].state,'needs_manual_reconciliation');
});

test('mixed batch scopes are the union of actual requested actions',()=>{
 assert.deepEqual(requiredMalotesModeScopes('misto',[{modo:'so_imprime'}]),{requiresReady:false,requiresPrint:true});
 assert.deepEqual(requiredMalotesModeScopes('misto',[{modo:'so_imprime'},{modo:'so_baixa'}]),{requiresReady:true,requiresPrint:true});
 assert.throws(()=>requiredMalotesModeScopes('misto',[{}]),/malotes_invalid_batch_mode/);
});

test('mixed batch continues per action and rejects malformed last item before any effects',async()=>{
 let reads=0;
 await assert.rejects(processMalotes({modo:'misto',pedidos:[{order_id:7001,modo:'so_imprime'},{order_id:7002,modo:'so_baixa'}],
  load:async()=>{reads++}}),/malotes_duplicate_or_invalid_order/);
 assert.equal(reads,0);
 const rows=new Map([[7001,{...row(),remaining_cents:0}],[7002,{...row(7002),status_key:'order_aborted'}]]);
 const calls=[];
 const r=await processMalotes({modo:'misto',pedidos:[{order_id:7001,expected_status_event_id:7101,modo:'so_baixa'},{order_id:7002,modo:'so_imprime'}],
  load:async id=>({...rows.get(id)}),lookupPrint:emptyReceipt,
  markReady:async({order_id})=>{calls.push('ready:'+order_id);rows.get(order_id).status_key='waiting_product_retrieve';rows.get(order_id).status_event_id++;return {state:'ready',status_key:'waiting_product_retrieve',status_event_id:7102}},
  printLabel:async({order_id})=>{calls.push('print:'+order_id);return {state:'queued',job_id:'job-two'}}});
 assert.deepEqual(calls,['ready:7001','print:7002']);assert.equal(r.processed_count,2);
});

test('completion after print-first does only the missing status and preserves receipt',async()=>{
 const order={...row(),remaining_cents:0};let writes=0,prints=0;
 const receipt={state:'spooled',needs_reconciliation:false,job:{job_id:'prior-job',order_id:7001,state:'spooled'}};
 const r=await processMalotes({modo:'baixa_e_imprime',pedidos:pending,load:async()=>({...order}),lookupPrint:async()=>receipt,
  markReady:async()=>{writes++;order.status_key='waiting_product_retrieve';order.status_event_id++;return {state:'ready',status_key:order.status_key,status_event_id:order.status_event_id}},
  printLabel:async()=>{prints++;throw Error('must_not_repeat')}});
 assert.equal(writes,1);assert.equal(prints,0);assert.equal(r.results[0].impressao_replay,true);
 assert.equal(r.results[0].job_id,'prior-job');assert.equal(r.processed_count,1);
});

test('already-completed order reconciles stale preview without repeating either action',async()=>{
 let writes=0,prints=0;
 const r=await processMalotes({modo:'baixa_e_imprime',pedidos:pending,
  load:async()=>({...row(),status_key:'waiting_product_retrieve',status_event_id:9999,remaining_cents:0}),
  lookupPrint:async()=>({state:'spooled',needs_reconciliation:false,job:{job_id:'old-job',order_id:7001,state:'spooled'}}),
  markReady:async()=>{writes++},printLabel:async()=>{prints++}});
 assert.equal(writes,0);assert.equal(prints,0);assert.equal(r.results[0].baixa,'already_ready');
 assert.equal(r.results[0].status_event_id,9999);assert.equal(r.changes_applied,false);
});

test('unknown or legacy tombstone is never interpreted as a missing label',async()=>{
 for(const state of ['unknown','failed','expired','not_verified']){
  let prints=0;
  const r=await processMalotes({modo:'so_imprime',pedidos:[{order_id:7001}],load:async()=>row(),
   lookupPrint:async()=>({state,job:null,needs_reconciliation:true}),printLabel:async()=>{prints++}});
  assert.equal(prints,0);assert.equal(r.results[0].impressao_reason,'printserver_manual_reconciliation_required');
 }
});

test('ready timeout is reconciled through fresh persisted status, never by another POST',async()=>{
 const order={...row(),remaining_cents:0};let writes=0,prints=0;
 const r=await processMalotes({modo:'baixa_e_imprime',pedidos:pending,load:async()=>({...order}),lookupPrint:emptyReceipt,
  markReady:async()=>{writes++;order.status_key='waiting_product_retrieve';order.status_event_id++;throw Error('crm_malotes_result_unknown')},
  printLabel:async()=>{prints++;return {state:'queued',job_id:'after-timeout'}}});
 assert.equal(writes,1);assert.equal(prints,1);assert.equal(r.results[0].baixa,'already_ready');
 assert.equal(r.results[0].baixa_reconciled,true);assert.equal(r.changes_applied,false);
});

test('global authentication failure halts later items, without further reads or writes',async()=>{
 let reads=0,prints=0;
 const r=await processMalotes({modo:'so_imprime',pedidos:[{order_id:7001},{order_id:7002}],
  load:async()=>{reads++;throw Error('operator_token_revoked')},lookupPrint:emptyReceipt,printLabel:async()=>{prints++}});
 assert.equal(reads,1);assert.equal(prints,0);assert.equal(r.results[1].state,'not_attempted');
 assert.equal(r.halted,true);
});

test('receipt lookup is a bounded authenticated GET and fails closed on mismatch',async()=>{
 const calls=[];
 const api=printserverClient({enabled:true,origin:'https://printer.invalid',token:'s'.repeat(48)},{fetchFn:async(url,options)=>{
  calls.push({url,method:options.method});
  return new Response(JSON.stringify({order_id:7001,state:'not_requested',job:null,needs_reconciliation:false}),{status:200});
 }});
 const r=await api.lookupOrder(7001);assert.equal(r.state,'not_requested');
 assert.deepEqual(calls,[{url:'https://printer.invalid/v1/orders/7001/label-job',method:'GET'}]);
 await assert.rejects(api.lookupOrder(7002),/printserver_receipt_invalid/);
 await assert.rejects(api.lookupOrder('../jobs'),/printserver_invalid_order_id/);
});
