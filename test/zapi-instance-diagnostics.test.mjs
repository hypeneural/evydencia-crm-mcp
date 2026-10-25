// Deterministic acceptance suite for Z-API instance diagnostics & history (v0.12.0).
// Covers all 16 mandatory scenarios offline on 127.0.0.1 with synthetic fixtures and zero real secrets.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {
 createGateway,
 LIVE_TOOL_NAMES,
 DIRECT_CRM_TOOL_NAMES,
 FORENSIC_CRM_TOOL_NAMES,
 PROPOSAL_CRM_TOOL_NAMES,
 ZAPI_INSTANCE_TOOL_NAMES
} from '../src/live-gateway.mjs';
import {gatewayConfig} from '../src/oauth-gateway.mjs';
import {createZapiInstanceDiagnostics,parseVerifiedZapiTimestamp} from '../src/zapi-instance-diagnostics.mjs';

const ABILITIES=['extension:bootstrap','extension:customer-read','extension:proposal-read','extension:proposal-write'];
const OPS={
 'fake-op7-sanctum-token-01':{id:7,ab:ABILITIES},
 'fake-op9-sanctum-token-02':{id:9,ab:ABILITIES},
 'fake-op8-sanctum-token-03':{id:8,ab:ABILITIES}
};
const INTERNAL_TOK='fake-internal-crm-read-token-diag-01';
const KEY=randomBytes(32).toString('base64');
const REDIR='https://chatgpt.com/connector_platform_oauth_redirect';

const SECRET_INST_OP7='FAKEINST700000000000000000007777';
const SECRET_TOK_OP7='FAKETOKEN700000000007777';
const SECRET_CTOK_OP7='FAKECLIENTTOKEN70000000000007777';
const SECRET_PROXY_URL='http://proxyuser:proxypass999@10.20.30.40:8080';
const SECRET_WEBHOOK_TOKEN='whsec_ultra_secret_path_token_999999';

const SECRET_INST_OP9='FAKEINST900000000000000000009999';
const SECRET_TOK_OP9='FAKETOKEN900000000009999';
const SECRET_CTOK_OP9='FAKECLIENTTOKEN90000000000009999';

const ALL_SECRETS=[
 ...Object.keys(OPS),
 INTERNAL_TOK,
 SECRET_INST_OP7,
 SECRET_TOK_OP7,
 SECRET_CTOK_OP7,
 SECRET_PROXY_URL,
 SECRET_WEBHOOK_TOKEN,
 SECRET_INST_OP9,
 SECRET_TOK_OP9,
 SECRET_CTOK_OP9
];

let crmServer,crmUrl,zapiRestServer,zapiRestUrl,tmpRoot;
let clock=Date.now();
const now=()=>clock;
const logs=[];

const restMocks=new Map();
const restHits=[];

function setInstanceMock(instanceId,handlers){
 restMocks.set(instanceId,handlers);
}

