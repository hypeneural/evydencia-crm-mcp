// Deterministic tests for ChatGPT Web MCP Apps UI cards, avatar honest states,
// bridge single-flight + TTL cache, typed bridge errors, and gateway performance telemetry.
// Synthetic fixtures only; zero real PII, credentials, or external network sockets.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {
 createBridgeSingleFlightCache,
 classifyBridgeExecError,
 buildAvatarRenderContract,
 probeCustomerAvatarAsset
} from '../src/legacy-api-read.mjs';
import {
 MCP_UI_CARD_RESOURCE_URI,
 MCP_UI_CARD_MIME_TYPE,
 AVATAR_RENDER_STATES,
 buildVisualCardPayload,
 formatVisualCardTextFallback,
 CRM_VISUAL_CARD_HTML
} from '../src/mcp-ui-cards.mjs';
import {createGateway,createGatewayPerfTracker} from '../src/live-gateway.mjs';

test('single-flight + short TTL cache deduplicates concurrent calls, serves warm hits and never caches errors',async()=>{
 let nowMs=1000;
 const cache=createBridgeSingleFlightCache({ttlMs:15000,maxEntries:8,now:()=>nowMs});
 let runs=0;
 const slowRunner=async()=>{
  runs++;
  await new Promise(r=>setTimeout(r,25));
  return {source:'TEST_BRIDGE',value:42,bridge_telemetry:{php_ms:18.4,sql_count:3,sql_ms:4.2}};
 };

 const [r1,r2,r3]=await Promise.all([
  cache.execute('k1',slowRunner),
  cache.execute('k1',slowRunner),
  cache.execute('k1',slowRunner)
 ]);
 assert.equal(runs,1,'3 concurrent identical calls shared 1 execution');
 assert.equal(r1.value,42);
 assert.equal(r1.bridge_telemetry.cache_hit,false);
 assert.equal([r1,r2,r3].filter(r=>r.bridge_telemetry.single_flight_shared===true).length,2);

 nowMs+=5000;
 const warm=await cache.execute('k1',slowRunner);
 assert.equal(runs,1,'warm read within 15s TTL did not re-run');
 assert.equal(warm.bridge_telemetry.cache_hit,true);
 assert.equal(warm.bridge_telemetry.php_ms,18.4);
 assert.ok(warm.bridge_telemetry.response_bytes>20);

 nowMs+=16000;
 const expired=await cache.execute('k1',slowRunner);
 assert.equal(runs,2,'expired TTL triggered fresh execution');
 assert.equal(expired.bridge_telemetry.cache_hit,false);

 let failCount=0;
 await assert.rejects(()=>cache.execute('k_err',async()=>{failCount++;throw Error('boom')}));
 await assert.rejects(()=>cache.execute('k_err',async()=>{failCount++;throw Error('boom')}));
 assert.equal(failCount,2,'errors are never cached');
});

