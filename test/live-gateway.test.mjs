// Deterministic LIVE acceptance tests: in-process gateway + fake Sanctum CRM on 127.0.0.1.
// All tokens, phones and names below are synthetic fixtures.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createGateway,LIVE_TOOL_NAMES,DIRECT_CRM_TOOL_NAMES,FORENSIC_CRM_TOOL_NAMES,PROPOSAL_CRM_TOOL_NAMES,UI_CRM_TOOL_NAMES} from '../src/live-gateway.mjs';
import {gatewayConfig,createSealer,redirectAllowed} from '../src/oauth-gateway.mjs';

const R=['extension:bootstrap','extension:customer-read'];
const OPS={
 'fake-op7-read-000001':{id:7,ab:R},
 'fake-op9-read-000002':{id:9,ab:[...R,'extension:proposal-read']},
 'fake-op7-write-00003':{id:7,ab:[...R,'extension:proposal-read','extension:proposal-write','extension:participant-write','extension:gallery-read']},
 'fake-op7-wild-000007':{id:7,ab:['*']},
 'fake-op99-read-00004':{id:99,ab:R},
 'fake-op7-expd-000005':{id:7,ab:R,exp:'2020-01-01T00:00:00Z'},
 'fake-op7-read-000006':{id:7,ab:R}
};
const INTERNAL_TOK='fake-internal-crm-read-token-000001';
const revoked=new Set(),crmLog=[],logs=[],secrets=[...Object.keys(OPS),INTERNAL_TOK];
const KEY=randomBytes(32).toString('base64');
const REDIR='https://chatgpt.com/connector_platform_oauth_redirect';
// The SDK bearer gate also checks expiresAt against the real clock, so start from real time.
let crm,crmUrl,clock=Date.now();
const now=()=>clock;
const env=x=>({EVYD_PUBLIC_URL:'http://localhost',CRM_BASE_URL:crmUrl,EVYD_GATEWAY_KEY:KEY,EVYD_ALLOWED_OPERATOR_IDS:'7,9',CRM_REQUEST_TIMEOUT_MS:'400',...x});
const gw=x=>createGateway(env(x),{log:e=>logs.push(e),now});
const call=(g,path,init={},host='localhost')=>g.handle(new Request(new URL(path,'http://localhost'),init),{ip:'10.0.0.1',host});
const form=o=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(o).toString()});
const env1=data=>JSON.stringify({schema_version:'1.0',generated_at:new Date(clock).toISOString(),data});

