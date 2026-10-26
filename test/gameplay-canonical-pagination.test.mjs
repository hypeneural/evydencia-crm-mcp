import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyReadClient} from '../src/legacy-api-read.mjs';

const U=[
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',
];
const row=(n)=>({
 id:7200+n,uuid:U[n],created_at:'2026-10-26T12:00:00Z',
 status:{id:12,name:'Pedido Concluído'}, // real Laravel resource has no status.key
 customer:{name:'Cliente Sintetico '+n},items:[],installments:[]
});
const clientWith=fetchFn=>legacyReadClient({
 baseUrl:'http://127.0.0.1:8099',
 token:'synthetic-forensic-test-token-123456789',
 includeParticipants:true,fetchFn
});
const filters={'product.slug':'natal','order.status':'order_completed'};
const opts={page:1,limit:25,detailLevel:'resumo',canonicalPaginationRequired:true};
test('Laravel meta proves canonical server-side pages without PHP bridge',async()=>{
 const queried=[];
 const client=clientWith(async input=>{
  const url=new URL(input);
  const page=Number(url.searchParams.get('page'));
  queried.push(page);
  assert.equal(url.pathname,'/api/orders/search');
  assert.equal(url.searchParams.get('product[slug]'),'natal');
  assert.equal(url.searchParams.get('order[status]'),'order_completed');
  const rows=page===1?[row(0),row(1)]:[row(2)];
  return new Response(JSON.stringify({
   data:rows,meta:{current_page:page,per_page:2,total:3,last_page:2},
   links:{next:page===1?'https://example.test/page=2':null}
  }),{status:200});
 });
 const one=await client.search(filters,opts);
 const two=await client.search(filters,{...opts,page:2});
 assert.deepEqual(queried,[1,2]);
 assert.equal(one.source,'CRM_API_SERVER_PAGINATED');
 assert.equal(one.orders.length,2);
 assert.equal(one.orders[0].status_key,'order_completed');
 assert.equal(one.pagination.has_more,true);
 assert.equal(two.orders.length,1);
 assert.equal(two.orders[0].order_uuid,U[2]);
 assert.equal(two.pagination.has_more,false);
});
test('Laravel status 11 stays ineligible even when returned by the server',async()=>{
 const original=row(0);
 original.status={id:11,name:'Entrega Realizada'};
 const client=clientWith(async()=>new Response(JSON.stringify({
  data:[original],meta:{current_page:1,per_page:1,total:1,last_page:1}
 }),{status:200}));
 const result=await client.search(filters,opts);
 assert.equal(result.orders[0].status_key,'product_retrieve_confirmed');
 assert.notEqual(result.orders[0].status_key,'order_completed');
});
test('canonical fallback refuses unpaged Laravel response',async()=>{
 const client=clientWith(async()=>new Response(JSON.stringify({data:[row(0)]}),{status:200}));
 await assert.rejects(client.search(filters,opts),/legacy_read_canonical_pagination_unavailable/);
});
test('canonical fallback rejects forged page totals and missing rows',async()=>{
 const client=clientWith(async()=>new Response(JSON.stringify({
  data:[row(0)],meta:{current_page:1,per_page:2,total:3,last_page:2}
 }),{status:200}));
 await assert.rejects(client.search(filters,opts),/legacy_read_canonical_pagination_unavailable/);
});
test('null total is rejected rather than silently interpreted as zero',async()=>{
 const client=clientWith(async()=>new Response(JSON.stringify({
  data:[],meta:{current_page:1,per_page:200,total:null,last_page:1}
 }),{status:200}));
 await assert.rejects(client.search(filters,opts),/legacy_read_canonical_pagination_unavailable/);
});
test('regular non-canonical search keeps existing behavior',async()=>{
 const client=clientWith(async()=>{throw Error('SYNTHETIC_NETWORK_STOP')});
 await assert.rejects(client.search({'order.id':12345},{page:1,limit:25,detailLevel:'resumo'}),/SYNTHETIC_NETWORK_STOP/);
});
