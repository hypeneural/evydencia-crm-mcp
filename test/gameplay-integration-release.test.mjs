import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPrivateReader, assertLoopbackOrigin} from '../scripts/antigravity/verify-private-gameplay-reader.mjs';
import {GAMEPLAY_CRM_TOOL_NAMES,PRINTSERVER_TOOL_NAMES,MALOTES_READY_TOOL_NAME,MALOTES_BATCH_TOOL_NAME,OUTPUT_SCHEMAS} from '../src/live-gateway.mjs';

const SECRET='synthetic-test-reader-secret-123456789012345';
const UUID='00000000-0000-4000-8000-000000000000';
const record={crm_order_uuid:UUID,state:'not_found',hub_url:null,gallery_url:null,games_runtime_verified:false};
const response=(payload,status=200)=>new Response(payload===null?null:JSON.stringify(payload),{
 status,headers:{'content-type':'application/json'}
});
function service({publicRouteStatus=404,linkStatus=409,positiveStatus=200,linkError='CUSTOMER_LINKS_NOT_ENABLED'}={}) {
 const calls=[];
 const fetchFn=async(input,options)=>{
  const url=new URL(input),auth=options.headers.Authorization;
  calls.push({path:url.pathname,method:options.method,authenticated:Boolean(auth)});
  if(url.pathname==='/healthz')return response({status:'ok'});
  if(url.pathname.startsWith('/internal/')){
   if(auth!== 'Bearer '+SECRET)return response({error:'UNAUTHORIZED'},401);
   if(url.pathname.endsWith('lookup-batch'))
    return response({schema_version:1,source:'gameplay_catalog',results:[record]},positiveStatus);
   return response({error:linkError},linkStatus);
  }
  return response(options.method==='HEAD'?null:{error:'NOT_FOUND'},publicRouteStatus);
 };
 return {fetchFn,calls};
}
test('probe allows exactly the localhost HTTP origin, never arbitrary URLs',()=>{
 assert.equal(assertLoopbackOrigin('http://127.0.0.1:4182'),'http://127.0.0.1:4182');
 for(const x of ['http://169.58.210.14:4182','http://localhost:4182',
  'https://127.0.0.1:4182','http://127.0.0.1:4182/s/',
  'http://user:secret@127.0.0.1:4182','http://127.0.0.1:4182?q=abc'])
  assert.throws(()=>assertLoopbackOrigin(x),/SIDE_ORIGIN_/);
});
test('healthy 200 + unauthorized 401 alone is not GO for real contract',async()=>{
 const fake=service();
 const result=await verifyPrivateReader({fetchFn:fake.fetchFn});
 assert.equal(result.pass,false);
 assert.equal(result.status,'INCOMPLETE_NO_AUTHORIZED_READER_SECRET');
 assert.equal(result.checks.some(x=>x.name==='unauthorized'),true);
 assert.equal(fake.calls.some(x=>x.authenticated),false);
});
test('synthetic authenticated contract passes without leaking URLs or secret',async()=>{
 const fake=service();
 const result=await verifyPrivateReader({secret:SECRET,fetchFn:fake.fetchFn});
 assert.equal(result.pass,true);
 assert.equal(result.status,'PASS_PRIVATE_METADATA_CONTRACT');
 assert.equal(result.dataset_proven,false);
 assert.equal(result.customer_links_verified,false);
 assert.equal(result.checks.filter(x=>x.name==='public_denied').length,4);
 assert.equal(JSON.stringify(result).includes(SECRET),false);
 assert.equal(JSON.stringify(result).includes(UUID),false);
});
test('stale sidecar serving public HTML is refused even when health is 200',async()=>{
 const fake=service({publicRouteStatus:200});
 await assert.rejects(verifyPrivateReader({secret:SECRET,fetchFn:fake.fetchFn}),/SIDE_PUBLIC_DENIED_HTTP_200/);
});
test('unexpectedly enabled customer links fails closed',async()=>{
 const fake=service({linkStatus:200});
 await assert.rejects(verifyPrivateReader({secret:SECRET,fetchFn:fake.fetchFn}),/SIDE_LINKS_DISABLED_HTTP_200/);
});
test('generic HTTP 409 from another service cannot masquerade as Gameplay contract',async()=>{
 const fake=service({linkError:'CONFLICT'});
 await assert.rejects(verifyPrivateReader({secret:SECRET,fetchFn:fake.fetchFn}),
  /SIDE_LINKS_DISABLED_CONTRACT_INVALID/);
});
test('bad private bearer response cannot be mistaken for ready',async()=>{
 const fake=service({positiveStatus:403});
 await assert.rejects(verifyPrivateReader({secret:SECRET,fetchFn:fake.fetchFn}),/SIDE_AUTHORIZED_BATCH_HTTP_403/);
});
test('the integration branch preserves PrintServer and malotes exports next to Gameplay',()=>{
 assert.deepEqual([...GAMEPLAY_CRM_TOOL_NAMES],['crm_gameplay_links','crm_gameplay_auditoria','crm_gameplay_galerias_disponiveis']);
 assert.deepEqual([...PRINTSERVER_TOOL_NAMES],[
  'crm_previa_malotes_retirada','crm_solicitar_impressao_etiqueta','crm_consultar_impressao_etiqueta'
 ]);
 assert.equal(MALOTES_READY_TOOL_NAME,'crm_marcar_disponivel_retirada');
 assert.equal(MALOTES_BATCH_TOOL_NAME,'crm_processar_malotes_retirada');
 const projection=OUTPUT_SCHEMAS.OUT_GAMEPLAY_LINKS.safeParse({
  source:'crm_gameplay_join',total:1,
  orders:[{crm_order_uuid:UUID,operational:{
   crm_order_uuid:UUID,crm_status_key:'waiting_product_retrieve',crm_status_id:10,
   publication_required_by_crm:true,digital_experience_status:'no_gameplay_session',
   publication_pending:true,customer_links_status:'unavailable_http_409',
   main_url:null,games_url:null,gallery_url:null,links_browser_verified:false,
   link_delivery_status:'not_verified',link_sent_confirmed:null,link_opened_confirmed:null,
   delivery_receipt_verified:false,published_photo_count:0,
   active_revision_manifest_photo_count:0,preparing_photo_count:null,
   published_variants_ready:0,preparing_variants_ready:null,
   individual_games_verified:false,browser_runtime_verified:false
  }}]
 });
 assert.equal(projection.success,true,JSON.stringify(projection.error?.issues));
});
