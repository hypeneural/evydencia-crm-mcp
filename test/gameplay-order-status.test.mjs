import test from 'node:test';
import assert from 'node:assert/strict';
import {gameplayOrderStatus,gameplayOrderSelectionRequired} from '../src/gameplay-order-status.mjs';

const U='11111111-1111-4111-8111-111111111111';
const order=(status_key,status_id=10)=>({order_uuid:U,status_key,status_id,package_name:'Então é Natal'});
const gp=(state,preparation={state:'none',revision_id:null,photo_count:null,expected_blobs:0,ready_blobs:0})=>({
 crm_order_uuid:U,state,photo_count:state==='published_unverified'?20:0,
 ready_blobs:state==='published_unverified'?60:0,preparation
});
test('current CRM status 10 and uncreated Gameplay means a publication requirement, not zero original photos',()=>{
 const result=gameplayOrderStatus(order('waiting_product_retrieve'),gp('not_found'));
 assert.equal(result.publication_required_by_crm,true);
 assert.equal(result.publication_pending,true);
 assert.equal(result.digital_experience_status,'no_gameplay_session');
 assert.equal(result.published_photo_count,0);
 assert.equal(result.preparing_photo_count,null);
 assert.equal(result.individual_games_verified,false);
});
test('staged photos are counted separately and do not imply playable game',()=>{
 const stage={state:'staged',revision_id:'22222222-2222-4222-8222-222222222222',
  photo_count:35,expected_blobs:105,ready_blobs:51};
 const result=gameplayOrderStatus(order('order_completed',12),gp('not_published',stage));
 assert.equal(result.digital_experience_status,'album_in_preparation');
 assert.equal(result.published_photo_count,0);
 assert.equal(result.preparing_photo_count,35);
 assert.equal(result.preparing_variants_ready,51);
 assert.equal(result.publication_pending,true);
});
test('published 20 photos is metadata-ready, never proof of all runtime games',()=>{
 const result=gameplayOrderStatus(order('order_completed',12),gp('published_unverified'));
 assert.equal(result.digital_experience_status,'album_published_runtime_unverified');
 assert.equal(result.published_photo_count,20);
 assert.equal(result.published_variants_ready,60);
 assert.equal(result.publication_pending,false);
 assert.equal(result.browser_runtime_verified,false);
});
test('CRM status 11 must not create operational publication demand',()=>{
 const result=gameplayOrderStatus(order('product_retrieve_confirmed',11),gp('not_found'));
 assert.equal(result.publication_required_by_crm,false);
 assert.equal(result.publication_pending,false);
});
test('early CRM statuses do not create false operational alerts',()=>{
 const result=gameplayOrderStatus(order('waiting_payment',4),gp('not_found'));
 assert.equal(result.publication_pending,false);
 assert.equal(result.crm_status_id,4);
});
test('incomplete active revision photos are not counted as published or playable',()=>{
 const row={...gp('partial'),photo_count:25,ready_blobs:15};
 const result=gameplayOrderStatus(order('order_completed',12),row);
 assert.equal(result.active_revision_manifest_photo_count,25);
 assert.equal(result.published_photo_count,0);
 assert.equal(result.publication_pending,true);
 assert.equal(result.digital_experience_status,'publication_incomplete');
});
test('invalid preparation is an explicit anomaly, never a published photo',()=>{
 const result=gameplayOrderStatus(order('order_completed',12),gp('not_published',{
  state:'invalid',revision_id:'33333333-3333-4333-8333-333333333333',
  photo_count:null,expected_blobs:0,ready_blobs:0}));
 assert.equal(result.digital_experience_status,'preparation_invalid');
 assert.equal(result.preparing_photo_count,null);
});
test('missing or unrecognized Gameplay state must not be silently considered published',()=>{
 assert.throws(()=>gameplayOrderStatus(order('order_completed',12),null),/gameplay_status_contract_invalid/);
 assert.throws(()=>gameplayOrderStatus(order('order_completed',12),gp('made_up')),/gameplay_status_contract_invalid/);
});

test('customer-name lookup requires explicit order selection even with exactly one match',()=>{
 assert.equal(gameplayOrderSelectionRequired({nome_cliente:'Nome Sintetico',orders_count:1}),true);
 assert.equal(gameplayOrderSelectionRequired({nome_cliente:'Nome Sintetico',orders_count:2}),true);
 assert.equal(gameplayOrderSelectionRequired({nome_cliente:'Nome Sintetico',orders_count:0}),true);
 assert.equal(gameplayOrderSelectionRequired({nome_cliente:undefined,orders_count:1}),false);
 assert.equal(gameplayOrderSelectionRequired({nome_cliente:undefined,orders_count:11}),true);
 assert.throws(()=>gameplayOrderSelectionRequired({nome_cliente:'A',orders_count:NaN}),
  /gameplay_selection_contract_invalid/);
});