before(async()=>{
 crm=createServer((req,res)=>{
  const u=new URL(req.url,'http://x'),auth=req.headers.authorization||'',tok=auth.replace(/^Bearer /,'');
  crmLog.push({method:req.method,path:u.pathname,tok,idempotencyKey:req.headers['x-idempotency-key']||null});
  const send=(s,b,ct='application/json')=>{res.writeHead(s,{'Content-Type':ct});res.end(b)};
  if(req.method==='POST'&&u.pathname.startsWith('/api/v1/extension/proposals/')){
   const op=OPS[tok];
   if(!op||revoked.has(tok))return send(401,JSON.stringify({message:'Unauthenticated.'}));
   let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
    const body=JSON.parse(raw||'{}');
    if(u.pathname==='/api/v1/extension/proposals/preview')
     return send(200,env1({ready:true,variant:body.name?'with_name':'without_name',recipient:{name:body.name||null,has_name:Boolean(body.name)},campaign:{id:415,type:'christmas_proposal'},message:body.name?`Olá, ${body.name}! Proposta Natal 2026`:'Olá! Proposta Natal 2026'}));
    if(u.pathname==='/api/v1/extension/proposals/schedule')
     return send(200,env1({scheduled:true,proposal:{id:901,uuid:'prop-uuid-901',status:'waiting',variant:body.name?'with_name':'without_name',campaign_id:415,send_after:'2026-10-25T13:20:00-03:00',cancel_until:'2026-10-25T13:20:00-03:00'},customer:{exists:true}}));
    send(404,'{}');
   });
   return;
  }
  if(req.method!=='GET')return send(405,'{}');
  if(u.pathname==='/health/live')return send(200,JSON.stringify({status:'ok'}));
  if(u.pathname.startsWith('/api/orders/')||u.pathname.startsWith('/api/reports/')){
   if(auth!==INTERNAL_TOK)return send(401,JSON.stringify({message:'Unauthorized'}));
   const sampleOrder={id:5001,uuid:'11111111-aaaa-4111-8111-000000000101',status:{id:10,name:'Aguardando Retirar'},customer:{name:'Cliente Ficticia 7',whatsapp:'48999990001'},created_at:'2026-10-01T17:33:09.000000Z',schedule_1:'2026-11-10 10:00:00',items:[{id:1,quantity:'1.000',total:'450.00',product:{name:'Experiência Então é Natal',slug:'natal',reference:'enatal'}}],installments:[{total:'200.00',method:{name:'Pix - Pagar.me',type:{name:'Pix'}}}],participants:[{name:'Crianca Ficticia',birthday:'2024-04-30',age:'2 anos e 5 meses',relationship:'Filho (a)'}],summary:{total:450,received:200,remaining:250}};
   const newerOrder={id:5127,uuid:'22222222-bbbb-4222-8222-000000000202',status:{id:6,name:'Sessão Agendada'},customer:{name:'Larissa Exemplo',whatsapp:'48988881775'},created_at:'2026-10-23T17:33:09.000000Z',schedule_1:'2026-11-02 09:00:00',items:[{id:2,quantity:'1.000',total:'480.00',product:{name:'Experiência Então é Natal',slug:'natal',reference:'enatal'}}],installments:[{total:'120.00',method:{name:'Pix - Pagar.me',type:{name:'Pix'}}}],participants:[{name:'João Miguel Exemplo',birth:'2024-04-30',birth_for_extense:'há 2 anos e 5 meses',relation:{id:1,name:'Filho (a)'}}],summary:{total:480,received:120,remaining:360}};
   if(u.pathname==='/api/orders/search')return send(200,JSON.stringify({data:[sampleOrder,newerOrder]}));
   if(u.pathname==='/api/orders/11111111-aaaa-4111-8111-000000000101/detail')return send(200,JSON.stringify({data:sampleOrder}));
   if(u.pathname==='/api/reports/natal-statistics')return send(200,JSON.stringify({source:'CRM_CANONICAL_NATAL_STATISTICS',reference_year:2026,cutoff_mmdd:u.searchParams.get('date')||'10-25',detail_level:u.searchParams.get('detail_level')||'resumo',kpis_2026:{valid_orders:101,unique_customers:100,scheduled_sessions:91,confirmed_realized_sessions:23,past_scheduled_sessions:27,past_scheduled_pending_confirmation:4,contracted_revenue_cents:5477600,contracted_revenue_reais:54776},ytd_comparison_at_cutoff:{'2026':{year:2026,accum_orders:101},'2025':{year:2025,accum_orders:142,diff_orders_2026_vs_year:-41},'2024':{year:2024,accum_orders:124,diff_orders_2026_vs_year:-23}}}));
   if(u.pathname==='/api/reports/natal-participants-statistics')return send(200,JSON.stringify({source:'CRM_CANONICAL_NATAL_PARTICIPANTS_ANALYTICS',year_scope:u.searchParams.get('year')||'2026',population_reconciliation:{valid_natal_orders_count:101,sessions_with_participants_count:93,valid_orders_without_participants_count:8,total_participants_count:326,children_0_17_count:134,adults_18_plus_count:186,pets_count:1,humans_without_birth_date_count:5,reconciled:true},age_distribution:{gender_distribution:{available:false,unavailable_reason:'no_gender_column'}}}));
   if(u.pathname==='/api/reports/sold-items'){if(!u.searchParams.get('order[created-start]')&&!u.searchParams.get('order[created-end]'))return send(422,JSON.stringify({message:'The given data was invalid.'}));return send(200,JSON.stringify({data:[{item:'Mini Sessao Natal',reference:'8008',year:2026,month:10,solds:12}]}))}
   if(u.pathname==='/api/reports/christmas-orders-without-participants')return send(200,JSON.stringify([{order_uuid:'11111111-aaaa-4111-8111-000000000101',customer_name:'Cliente Ficticia 7',customer_whatsapp:'48999990001',current_status:'payment_confirmed',participants:0}]));
   if(u.pathname==='/api/reports/customers-with-christmas-orders')return send(200,JSON.stringify([{name:'Cliente Ficticia 7',whatsapp:'48999990001',email:'ficticia@example.test'}]));
   if(u.pathname==='/api/reports/customers-without-christmas-orders')return send(200,JSON.stringify([{name:'Cliente Ficticia 9',whatsapp:'48999990002',email:'ficticia9@example.test'}]));
   return send(404,'{}');
  }
  if(!u.pathname.startsWith('/api/v1/extension/'))return send(404,'{}');
  const op=OPS[tok];
  if(!op||revoked.has(tok))return send(401,JSON.stringify({message:'Unauthenticated.'}));
  if(u.pathname==='/api/v1/extension/bootstrap')return send(200,env1({operator:{id:op.id,name:'Operadora Ficticia'},server:{timezone:'America/Sao_Paulo',api_version:'1.0',minimum_extension_version:'1.0.0'},features:{proposals:{enabled:true},natal_2026:{enabled:true,reference_year:2026}},token:{abilities:op.ab,expires_at:op.exp||'2099-01-01T00:00:00Z'}}));
  const phone=u.searchParams.get('phone');
  if(phone==='11999990503')return send(503,'{"message":"down"}');
  if(phone==='11999990777')return send(200,'not-json');
  if(phone==='11999990888'){const t=setTimeout(()=>send(200,'{}'),1500);res.on('close',()=>clearTimeout(t));return}
  const customer={uuid:'cust-op'+op.id,display_name:'Cliente Ficticia '+op.id,first_name:'Ficticia',customer_since:'2023-01-01',lifecycle_stage:'recurring',phone:'+55'+phone};
  const history={lifecycle_stage:'recurring',orders_count:1,completed_sessions_count:1,lifetime_value:350.5,average_ticket:350.5,years_attended:[2025]};
  if(u.pathname==='/api/v1/extension/customer-context')return send(200,env1({lookup:{status:'matched',match_count:1,normalized_e164:'+55'+phone},customer,current_order:null,natal_2026:{purchased:false,mode:'prospect'},history,capabilities:{proposal_preview:{allowed:true,reason:null},proposal_schedule:{allowed:true,reason:null}}}));
  if(u.pathname==='/api/v1/extension/customer-360')return send(200,env1({lookup:{status:'matched',match_count:1},customer,kpis:history,natal_2026:{purchased:false,mode:'prospect'},current_order:null,history:{page:1,per_page:5,total:1,has_more:false},orders:[{uuid:'ord-1',campaign_key:'natal-2025',title:'Natal 2025',package_name:'Ho Ho Ho',status:'order_completed',status_label:'Concluído',total_amount:350.5,balance_pending:0,session_date:'2025-12-10',created_at:'2025-10-01',payment_status:'paid',participants:[{name:'Crianca Ficticia',birthday:'2020-01-01'}]}]}));
  send(404,'{}');
 });
 await new Promise(r=>crm.listen(0,'127.0.0.1',r));
 crmUrl='http://127.0.0.1:'+crm.address().port;
});
after(()=>new Promise(r=>crm.close(r)));