before(async()=>{
 tmpRoot=mkdtempSync(join(tmpdir(),'evyd-zapi-diag-test-'));

 crmServer=createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  const auth=req.headers.authorization||'';
  const tok=auth.replace(/^Bearer /,'');
  const send=(s,b)=>res.writeHead(s,{'Content-Type':'application/json'}).end(JSON.stringify(b));

  if(u.pathname==='/health/live')return send(200,{status:'ok'});
  if(u.pathname.startsWith('/api/orders/')||u.pathname.startsWith('/api/reports/')){
   if(auth!==INTERNAL_TOK)return send(401,{message:'Unauthorized'});
   const sampleOrder={
    id:8101,
    uuid:'88888888-aaaa-4111-8111-000000008101',
    status:{id:6,name:'Sessão Agendada'},
    customer:{name:'Cliente Sintética Diag',whatsapp:'48999990101'},
    created_at:'2026-10-20T14:00:00.000000Z',
    schedule_1:'2026-11-12 10:00:00',
    items:[{id:1,quantity:'1.000',total:'480.00',product:{name:'Experiência Então é Natal',slug:'natal',reference:'enatal'}}],
    installments:[{total:'480.00',method:{name:'Pix - Pagar.me',type:{name:'Pix'}}}],
    participants:[],
    summary:{total:480,received:480,remaining:0}
   };
   if(u.pathname==='/api/orders/search')return send(200,{data:[sampleOrder]});
   if(u.pathname==='/api/reports/natal-statistics')return send(200,{
    source:'CRM_CANONICAL_NATAL_STATISTICS',
    reference_year:2026,
    cutoff_mmdd:'10-25',
    detail_level:'resumo',
    kpis_2026:{valid_orders:101,unique_customers:100,scheduled_sessions:91,confirmed_realized_sessions:23}
   });
   return send(200,{data:[]});
  }
  if(u.pathname==='/api/v1/extension/bootstrap'){
   const op=OPS[tok];
   if(!op)return send(401,{message:'Unauthenticated'});
   return send(200,{
    schema_version:'1.0',
    generated_at:new Date(clock).toISOString(),
    data:{
     operator:{id:op.id,name:`Op ${op.id}`},
     server:{timezone:'America/Sao_Paulo',api_version:'1.0',minimum_extension_version:'1.0.0'},
     features:{proposals:{enabled:true},natal_2026:{enabled:true,reference_year:2026}},
     token:{abilities:op.ab,expires_at:'2099-01-01T00:00:00Z'}
    }
   });
  }
  send(404,{error:'not_found'});
 });
 await new Promise(r=>crmServer.listen(0,'127.0.0.1',r));
 crmUrl=`http://127.0.0.1:${crmServer.address().port}`;

 zapiRestServer=createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  const m=u.pathname.match(/^\/instances\/([^/]+)\/token\/([^/]+)\/(status|device|me)$/);
  if(!m||req.method!=='GET'){
   res.writeHead(404,{'Content-Type':'application/json'}).end('{"error":"not_found"}');
   return;
  }
  const [,instId,tok,endpoint]=m;
  const ctok=req.headers['client-token']||'';
  restHits.push({instId,endpoint,hasClientToken:Boolean(ctok)});

  const expected=(instId===SECRET_INST_OP7&&tok===SECRET_TOK_OP7&&ctok===SECRET_CTOK_OP7)||
   (instId===SECRET_INST_OP9&&tok===SECRET_TOK_OP9&&ctok===SECRET_CTOK_OP9);
  if(!expected){
   res.writeHead(401,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Invalid credentials',token:tok}));
   return;
  }
  const handlerSet=restMocks.get(instId)||{};
  const fn=handlerSet[endpoint];
  if(!fn){
   res.writeHead(500,{'Content-Type':'application/json'}).end('{"error":"unconfigured_mock"}');
   return;
  }
  fn(req,res);
 });
 await new Promise(r=>zapiRestServer.listen(0,'127.0.0.1',r));
 zapiRestUrl=`http://127.0.0.1:${zapiRestServer.address().port}`;
});

after(async()=>{
 await Promise.all([
  new Promise(r=>crmServer.close(r)),
  new Promise(r=>zapiRestServer.close(r))
 ]);
 try{rmSync(tmpRoot,{recursive:true,force:true})}catch{}
});

const call=(g,path,init={},host='localhost')=>g.handle(new Request(new URL(path,'http://localhost'),init),{ip:'10.0.0.1',host});

async function connectOperatorMcp(g,crmSanctumToken){
 const reg=await call(g,'/register',{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({redirect_uris:[REDIR],token_endpoint_auth_method:'none',client_name:'ChatGPT'})
 });
 const {client_id}=await reg.json();
 const verifier='pkce-verifier-diag-012345678901234567890123456789';
 const challenge=createHash('sha256').update(verifier).digest('base64url');
 const getAuth=await call(g,`/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(REDIR)}&code_challenge=${challenge}&code_challenge_method=S256&state=st1&scope=crm.read`);
 const html=await getAuth.text();
 const txn=html.match(/name="txn" value="([^"]+)"/)[1];
 const postAuth=await call(g,'/authorize',{
  method:'POST',
  headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({txn,crm_token:crmSanctumToken}).toString()
 });
 const code=new URL(postAuth.headers.get('location')).searchParams.get('code');
 const tokRes=await call(g,'/token',{
  method:'POST',
  headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'authorization_code',code,client_id,redirect_uri:REDIR,code_verifier:verifier}).toString()
 });
 const tokens=await tokRes.json();
 const transport=new StreamableHTTPClientTransport(new URL('http://localhost/mcp'),{
  requestInit:{headers:{authorization:`Bearer ${tokens.access_token}`}},
  fetch:(url,init)=>g.handle(new Request(url,init),{ip:'10.0.0.1',host:'localhost'})
 });
 const client=new Client({name:'chatgpt-diag-test',version:'1.0.0'});
 await client.connect(transport);
 return client;
}

