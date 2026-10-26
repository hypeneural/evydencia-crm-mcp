// Real, read-only population reconciliation for CRM Christmas 2026 and
// Gameplay Catalog metadata. No customer PII, UUIDs, bearer tokens or family
// capability links are included in the returned report. Clients are injected.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES=Object.freeze([
  ['waiting_product_retrieve',10],
  ['order_completed',12],
]);
const STATES=['not_found','not_published','partial','revoked','published_unverified'];
const safeInteger=n=>Number.isSafeInteger(n)&&n>=0;
const fail=code=>{throw Error('real_audit_'+code)};
const baseFilters=Object.freeze({
 'product.slug':'natal','order.created-start':'2026-01-01','order.created-end':'2026-12-31'
});
function verifyPage(data,status,id,page,previousTotal) {
 if(!data||!['CRM_FORENSIC_READ_ONLY_BRIDGE','CRM_API_SERVER_PAGINATED'].includes(data.source)||
   !Array.isArray(data.orders))fail('crm_source_unverified');
 const p=data.pagination;
 if(!p||p.page!==page||!safeInteger(p.total_matching_orders)||
   !safeInteger(p.returned_count)||p.returned_count!==data.orders.length||
   typeof p.has_more!=='boolean'||(p.has_more&&data.orders.length===0))
   fail('crm_pagination_invalid');
 if(previousTotal!==null&&p.total_matching_orders!==previousTotal)fail('crm_total_drift');
 for(const o of data.orders){
  const uuid=String(o.order_uuid||'').toLowerCase();
  if(!UUID.test(uuid)||o.status_key!==status||o.status_id!==id||
    !Number.isSafeInteger(o.order_id)||o.order_id<1)
   fail('crm_order_contract_invalid');
  // This population explicitly excludes CRM orders created outside 2026.
  if(typeof o.created_at_brt==='string'&&!o.created_at_brt.startsWith('2026-'))
   fail('crm_date_filter_mismatch');
 }
 return p.total_matching_orders;
}
async function readPopulation(crm,{maxPages,maxOrders}) {
 const orderIds=new Set();
 const orders=[];
 let pages=0;
 const totals={};
 const sources=new Set();
 for(const [status,id] of STATUSES){
  let previousTotal=null,complete=false;
  for(let page=1;page<=maxPages;page++){
   const result=await crm.search({...baseFilters,'order.status':status},{
    page,limit:25,detailLevel:'resumo',canonicalPaginationRequired:true
   });
   const count=verifyPage(result,status,id,page,previousTotal);
   previousTotal=count;pages++;sources.add(result.source);
   for(const o of result.orders){
    const uuid=o.order_uuid.toLowerCase();
    if(orderIds.has(uuid))fail('duplicate_uuid_or_status_drift');
    orderIds.add(uuid);orders.push({uuid,status,id});
   }
   if(!result.pagination.has_more){complete=true;break;}
  }
  if(!complete||orders.length>maxOrders)fail('population_limit');
  totals[status]=previousTotal;
 }
 if(totals.waiting_product_retrieve+totals.order_completed!==orders.length)
  fail('population_count_mismatch');
 return {orders,totals,pages,sources:[...sources].sort()};
}
function validateGameplaySnapshot(row,uuid) {
 if(!row||row.crm_order_uuid!==uuid||!STATES.includes(row.state)||
  !safeInteger(row.photo_count)||row.photo_count>200||
  !safeInteger(row.expected_blobs)||!safeInteger(row.ready_blobs)||
  row.ready_blobs>row.expected_blobs||row.games_runtime_verified!==false||
  row.hub_url!==null||row.gallery_url!==null)
  fail('gameplay_contract_invalid');
 const p=row.preparation;
 if(!p||!['none','staged','invalid'].includes(p.state)||
    !safeInteger(p.expected_blobs)||!safeInteger(p.ready_blobs)||
    p.ready_blobs>p.expected_blobs||!(p.photo_count===null||
    (safeInteger(p.photo_count)&&p.photo_count<=200)))
   fail('gameplay_preparation_invalid');
 if(p.state==='staged'&&(!safeInteger(p.photo_count)||p.photo_count<1||
    p.expected_blobs!==p.photo_count*3))fail('gameplay_preparation_invalid');
 if(row.state==='published_unverified'&&
    (row.photo_count<1||row.expected_blobs!==row.photo_count*3||
     row.ready_blobs!==row.expected_blobs))
  fail('gameplay_publication_inconsistent');
 return row;
}
async function gatherGameplay(orders,gameplay){
 const counts=Object.fromEntries(STATES.map(x=>[x,0]));
 let published=0,staged=0,preparingOrders=0,partialManifest=0;
 for(let i=0;i<orders.length;i+=50){
  const ids=orders.slice(i,i+50).map(x=>x.uuid);
  const answer=await gameplay.lookup(ids,{includeLinks:false});
  if(!Array.isArray(answer?.results)||answer.results.length!==ids.length)
   fail('gameplay_batch_incomplete');
  for(let j=0;j<ids.length;j++){
   const r=validateGameplaySnapshot(answer.results[j],ids[j]);
   counts[r.state]++;
   if(r.state==='published_unverified')published+=r.photo_count;
   else if(r.state==='partial')partialManifest+=r.photo_count;
   if(r.preparation.state==='staged'){
    preparingOrders++;staged+=r.preparation.photo_count;
   }
  }
 }
 return {states:counts,published_photo_count:published,
  preparing_photo_count:staged,orders_in_preparation:preparingOrders,
  incomplete_active_manifest_photo_count:partialManifest,
  publication_pending:orders.length-counts.published_unverified,
  browser_runtime_verified:false};
}
/**
 * @param {object} options
 * @param {object} options.crm an authenticated, canonical CRM read client
 * @param {object|null} options.gameplay read-only private API client
 */
