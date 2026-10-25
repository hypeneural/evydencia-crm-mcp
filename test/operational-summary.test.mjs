import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalStatusSummary} from '../src/operational-summary.mjs';
const x=(id,status_key)=>({uuid:id,status_key});
test('sem inventário completo não publica contagens da empresa',()=>{
 assert.throws(()=>operationalStatusSummary([x('1','waiting_product_retrieve')],{asOf:new Date().toISOString()}),/partial_inventory/);
});
test('status 10 aguardando retirada; status 11 entregue; status 12 sem prova',()=>{
 const r=operationalStatusSummary([x('1','waiting_product_retrieve'),x('2','product_retrieve_confirmed'),x('3','order_completed'),x('4','session_schedule')],{complete:true,asOf:'2026-10-25T11:00:00-03:00'});
 assert.equal(r.waiting_pickup,1);assert.equal(r.already_delivered,1);
 assert.equal(r.photo_session_pending_exact,null);
 assert.equal(r.delivery_pending_exact,null);
 assert.equal(r.photo_session_pending_evidence,1);
 assert.equal(r.stages.completed_unknown_delivery,1);
});
test('invalida duplicidade para evitar contagem em duas páginas',()=>{
 assert.throws(()=>operationalStatusSummary([x('1','waiting_product_retrieve'),x('1','waiting_product_retrieve')],{complete:true,asOf:'2026-10-25T10:00:00Z'}),/duplicate/);
});
