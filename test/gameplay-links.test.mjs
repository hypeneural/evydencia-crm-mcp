import test from 'node:test';
import assert from 'node:assert/strict';
import {projectGameplayLinks,lookupGameplayWithCustomerLinks} from '../src/gameplay-links.mjs';

const uuid='11111111-1111-4111-8111-111111111111';
const hub='https://jogos.fotosdenatal.com/s/opaque-capability';
const published={crm_order_uuid:uuid,state:'published_unverified',hub_url:hub,gallery_url:hub+'/fotos'};
const without={...published,hub_url:null,gallery_url:null};
test('main and games hub refer to the actual shared Gameplay route',()=>{
 const links=projectGameplayLinks(published);
 assert.equal(links.main_url,hub);
 assert.equal(links.games_url,hub);
 assert.equal(links.gallery_url,hub+'/fotos');
 assert.equal(links.customer_links_status,'available');
 assert.equal(links.links_browser_verified,false);
});
test('private metadata-only 409 returns status with no fabricated links',async()=>{
 const calls=[];
 const client={async lookup(ids,opts){
  calls.push({ids,opts});
  if(opts.includeLinks)throw Error('gameplay_http_409');
  return {results:[without]};
 }};
 const x=await lookupGameplayWithCustomerLinks(client,uuid);
 assert.equal(calls.length,2);
 assert.equal(calls[0].opts.includeLinks,true);
 assert.equal(calls[1].opts.includeLinks,false);
 assert.equal(x.links.main_url,null);
 assert.equal(x.links.games_url,null);
 assert.equal(x.links.gallery_url,null);
 assert.equal(x.links.customer_links_status,'unavailable_http_409');
});
test('authorization and upstream downtime fail closed (no metadata retry)',async()=>{
 for(const code of ['gameplay_http_401','gameplay_http_403','gameplay_http_503','gameplay_unavailable']){
  let calls=0;
  await assert.rejects(lookupGameplayWithCustomerLinks({async lookup(){calls++;throw Error(code)}},uuid),new RegExp(code));
  assert.equal(calls,1);
 }
});
test('mismatched gallery token or revoked link is rejected',()=>{
 assert.throws(()=>projectGameplayLinks({...published,gallery_url:hub+'/other/fotos'}),/gameplay_contract_invalid/);
 assert.throws(()=>projectGameplayLinks({...published,state:'revoked'}),/gameplay_contract_invalid/);
});
test('when published client URLs exist, no second network call',async()=>{
 let calls=0;
 const x=await lookupGameplayWithCustomerLinks({async lookup(){calls++;return {results:[published]}}},uuid);
 assert.equal(calls,1);
 assert.equal(x.links.customer_links_status,'available');
});
test('a metadata retry failing remains an error rather than becoming not_found',async()=>{
 await assert.rejects(lookupGameplayWithCustomerLinks({async lookup(_ids,{includeLinks}){
  if(includeLinks)throw Error('gameplay_http_409');
  throw Error('gameplay_http_503');
 }},uuid),/gameplay_http_503/);
});