function makeGatewayEnv(extra={}){
 const obsPath=join(tmpRoot,`obs-${randomBytes(4).toString('hex')}.enc.json`);
 return {
  EVYD_PUBLIC_URL:'http://localhost',
  CRM_BASE_URL:crmUrl,
  EVYD_GATEWAY_KEY:KEY,
  EVYD_ALLOWED_OPERATOR_IDS:'7,8,9',
  EVYD_INTERNAL_READ_TOKEN:INTERNAL_TOK,
  EVYD_ENABLE_OPERATOR_FULL_CRM:'1',
  EVYD_ZAPI_DIAG_BASE_URL:zapiRestUrl,
  EVYD_ZAPI_DIAG_OBS_PATH:obsPath,
  EVYD_ZAPI_DIAG_TIMEOUT_MS:'500',
  EVYD_ZAPI_DIAG_INSTANCES_JSON:JSON.stringify([
   {
    alias:'principal',
    label:'#1',
    operatorId:'7',
    instanceId:SECRET_INST_OP7,
    token:SECRET_TOK_OP7,
    clientToken:SECRET_CTOK_OP7
   },
   {
    alias:'op9_inst',
    label:'#9',
    operatorId:'9',
    instanceId:SECRET_INST_OP9,
    token:SECRET_TOK_OP9,
    clientToken:SECRET_CTOK_OP9
   }
  ]),
  ...extra
 };
}

function defaultConnectedMocks(){
 return {
  status:(_req,res)=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({
   connected:true,
   session:false,
   created:1792965164769,
   error:'You are already connected.',
   smartphoneConnected:true
  })),
  device:(_req,res)=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({
   phone:'5548900000777',
   lid:'151741000000@lid',
   imgUrl:'https://pps.whatsapp.net/v/t61.24694-24/avatar_test.jpg?ccb=11-4&oh=abc123public',
   about:'   Estúdio Fotográfico   ',
   name:'Estúdio Sintético',
   device:{sessionName:'Z-API',device_model:'iPhone 15 Pro'},
   originalDevice:'smbi',
   sessionId:126,
   isBusiness:true
  })),
  me:(_req,res)=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({
   id:SECRET_INST_OP7,
   name:'#1',
   token:SECRET_TOK_OP7,
   proxyUrl:SECRET_PROXY_URL,
   useProxy:true,
   connected:true,
   paymentStatus:'PAID',
   created:'2023-05-23T10:07:11.869+00:00',
   due:1793029357000,
   connectedCallbackUrl:`https://evydencia.com/webhooks/zapi/${SECRET_WEBHOOK_TOKEN}/connected?secret=${SECRET_WEBHOOK_TOKEN}`,
   disconnectedCallbackUrl:`https://evydencia.com/webhooks/zapi/${SECRET_WEBHOOK_TOKEN}/disconnected`,
   receivedCallbackUrl:`https://evydencia.com/webhooks/zapi/${SECRET_WEBHOOK_TOKEN}/received`,
   deliveryCallbackUrl:`https://evydencia.com/webhooks/zapi/${SECRET_WEBHOOK_TOKEN}/delivery`,
   messageStatusCallbackUrl:`https://evydencia.com/webhooks/zapi/${SECRET_WEBHOOK_TOKEN}/status`,
   receivedAndDeliveryCallbackUrl:'',
   presenceChatCallbackUrl:'https://api.etijucas.com.br/webhooks/presence',
   receivedStatusCallbackUrl:'https://api.etijucas.com.br/webhooks/status',
   receiveCallbackSentByMe:false,
   callRejectAuto:true,
   callRejectMessage:'Ligação automática recusada',
   autoReadMessage:true,
   announcementGuard:false,
   undocumentedFutureSecretField:`leak-${SECRET_TOK_OP7}`,
   anotherUnknownField:{nested:'ignored'}
  }))
 };
}

