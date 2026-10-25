// Deterministic LIVE acceptance tests: in-process gateway + fake Sanctum CRM on 127.0.0.1.
// All tokens, phones and names below are synthetic fixtures.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createGateway,LIVE_TOOL_NAMES} from '../src/live-gateway.mjs';
import {gatewayConfig,createSealer,redirectAllowed} from '../src/oauth-gateway.mjs';

const R=['extension:bootstrap','extension:customer-read'];
const OPS={
 'fake-op7-read-000001':{id:7,ab:R},
 'fake-op9-read-000002':{id:9,ab:[...R,'extension:proposal-read']},
 'fake-op7-write-00003':{id:7,ab:[...R,'extension:proposal-write']},
 'fake-op99-read-00004':{id:99,ab:R},
 'fake-op7-expd-000005':{id:7,ab:R,exp:'2020-01-01T00:00:00Z'},
 'fake-op7-read-000006':{id:7,ab:R}
};
const revoked=new Set(),crmLog=[],logs=[],secrets=[...Object.keys(OPS)];
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
  crmLog.push({method:req.method,path:u.pathname,tok});
  const send=(s,b,ct='application/json')=>{res.writeHead(s,{'Content-Type':ct});res.end(b)};
  if(req.method!=='GET')return send(405,'{}');
  if(u.pathname==='/health/live')return send(200,JSON.stringify({status:'ok'}));
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

test('authorization refuses write-capable, non-allowlisted, expired and revoked Sanctum tokens',async()=>{
 const g=gw();
 const w=await connect(g,'fake-op7-write-00003');
 assert.equal(w.denied,403);assert.match(w.html,/escrita/);
 assert.equal((await connect(g,'fake-op99-read-00004')).denied,403);
 assert.equal((await connect(g,'fake-op7-expd-000005')).denied,403);
 assert.equal((await connect(g,'fake-op-unknown-0007')).denied,403);
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
  assert.ok(tools.every(t=>t.annotations?.readOnlyHint===true&&t.annotations?.destructiveHint===false));
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
  assert.equal(cap.structuredContent.tools.find(t=>t.tool==='crm_previa_proposta_natal').state,'NOT_AVAILABLE');
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
