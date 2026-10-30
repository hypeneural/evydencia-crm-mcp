import test from 'node:test';
import assert from 'node:assert/strict';
import {paginatePublishedFamilies} from '../src/gameplay-family-inventory.mjs';

const rows=[
 {order_id:101,order_uuid:'11111111-aaaa-4111-8111-111111111111',status_key:'order_aborted'},
 {order_id:102,order_uuid:'22222222-bbbb-4222-8222-222222222222',status_key:'waiting_product_retrieve'},
 {order_id:103,order_uuid:'33333333-cccc-4333-8333-333333333333',status_key:'order_completed'},
 {order_id:104,order_uuid:'44444444-dddd-4444-8444-444444444444',status_key:'order_aborted'},
];
const map=new Map([
 [rows[0].order_uuid,{crm_order_uuid:rows[0].order_uuid,state:'published_unverified'}],
 [rows[1].order_uuid,{crm_order_uuid:rows[1].order_uuid,state:'published_unverified'}],
 [rows[2].order_uuid,{crm_order_uuid:rows[2].order_uuid,state:'revoked'}],
 [rows[3].order_uuid,{crm_order_uuid:rows[3].order_uuid,state:'published_unverified'}],
]);
test('operator inventory includes published cancelled orders, excludes revoked and sorts newest first',()=>{
 const result=paginatePublishedFamilies(rows,map,{pagina:1,por_pagina:50});
 assert.deepEqual(result.orders.map(x=>x.order_id),[104,102,101]);
 assert.equal(result.total,3);
 assert.equal(result.pagination.has_more,false);
});

test('all published families can be paged without truncating inventory',()=>{
 const first=paginatePublishedFamilies(rows,map,{pagina:1,por_pagina:2});
 const second=paginatePublishedFamilies(rows,map,{pagina:2,por_pagina:2});
 assert.deepEqual(first.orders.map(x=>x.order_id),[104,102]);
 assert.deepEqual(second.orders.map(x=>x.order_id),[101]);
 assert.equal(first.pagination.total_matching,3);
 assert.equal(first.pagination.has_more,true);
 assert.equal(second.pagination.has_more,false);
});

test('missing or mismatched reader metadata cannot be classified as no gallery',()=>{
 const missing=new Map(map);missing.delete(rows[0].order_uuid);
 assert.throws(()=>paginatePublishedFamilies(rows,missing,{pagina:1,por_pagina:25}),
  /gameplay_contract_invalid/);
 const mismatch=new Map(map);
 mismatch.set(rows[0].order_uuid,{crm_order_uuid:rows[2].order_uuid,state:'published_unverified'});
 assert.throws(()=>paginatePublishedFamilies(rows,mismatch,{pagina:1,por_pagina:25}),
  /gameplay_contract_invalid/);
});

test('invalid request pagination fails closed',()=>{
 for(const value of [0,-1,1.2,51,Infinity]){
  assert.throws(()=>paginatePublishedFamilies(rows,map,{pagina:1,por_pagina:value}),
   /gameplay_contract_invalid/);
 }
});