test('Scenarios 1, 10, 11, 12, 16: Connected instance, selective 1-GET status_rapido, timezone conversion, unknown /me fields ignored, zero secret leaks & CRM preservation',async()=>{
 setInstanceMock(SECRET_INST_OP7,defaultConnectedMocks());
 setInstanceMock(SECRET_INST_OP9,defaultConnectedMocks());
 const envObj=makeGatewayEnv();
 const g=createGateway(envObj,{log:e=>logs.push(e),now});
 const c7=await connectOperatorMcp(g,'fake-op7-sanctum-token-01');
 try{
  const {tools}=await c7.listTools();
  const names=tools.map(t=>t.name);
  for(const crmTool of [...LIVE_TOOL_NAMES,...DIRECT_CRM_TOOL_NAMES,...FORENSIC_CRM_TOOL_NAMES,...PROPOSAL_CRM_TOOL_NAMES]){
   assert.ok(names.includes(crmTool),`CRM tool preserved: ${crmTool}`);
  }
  for(const zt of ZAPI_INSTANCE_TOOL_NAMES){
   const found=tools.find(t=>t.name===zt);
   assert.ok(found,`Diagnostic tool registered: ${zt}`);
   assert.equal(found.annotations.readOnlyHint,true);
  }

  // Selective scope="status_rapido" must make ONLY 1 GET (/status) and NOT call /device or /me!
  restHits.length=0;
  const quick=await c7.callTool({
   name:'zapi_instancia_diagnostico',
   arguments:{escopo:'status_rapido',atualizar:true}
  });
  assert.equal(quick.isError,undefined);
  assert.deepEqual(restHits.map(h=>h.endpoint),['status']);
  assert.equal(quick.structuredContent.instance.connected,true);
  assert.equal(quick.structuredContent.instance.smartphone_connected,true);
  assert.equal(quick.structuredContent.instance.status_error,undefined,'Normal "You are already connected." is not classified as error');
  assert.equal(quick.structuredContent.diagnostics.device_source,'not_requested');
  assert.equal(quick.structuredContent.diagnostics.settings_source,'not_requested');

  // Full diagnostic ("completo") executes parallel GETs and projects safe fields with exact BRT timestamps.
  const full=await c7.callTool({
   name:'zapi_instancia_diagnostico',
   arguments:{nivel_detalhe:'completo',escopo:'completo',atualizar:true}
  });
  const sc=full.structuredContent;
  assert.equal(sc.source,'ZAPI_REST_LIVE');
  assert.equal(sc.timezone,'America/Sao_Paulo');
  assert.equal(sc.instance.connected,true);
  assert.equal(sc.instance.smartphone_connected,true);
  assert.equal(sc.instance.phone,'5548900000777');
  assert.equal(sc.instance.phone_e164,'+5548900000777');
  assert.equal(sc.instance.profile_name,'Estúdio Sintético');
  assert.equal(sc.instance.about,'Estúdio Fotográfico');
  assert.equal(sc.instance.is_business,true);
  assert.equal(sc.instance.device_model,'iPhone 15 Pro');
  assert.equal(sc.instance.created_at,'2023-05-23T07:07:11-03:00');
  assert.equal(sc.instance.due_at,'2026-10-26T12:42:37-03:00');
  assert.equal(sc.timestamps_provenance.created_at.raw_format,'iso8601');
  assert.equal(sc.timestamps_provenance.due_at.raw_format,'unix_ms');
  assert.equal(sc.instance.payment_status,'PAID');
  assert.equal(sc.webhooks.connected,'configured');
  assert.equal(sc.webhooks.received_and_delivery,'not_configured');
  assert.equal(sc.webhooks.sent_by_me_enabled,false);
  assert.equal(sc.webhook_targets.connected.target_host,'evydencia.com');
  assert.equal(sc.webhook_targets.connected.https,true);
  assert.equal(sc.settings.call_reject_auto,true);
  assert.equal(sc.settings.use_proxy,true);
  assert.equal(sc.diagnostics.unknown_me_fields_ignored_count,2);
  assert.equal(sc.diagnostics.partial_failure,false);

  // Scenario 11: Zero secret leakage anywhere in response, disk store, or logs.
  const serialized=JSON.stringify(full);
  for(const sec of ALL_SECRETS){
   assert.ok(!serialized.includes(sec),`Secret leaked in tool output: ${sec.slice(0,6)}`);
  }
  assert.ok(!serialized.includes('undocumentedFutureSecretField'));
  assert.ok(!serialized.includes('proxyUrl'));

  if(existsSync(envObj.EVYD_ZAPI_DIAG_OBS_PATH)){
   const diskRaw=readFileSync(envObj.EVYD_ZAPI_DIAG_OBS_PATH,'utf8');
   for(const sec of ALL_SECRETS){
    assert.ok(!diskRaw.includes(sec),'Encrypted observation store must not contain plaintext secrets');
   }
  }

  // Scenario 16: Existing CRM tools still work seamlessly.
  const orders=await c7.callTool({name:'crm_pedidos_buscar',arguments:{}});
  assert.equal(orders.structuredContent.orders[0].order_id,8101);
 }finally{
  await c7.close();
  await g.close();
 }
});

