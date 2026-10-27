import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplayReadClient,gameplayReadConfig,GameplayReadError} from '../src/gameplay-read-client.mjs';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const origin='https://jogos.fotosdenatal.com';
const cfg={origin,secret:'S'.repeat(40),timeoutMs:250};
test('configuration is disabled until explicitly enabled',()=>{
 assert.equal(gameplayReadConfig({}),null);
});
test('invalid origin and missing bearer fail closed',()=>{
 assert.throws(()=>gameplayReadConfig({EVYD_GAMEPLAY_READ_ENABLED:'1',EVYD_GAMEPLAY_READ_ORIGIN:'http://evil.example',EVYD_GAMEPLAY_READ_TOKEN:'x'.repeat(40)}),GameplayReadError);
});
test('batch validates identity and deduplicates requests',async()=>{
 let body;
 const client=createGameplayReadClient(cfg,{fetchFn:async(_url,opts)=>{
  body=JSON.parse(opts.body);
  return new Response(JSON.stringify({schema_version:1,verified_at:'2026-10-26T00:00:00Z',results:[
   {crm_order_uuid:a,state:'not_found',hub_url:null,gallery_url:null},
   {crm_order_uuid:b,state:'not_published',hub_url:null,gallery_url:null}
  ]}),{status:200});
 }});
 const result=await client.lookup([a,a,b]);
 assert.deepEqual(body.crm_order_uuids,[a,b]);
 assert.equal(result.results.length,2);
});
test('cross-origin public capability URLs are rejected',async()=>{
 const client=createGameplayReadClient(cfg,{fetchFn:async()=>new Response(JSON.stringify({
  schema_version:1,results:[{
   crm_order_uuid:a,state:'published_unverified',
   hub_url:'https://attacker.invalid/s/token',gallery_url:null
  }]
 }),{status:200})});
 await assert.rejects(client.lookup([a]),/gameplay_url_invalid/);
});
test('upstream downtime is not converted to not_found',async()=>{
 const client=createGameplayReadClient(cfg,{fetchFn:async()=>{throw Error('down')}});
 await assert.rejects(client.lookup([a]),/gameplay_unavailable/);
});