async function connect(g,crmToken,{exchange=true}={}){
 const reg=await call(g,'/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:[REDIR],token_endpoint_auth_method:'none',client_name:'ChatGPT'})});
 assert.equal(reg.status,201);
 const {client_id}=await reg.json();
 const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
 const q=new URLSearchParams({response_type:'code',client_id,redirect_uri:REDIR,code_challenge:challenge,code_challenge_method:'S256',state:'st-123',resource:'http://localhost/mcp',scope:'crm.read'});
 const pg=await call(g,'/authorize?'+q);
 assert.equal(pg.status,200);
 const txn=/name="txn" value="([^"]+)"/.exec(await pg.text())[1];
 const post=await call(g,'/authorize',form({txn,crm_token:crmToken,action:'approve'}));
 if(post.status!==302)return {denied:post.status,html:await post.text()};
 const loc=new URL(post.headers.get('location'));
 const code=loc.searchParams.get('code');
 secrets.push(code);
 if(!exchange)return {client_id,code,verifier,loc};
 const t=await call(g,'/token',form({grant_type:'authorization_code',code,redirect_uri:REDIR,client_id,code_verifier:verifier,resource:'http://localhost/mcp'}));
 assert.equal(t.status,200);
 const tokens=await t.json();secrets.push(tokens.access_token,tokens.refresh_token);
 return {client_id,tokens,loc};
}
async function mcp(g,at){
 const transport=new StreamableHTTPClientTransport(new URL('http://localhost/mcp'),{fetch:(u,init)=>{const r=new Request(u,init);r.headers.set('authorization','Bearer '+at);return g.handle(r,{ip:'10.0.0.1',host:'localhost'})}});
 const client=new Client({name:'acceptance',version:'1.0.0'});
 await client.connect(transport);
 return client;
}
const rawMcp=(g,at)=>call(g,'/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...(at?{authorization:'Bearer '+at}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
const err=r=>JSON.parse(r.content[0].text).error;

test('config fail-closed: mock, shared token, weak key, insecure URL, empty allowlist',()=>{
 for(const bad of [{EVYD_MOCK_MODE:'1'},{CRM_READ_TOKEN:'x'.repeat(20)},{EVYDENCIA_LEGACY_TOKEN:'y'.repeat(20)},{EVYD_GATEWAY_KEY:'c2hvcnQ='},{EVYD_PUBLIC_URL:'http://mcp.example.com'},{EVYD_ALLOWED_OPERATOR_IDS:''},{EVYD_ALLOWED_OPERATOR_IDS:'7,abc'}])
  assert.throws(()=>gatewayConfig(env(bad)),/gateway_config_/);
 assert.equal(gatewayConfig(env({})).resource,'http://localhost/mcp');
 assert.ok(redirectAllowed('https://chatgpt.com/connector/oauth/AbC_12-3',gatewayConfig(env({})).redirects));
 for(const u of ['https://chatgpt.com/connector/oauth/a/../x','https://evil.example/connector_platform_oauth_redirect','https://chatgpt.com/connector_platform_oauth_redirect#x'])
  assert.equal(redirectAllowed(u,gatewayConfig(env({})).redirects),false);
});

test('discovery metadata advertises PKCE S256, RFC 9207 iss and the protected resource',async()=>{
 const g=gw();
 const pr=await (await call(g,'/.well-known/oauth-protected-resource/mcp')).json();
 assert.equal(pr.resource,'http://localhost/mcp');
 assert.ok(pr.authorization_servers.some(s=>s.replace(/\/$/,'')==='http://localhost'));
 const as=await (await call(g,'/.well-known/oauth-authorization-server')).json();
 assert.deepEqual(as.code_challenge_methods_supported,['S256']);
 assert.equal(as.authorization_response_iss_parameter_supported,true);
 assert.equal(as.registration_endpoint,'http://localhost/register');
});

test('401 without auth and with invalid, wrong-type, wrong-audience or expired token',async()=>{
 const g=gw();
 const none=await rawMcp(g);
 assert.equal(none.status,401);
 assert.match(none.headers.get('www-authenticate')||'',/resource_metadata=/);
 assert.equal((await rawMcp(g,'garbage')).status,401);
 const {tokens}=await connect(g,'fake-op7-read-000001');
 assert.equal((await rawMcp(g,tokens.refresh_token)).status,401,'refresh token is not an access token');
 const s=createSealer(Buffer.from(KEY,'base64'));
 const forged=s.seal('eva',{cid:'c',op:'7',up:'fake-op7-read-000001',sc:'crm.read',aud:'http://localhost/other',exp:Math.floor(clock/1000)+600});
 assert.equal((await rawMcp(g,forged)).status,401);
 const before=clock;clock+=3601*1000;
 try{assert.equal((await rawMcp(g,tokens.access_token)).status,401)}finally{clock=before}
});

test('403 without scope or for an operator no longer authorized',async()=>{
 const g=gw();
 const s=createSealer(Buffer.from(KEY,'base64'));
 const noScope=s.seal('eva',{cid:'c',op:'7',up:'fake-op7-read-000001',sc:'other',aud:'http://localhost/mcp',exp:Math.floor(clock/1000)+600});
 assert.equal((await rawMcp(g,noScope)).status,403);
 const {tokens}=await connect(g,'fake-op7-read-000001');
 const onlyNine=gw({EVYD_ALLOWED_OPERATOR_IDS:'9'});
 assert.equal((await rawMcp(onlyNine,tokens.access_token)).status,403);
});

test('authorization accepts standard ExtensionAbilities::operator() token by default, refuses wildcard/non-allowlisted/expired, and honors EVYD_STRICT_READONLY_TOKEN=1',async()=>{
 const g=gw();
 const std=await connect(g,'fake-op7-write-00003');
 assert.ok(std.tokens?.access_token,'standard operator token with ExtensionAbilities::operator() is accepted');
 assert.equal((await connect(g,'fake-op7-wild-000007')).denied,403,'wildcard token is always refused');
 assert.equal((await connect(g,'fake-op99-read-00004')).denied,403);
 assert.equal((await connect(g,'fake-op7-expd-000005')).denied,403);
 assert.equal((await connect(g,'fake-op-unknown-0007')).denied,403);
 const strictGw=gw({EVYD_STRICT_READONLY_TOKEN:'1'});
 assert.equal((await connect(strictGw,'fake-op7-write-00003')).denied,403,'EVYD_STRICT_READONLY_TOKEN=1 refuses write-capable tokens');
});

test('PKCE, single-use code, redirect binding and registration allowlist',async()=>{
 const g=gw();
 const bad=await call(g,'/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:['https://evil.example/cb']})});
 assert.equal((await bad.json()).error,'invalid_redirect_uri');
 const c=await connect(g,'fake-op7-read-000001',{exchange:false});
 assert.equal(c.loc.searchParams.get('iss'),'http://localhost');
 assert.equal(c.loc.searchParams.get('state'),'st-123');
 const tok=v=>call(g,'/token',form({grant_type:'authorization_code',code:c.code,redirect_uri:REDIR,client_id:c.client_id,code_verifier:v}));
 assert.equal((await (await tok(randomBytes(32).toString('base64url'))).json()).error,'invalid_grant');
 assert.equal((await call(g,'/token',form({grant_type:'authorization_code',code:c.code,redirect_uri:'https://chatgpt.com/connector/oauth/x',client_id:c.client_id,code_verifier:c.verifier}))).status,400);
 const ok=await tok(c.verifier);assert.equal(ok.status,200);secrets.push((await ok.json()).access_token);
 assert.equal((await (await tok(c.verifier)).json()).error,'invalid_grant','code replay');
 const unreg=await call(g,'/authorize?'+new URLSearchParams({response_type:'code',client_id:c.client_id,redirect_uri:'https://chatgpt.com/connector/oauth/other',code_challenge:'a'.repeat(43),code_challenge_method:'S256'}));
 assert.equal(unreg.status,400);
});

test('authorized read-only operator: exact tool set, customer lookup and Cliente 360 without PII leaks',async()=>{
 const g=gw();
 const {tokens}=await connect(g,'fake-op7-read-000001');
 const client=await mcp(g,tokens.access_token);
 try{
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(t=>t.name).sort(),[...LIVE_TOOL_NAMES].sort());
  assert.ok(tools.every(t=>t.annotations?.readOnlyHint===true&&t.annotations?.destructiveHint===false&&t.outputSchema?.type==='object'));
  assert.ok(!tools.some(t=>/agendar|enviar|cancel|previa|schedule|abort/.test(t.name)));
  crmLog.length=0;
  const r=await client.callTool({name:'crm_cliente_resumo',arguments:{telefone:'(11) 99999-0001'}});
  assert.equal(r.isError,undefined);
  assert.equal(r.structuredContent.lookup.status,'matched');
  assert.equal(r.structuredContent.customer.uuid,'cust-op7');
  const txt=JSON.stringify(r);
  assert.ok(!txt.includes('99999')&&!txt.includes('e164')&&!txt.includes('phone'));
  assert.ok(crmLog.filter(x=>x.path.startsWith('/api/v1/extension/')).every(x=>x.tok==='fake-op7-read-000001'));
  const h=await client.callTool({name:'crm_cliente_360',arguments:{telefone:'11999990001'}});
  assert.equal(h.structuredContent.orders[0].participants_count,1);
  assert.ok(!JSON.stringify(h).includes('Crianca')&&!JSON.stringify(h).includes('birthday'));
  const cap=await client.callTool({name:'crm_capacidades',arguments:{}});
  assert.equal(cap.structuredContent.mode,'LIVE_READ_ONLY_OAUTH');
  assert.equal(cap.structuredContent.version,'0.12.0');
  assert.equal(cap.structuredContent.tools.find(t=>t.tool==='crm_previa_proposta_natal').state,'NOT_AVAILABLE');
  assert.ok(!cap.structuredContent.tools.some(t=>t.state==='MOCK_ONLY'));
 }finally{await client.close()}
});

test('direct CRM read integration (replaces api.evydencia.com.br): orders and Natal reports without PII leaks',async()=>{
 const g=gw({EVYD_INTERNAL_READ_TOKEN:INTERNAL_TOK});
 const {tokens}=await connect(g,'fake-op7-write-00003');
 const client=await mcp(g,tokens.access_token);
 try{
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(t=>t.name).sort(),[...LIVE_TOOL_NAMES,...DIRECT_CRM_TOOL_NAMES].sort());
  const s=await client.callTool({name:'crm_pedidos_buscar',arguments:{}});
  assert.equal(s.isError,undefined);
  assert.equal(s.structuredContent.orders.length,2);
  assert.equal(s.structuredContent.orders[0].order_id,5127,'most recent order returned first');
  assert.equal(s.structuredContent.orders[0].created_at_brt,'2026-10-23 14:33:09');
  assert.equal(s.structuredContent.orders[0].package_name,'Experiência Então é Natal');
  assert.deepEqual(s.structuredContent.orders[0].payment_methods,['Pix']);
  assert.equal(s.structuredContent.orders[1].remaining_cents,25000);
  assert.ok(!JSON.stringify(s).includes('Crianca')&&!JSON.stringify(s).includes('48988881775'));
  const ns=await client.callTool({name:'crm_estatisticas_natal',arguments:{data_corte_mm_dd:'10-25'}});
  assert.equal(ns.structuredContent.kpis_2026.valid_orders,101);
  assert.equal(ns.structuredContent.kpis_2026.confirmed_realized_sessions,23);
  assert.equal(ns.structuredContent.kpis_2026.past_scheduled_sessions,27);
  assert.equal(ns.structuredContent.ytd_comparison_at_cutoff['2025'].accum_orders,142);
  assert.equal(ns.structuredContent.ytd_comparison_at_cutoff['2024'].accum_orders,124);
  const npDemo=await client.callTool({name:'crm_natal_participantes_estatisticas',arguments:{ano:'2026'}});
  assert.equal(npDemo.structuredContent.population_reconciliation.total_participants_count,326);
  assert.equal(npDemo.structuredContent.population_reconciliation.reconciled,true);
  const byName=await client.callTool({name:'crm_cliente_360',arguments:{nome_cliente:'Larissa Exemplo'}});
  assert.equal(byName.isError,undefined);
  assert.equal(byName.structuredContent.customer.uuid,'cust-op7');
  assert.equal(byName.structuredContent.orders.length,1);
  const d=await client.callTool({name:'crm_pedido_detalhe',arguments:{uuid:'11111111-aaaa-4111-8111-000000000101'}});
  assert.equal(d.structuredContent.order.order_id,5001);
  const si=await client.callTool({name:'crm_relatorio_itens_vendidos',arguments:{inicio:'2026-10-01',fim:'2026-10-25',slug:'natal'}});
  assert.equal(si.structuredContent.items[0].solds,12);
  const np=await client.callTool({name:'crm_relatorio_natal_sem_participantes',arguments:{limite:10}});
  assert.equal(np.structuredContent.orders[0].customer_phone_masked,'(**) *****-0001');
  assert.ok(!JSON.stringify(np).includes('48999990001'));
  const cn=await client.callTool({name:'crm_relatorio_clientes_natal',arguments:{comprou_natal:true,busca_nome:'Ficticia'}});
  assert.equal(cn.structuredContent.customers[0].phone_masked,'(**) *****-0001');
  assert.ok(!JSON.stringify(cn).includes('ficticia@example.test')&&!JSON.stringify(cn).includes('48999990001'));
 }finally{await client.close()}
});