test('Scenarios 2, 3, 8, 9, 13: Disconnected phone attribution, smartphone disconnected warning, empty device fields, /status vs /me mismatch, and invalid timestamps',async()=>{
 const envObj=makeGatewayEnv();
 const g=createGateway(envObj,{log:e=>logs.push(e),now});
 const c7=await connectOperatorMcp(g,'fake-op7-sanctum-token-01');
 try{
  // Scenario 2: Disconnected -> phone must NOT appear as connected phone; moved to last_known_profile.
  setInstanceMock(SECRET_INST_OP7,{
   ...defaultConnectedMocks(),
   status:(_req,res)=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({
    connected:false,
    smartphoneConnected:false,
    error:'QR code scan required'
   }))
  });
  const disc=await c7.callTool({name:'zapi_instancia_diagnostico',arguments:{atualizar:true}});
  assert.equal(disc.structuredContent.instance.connection_state,'disconnected');
  assert.equal(disc.structuredContent.instance.connected,false);
  assert.equal(disc.structuredContent.instance.phone,null,'Disconnected instance must not claim active phone');
  assert.equal(disc.structuredContent.instance.status_error,'QR code scan required');
  assert.equal(disc.structuredContent.last_known_profile.phone,'5548900000777');
  assert.ok(disc.structuredContent.warnings.some(w=>w.code==='DEVICE_PROFILE_UNCONFIRMED_NOT_CONNECTED'));

  // Scenario 3 + 8 + 9 + 13:
  // - /status.connected=true, smartphoneConnected=false
  // - /device has no phone and no photo
  // - /me.connected=false (mismatch with /status!) + invalid timestamps
  setInstanceMock(SECRET_INST_OP7,{
   status:(_req,res)=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({
    connected:true,
    smartphoneConnected:false,
    error:''
   })),
   device:(_req,res)=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({
    phone:'',
    imgUrl:'   ',
    about:'   ',
    name:'',
    device:{sessionName:'',device_model:''},
    isBusiness:false
   })),
   me:(_req,res)=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({
    id:SECRET_INST_OP7,
    name:'#1',
    connected:false,
    paymentStatus:'PAID',
    created:'not-a-valid-date',
    due:-99999
   }))
  });
  const mix=await c7.callTool({name:'zapi_instancia_diagnostico',arguments:{nivel_detalhe:'completo',atualizar:true}});
  const msc=mix.structuredContent;
  assert.equal(msc.instance.connected,true,'/status.connected is primary truth over /me.connected');
  assert.equal(msc.instance.smartphone_connected,false);
  assert.equal(msc.instance.me_connected,false);
  assert.equal(msc.instance.phone,null);
  assert.equal(msc.instance.profile_image_url,null);
  assert.equal(msc.instance.about,null);
  assert.equal(msc.instance.created_at,null);
  assert.equal(msc.instance.due_at,null);
  const wCodes=msc.warnings.map(w=>w.code);
  assert.ok(wCodes.includes('SMARTPHONE_DISCONNECTED'));
  assert.ok(wCodes.includes('STATUS_VS_ME_CONNECTED_MISMATCH'));
  assert.ok(wCodes.includes('INVALID_ME_CREATED_TIMESTAMP'));
  assert.ok(wCodes.includes('INVALID_ME_DUE_TIMESTAMP'));

  // Direct unit check on parseVerifiedZapiTimestamp for unix_s as well.
  const unixSec=parseVerifiedZapiTimestamp(1793029357,'unit.test');
  assert.equal(unixSec.valid,true);
  assert.equal(unixSec.raw_format,'unix_s');
  assert.equal(unixSec.iso_brt,'2026-10-26T12:42:37-03:00');
 }finally{
  await c7.close();
  await g.close();
 }
});