export async function auditRealOrderGameplay({
 crm,gameplay=null,maxPages=80,maxOrders=2000,recheckCrm=true
}={}){
 if(!crm?.search||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>80||
  !Number.isSafeInteger(maxOrders)||maxOrders<1||maxOrders>2000)
  fail('configuration_invalid');
 const startedAt=new Date().toISOString();
 const population=await readPopulation(crm,{maxPages,maxOrders});
 let gameplayReport=null;
 if(gameplay){
  if(typeof gameplay.lookup!=='function')fail('gameplay_client_invalid');
  gameplayReport=await gatherGameplay(population.orders,gameplay);
 }
 let crmRechecked=false;
 if(recheckCrm&&gameplay){
  const repeat=await readPopulation(crm,{maxPages,maxOrders});
  if(repeat.orders.length!==population.orders.length||
     repeat.orders.some((o,i)=>o.uuid!==population.orders[i].uuid||o.status!==population.orders[i].status))
    fail('crm_snapshot_changed');
  crmRechecked=true;
 }
 // Never expose the raw population array or linkage keys in this report.
 return Object.freeze({
  report_schema_version:1,mode:gameplay?'crm_and_gameplay':'crm_only',
  observed_at_start:startedAt,observed_at_end:new Date().toISOString(),
  crm:{source:population.sources,total:population.orders.length,
   by_current_status:population.totals,pages:population.pages,
   complete_population:true,rechecked_after_gameplay:crmRechecked},
  gameplay:gameplayReport||{verification:'not_checked',photo_counts_verified:false},
  gameplay_live_metadata_verified:Boolean(gameplayReport),
  // A valid private API reply cannot establish that it targets the currently
  // deployed production database or that WebP/media actually opens.
  gameplay_dataset_provenance_verified:false,
  media_bytes_verified:false,
  browser_runtime_verified:false,customer_data_release_approved:false,
  includes_customer_data:false,includes_capability_urls:false
 });
}