test('operator isolation: each session reaches the CRM only with its own Sanctum token',async()=>{
 const g=gw();
 const a=await connect(g,'fake-op7-read-000001'),b=await connect(g,'fake-op9-read-000002');
 const ca=await mcp(g,a.tokens.access_token),cb=await mcp(g,b.tokens.access_token);
 try{
  crmLog.length=0;
  const rb=await cb.callTool({name:'crm_cliente_resumo',arguments:{telefone:'11999990001'}});
  assert.equal(rb.structuredContent.customer.uuid,'cust-op9');
  assert.ok(crmLog.filter(x=>x.path.startsWith('/api/v1/extension/')).every(x=>x.tok==='fake-op9-read-000002'));
  crmLog.length=0;
  const ra=await ca.callTool({name:'crm_cliente_resumo',arguments:{telefone:'11999990001'}});
  assert.equal(ra.structuredContent.customer.uuid,'cust-op7');
  assert.ok(crmLog.filter(x=>x.path.startsWith('/api/v1/extension/')).every(x=>x.tok==='fake-op7-read-000001'));
 }finally{await ca.close();await cb.close()}
});

test('CRM 503, invalid JSON and timeout fail closed with generic codes',async()=>{
 const g=gw();
 const {tokens}=await connect(g,'fake-op7-read-000001');
 const c=await mcp(g,tokens.access_token);
 try{
  const t=async p=>c.callTool({name:'crm_cliente_resumo',arguments:{telefone:p}});
  const a=await t('11999990503');assert.equal(a.isError,true);assert.equal(err(a),'crm_http_503');
  const b=await t('11999990777');assert.equal(err(b),'crm_invalid_json');
  const d=await t('11999990888');assert.equal(err(d),'crm_unavailable');
  const e=await t('12345678');assert.equal(err(e),'invalid_mobile');
  const z=await t('123');assert.equal(z.isError,true,'schema rejects too-short input before any CRM call');
 }finally{await c.close()}
});

