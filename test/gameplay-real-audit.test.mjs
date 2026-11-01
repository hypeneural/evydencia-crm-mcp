import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRealOrderGameplay} from '../src/gameplay-real-audit.mjs';
import {runRealReadOnlyAudit} from '../scripts/antigravity/audit-real-crm-gameplay.mjs';

const U1='11111111-1111-4111-8111-111111111111';
const U2='22222222-2222-4222-8222-222222222222';
const resultFor=(uuid,status,id,n)=>({
 order_id:n,order_uuid:uuid,status_id:id,status_key:status,created_at_brt:'2026-10-26 12:00:00'
});
const objects=[
 resultFor(U1,'waiting_product_retrieve',10,7001),
 resultFor(U2,'order_completed',12,7002)
];
function crmStub({drift=false,badPage=false,duplicate=false}={}){
 const calls={pickup:0,complete:0};
 return {search:async f=>{
  const status=f['order.status'],id=status==='waiting_product_retrieve'?10:12;
  const key=id===10?'pickup':'complete';calls[key]++;
  const base=objects.filter(o=>o.status_id===id);
  const orders=drift&&id===12&&calls[key]>1
   ?[]:duplicate&&id===12?[objects[0]]:base;
  return {
   source:'CRM_FORENSIC_READ_ONLY_BRIDGE',
   pagination:{page:1,returned_count:orders.length,
    total_matching_orders:badPage?orders.length+1:orders.length,has_more:false},
   orders
  };
 }};
}
const gameplayStub={
 lookup:async ids=>({results:ids.map(id=>id===U1?{
  crm_order_uuid:id,state:'not_published',photo_count:0,expected_blobs:0,
  ready_blobs:0,games_runtime_verified:false,hub_url:null,gallery_url:null,
  preparation:{state:'staged',revision_id:'33333333-3333-4333-8333-333333333333',
   photo_count:20,expected_blobs:60,ready_blobs:36}
 }:{
  crm_order_uuid:id,state:'published_unverified',photo_count:30,expected_blobs:90,
  ready_blobs:90,games_runtime_verified:false,hub_url:null,gallery_url:null,
  preparation:{state:'none',revision_id:null,photo_count:null,expected_blobs:0,ready_blobs:0}
 })})
};
test('CRM-only execution confirms real-client contract but never claims Gameplay',async()=>{
 const result=await auditRealOrderGameplay({crm:crmStub()});
 assert.equal(result.crm.total,2);
 assert.equal(result.crm.complete_population,true);
 assert.equal(result.gameplay.verification,'not_checked');
 assert.equal(result.gameplay_live_metadata_verified,false);
 assert.equal(result.link_delivery.orders_with_unverified_delivery,2);
 assert.equal(result.link_delivery.orders_proven_not_sent,null);
 assert.equal(JSON.stringify(result).includes(U1),false);
});
test('cross-check reconciles UUID, status and publication/photo totals without leaking private IDs',async()=>{
 const result=await auditRealOrderGameplay({crm:crmStub(),gameplay:gameplayStub});
 assert.equal(result.crm.rechecked_after_gameplay,true);
 assert.equal(result.gameplay.states.not_published,1);
 assert.equal(result.gameplay.states.published_unverified,1);
 assert.equal(result.gameplay.published_photo_count,30);
 assert.equal(result.gameplay.preparing_photo_count,20);
 assert.equal(result.gameplay.publication_pending,1);
 assert.equal(result.link_delivery.source,'not_integrated');
 assert.equal(result.link_delivery.status,'not_verified');
 assert.equal(result.link_delivery.orders_with_unverified_delivery,2);
 assert.equal(result.link_delivery.orders_proven_not_sent,null);
 assert.equal(result.gameplay_live_metadata_verified,true);
 assert.equal(result.gameplay_dataset_provenance_verified,false);
 assert.equal(result.media_bytes_verified,false);
 assert.equal(result.browser_runtime_verified,false);
 assert.equal(result.customer_data_release_approved,false);
 assert.equal(JSON.stringify(result).includes(U1),false);
 assert.equal(JSON.stringify(result).includes(U2),false);
 assert.equal(JSON.stringify(result).includes('https://'),false);
});
test('duplicate UUID across different CRM statuses fails closed',async()=>{
 await assert.rejects(
  auditRealOrderGameplay({crm:crmStub({duplicate:true})}),
  /real_audit_crm_order_contract_invalid|real_audit_duplicate_uuid_or_status_drift/
 );
});
test('inconsistent canonical page totals fail closed',async()=>{
 await assert.rejects(auditRealOrderGameplay({crm:crmStub({badPage:true})}),
  /real_audit_population_count_mismatch/);
});
test('CRM drift between Gameplay query and second CRM read invalidates report',async()=>{
 await assert.rejects(auditRealOrderGameplay({crm:crmStub({drift:true}),gameplay:gameplayStub}),
  /real_audit_crm_snapshot_changed/);
});
test('Gameplay links in batch are rejected before reporting aggregate results',async()=>{
 const g={lookup:async ids=>({results:ids.map(id=>({
  crm_order_uuid:id,state:'not_found',photo_count:0,expected_blobs:0,ready_blobs:0,
  games_runtime_verified:false,hub_url:'https://jogos.fotosdenatal.com/s/token',
  gallery_url:null,preparation:{state:'none',revision_id:null,
   photo_count:null,expected_blobs:0,ready_blobs:0}
 }))})};
 await assert.rejects(auditRealOrderGameplay({crm:crmStub(),gameplay:g}),
  /real_audit_gameplay_contract_invalid/);
});
test('standalone live entrypoint makes no network calls without explicit authorization',async()=>{
 let calls=0;
 await assert.rejects(runRealReadOnlyAudit({
  env:{CRM_BASE_URL:'https://evydencia.com',EVYD_REAL_AUDIT_AUTHORIZED:'0'},
  argv:['--crm-only'],fetchFn:async()=>{calls++;throw Error('unexpected')}
 }),/AUDIT_NOT_AUTHORIZED/);
 assert.equal(calls,0);
});