test('Scenarios 4, 5, 6, 7: Invalid/missing credentials, HTTP 401/403, HTTP 429/500 partial failure, and timeout/invalid JSON -> unknown connection_state',async()=>{
 // Scenario 4a: Gateway config blocks shared ZAPI_TOKEN and external non-Z-API REST base URL on HTTPS.
 assert.throws(()=>gatewayConfig({
  EVYD_PUBLIC_URL:'https://mcp-crm.etijucas.com.br',
  CRM_BASE_URL:'https://evydencia.com',
  EVYD_GATEWAY_KEY:KEY,
  EVYD_ALLOWED_OPERATOR_IDS:'7',
  ZAPI_TOKEN:'shared-forbidden'
 }),/gateway_config_shared_secret_forbidden/);

 assert.throws(()=>gatewayConfig({
  EVYD_PUBLIC_URL:'https://mcp-crm.etijucas.com.br',
  CRM_BASE_URL:'https://evydencia.com',
  EVYD_GATEWAY_KEY:KEY,
  EVYD_ALLOWED_OPERATOR_IDS:'7',
  EVYD_ZAPI_DIAG_OPERATOR_ID:'7',
  EVYD_ZAPI_DIAG_INSTANCE_ID:'inst1',
  EVYD_ZAPI_DIAG_INSTANCE_TOKEN:'tok1',
  EVYD_ZAPI_DIAG_CLIENT_TOKEN:'ctok1',
  EVYD_ZAPI_DIAG_BASE_URL:'https://evil.example.com'
 }),/gateway_config_zapi_rest_base_url/);

 const envObj=makeGatewayEnv();
 const g=createGateway(envObj,{log:e=>logs.push(e),now});
 const c7=await connectOperatorMcp(g,'fake-op7-sanctum-token-01');
 const c8=await connectOperatorMcp(g,'fake-op8-sanctum-token-03');
 try{
  // Scenario 4b: Operator #8 has no REST instance configured -> NOT_CONFIGURED cleanly.
  const notCfg=await c8.callTool({name:'zapi_instancia_diagnostico',arguments:{}});
  assert.equal(notCfg.structuredContent.configured,false);
  assert.equal(notCfg.structuredContent.diagnostics.status,'NOT_CONFIGURED');

  // Scenario 5: HTTP 401/403 -> credentials_valid=false, connection_state="unknown".
  setInstanceMock(SECRET_INST_OP7,{
   status:(_req,res)=>res.writeHead(403,{'Content-Type':'application/json'}).end('{"error":"Forbidden Client-Token"}'),
   device:(_req,res)=>res.writeHead(403,{'Content-Type':'application/json'}).end('{"error":"Forbidden"}'),
   me:(_req,res)=>res.writeHead(403,{'Content-Type':'application/json'}).end('{"error":"Forbidden"}')
  });
  const unauth=await c7.callTool({name:'zapi_instancia_diagnostico',arguments:{atualizar:true}});
  assert.equal(unauth.structuredContent.diagnostics.credentials_valid,false);
  assert.equal(unauth.structuredContent.diagnostics.api_reachable,false);
  assert.equal(unauth.structuredContent.instance.connection_state,'unknown');
  assert.equal(unauth.structuredContent.instance.connected,null);

  // Scenario 6: Partial failure (/status 200 connected, /device 500, /me 429) -> /status stays true!
  setInstanceMock(SECRET_INST_OP7,{
   status:defaultConnectedMocks().status,
   device:(_req,res)=>res.writeHead(500,{'Content-Type':'application/json'}).end('{"error":"Internal error"}'),
   me:(_req,res)=>res.writeHead(429,{'Content-Type':'application/json'}).end('{"error":"Rate limit"}')
  });
  const partial=await c7.callTool({name:'zapi_instancia_diagnostico',arguments:{atualizar:true}});
  assert.equal(partial.structuredContent.instance.connected,true,'Failure of /device or /me must NOT flip /status to false');
  assert.equal(partial.structuredContent.diagnostics.partial_failure,true);
  assert.equal(partial.structuredContent.diagnostics.device_source,'error:http_500');
  assert.equal(partial.structuredContent.diagnostics.settings_source,'error:rate_limited');

  // Scenario 7a: Invalid JSON on /status -> connection_state="unknown" (NOT disconnected).
  setInstanceMock(SECRET_INST_OP7,{
   status:(_req,res)=>res.writeHead(200,{'Content-Type':'text/plain'}).end('<<<not-json>>>'),
   device:defaultConnectedMocks().device,
   me:defaultConnectedMocks().me
  });
  const badJson=await c7.callTool({name:'zapi_instancia_diagnostico',arguments:{atualizar:true}});
  assert.equal(badJson.structuredContent.instance.connection_state,'unknown');
  assert.equal(badJson.structuredContent.instance.connected,null);
  assert.equal(badJson.structuredContent.diagnostics.status_source,'error:invalid_json');

  // Scenario 7b: Timeout on /status -> connection_state="unknown".
  setInstanceMock(SECRET_INST_OP7,{
   status:(_req,res)=>{const t=setTimeout(()=>res.end('{}'),1500);res.on('close',()=>clearTimeout(t))},
   device:defaultConnectedMocks().device,
   me:defaultConnectedMocks().me
  });
  const timedOut=await c7.callTool({name:'zapi_instancia_diagnostico',arguments:{escopo:'status_rapido',atualizar:true}});
  assert.equal(timedOut.structuredContent.instance.connection_state,'unknown');
  assert.equal(timedOut.structuredContent.instance.connected,null);
  assert.equal(timedOut.structuredContent.diagnostics.status_source,'error:timeout');
 }finally{
  await c7.close();
  await c8.close();
  await g.close();
 }
});