test('upstream revocation: tool error, then 401 on next request and refresh denied',async()=>{
 const g=gw();
 const {client_id,tokens}=await connect(g,'fake-op7-read-000006');
 const r=await call(g,'/token',form({grant_type:'refresh_token',refresh_token:tokens.refresh_token,client_id}));
 assert.equal(r.status,200);secrets.push((await r.json()).access_token);
 const c=await mcp(g,tokens.access_token);
 try{
  revoked.add('fake-op7-read-000006');
  const x=await c.callTool({name:'crm_cliente_resumo',arguments:{telefone:'11999990001'}});
  assert.equal(err(x),'operator_token_revoked');
 }finally{await c.close().catch(()=>{})}
 assert.equal((await rawMcp(g,tokens.access_token)).status,401);
 const rr=await call(g,'/token',form({grant_type:'refresh_token',refresh_token:tokens.refresh_token,client_id}));
 assert.equal((await rr.json()).error,'invalid_grant');
});

test('per-operator rate limit and Host header validation',async()=>{
 const g=gw({EVYD_RATE_MCP_PER_MIN:'2'});
 const {tokens}=await connect(g,'fake-op9-read-000002');
 const s=[];for(let i=0;i<3;i++)s.push((await rawMcp(g,tokens.access_token)).status);
 assert.notEqual(s[0],429);assert.equal(s[2],429);
 assert.equal((await call(g,'/mcp',{method:'POST'},'evil.example')).status,403);
});

