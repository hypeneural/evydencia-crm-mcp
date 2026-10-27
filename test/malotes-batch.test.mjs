import test from 'node:test';
import assert from 'node:assert/strict';
import {processMalotes} from '../src/malotes-batch.mjs';
const source={order_id:6002,status_event_id:41,status_key:'session_schedule',remaining_cents:0};
test('status and canonical print are ordered, with a fresh status10 requery',async()=>{
 const stages=[],order={...source};
 const report=await processMalotes({modo:'baixa_e_imprime',
  pedidos:[{order_id:6002,expected_status_event_id:41}],
  load:async()=>{stages.push('read');return {...order}},
  markReady:async()=>{stages.push('ready');order.status_key='waiting_product_retrieve';order.status_event_id=42;return {state:'ready',status_key:'waiting_product_retrieve'}},
  printLabel:async()=>{stages.push('print');assert.equal(order.status_event_id,42);return {state:'queued',job_id:'synthetic-job'}}
 });
 assert.deepEqual(stages,['read','ready','read','print','read']);
 assert.equal(report.results[0].job_id,'synthetic-job');
 assert.equal(report.results[0].baixa,'ready');
 assert.equal(report.printed_physically,false);
 assert.equal(report.notification_delivery_verified,false);
});
test('write timeout cannot trigger print, retry or a fake success',async()=>{
 let printed=0,calls=0;
 const r=await processMalotes({modo:'baixa_e_imprime',pedidos:[{order_id:6002,expected_status_event_id:41}],
  load:async()=>({...source}),markReady:async()=>{calls++;throw Error('crm_malotes_result_unknown')},
  printLabel:async()=>{printed++}});
 assert.equal(printed,0);assert.equal(calls,1);assert.equal(r.needs_reconciliation_count,1);
});
test('print-only refuses status6 or outstanding balances',async()=>{
 let printed=0;
 for(const row of [source,{...source,status_key:'waiting_product_retrieve',remaining_cents:200}]){
  const x=await processMalotes({modo:'so_imprime',pedidos:[{order_id:6002,expected_status_event_id:41}],
   load:async()=>({...row}),markReady:async()=>{throw Error('must-not-write')},
   printLabel:async()=>{printed++}});
  assert.equal(x.needs_reconciliation_count,1);
 }
 assert.equal(printed,0);
});
test('batch rejects duplicate IDs before executing anything',async()=>{
 let count=0;
 await assert.rejects(processMalotes({modo:'so_baixa',pedidos:[{order_id:1,expected_status_event_id:1},{order_id:1,expected_status_event_id:1}],
  load:async()=>{count++}}),/malotes_duplicate_or_invalid_order/);
 assert.equal(count,0);
});
