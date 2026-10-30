import test from 'node:test';import assert from 'node:assert/strict';
import {legacyFilters,legacyOrderProjection,legacyReadClient} from '../src/legacy-api-read.mjs';
const raw={id:5001,uuid:'11111111-aaaa-4111-8111-000000000101',status:{id:10,name:'Aguardando Retirar'},customer:{name:'Sample'},items:[],participants:[{name:'DoNotExpose'}],summary:{total:450,received:200,remaining:250}};
test('only established GET search filters accepted',()=>{
 assert.equal(legacyFilters({'product.slug':'natal'}).get('product[slug]'),'natal');
 assert.throws(()=>legacyFilters({'order.status':'invalid'}),/invalid_status/);
 assert.throws(()=>legacyFilters({'admin':'true'}),/filters_not_allowlisted/);
});
test('projection omits participant identity and retains financial centavos',()=>{
 const x=legacyOrderProjection(raw);assert.equal(x.remaining_cents,25000);
 assert.equal(x.participant_count,1);assert.ok(!JSON.stringify(x).includes('DoNotExpose'));
});
test('client uses GET only with restricted endpoint',async()=>{
 const seen=[];const c=legacyReadClient({baseUrl:'https://example.test',token:'SYNTHETIC_TOKEN',fetchFn:async(u,o)=>{
  seen.push({path:u.pathname,method:o.method});return new Response(JSON.stringify([raw]))}});
 const x=await c.search({'product.slug':'natal'});
 assert.equal(x.orders.length,1);assert.deepEqual(seen,[{path:'/api/orders/search',method:'GET'}]);
});
test('invalid JSON and large payloads fail closed',async()=>{
 const c=legacyReadClient({baseUrl:'https://example.test',token:'SYNTHETIC_TOKEN',fetchFn:async()=>new Response('bad json')});
 await assert.rejects(()=>c.search({'product.slug':'natal'}),/invalid_json/);
});