test('no write call ever reached the CRM and logs carry no secrets or PII',()=>{
 assert.ok(crmLog.length>0);
 assert.ok(crmLog.every(x=>x.method==='GET'),'only GET upstream');
 assert.ok(!crmLog.some(x=>/proposals|schedule|abort/.test(x.path)));
 const dump=JSON.stringify(logs);
 for(const s of secrets.filter(Boolean))assert.ok(!dump.includes(s),'secret leaked in logs');
 for(const pii of ['99999','Ficticia','Crianca','+55','cust-op'])assert.ok(!dump.includes(pii),'PII leaked: '+pii);
 assert.ok(logs.some(l=>l.evt==='tool'&&l.ok===true&&typeof l.op==='string'));
});

test('EVYD_ENABLE_OPERATOR_FULL_CRM=1 exposes Natal 2026 proposal preview/dispatch (requiring explicit confirmation), forensic customer search, full participants and CRM URLs',async()=>{
 const g=gw({EVYD_INTERNAL_READ_TOKEN:INTERNAL_TOK,EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 const hz=await call(g,'/healthz');
 assert.equal(hz.status,200);
 const hzJson=await hz.json();
 assert.equal(hzJson.version,'0.12.0');
 assert.equal(typeof hzJson.build_commit,'string');
 const {tokens}=await connect(g,'fake-op7-write-00003');
 const rawRes=await rawMcp(g,tokens.access_token);
 assert.equal(rawRes.headers.get('cache-control'),'private, no-store');
 const client=await mcp(g,tokens.access_token);
 try{
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(t=>t.name).sort(),[...LIVE_TOOL_NAMES,...DIRECT_CRM_TOOL_NAMES,...FORENSIC_CRM_TOOL_NAMES,...PROPOSAL_CRM_TOOL_NAMES,...UI_CRM_TOOL_NAMES].sort());
  assert.ok(tools.every(t=>t.outputSchema?.type==='object'),'every tool publishes a valid JSON Schema outputSchema');
  const cap=await client.callTool({name:'crm_capacidades',arguments:{}});
  assert.equal(cap.structuredContent.version,'0.12.0');
  assert.equal(cap.structuredContent.forensic_audit_enabled,true);
  assert.equal(cap.structuredContent.mcp_ui_apps_enabled,true);
  assert.equal(cap.structuredContent.legacy_v012_tools_preserved_count,17);
  assert.equal(cap.structuredContent.write_requires_explicit_confirmation,true);
  assert.ok(!cap.structuredContent.tools.some(t=>t.state==='MOCK_ONLY'),'live capability inventory excludes legacy MOCK_ONLY tools');
  assert.equal(typeof cap.structuredContent.build_commit,'string');
  assert.ok(cap.content[0].text.length<260,'text content summary is concise instead of duplicating JSON');
  const s=await client.callTool({name:'crm_pedidos_buscar',arguments:{}});
  assert.equal(s.structuredContent.orders[0].crm_order_url,'https://evydencia.com/gestao/pedidos/22222222-bbbb-4222-8222-000000000202/detalhes');
  assert.equal(s.structuredContent.orders[0].participants[0].name,'João Miguel Exemplo');
  assert.equal(s.structuredContent.orders[0].participants[0].birth_date,'2024-04-30');
  assert.equal(s.structuredContent.orders[0].participants[0].kinship,'Filho (a)');
  assert.equal(s.structuredContent.orders[0].participants[0].session_reference_date,'2026-11-02');
  const dById=await client.callTool({name:'crm_pedido_detalhe',arguments:{order_id:5001}});
  assert.equal(dById.structuredContent.order.order_id,5001);
  const np=await client.callTool({name:'crm_relatorio_natal_sem_participantes',arguments:{limite:10}});
  assert.equal(np.structuredContent.orders[0].crm_order_url,'https://evydencia.com/gestao/pedidos/11111111-aaaa-4111-8111-000000000101/detalhes');
  const prev=await client.callTool({name:'crm_previa_proposta_natal',arguments:{telefone:'(48) 99924-4309',nome:'Luciano'}});
  assert.equal(prev.isError,undefined);
  assert.equal(prev.structuredContent.ready,true);
  assert.equal(prev.structuredContent.campaign_id,415);
  crmLog.length=0;
  const omittedConfirm=await client.callTool({name:'crm_enviar_proposta_natal',arguments:{telefone:'(48) 99924-4309',nome:'Luciano'}});
  assert.equal(omittedConfirm.isError,true,'omitted confirmado_pelo_operador fails closed via schema');
  const blocked=await client.callTool({name:'crm_enviar_proposta_natal',arguments:{telefone:'(48) 99924-4309',nome:'Luciano',confirmado_pelo_operador:false}});
  assert.equal(blocked.isError,true);
  assert.equal(err(blocked),'operator_confirmation_required');
  assert.ok(!crmLog.some(x=>x.path==='/api/v1/extension/proposals/schedule'),'zero schedule calls before explicit true confirmation');
  const sent=await client.callTool({name:'crm_enviar_proposta_natal',arguments:{telefone:'(48) 99924-4309',nome:'Luciano',confirmado_pelo_operador:true,request_id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'}});
  assert.equal(sent.isError,undefined);
  assert.equal(sent.structuredContent.scheduled,true);
  assert.equal(sent.structuredContent.dispatch_uuid,'prop-uuid-901');
  assert.equal(crmLog.find(x=>x.path==='/api/v1/extension/proposals/schedule')?.idempotencyKey,'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
 }finally{await client.close()}
});

test('Regression P0 — write scope enforcement, securitySchemes metadata, operator bridge cache isolation, and public availability 404 vs empty slots',async()=>{
 const g=gw({EVYD_INTERNAL_READ_TOKEN:INTERNAL_TOK,EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 const asMeta=await (await call(g,'/.well-known/oauth-authorization-server')).json();
 assert.ok(asMeta.scopes_supported.includes('crm.read'));
 assert.ok(asMeta.scopes_supported.includes('crm.proposal.write'));

 // Operator 9 has extension:proposal-read ONLY (NO extension:proposal-write)
 const op9Conn=await connect(g,'fake-op9-read-000002');
 assert.ok(!op9Conn.tokens.scope.split(/\s+/).includes('crm.proposal.write'),'read-only operator never receives crm.proposal.write');
 const op7Conn=await connect(g,'fake-op7-write-00003');
 assert.ok(op7Conn.tokens.scope.split(/\s+/).includes('crm.proposal.write'),'write-capable operator receives crm.proposal.write');

 const c9=await mcp(g,op9Conn.tokens.access_token);
 const c7=await mcp(g,op7Conn.tokens.access_token);
 try{
  const {tools}=await c7.listTools();
  const writeTool=tools.find(t=>t.name==='crm_enviar_proposta_natal');
  assert.deepEqual(writeTool._meta?.securitySchemes,[{type:'oauth2',scopes:['crm.read','crm.proposal.write']}]);
  const readTool=tools.find(t=>t.name==='crm_pedido_detalhe');
  assert.deepEqual(readTool._meta?.securitySchemes,[{type:'oauth2',scopes:['crm.read']}]);

  // Op9 can preview (has extension:proposal-read)
  const prev9=await c9.callTool({name:'crm_previa_proposta_natal',arguments:{telefone:'(48) 99924-4309',nome:'Teste'}});
  assert.equal(prev9.isError,undefined);

  // Op9 MUST be blocked server-side from crm_enviar_proposta_natal BEFORE hitting CRM!
  crmLog.length=0;
  const denyWrite=await c9.callTool({name:'crm_enviar_proposta_natal',arguments:{telefone:'(48) 99924-4309',nome:'Teste',confirmado_pelo_operador:true}});
  assert.equal(denyWrite.isError,true);
  const denyBody=JSON.parse(denyWrite.content[0].text);
  assert.equal(denyBody.error_category,'UNAUTHORIZED');
  assert.ok(!crmLog.some(x=>x.path==='/api/v1/extension/proposals/schedule'),'zero CRM write requests from read-only operator');

  // Public availability HTTP 404 (e.g. internal ref "enatal" instead of public slug "entao-e-natal") must return NOT_FOUND error, never fake 0 slots
  const pub404=await c7.callTool({name:'crm_horarios_publicos',arguments:{campanha:'natal',pacote:'enatal',inicio:'2026-11-01',fim:'2026-11-10'}});
  assert.equal(pub404.isError,true);
  const pubBody=JSON.parse(pub404.content[0].text);
  assert.equal(pubBody.error_category,'NOT_FOUND');
  assert.match(pubBody.hint||pubBody.error,/entao-e-natal/);
 }finally{
  await c9.close();
  await c7.close();
 }
});

test('PrintServer synthetic job status is readable with print scope, never needs a fake CRM order',async()=>{
 const TEST_JOB='95bab7dc-62e9-498f-afbd-68775f05e549';
 const statusCalls=[];
 const fakeFetch=async(input,options)=>{
  const url=String(input);
  if(url.startsWith('https://print.example.test/v1/jobs/')){
   statusCalls.push({url,method:options?.method});
   return new Response(JSON.stringify({job:{job_id:TEST_JOB,order_id:999999,state:'spooled'}}),{
    status:200,headers:{'Content-Type':'application/json'}
   });
  }
  return fetch(input,options);
 };
 const g=createGateway(env({
  EVYD_INTERNAL_READ_TOKEN:INTERNAL_TOK,EVYD_ENABLE_OPERATOR_FULL_CRM:'1',
  EVYD_PRINTSERVER_ENABLED:'1',EVYD_PRINT_ALLOWED_OPERATOR_IDS:'7',
  EVYD_PRINTSERVER_URL:'https://print.example.test',EVYD_PRINTSERVER_MCP_TOKEN:'x'.repeat(48)
 }),{fetchFn:fakeFetch,log:e=>logs.push(e),now});
 const op=await connect(g,'fake-op7-read-000001');
 const client=await mcp(g,op.tokens.access_token);
 try{
  const capabilities=await client.callTool({name:'crm_capacidades',arguments:{}});
  assert.equal(capabilities.structuredContent.oauth_authorization.operator_id,'7');
  assert.equal(capabilities.structuredContent.oauth_authorization.print_scope_granted,true);
  assert.equal(capabilities.structuredContent.oauth_authorization.print_tool_enabled,true);
  assert.ok(capabilities.structuredContent.oauth_authorization.granted_scopes.includes('print.jobs.write'));
  assert.equal(capabilities.structuredContent.legacy_v012_tools_preserved_count,
   capabilities.structuredContent.tools.filter(t=>t.registered&&!t.tool.startsWith('crm_renderizar_card_visual')&&!t.tool.startsWith('crm_previa_malotes_retirada')&&!t.tool.startsWith('crm_solicitar_impressao_etiqueta')&&!t.tool.startsWith('crm_consultar_impressao_etiqueta')).length);
  const r=await client.callTool({name:'crm_consultar_impressao_etiqueta',arguments:{order_id:999999,job_id:TEST_JOB}});
  assert.equal(r.isError,undefined);
  assert.equal(r.structuredContent.print_state,'spooled');
  assert.equal(r.structuredContent.synthetic_test,true);
  assert.equal(r.structuredContent.printed_physically,false);
  assert.equal(statusCalls.length,1);
  assert.equal(statusCalls[0].method,'GET');
  const noCrm=await client.callTool({name:'crm_consultar_impressao_etiqueta',arguments:{order_id:999998,job_id:TEST_JOB}});
  assert.equal(noCrm.isError,true);
  assert.equal(statusCalls.length,1,'real/non-synthetic missing order cannot query broker');
 }finally{
  await client.close();
  await g.close();
 }
});

test('PrintServer tool scope uses a dedicated operator allowlist and never prints without confirmation',async()=>{
 const g=gw({
  EVYD_INTERNAL_READ_TOKEN:INTERNAL_TOK,EVYD_ENABLE_OPERATOR_FULL_CRM:'1',
  EVYD_PRINTSERVER_ENABLED:'1',EVYD_PRINT_ALLOWED_OPERATOR_IDS:'7',
  EVYD_PRINTSERVER_URL:'https://print.example.test',EVYD_PRINTSERVER_MCP_TOKEN:'x'.repeat(48)
 });
 const op7=await connect(g,'fake-op7-read-000001');
 const op9=await connect(g,'fake-op9-read-000002');
 assert.ok(op7.tokens.scope.split(/\s+/).includes('print.jobs.write'),'explicitly allowed operator gets print scope even with read-only CRM ability');
 assert.ok(!op9.tokens.scope.split(/\s+/).includes('print.jobs.write'),'unlisted operator cannot print');
 const c7=await mcp(g,op7.tokens.access_token);
 const c9=await mcp(g,op9.tokens.access_token);
 try{
  const t7=(await c7.listTools()).tools;
  const t9=(await c9.listTools()).tools;
  assert.ok(t7.some(t=>t.name==='crm_solicitar_impressao_etiqueta'));
  assert.ok(!t9.some(t=>t.name==='crm_solicitar_impressao_etiqueta'));
  const printTool=t7.find(t=>t.name==='crm_solicitar_impressao_etiqueta');
  assert.deepEqual(printTool._meta?.securitySchemes,[{type:'oauth2',scopes:['crm.read','print.jobs.write']}]);
  assert.equal(printTool.annotations?.readOnlyHint,false);
  assert.equal(printTool.annotations?.destructiveHint,true,'printing is an irreversible physical action');
  assert.equal(printTool.annotations?.openWorldHint,false,'only the fixed private LABEL fleet');
  assert.equal(printTool.annotations?.idempotentHint,true,'broker deduplicates arrival labels per order');
  const c7Caps=await c7.callTool({name:'crm_capacidades',arguments:{}});
  const c9Caps=await c9.callTool({name:'crm_capacidades',arguments:{}});
  assert.equal(c7Caps.structuredContent.oauth_authorization.print_scope_granted,true);
  assert.equal(c9Caps.structuredContent.oauth_authorization.print_scope_granted,false);
  assert.equal(c9Caps.structuredContent.oauth_authorization.print_tool_enabled,false);
  const result=await c7.callTool({name:'crm_solicitar_impressao_etiqueta',arguments:{order_id:5001,confirmado_pelo_operador:false}});
  assert.equal(result.isError,true);
  assert.equal(JSON.parse(result.content[0].text).error,'operator_confirmation_required');
 }finally{
  await c7.close();
  await c9.close();
  await g.close();
 }
});
