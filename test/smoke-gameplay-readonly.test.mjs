import test from 'node:test';
import assert from 'node:assert/strict';
import {smokeReadOnly} from '../scripts/antigravity/smoke-gameplay-readonly.mjs';

const U='11111111-1111-4111-8111-111111111111';
const env={
 EVYD_GAMEPLAY_SMOKE_AUTHORIZED:'1',EVYD_GAMEPLAY_SMOKE_ORDER_UUID:U,
 EVYD_GAMEPLAY_READ_ENABLED:'1',EVYD_GAMEPLAY_READ_ORIGIN:'http://127.0.0.1:8099',
 EVYD_GAMEPLAY_READ_TOKEN:'t'.repeat(40),
 EVYD_GAMEPLAY_PUBLIC_ORIGIN:'https://jogos.fotosdenatal.com',
};
test('unauthorized smoke never makes a network call',async()=>{
 let calls=0;
 await assert.rejects(smokeReadOnly({env:{...env,EVYD_GAMEPLAY_SMOKE_AUTHORIZED:'0'},
  fetchFn:async()=>{calls++;throw Error('no')}}),/SMOKE_NOT_AUTHORIZED/);
 assert.equal(calls,0);
});
test('read-only smoke requests only metadata and redacts order UUID and family URLs',async()=>{
 let calls=0;
 const result=await smokeReadOnly({env,fetchFn:async(url,opts)=>{
  calls++;
  assert.match(url,/lookup-batch$/);
  assert.equal(opts.method,'POST');
  assert.equal(JSON.parse(opts.body).crm_order_uuids[0],U);
  return new Response(JSON.stringify({schema_version:1,verified_at:'2026-10-26T18:00:00Z',
   results:[{crm_order_uuid:U,state:'published_unverified',
    photo_count:20,ready_blobs:60,
    preparation:{state:'none',revision_id:null,photo_count:null,expected_blobs:0,ready_blobs:0},
    hub_url:null,gallery_url:null,games_runtime_verified:false}]}),{status:200});
 }});
 assert.equal(calls,1);
 assert.equal(result.published_photo_count,20);
 assert.equal(result.preparing_photo_count,null);
 assert.equal(result.browser_games_verified,false);
 assert.equal(result.family_urls_requested,false);
 assert.equal(JSON.stringify(result).includes(U),false);
});
