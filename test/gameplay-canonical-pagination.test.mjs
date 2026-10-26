import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyReadClient} from '../src/legacy-api-read.mjs';

const stub=()=>{
 let requests=0;
 const client=legacyReadClient({
  baseUrl:'http://127.0.0.1:8099',
  token:'synthetic-forensic-test-token-123456789',
  includeParticipants:true,
  fetchFn:async()=>{requests++;throw Error('SHOULD_NOT_FETCH')}
 });
 return {client,count:()=>requests};
};
test('Gameplay publication audit refuses client-side legacy pagination',async()=>{
 const {client,count}=stub();
 await assert.rejects(
  client.search({'product.slug':'natal','order.status':'order_completed'},{
   page:1,limit:25,detailLevel:'resumo',canonicalPaginationRequired:true
  }),
  /legacy_read_canonical_pagination_unavailable/
 );
 assert.equal(count(),0,'no legacy list must be read before failing closed');
});
test('Canonical mode only changes opted-in Gameplay queries',async()=>{
 const {client}=stub();
 await assert.rejects(
  client.search({'order.id':12345},{page:1,limit:25,detailLevel:'resumo'}),
  /SHOULD_NOT_FETCH/
 );
});
