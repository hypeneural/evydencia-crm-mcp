import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplayReadClient,gameplayReadConfig} from '../src/gameplay-read-client.mjs';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const cfg={origin:'https://gameplay-private.example',publicOrigin:'https://jogos.fotosdenatal.com',secret:'x'.repeat(40),timeoutMs:1000};
const payload=results=>new Response(JSON.stringify({schema_version:1,verified_at:'2026-10-26T16:00:00Z',results}),{status:200});

test('batch status never requests family capability URLs',async()=>{
 let path,body;
 const c=createGameplayReadClient(cfg,{fetchFn:async(u,opt)=>{path=u;body=JSON.parse(opt.body);return payload([
  {crm_order_uuid:a,state:'published_unverified',hub_url:null,gallery_url:null},
  {crm_order_uuid:b,state:'not_found',hub_url:null,gallery_url:null}]);
 }});
 const z=await c.lookup([a,b]);
 assert.equal(z.results.length,2);
 assert.match(path,/lookup-batch$/);
 assert.equal(z.results[0].hub_url,null);
 assert.deepEqual(body.crm_order_uuids,[a,b]);
});
test('single link endpoint accepts pinned public origin distinct from private backend',async()=>{
 let path,body;
 const c=createGameplayReadClient(cfg,{fetchFn:async(u,opt)=>{path=u;body=JSON.parse(opt.body);return payload([
  {crm_order_uuid:a,state:'published_unverified',hub_url:'https://jogos.fotosdenatal.com/s/ABCd0123',
   gallery_url:'https://jogos.fotosdenatal.com/s/ABCd0123/fotos'}]);}});
 const z=await c.lookup([a],{includeLinks:true});
 assert.match(path,/sessions\/lookup$/);
 assert.equal(body.include_links,true);
 assert.match(z.results[0].hub_url,/ABCd0123/);
});
test('batch rejects accidental secret capability URL leaks',async()=>{
 const c=createGameplayReadClient(cfg,{fetchFn:async()=>payload([
  {crm_order_uuid:a,state:'published_unverified',hub_url:'https://jogos.fotosdenatal.com/s/ABC',
   gallery_url:'https://jogos.fotosdenatal.com/s/ABC/fotos'}])});
 await assert.rejects(c.lookup([a]),/gameplay_contract_invalid/);
});
test('single rejects a gallery URL belonging to another token',async()=>{
 const c=createGameplayReadClient(cfg,{fetchFn:async()=>payload([
  {crm_order_uuid:a,state:'published_unverified',hub_url:'https://jogos.fotosdenatal.com/s/ABC',
   gallery_url:'https://jogos.fotosdenatal.com/s/ANOTHER/fotos'}])});
 await assert.rejects(c.lookup([a],{includeLinks:true}),/gameplay_contract_invalid/);
});
test('oversized stream with dishonest content-length is rejected',async()=>{
 const c=createGameplayReadClient(cfg,{fetchFn:async()=>new Response(' '.repeat(70000),{status:200,headers:{'content-length':'2'}})});
 await assert.rejects(c.lookup([a]),/gameplay_response_oversized/);
});
test('configuration refuses insecure origin or weak secret',()=>{
 assert.throws(()=>gameplayReadConfig({EVYD_GAMEPLAY_READ_ENABLED:'1',
  EVYD_GAMEPLAY_READ_ORIGIN:'http://evil.invalid',EVYD_GAMEPLAY_READ_TOKEN:'x'.repeat(40)}));
 assert.throws(()=>gameplayReadConfig({EVYD_GAMEPLAY_READ_ENABLED:'1',
  EVYD_GAMEPLAY_READ_ORIGIN:'https://gameplay.invalid',EVYD_GAMEPLAY_READ_TOKEN:'weak'}));
});
test('many-order capability URL reads are blocked before network',async()=>{
 const c=createGameplayReadClient(cfg,{fetchFn:async()=>{throw Error('No network expected')}});
 await assert.rejects(c.lookup([a,b],{includeLinks:true}),/gameplay_links_requires_single_order/);
});