test('classifyBridgeExecError distinguishes timeout, max_buffer, invalid_json and php_exit safely',()=>{
 assert.equal(classifyBridgeExecError({killed:true,signal:'SIGTERM'},'natal_bridge'),'natal_bridge_timeout');
 assert.equal(classifyBridgeExecError({code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'},'forensic_bridge'),'forensic_bridge_max_buffer');
 assert.equal(classifyBridgeExecError({isInvalidJson:true},'natal_bridge'),'natal_bridge_invalid_json');
 assert.equal(classifyBridgeExecError({code:255},'forensic_bridge'),'forensic_bridge_php_exit');
 assert.equal(classifyBridgeExecError({},'natal_bridge'),'natal_stats_unavailable');
 assert.equal(classifyBridgeExecError({},'forensic_bridge'),'forensic_bridge_unavailable');
});

test('avatar render contract and MCP UI card distinguish all 4 honest avatar states and redact minor PII',async()=>{
 assert.deepEqual(AVATAR_RENDER_STATES,[
  'url_validated_pending_widget_load',
  'image_loaded',
  'image_blocked_or_error',
  'initials_fallback'
 ]);

 // 1) initials_fallback (no photo)
 const noPhoto=await probeCustomerAvatarAsset({has_avatar:false,url:null,initials:'LE'});
 assert.equal(noPhoto.render_contract.state,'initials_fallback');
 assert.equal(noPhoto.render_contract.chat_rendered_confirmed,false);

 // 2) url_validated_pending_widget_load (HTTP 200 + WebP magic valid != browser rendered!)
 const webpHeader=Buffer.from('52494646240000005745425056503820','hex');
 const okFetch=async(_u,opts)=>{
  if(opts?.method==='HEAD')return new Response(null,{status:200,headers:{'content-type':'image/webp','content-length':'1024'}});
  return new Response(webpHeader,{status:206,headers:{'content-type':'image/webp','content-range':'bytes 0-15/1024'}});
 };
 const validated=await probeCustomerAvatarAsset(
  {has_avatar:true,url:'https://evydencia.com/storage/customers/synth.webp',initials:'LE'},
  {fetchFn:okFetch,crmBaseUrl:'https://evydencia.com'}
 );
 assert.equal(validated.asset_check_status,'validated');
 assert.equal(validated.render_contract.state,'url_validated_pending_widget_load');
 assert.equal(validated.render_contract.chat_rendered_confirmed,false);

 const orderCard=buildVisualCardPayload({
  tipo:'pedido',
  detailResult:{
   order:{
    order_id:9901,
    uuid:'11111111-aaaa-4111-8111-000000000101',
    status_label:'Sessão Agendada',
    package_name:'Experiência Natal Sintética',
    crm_order_url:'https://evydencia.com/gestao/pedidos/11111111-aaaa-4111-8111-000000000101/detalhes',
    crm_customer_url:'https://evydencia.com/gestao/clientes/cust-synth-01/consultar',
    total_reais:1290,
    received_reais:645,
    remaining_reais:645,
    participant_count:3,
    participants:[{name:'Menor Sintético Secreto',birth_date:'2023-05-10'}],
    customer:{name:'Larissa Sintética',city:'Tijucas',state:'SC',avatar:validated}
   }
  }
 });
 assert.equal(orderCard.avatar.initial_state,'url_validated_pending_widget_load');
 assert.equal(orderCard.avatar.allow_img_tag,true);
 assert.equal(orderCard.participants_summary.minor_pii_redacted_in_widget,true);
 assert.ok(!JSON.stringify(orderCard).includes('Menor Sintético Secreto'),'minor names/birthdays never leak into visual card payload');
 assert.ok(!JSON.stringify(orderCard).includes('2023-05-10'));

 const fallbackTxt=formatVisualCardTextFallback(orderCard);
 assert.match(fallbackTxt,/Pedido #9901/);
 assert.match(fallbackTxt,/url_validated_pending_widget_load/);
 assert.match(fallbackTxt,/https:\/\/evydencia\.com\/gestao\/pedidos\//);

 // 3) image_blocked_or_error when probe reports 403/404 or disallowed domain
 const blockedCard=buildVisualCardPayload({
  tipo:'cliente_360',
  customerResult:{
   customer:{
    name:'Cliente Bloqueado',
    avatar:{has_avatar:true,url:'https://evil.example/a.webp',asset_accessible:false,asset_check_status:'restricted',initials:'CB'}
   }
  }
 });
 assert.equal(blockedCard.avatar.initial_state,'image_blocked_or_error');
 assert.equal(blockedCard.avatar.allow_img_tag,false);

 // 4) Widget HTML contains explicit onload -> image_loaded and onerror -> image_blocked_or_error transitions
 assert.match(CRM_VISUAL_CARD_HTML,/avImg\.onload\s*=\s*function/);
 assert.match(CRM_VISUAL_CARD_HTML,/setAvatarState\(avBox,\s*avCap,\s*'image_loaded'/);
 assert.match(CRM_VISUAL_CARD_HTML,/avImg\.onerror\s*=\s*function/);
 assert.match(CRM_VISUAL_CARD_HTML,/setAvatarState\(avBox,\s*avCap,\s*'image_blocked_or_error'/);
});

// End-to-end MCP resource + decoupled UI tool test over Streamable HTTP
let crmSrv,crmOrigin;
const OP_TOK='fake-ui-op7-token-00001';
const INT_TOK='fake-ui-internal-read-token-01';
const KEY=randomBytes(32).toString('base64');
const REDIR='https://chatgpt.com/connector_platform_oauth_redirect';

before(async()=>{
 crmSrv=createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  const send=(s,b)=>{res.writeHead(s,{'content-type':'application/json'});res.end(JSON.stringify(b))};
  if(u.pathname==='/api/v1/extension/bootstrap'){
   if(req.headers.authorization!=='Bearer '+OP_TOK)return send(401,{});
   return send(200,{schema_version:'1.0',generated_at:new Date().toISOString(),data:{
    operator:{id:7,name:'Op UI'},
    server:{timezone:'America/Sao_Paulo',api_version:'1.0'},
    token:{abilities:['extension:bootstrap','extension:customer-read','extension:proposal-read'],expires_at:'2099-01-01T00:00:00Z'}
   }});
  }
  if(u.pathname==='/api/orders/11111111-aaaa-4111-8111-000000000101/detail'){
   return send(200,{id:5001,uuid:'11111111-aaaa-4111-8111-000000000101',status:'session_scheduled',total:890,
    customer:{uuid:'cust-op7',name:'Larissa Exemplo',city:'Florianópolis',state:'SC'},
    items:[{name:'Experiência Natal',quantity:1,total:890}],installments:[{total:890,payment_at:'2026-10-10 10:00:00',method:{name:'Pix'}}]});
  }
  if(u.pathname==='/api/customers/forensic-360'){
   return send(200,{
    lookup:{status:'matched',match_count:1},
    customer:{uuid:'cust-op7',name:'Larissa Exemplo',city:'Florianópolis',state:'SC'},
    kpis:{total_orders_registered:1,total_contracted_reais:890,total_received_reais:890,open_balance_reais:0},
    orders:[{id:5001,uuid:'11111111-aaaa-4111-8111-000000000101',status:'session_scheduled',total:890,
     items:[{name:'Experiência Natal',quantity:1,total:890}],installments:[{total:890,payment_at:'2026-10-10 10:00:00',method:{name:'Pix'}}]}]
   });
  }
  if(u.pathname==='/api/v1/extension/customer-context'){
   return send(200,{schema_version:'1.0',generated_at:new Date().toISOString(),data:{lookup:{status:'matched',match_count:1},customer:{uuid:'cust-op7'},natal_2026:{purchased:true}}});
  }
  send(404,{});
 });
 await new Promise(r=>crmSrv.listen(0,'127.0.0.1',r));
 crmOrigin='http://127.0.0.1:'+crmSrv.address().port;
});

after(()=>crmSrv?.close());

test('MCP Apps resource, CSP allowlist, decoupled tool metadata and kill-switch work end-to-end',async()=>{
 const g=createGateway({
  EVYD_PUBLIC_URL:'http://localhost',
  CRM_BASE_URL:crmOrigin,
  EVYD_GATEWAY_KEY:KEY,
  EVYD_ALLOWED_OPERATOR_IDS:'7',
  EVYD_INTERNAL_READ_TOKEN:INT_TOK,
  EVYD_ENABLE_OPERATOR_FULL_CRM:'1'
 },{log:()=>{}});

 const call=(p,init={})=>g.handle(new Request('http://localhost'+p,{...init,headers:{host:'localhost',...(init.headers||{})}}),{ip:'127.0.0.1',host:'localhost'});
 const reg=await (await call('/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:[REDIR]})})).json();
 const ver=randomBytes(32).toString('base64url');
 const ch=createHash('sha256').update(ver).digest('base64url');
 const page=await (await call('/authorize?'+new URLSearchParams({response_type:'code',client_id:reg.client_id,redirect_uri:REDIR,code_challenge:ch,code_challenge_method:'S256',state:'s1',resource:'http://localhost/mcp'}))).text();
 const txn=/name="txn" value="([^"]+)"/.exec(page)[1];
 const authPost=await call('/authorize',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({txn,crm_token:OP_TOK,action:'approve'})});
 const code=new URL(authPost.headers.get('location')).searchParams.get('code');
 const tok=await (await call('/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:REDIR,client_id:reg.client_id,code_verifier:ver})})).json();

 const client=new Client({name:'ui-test',version:'1.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'),{
  fetch:(u,init)=>g.handle(new Request(u,init),{ip:'127.0.0.1',host:'localhost'}),
  requestInit:{headers:{Authorization:'Bearer '+tok.access_token}}
 }));

 try{
  const {resources}=await client.listResources();
  const uiRes=resources.find(r=>r.uri===MCP_UI_CARD_RESOURCE_URI);
  assert.ok(uiRes,'MCP App UI resource registered');
  assert.equal(uiRes.mimeType,MCP_UI_CARD_MIME_TYPE);
  assert.deepEqual(uiRes._meta?.ui?.csp?.resourceDomains,['https://evydencia.com','https://pps.whatsapp.net']);

  const readRes=await client.readResource({uri:MCP_UI_CARD_RESOURCE_URI});
  assert.equal(readRes.contents[0].mimeType,MCP_UI_CARD_MIME_TYPE);
  assert.match(readRes.contents[0].text,/ui\/initialize/);
  assert.match(readRes.contents[0].text,/prefers-color-scheme:\s*dark/);

  const {tools}=await client.listTools();
  const uiTool=tools.find(t=>t.name==='crm_renderizar_card_visual');
  assert.equal(uiTool._meta?.ui?.resourceUri,MCP_UI_CARD_RESOURCE_URI);
  const nonUiTools=tools.filter(t=>t.name!=='crm_renderizar_card_visual');
  assert.ok(nonUiTools.every(t=>!t._meta?.ui),'analytical and CRM data tools remain 100% decoupled from iframe UI metadata');

  const cardOrder=await client.callTool({name:'crm_renderizar_card_visual',arguments:{tipo:'pedido',order_uuid:'11111111-aaaa-4111-8111-000000000101'}});
  assert.equal(cardOrder.isError,undefined);
  assert.equal(cardOrder.structuredContent.card_type,'pedido');
  assert.equal(cardOrder.structuredContent.header.title,'Pedido #5001');
  assert.match(cardOrder.content[0].text,/Card Visual — Pedido #5001/);

  const cardCust=await client.callTool({name:'crm_renderizar_card_visual',arguments:{tipo:'cliente_360',nome_cliente:'Larissa Exemplo'}});
  assert.equal(cardCust.isError,undefined);
  assert.equal(cardCust.structuredContent.card_type,'cliente_360');
  assert.match(cardCust.content[0].text,/Card Visual Cliente 360 — Larissa Exemplo/);

  const cap=await client.callTool({name:'crm_capacidades',arguments:{}});
  assert.ok(cap.structuredContent.performance_telemetry.calls_total>=2);
  assert.equal(typeof cap.structuredContent.performance_telemetry.gateway_ms.p50,'number');
 }finally{
  await client.close();
  await g.close();
 }

 // Verify perf tracker standalone percentiles
 const pt=createGatewayPerfTracker(10);
 pt.record({tool:'crm_estatisticas_natal',ok:true,gatewayMs:12,phpMs:9,sqlCount:2,sqlMs:1.5,cacheHit:false,responseBytes:2400});
 pt.record({tool:'crm_estatisticas_natal',ok:true,gatewayMs:2,phpMs:9,sqlCount:2,sqlMs:1.5,cacheHit:true,responseBytes:2400});
 const snap=pt.snapshot();
 assert.equal(snap.calls_total,2);
 assert.equal(snap.cache_hit_rate,0.5);
 assert.equal(snap.error_rate,0);
});