test('Scenarios 14 & 15: Connection history (unavailable vs real webhook events + deduplicated poll transitions) and strict operator/instance isolation',async()=>{
 setInstanceMock(SECRET_INST_OP7,defaultConnectedMocks());
 setInstanceMock(SECRET_INST_OP9,defaultConnectedMocks());
 const envObj=makeGatewayEnv();
 const g=createGateway(envObj,{log:e=>logs.push(e),now});
 const c7=await connectOperatorMcp(g,'fake-op7-sanctum-token-01');
 const c9=await connectOperatorMcp(g,'fake-op9-sanctum-token-02');
 try{
  // Scenario 15a: Arbitrary URL or token in `instancia` is blocked immediately.
  const urlAttempt=await c7.callTool({
   name:'zapi_instancia_diagnostico',
   arguments:{instancia:'https://evil.example/instances/123/token/abc'}
  });
  assert.equal(urlAttempt.isError,true);
  assert.match(urlAttempt.content[0].text,/invalid_zapi_instance_selector/);

  // Scenario 15b: Operator #7 cannot access Operator #9's `op9_inst` alias.
  const crossAttempt=await c7.callTool({
   name:'zapi_instancia_diagnostico',
   arguments:{instancia:'op9_inst'}
  });
  assert.equal(crossAttempt.isError,true);
  assert.match(crossAttempt.content[0].text,/zapi_instance_not_authorized/);

  // Operator #9 CAN access their own `op9_inst`.
  const op9Ok=await c9.callTool({
   name:'zapi_instancia_diagnostico',
   arguments:{instancia:'op9_inst',escopo:'status_rapido',atualizar:true}
  });
  assert.equal(op9Ok.isError,undefined);
  assert.equal(op9Ok.structuredContent.instance.alias,'op9_inst');

  // Scenario 14a: Poll observations deduplicate identical states and record real state transitions.
  await c7.callTool({name:'zapi_instancia_diagnostico',arguments:{escopo:'status_rapido',atualizar:true}});
  clock+=5000;
  await c7.callTool({name:'zapi_instancia_diagnostico',arguments:{escopo:'status_rapido',atualizar:true}});
  clock+=5000;
  setInstanceMock(SECRET_INST_OP7,{
   ...defaultConnectedMocks(),
   status:(_req,res)=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({
    connected:false,
    smartphoneConnected:false,
    error:'Session logged out'
   }))
  });
  await c7.callTool({name:'zapi_instancia_diagnostico',arguments:{escopo:'status_rapido',atualizar:true}});

  // Without local PHP forensic bridge on Windows test machine, webhook_history.available===false cleanly.
  const histNoBridge=await c7.callTool({name:'zapi_instancia_historico',arguments:{}});
  assert.equal(histNoBridge.structuredContent.webhook_history.available,false);
  assert.equal(histNoBridge.structuredContent.gateway_poll_observations.available,true);
  assert.equal(histNoBridge.structuredContent.gateway_poll_observations.returned_count,2,'Repeated connected polls were deduplicated into 1 initial + 1 disconnect transition');
  assert.equal(histNoBridge.structuredContent.gateway_poll_observations.events[0].transition,'observed_disconnected');
  assert.equal(histNoBridge.structuredContent.gateway_poll_observations.events[0].timestamp_origin,'gateway_poll_detected_at');

  // Scenario 14b: Unit test of history() with authorized webhook event reader (momment vs received_at vs poll_detected_at).
  const cfg=gatewayConfig(envObj);
  const diag=createZapiInstanceDiagnostics(cfg,{now});
  const richHist=await diag.history('7',{
   limite:10,
   readWebhookHistory:async({instanceId})=>{
    assert.equal(instanceId,SECRET_INST_OP7);
    return {
     available:true,
     source:'CRM_PROVIDER_WEBHOOK_EVENTS_READ_ONLY',
     total_matching_events:2,
     returned_count:2,
     has_more:false,
     last_connected:{
      event_id:102,
      event_type:'ConnectedCallback',
      state:'connected',
      occurred_at_brt:'2026-10-15T18:53:52-03:00',
      occurred_at_origin:'zapi_webhook_momment',
      webhook_received_at_brt:'2026-10-15T18:53:54-03:00',
      webhook_received_at_origin:'crm_webhook_received_at',
      phone_masked:'5548*****94',
      disconnect_reason:null
     },
     last_disconnected:{
      event_id:101,
      event_type:'DisconnectedCallback',
      state:'disconnected',
      occurred_at_brt:'2026-10-15T18:53:36-03:00',
      occurred_at_origin:'zapi_webhook_momment',
      webhook_received_at_brt:'2026-10-15T18:53:39-03:00',
      webhook_received_at_origin:'crm_webhook_received_at',
      phone_masked:null,
      disconnect_reason:'It was not possible to restore a session with the current token, please login again'
     },
     events:[
      {event_id:102,state:'connected',occurred_at_brt:'2026-10-15T18:53:52-03:00',webhook_received_at_brt:'2026-10-15T18:53:54-03:00'},
      {event_id:101,state:'disconnected',occurred_at_brt:'2026-10-15T18:53:36-03:00',webhook_received_at_brt:'2026-10-15T18:53:39-03:00'}
     ]
    };
   }
  });
  assert.equal(richHist.source,'ZAPI_CRM_WEBHOOK_HISTORY_AND_POLL_LOG');
  assert.equal(richHist.webhook_history.available,true);
  assert.equal(richHist.webhook_history.last_disconnected.disconnect_reason,'It was not possible to restore a session with the current token, please login again');
  assert.equal(richHist.webhook_history.last_connected.occurred_at_origin,'zapi_webhook_momment');
  assert.equal(richHist.webhook_history.last_connected.webhook_received_at_origin,'crm_webhook_received_at');
 }finally{
  await c7.close();
  await c9.close();
  await g.close();
 }
});
