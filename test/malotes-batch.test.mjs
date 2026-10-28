import test from 'node:test';
import assert from 'node:assert/strict';
import {processMalotes,requiredMalotesModeScopes} from '../src/malotes-batch.mjs';
const source={order_id:6002,status_event_id:41,status_key:'session_schedule',remaining_cents:0};
const lookupPrint=async()=>({state:'not_requested',job:null,needs_reconciliation:false});
test('status and canonical print are ordered, with a fresh status10 requery',async()=>{
 const stages=[],order={...source};
 const report=await processMalotes({modo:'baixa_e_imprime',
  pedidos:[{order_id:6002,expected_status_event_id:41}],
  load:async()=>{stages.push('read');return {...order}},lookupPrint,
  markReady:async()=>{stages.push('ready');order.status_key='waiting_product_retrieve';order.status_event_id=42;return {state:'ready',status_key:'waiting_product_retrieve'}},
  printLabel:async()=>{stages.push('print');assert.equal(order.status_event_id,42);return {state:'queued',job_id:'synthetic-job'}}
 });
 assert.deepEqual(stages,['read','ready','read','read','print']);
 assert.equal(report.results[0].job_id,'synthetic-job');
 assert.equal(report.results[0].baixa,'ready');
 assert.equal(report.printed_physically,false);
 assert.equal(report.notification_delivery_verified,false);
});
test('write timeout remains pending while the independent authorized label prints once',async()=>{
 let printed=0,calls=0;
 const r=await processMalotes({modo:'baixa_e_imprime',pedidos:[{order_id:6002,expected_status_event_id:41}],
  load:async()=>({...source}),lookupPrint,markReady:async()=>{calls++;throw Error('crm_malotes_result_unknown')},
  printLabel:async()=>{printed++;return {state:'queued',job_id:'synthetic-job'}}});
 assert.equal(printed,1);assert.equal(calls,1);assert.equal(r.needs_reconciliation_count,1);
 assert.equal(r.results[0].baixa,'unknown');assert.equal(r.results[0].impressao,'queued');
});
test('print-only ignores commercial status and outstanding balances without a status write',async()=>{
 let printed=0;
 for(const row of [source,{...source,status_key:'waiting_product_retrieve',remaining_cents:200}]){
  const x=await processMalotes({modo:'so_imprime',pedidos:[{order_id:6002,expected_status_event_id:41}],
   load:async()=>({...row}),lookupPrint,markReady:async()=>{throw Error('must-not-write')},
   printLabel:async()=>{printed++;return {state:'queued',job_id:'synthetic-job'}}});
  assert.equal(x.processed_count,1);assert.equal(x.results[0].baixa,'not_requested');
 }
 assert.equal(printed,2);
});
test('batch rejects duplicate IDs before executing anything',async()=>{
 let count=0;
 await assert.rejects(processMalotes({modo:'so_baixa',pedidos:[{order_id:1,expected_status_event_id:1},{order_id:1,expected_status_event_id:1}],
  load:async()=>{count++}}),/malotes_duplicate_or_invalid_order/);
 assert.equal(count,0);
});

test('mode-scoped permissions never require extra privilege for one-action batches',()=>{
 assert.deepEqual({...requiredMalotesModeScopes('so_baixa')},{requiresReady:true,requiresPrint:false});
 assert.deepEqual({...requiredMalotesModeScopes('so_imprime')},{requiresReady:false,requiresPrint:true});
 assert.deepEqual({...requiredMalotesModeScopes('baixa_e_imprime')},{requiresReady:true,requiresPrint:true});
 assert.throws(()=>requiredMalotesModeScopes('inventado'),/malotes_invalid_batch_mode/);
});

test('print-only batch works with no CRM write capability or status mutation',async()=>{
 let writes=0,prints=0,reads=0;
 const order={order_id:6002,status_event_id:41,status_key:'waiting_product_retrieve',remaining_cents:0};
 const r=await processMalotes({modo:'so_imprime',pedidos:[{order_id:6002,expected_status_event_id:41}],
  load:async()=>{reads++;return {...order}},lookupPrint,
  markReady:async()=>{writes++;throw Error('unexpected_write')},
  printLabel:async()=>{prints++;return {state:'queued',job_id:'synthetic-queue-ref'}}});
 assert.equal(writes,0);assert.equal(prints,1);assert.equal(reads,2);
 assert.equal(r.processed_count,1);assert.equal(r.results[0].baixa,'not_requested');
 assert.equal(r.results[0].impressao,'queued');assert.equal(r.printed_physically,false);
});
test('status-only batch never initializes or invokes printer',async()=>{
 let prints=0;
 const order={...source};
 const r=await processMalotes({modo:'so_baixa',pedidos:[{order_id:6002,expected_status_event_id:41}],
  load:async()=>({...order}),
  markReady:async()=>{order.status_key='waiting_product_retrieve';order.status_event_id=42;
   return {state:'ready',status_key:'waiting_product_retrieve'}},
  printLabel:async()=>{prints++;throw Error('unexpected_print')}});
 assert.equal(prints,0);assert.equal(r.processed_count,1);
 assert.equal(r.results[0].impressao,'not_requested');assert.equal(r.results[0].baixa,'ready');
});
