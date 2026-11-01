// Deterministic acceptance suite for Official Z-API MCP integration in Evydência CRM MCP Live.
// Uses controlled local fake CRM + fake Z-API OAuth 2.1 + Streamable HTTP MCP server on 127.0.0.1.
// Zero real credentials, zero real phones, zero external network calls.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {
 createGateway,
 LIVE_TOOL_NAMES,
 DIRECT_CRM_TOOL_NAMES,
 FORENSIC_CRM_TOOL_NAMES,
 PROPOSAL_CRM_TOOL_NAMES,
 UI_CRM_TOOL_NAMES,
 ZAPI_INSTANCE_TOOL_NAMES
} from '../src/live-gateway.mjs';
import {ZAPI_GATEWAY_TOOL_NAMES,ZAPI_STATUS_TOOL_NAME} from '../src/zapi-mcp-tools.mjs';

const R=['extension:bootstrap','extension:customer-read','extension:proposal-read','extension:proposal-write'];
const OPS={
 'fake-crm-sanctum-op7-secret':{id:7,ab:R},
 'fake-crm-sanctum-op9-secret':{id:9,ab:R}
};
const INTERNAL_TOK='fake-internal-crm-read-secret-01';
const REST_INST_ID='FAKEINST998877665544';
const REST_INST_TOK='fake-zapi-rest-inst-token-secret';
const REST_CLIENT_TOK='fake-zapi-rest-client-token-secret';
const SIGNED_MEDIA_SIG='super-secret-presigned-sig-991122';
const REDIR='https://chatgpt.com/connector_platform_oauth_redirect';
const KEY=randomBytes(32).toString('base64');

const OFFICIAL_NINE_UPSTREAM=[
 {
  name:'Send-text',
  description:'Send a text message via WhatsApp',
  inputSchema:{
   type:'object',
   properties:{
    phone:{type:'string',description:'Recipient phone in DDI+DDD+number format'},
    message:{type:'string',description:'Text body'},
    delayMessage:{type:'number'}
   },
   required:['phone','message']
  }
 },
 {
  name:'Send-image',
  description:'Send an image message via URL',
  inputSchema:{
   type:'object',
   properties:{
    phone:{type:'string'},
    image:{type:'string',description:'HTTPS image URL'},
    caption:{type:'string'}
   },
   required:['phone','image']
  }
 },
 {
  name:'Send-video',
  description:'Send a video message via URL',
  inputSchema:{
   type:'object',
   properties:{
    phone:{type:'string'},
    video:{type:'string',description:'HTTPS video URL'},
    caption:{type:'string'}
   },
   required:['phone','video']
  }
 },
 {
  name:'Group-create',
  description:'Create a new WhatsApp group',
  inputSchema:{
   type:'object',
   properties:{
    groupName:{type:'string'},
    phones:{type:'array',items:{type:'string'}}
   },
   required:['groupName','phones']
  }
 },
 {
  name:'Group-add-participant',
  description:'Add participant(s) to a WhatsApp group',
  inputSchema:{
   type:'object',
   properties:{
    groupId:{type:'string'},
    phones:{type:'array',items:{type:'string'}}
   },
   required:['groupId','phones']
  }
 },
 {
  name:'Group-remove-participant',
  description:'Remove participant(s) from a WhatsApp group',
  inputSchema:{
   type:'object',
   properties:{
    groupId:{type:'string'},
    phones:{type:'array',items:{type:'string'}}
   },
   required:['groupId','phones']
  }
 },
 {
  name:'Group-add-admin',
  description:'Promote participant(s) to group admin',
  inputSchema:{
   type:'object',
   properties:{
    groupId:{type:'string'},
    phones:{type:'array',items:{type:'string'}}
   },
   required:['groupId','phones']
  }
 },
 {
  name:'Group-remove-admin',
  description:'Demote admin(s) in a WhatsApp group',
  inputSchema:{
   type:'object',
   properties:{
    groupId:{type:'string'},
    phones:{type:'array',items:{type:'string'}}
   },
   required:['groupId','phones']
  }
 },
 {
  name:'Group-metadata',
  description:'Fetch group metadata and participants',
  inputSchema:{
   type:'object',
   properties:{
    groupId:{type:'string'}
   },
   required:['groupId']
  }
 }
];

const UNAPPROVED_EXTRA_TOOLS=[
 {
  name:'Future-dangerous-webhook-override',
  description:'Hypothetical future tool that must not be auto-exposed',
  inputSchema:{type:'object',properties:{webhookUrl:{type:'string'}},required:['webhookUrl']}
 },
 {
  name:'Send-text',
  description:'Duplicate tool entry that must be ignored',
  inputSchema:{type:'object',properties:{phone:{type:'string'}},required:['phone']}
 }
];

let crmServer,crmUrl,zapiServer,zapiOrigin,tmpRoot;
let clock=Date.now();
const now=()=>clock;
const logs=[];
const secrets=[
 ...Object.keys(OPS),
 INTERNAL_TOK,
 REST_INST_TOK,
 REST_CLIENT_TOK,
 SIGNED_MEDIA_SIG
];

const zapiState={
 registeredClients:new Map(),
 authCodes:new Map(),
 accessTokens:new Map(),
 refreshTokens:new Map(),
 mcpCalls:[],
 initializeCountByInstance:{},
 restStatusCalls:[],
 restConnected:true,
 nextCallBehavior:null
};

function readBody(req){
 return new Promise((resolve,reject)=>{
  let raw='';
  req.on('data',c=>{raw+=c;if(raw.length>262144)reject(Error('body_too_large'))});
  req.on('end',()=>resolve(raw));
  req.on('error',reject);
 });
}

before(async()=>{
 tmpRoot=mkdtempSync(join(tmpdir(),'evyd-zapi-test-'));

 crmServer=createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  const auth=req.headers.authorization||'';
  const tok=auth.replace(/^Bearer /,'');
  const send=(s,b)=>res.writeHead(s,{'Content-Type':'application/json'}).end(JSON.stringify(b));
  const env1=data=>({schema_version:'1.0',generated_at:new Date(clock).toISOString(),data});

  if(u.pathname==='/health/live')return send(200,{status:'ok'});
  if(u.pathname.startsWith('/api/orders/')||u.pathname.startsWith('/api/reports/')){
   if(auth!==INTERNAL_TOK)return send(401,{message:'Unauthorized'});
   const ord={id:7001,uuid:'11111111-aaaa-4111-8111-000000000701',status:{id:6,name:'Sessão Agendada'},customer:{name:'Cliente Sintética Teste',whatsapp:'48900001122'},created_at:'2026-10-20T12:00:00.000000Z',schedule_1:'2026-11-12 10:00:00',items:[{id:1,quantity:'1.000',total:'480.00',product:{name:'Experiência Então é Natal',slug:'natal',reference:'enatal'}}],installments:[],participants:[],summary:{total:480,received:480,remaining:0}};
   if(u.pathname==='/api/orders/search')return send(200,{data:[ord]});
   if(u.pathname==='/api/reports/natal-statistics')return send(200,{source:'CRM_CANONICAL_NATAL_STATISTICS',reference_year:2026,cutoff_mmdd:'10-25',detail_level:'resumo',kpis_2026:{valid_orders:101,confirmed_realized_sessions:23}});
   return send(200,{data:[]});
  }
  const op=OPS[tok];
  if(!op)return send(401,{message:'Unauthenticated'});
  if(u.pathname==='/api/v1/extension/bootstrap'){
   return send(200,env1({
    operator:{id:op.id,name:'Operador Sintético '+op.id},
    server:{timezone:'America/Sao_Paulo',api_version:'1.0',minimum_extension_version:'1.0.0'},
    features:{proposals:{enabled:true},natal_2026:{enabled:true,reference_year:2026}},
    token:{abilities:op.ab,expires_at:'2099-01-01T00:00:00Z'}
   }));
  }
  if(u.pathname==='/api/v1/extension/customer-context'){
   return send(200,env1({
    lookup:{status:'matched',match_count:1},
    customer:{uuid:'cust-op-'+op.id,display_name:'Cliente Sintética'},
    current_order:null,
    natal_2026:{purchased:false,mode:'prospect'},
    history:{orders_count:1},
    capabilities:{proposal_preview:{allowed:true,reason:null}}
   }));
  }
  if(u.pathname==='/api/v1/extension/proposals/preview'&&req.method==='POST'){
   return send(200,env1({ready:true,variant:'with_name',campaign:{id:415},message:'Prévia sintética'}));
  }
  return send(404,{});
 });
 await new Promise(r=>crmServer.listen(0,'127.0.0.1',r));
 crmUrl=`http://127.0.0.1:${crmServer.address().port}`;

 zapiServer=createServer(async(req,res)=>{
  const u=new URL(req.url,zapiOrigin||'http://127.0.0.1');
  const json=(s,b,extra={})=>res.writeHead(s,{'Content-Type':'application/json',...extra}).end(JSON.stringify(b));

  // Optional REST status endpoint: GET /instances/{id}/token/{tok}/status
  const restMatch=/^\/instances\/([^/]+)\/token\/([^/]+)\/status$/.exec(u.pathname);
  if(restMatch&&req.method==='GET'){
   zapiState.restStatusCalls.push({
    instanceId:restMatch[1],
    token:restMatch[2],
    clientToken:req.headers['client-token']||null
   });
   if(restMatch[1]!==REST_INST_ID||restMatch[2]!==REST_INST_TOK||req.headers['client-token']!==REST_CLIENT_TOK){
    return json(401,{error:'invalid_rest_credentials'});
   }
   return json(200,{connected:zapiState.restConnected,smartphoneConnected:zapiState.restConnected});
  }

  // RFC 8414 metadata (matching real https://mcp.z-api.io/.well-known/oauth-authorization-server)
  if(u.pathname==='/.well-known/oauth-authorization-server'&&req.method==='GET'){
   return json(200,{
    issuer:zapiOrigin,
    authorization_endpoint:`${zapiOrigin}/authorize`,
    token_endpoint:`${zapiOrigin}/token`,
    registration_endpoint:`${zapiOrigin}/register`,
    response_types_supported:['code'],
    response_modes_supported:['query'],
    grant_types_supported:['authorization_code','refresh_token'],
    token_endpoint_auth_methods_supported:['client_secret_post','client_secret_basic','none'],
    registration_endpoint_auth_methods_supported:['client_secret_post','client_secret_basic','none'],
    code_challenge_methods_supported:['S256']
   });
  }

  // Dynamic Client Registration
  if(u.pathname==='/register'&&req.method==='POST'){
   const body=JSON.parse(await readBody(req));
   const cid='zapi-cid-'+randomBytes(6).toString('hex');
   const csec='zapi-csec-'+randomBytes(8).toString('hex');
   secrets.push(csec);
   const info={
    client_id:cid,
    client_secret:csec,
    redirect_uris:body.redirect_uris,
    grant_types:body.grant_types||['authorization_code','refresh_token'],
    response_types:['code'],
    token_endpoint_auth_method:body.token_endpoint_auth_method||'none'
   };
   zapiState.registeredClients.set(cid,info);
   return json(200,info);
  }

  // Authorization endpoint (test simulates operator selecting an instance via ?mock_instance=...)
  if(u.pathname==='/authorize'&&req.method==='GET'){
   return json(200,{ok:true});
  }

  // Token endpoint (authorization_code + refresh_token)
  if(u.pathname==='/token'&&req.method==='POST'){
   const f=new URLSearchParams(await readBody(req));
   const gt=f.get('grant_type');
   if(gt==='authorization_code'){
    const code=f.get('code');
    const entry=zapiState.authCodes.get(code);
    zapiState.authCodes.delete(code);
    if(!entry)return json(400,{error:'invalid_grant'});
    const ver=f.get('code_verifier')||'';
    const expectedChallenge=createHash('sha256').update(ver).digest('base64url');
    if(expectedChallenge!==entry.codeChallenge||f.get('redirect_uri')!==entry.redirectUri){
     return json(400,{error:'invalid_grant'});
    }
    const at=`zapi-at-${entry.instanceLabel}-${randomBytes(8).toString('hex')}`;
    const rt=entry.issueRefresh?`zapi-rt-${entry.instanceLabel}-${randomBytes(8).toString('hex')}`:undefined;
    secrets.push(at);
    if(rt)secrets.push(rt);
    zapiState.accessTokens.set(at,{instanceLabel:entry.instanceLabel,revoked:false});
    if(rt)zapiState.refreshTokens.set(rt,{instanceLabel:entry.instanceLabel,revoked:false});
    return json(200,{
     access_token:at,
     token_type:'Bearer',
     expires_in:entry.expiresIn??3600,
     ...(rt?{refresh_token:rt}:{})
    });
   }
   if(gt==='refresh_token'){
    const rt=f.get('refresh_token')||'';
    const rtEntry=zapiState.refreshTokens.get(rt);
    if(!rtEntry||rtEntry.revoked){
     return json(400,{error:'invalid_grant',error_description:rtEntry?.revoked?'Token has been revoked':'Expired refresh token'});
    }
    zapiState.refreshTokens.delete(rt);
    const nextAt=`zapi-at-refreshed-${rtEntry.instanceLabel}-${randomBytes(8).toString('hex')}`;
    const nextRt=`zapi-rt-rotated-${rtEntry.instanceLabel}-${randomBytes(8).toString('hex')}`;
    secrets.push(nextAt,nextRt);
    zapiState.accessTokens.set(nextAt,{instanceLabel:rtEntry.instanceLabel,revoked:false});
    zapiState.refreshTokens.set(nextRt,{instanceLabel:rtEntry.instanceLabel,revoked:false});
    return json(200,{
     access_token:nextAt,
     refresh_token:nextRt,
     token_type:'Bearer',
     expires_in:3600
    });
   }
   return json(400,{error:'unsupported_grant_type'});
  }

  // Streamable HTTP MCP endpoint (/mcp)
  if(u.pathname==='/mcp'){
   const auth=req.headers.authorization||'';
   if(!auth.startsWith('Bearer ')){
    return json(401,{error:'invalid_token',error_description:'Missing Authorization header'},{
     'WWW-Authenticate':'Bearer error="invalid_token", error_description="Missing Authorization header"'
    });
   }
   const at=auth.slice(7);
   const tokData=zapiState.accessTokens.get(at);
   if(!tokData||tokData.revoked){
    return json(401,{error:'invalid_token',error_description:'Invalid or revoked token'},{
     'WWW-Authenticate':'Bearer error="invalid_token"'
    });
   }
   if(req.method==='DELETE'){
    return res.writeHead(200).end();
   }
   if(req.method==='GET'){
    return res.writeHead(405,{'Allow':'POST, DELETE'}).end();
   }
   if(req.method!=='POST')return res.writeHead(405).end();

   const rpc=JSON.parse(await readBody(req));
   const sessionId=req.headers['mcp-session-id']||`zapi-sess-${tokData.instanceLabel}`;

   if(rpc.method==='initialize'){
    zapiState.initializeCountByInstance[tokData.instanceLabel]=(zapiState.initializeCountByInstance[tokData.instanceLabel]||0)+1;
    return json(200,{
     jsonrpc:'2.0',
     id:rpc.id,
     result:{
      protocolVersion:'2025-11-25',
      capabilities:{tools:{listChanged:false}},
      serverInfo:{name:'z-api-official-mcp-fake',version:'1.0.0'}
     }
    },{'mcp-session-id':sessionId});
   }

   if(rpc.method==='notifications/initialized'){
    return res.writeHead(202,{'mcp-session-id':sessionId}).end();
   }

   if(rpc.method==='tools/list'){
    const cursor=rpc.params?.cursor;
    if(!cursor){
     return json(200,{
      jsonrpc:'2.0',
      id:rpc.id,
      result:{
       tools:OFFICIAL_NINE_UPSTREAM.slice(0,5),
       nextCursor:'page-2'
      }
     },{'mcp-session-id':sessionId});
    }
    if(cursor==='page-2'){
     return json(200,{
      jsonrpc:'2.0',
      id:rpc.id,
      result:{
       tools:[
        ...OFFICIAL_NINE_UPSTREAM.slice(5),
        ...UNAPPROVED_EXTRA_TOOLS,
        {name:'Group-create',description:'Broken duplicate',inputSchema:{type:'object',properties:{x:{type:'string',pattern:'['}}}}
       ]
      }
     },{'mcp-session-id':sessionId});
    }
    return json(200,{jsonrpc:'2.0',id:rpc.id,result:{tools:[]}},{'mcp-session-id':sessionId});
   }

   if(rpc.method==='tools/call'){
    const toolName=rpc.params?.name;
    const args=rpc.params?.arguments||{};
    zapiState.mcpCalls.push({
     instanceLabel:tokData.instanceLabel,
     accessToken:at,
     sessionId,
     toolName,
     args
    });

    const behavior=zapiState.nextCallBehavior;
    if(behavior){
     zapiState.nextCallBehavior=null;
     if(behavior.type==='http'){
      return json(behavior.status,{error:'simulated_http_'+behavior.status},behavior.headers||{});
     }
     if(behavior.type==='drop'){
      req.socket.destroy();
      return;
     }
     if(behavior.type==='timeout'){
      const t=setTimeout(()=>{if(!res.writableEnded)json(200,{jsonrpc:'2.0',id:rpc.id,result:{content:[{type:'text',text:'late'}]}})},behavior.delayMs||2000);
      res.on('close',()=>clearTimeout(t));
      return;
     }
     if(behavior.type==='tool_error'){
      return json(200,{
       jsonrpc:'2.0',
       id:rpc.id,
       result:{
        isError:true,
        content:[{type:'text',text:`Provider rejected media https://cdn.example.test/file.mp4?sig=${SIGNED_MEDIA_SIG}: invalid number`}]
       }
      },{'mcp-session-id':sessionId});
     }
    }

    const msgId=`ZAAP-${tokData.instanceLabel}-987654321`;
    const payload={
     zaapId:msgId,
     messageId:`MSG-${tokData.instanceLabel}-123456`,
     instance:tokData.instanceLabel,
     tool:toolName,
     echoedArgs:args
    };
    return json(200,{
     jsonrpc:'2.0',
     id:rpc.id,
     result:{
      content:[{type:'text',text:JSON.stringify(payload)}]
     }
    },{'mcp-session-id':sessionId});
   }

   return json(200,{jsonrpc:'2.0',id:rpc.id,error:{code:-32601,message:'Method not found'}});
  }

  return json(404,{error:'not_found'});
 });
 await new Promise(r=>zapiServer.listen(0,'127.0.0.1',r));
 zapiOrigin=`http://127.0.0.1:${zapiServer.address().port}`;
});

after(async()=>{
 await new Promise(r=>crmServer.close(r));
 await new Promise(r=>zapiServer.close(r));
 if(tmpRoot&&existsSync(tmpRoot))rmSync(tmpRoot,{recursive:true,force:true});
});

const call=(g,path,init={},host='localhost')=>g.handle(new Request(new URL(path,'http://localhost'),init),{ip:'10.0.0.1',host});
const form=o=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(o).toString()});

function makeGateway(storeSubname,extraEnv={}){
 const storePath=join(tmpRoot,storeSubname,'zapi-oauth.enc.json');
 return {
  storePath,
  gateway:createGateway({
   EVYD_PUBLIC_URL:'http://localhost',
   CRM_BASE_URL:crmUrl,
   EVYD_GATEWAY_KEY:KEY,
   EVYD_ALLOWED_OPERATOR_IDS:'7,9',
   EVYD_INTERNAL_READ_TOKEN:INTERNAL_TOK,
   EVYD_ENABLE_OPERATOR_FULL_CRM:'1',
   EVYD_ZAPI_MCP_ENABLED:'1',
   EVYD_ZAPI_MCP_URL:`${zapiOrigin}/mcp`,
   EVYD_ZAPI_OAUTH_ISSUER:zapiOrigin,
   EVYD_ZAPI_STORE_PATH:storePath,
   EVYD_ZAPI_TIMEOUT_MS:'350',
   CRM_REQUEST_TIMEOUT_MS:'500',
   ...extraEnv
  },{log:e=>logs.push(e),now})
 };
}

async function connectCrmOperator(g,crmToken){
 const reg=await call(g,'/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:[REDIR],token_endpoint_auth_method:'none',client_name:'ChatGPT'})});
 assert.equal(reg.status,201);
 const {client_id}=await reg.json();
 const verifier=randomBytes(32).toString('base64url');
 const challenge=createHash('sha256').update(verifier).digest('base64url');
 const q=new URLSearchParams({response_type:'code',client_id,redirect_uri:REDIR,code_challenge:challenge,code_challenge_method:'S256',state:'st-crm',resource:'http://localhost/mcp',scope:'crm.read'});
 const pg=await call(g,'/authorize?'+q);
 const txn=/name="txn" value="([^"]+)"/.exec(await pg.text())[1];
 const post=await call(g,'/authorize',form({txn,crm_token:crmToken,action:'approve'}));
 assert.equal(post.status,302);
 const code=new URL(post.headers.get('location')).searchParams.get('code');
 secrets.push(code);
 const tokRes=await call(g,'/token',form({grant_type:'authorization_code',code,redirect_uri:REDIR,client_id,code_verifier:verifier,resource:'http://localhost/mcp'}));
 assert.equal(tokRes.status,200);
 const tokens=await tokRes.json();
 secrets.push(tokens.access_token,tokens.refresh_token);
 return tokens;
}

async function openMcpClient(g,accessToken){
 const transport=new StreamableHTTPClientTransport(new URL('http://localhost/mcp'),{
  fetch:(u,init)=>{
   const r=new Request(u,init);
   r.headers.set('authorization','Bearer '+accessToken);
   return g.handle(r,{ip:'10.0.0.1',host:'localhost'});
  }
 });
 const client=new Client({name:'chatgpt-sim',version:'1.0.0'});
 await client.connect(transport);
 return client;
}

async function completeZapiBrowserOAuth(g,connectUrl,{instanceLabel='INST_OP7',issueRefresh=true,expiresIn=3600}={}){
 const pathWithQuery=new URL(connectUrl).pathname+new URL(connectUrl).search;
 const getRes=await call(g,pathWithQuery);
 assert.equal(getRes.status,200);
 const html=await getRes.text();
 const formTxn=/name="form_txn" value="([^"]+)"/.exec(html)[1];
 const postRes=await call(g,'/zapi/connect',form({form_txn:formTxn}));
 assert.equal(postRes.status,302);
 const zapiAuthUrl=new URL(postRes.headers.get('location'));
 assert.equal(zapiAuthUrl.origin,zapiOrigin);
 assert.equal(zapiAuthUrl.pathname,'/authorize');
 assert.equal(zapiAuthUrl.searchParams.get('code_challenge_method'),'S256');
 const code='zapi-auth-code-'+randomBytes(8).toString('hex');
 secrets.push(code);
 zapiState.authCodes.set(code,{
  codeChallenge:zapiAuthUrl.searchParams.get('code_challenge'),
  redirectUri:zapiAuthUrl.searchParams.get('redirect_uri'),
  instanceLabel,
  issueRefresh,
  expiresIn
 });
 const cbUrl=`/zapi/oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(zapiAuthUrl.searchParams.get('state'))}`;
 const cbRes=await call(g,cbUrl);
 assert.equal(cbRes.status,200);
 return {cbHtml:await cbRes.text(),formTxn,state:zapiAuthUrl.searchParams.get('state'),code};
}

test('1. Pre-OAuth state (authorization_required), paginated discovery of 9 official tools, schema preservation, unapproved tool blocking & CRM coexistence',async()=>{
 const {gateway:g,storePath}=makeGateway('suite-1');
 try{
  const op7Tokens=await connectCrmOperator(g,'fake-crm-sanctum-op7-secret');
  const c7=await openMcpClient(g,op7Tokens.access_token);
  try{
   // Before Z-API OAuth: all 17 CRM tools + 1 decoupled UI card tool + zapi_status_conexao + 2 zapi_instancia_* tools, zero faked Z-API MCP schemas.
   const preList=await c7.listTools();
   const expectedPre=[...LIVE_TOOL_NAMES,...DIRECT_CRM_TOOL_NAMES,...FORENSIC_CRM_TOOL_NAMES,...PROPOSAL_CRM_TOOL_NAMES,...UI_CRM_TOOL_NAMES,ZAPI_STATUS_TOOL_NAME,...ZAPI_INSTANCE_TOOL_NAMES].sort();
   assert.deepEqual(preList.tools.map(t=>t.name).sort(),expectedPre);

   const statusPre=await c7.callTool({name:ZAPI_STATUS_TOOL_NAME,arguments:{}});
   assert.equal(statusPre.isError,undefined);
   assert.equal(statusPre.structuredContent.oauth_status,'authorization_required');
   assert.equal(statusPre.structuredContent.discovered_tools_count,0);
   assert.equal(statusPre.structuredContent.whatsapp_connection.status,'not_verifiable_via_official_mcp');
   assert.match(statusPre.structuredContent.whatsapp_connection.detail,/não verificável pelo MCP oficial/);
   assert.ok(statusPre.structuredContent.authorization_url.startsWith('http://localhost/zapi/connect?ticket='));

   // Complete real OAuth 2.1 + PKCE + DCR callback for Operator 7.
   const {cbHtml,code,state}=await completeZapiBrowserOAuth(g,statusPre.structuredContent.authorization_url,{instanceLabel:'INST_OP7'});
   assert.match(cbHtml,/Ferramentas oficiais Z-API descobertas:<\/strong>\s*9/);

   // Anti-replay: replaying callback fails closed.
   const replayRes=await call(g,`/zapi/oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
   assert.equal(replayRes.status,400);

   // Encrypted persistent store exists on disk and contains NO plaintext tokens.
   assert.equal(existsSync(storePath),true);
   const rawDisk=readFileSync(storePath,'utf8');
   assert.ok(!rawDisk.includes('INST_OP7')&&!rawDisk.includes('zapi-at-')&&!rawDisk.includes('zapi-rt-'));

   // Refresh client tool list: all 30 legacy v0.12 tools preserved + 1 decoupled MCP App UI tool = 31 active tools!
   const postList=await c7.listTools(undefined,{cacheMode:'refresh'});
   const names=postList.tools.map(t=>t.name).sort();
   assert.deepEqual(names,[...expectedPre,...ZAPI_GATEWAY_TOOL_NAMES].sort());
   assert.equal(names.length,31);
   assert.ok(!names.some(n=>n.includes('webhook')||n.includes('dangerous')),'10th unapproved upstream tool was NOT silently exposed');

   // Verify exact upstream inputSchema preservation on zapi_send_text and zapi_send_image.
   const sendTextTool=postList.tools.find(t=>t.name==='zapi_send_text');
   assert.deepEqual(sendTextTool.inputSchema.required,['phone','message']);
   assert.equal(sendTextTool.inputSchema.properties.phone.type,'string');
   assert.equal(sendTextTool.annotations.readOnlyHint,false);
   const groupMetaTool=postList.tools.find(t=>t.name==='zapi_group_metadata');
   assert.equal(groupMetaTool.annotations.readOnlyHint,true);

   // Existing CRM tools continue working identically, with all 30 v0.12 tools preserved.
   const crmCap=await c7.callTool({name:'crm_capacidades',arguments:{}});
   assert.equal(crmCap.structuredContent.zapi_mcp_enabled,true);
   assert.equal(crmCap.structuredContent.zapi_oauth_status,'authorized');
   assert.equal(crmCap.structuredContent.zapi_discovered_tools_count,9);
   assert.equal(crmCap.structuredContent.legacy_v012_tools_preserved_count,30);
   assert.equal(crmCap.structuredContent.tools_active_count,31);

   const crmOrders=await c7.callTool({name:'crm_pedidos_buscar',arguments:{}});
   assert.equal(crmOrders.structuredContent.orders[0].order_id,7001);
   const crmStats=await c7.callTool({name:'crm_estatisticas_natal',arguments:{}});
   assert.equal(crmStats.structuredContent.kpis_2026.valid_orders,101);
  }finally{
   await c7.close();
  }
 }finally{
  await g.close();
 }
});

test('2. Two-operator strict isolation + tools/call for text, HTTPS image/video with captions, media guards & session reuse',async()=>{
 const {gateway:g}=makeGateway('suite-2',{
  EVYD_ZAPI_REST_OPERATOR_ID:'7',
  EVYD_ZAPI_REST_BASE_URL:zapiOrigin,
  EVYD_ZAPI_REST_INSTANCE_ID:REST_INST_ID,
  EVYD_ZAPI_REST_TOKEN:REST_INST_TOK,
  EVYD_ZAPI_REST_CLIENT_TOKEN:REST_CLIENT_TOK
 });
 try{
  const op7=await connectCrmOperator(g,'fake-crm-sanctum-op7-secret');
  const op9=await connectCrmOperator(g,'fake-crm-sanctum-op9-secret');
  const c7=await openMcpClient(g,op7.access_token);
  const c9=await openMcpClient(g,op9.access_token);
  try{
   const st7Pre=await c7.callTool({name:ZAPI_STATUS_TOOL_NAME,arguments:{}});
   await completeZapiBrowserOAuth(g,st7Pre.structuredContent.authorization_url,{instanceLabel:'INST_OP7_ISO'});

   // Operator 9 has NOT linked Z-API: must NOT see Operator 7's authorization or REST status adapter!
   const st9Pre=await c9.callTool({name:ZAPI_STATUS_TOOL_NAME,arguments:{}});
   assert.equal(st9Pre.structuredContent.oauth_status,'authorization_required');
   assert.equal(st9Pre.structuredContent.discovered_tools_count,0);
   assert.equal(st9Pre.structuredContent.whatsapp_connection.verifiable,false,'REST status bound to op 7 is never exposed to op 9');
   const list9Pre=await c9.listTools(undefined,{cacheMode:'refresh'});
   assert.ok(!list9Pre.tools.some(t=>t.name==='zapi_send_text'));

   // Operator 7 sees connected WhatsApp via REST status adapter bound to op 7.
   const st7Post=await c7.callTool({name:ZAPI_STATUS_TOOL_NAME,arguments:{}});
   assert.equal(st7Post.structuredContent.oauth_status,'authorized');
   assert.equal(st7Post.structuredContent.whatsapp_connection.verifiable,true);
   assert.equal(st7Post.structuredContent.whatsapp_connection.status,'connected');

   // Link Operator 9 to a completely separate Z-API instance (INST_OP9_ISO).
   await completeZapiBrowserOAuth(g,st9Pre.structuredContent.authorization_url,{instanceLabel:'INST_OP9_ISO'});

   zapiState.mcpCalls.length=0;
   const initBefore=zapiState.initializeCountByInstance.INST_OP7_ISO||0;

   // Operator 7 sends synthetic text, image (with caption) and video (with caption) reusing the SAME upstream MCP session!
   const rText=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000001',message:'Olá sintético 1'}});
   assert.equal(rText.isError,undefined);
   assert.equal(rText.structuredContent.upstream_result.instance,'INST_OP7_ISO');
   assert.equal(rText.structuredContent.upstream_result.zaapId,'ZAAP-INST_OP7_ISO-987654321');
   assert.equal(rText.structuredContent.delivery_semantics,'accepted_by_provider_not_final_delivery');

   const rImg=await c7.callTool({name:'zapi_send_image',arguments:{phone:'5548900000001',image:'https://cdn.example.test/ensaio.jpg',caption:'Legenda da foto'}});
   assert.equal(rImg.isError,undefined);
   assert.equal(rImg.structuredContent.upstream_result.echoedArgs.caption,'Legenda da foto');

   const rVid=await c7.callTool({name:'zapi_send_video',arguments:{phone:'5548900000001',video:'https://cdn.example.test/teaser.mp4',caption:'Legenda do vídeo'}});
   assert.equal(rVid.isError,undefined);
   assert.equal(rVid.structuredContent.upstream_result.echoedArgs.caption,'Legenda do vídeo');

   // Session pooling proof: 3 tool calls reused the already-connected session (zero extra initialize handshakes).
   assert.equal(zapiState.initializeCountByInstance.INST_OP7_ISO,initBefore);

   // Operator 9 calls Group-metadata -> hits ONLY INST_OP9_ISO!
   const rGrp9=await c9.callTool({name:'zapi_group_metadata',arguments:{groupId:'120363000000000001-group'}});
   assert.equal(rGrp9.isError,undefined);
   assert.equal(rGrp9.structuredContent.upstream_result.instance,'INST_OP9_ISO');

   assert.equal(zapiState.mcpCalls.length,4);
   assert.ok(zapiState.mcpCalls.slice(0,3).every(c=>c.instanceLabel==='INST_OP7_ISO'));
   assert.equal(zapiState.mcpCalls[3].instanceLabel,'INST_OP9_ISO');

   // Media guards: reject HTTP (non-HTTPS), localhost SSRF and large Base64 before reaching upstream!
   const callsBeforeBad=zapiState.mcpCalls.length;
   const badHttp=await c7.callTool({name:'zapi_send_image',arguments:{phone:'5548900000001',image:'http://cdn.example.test/inseguro.jpg'}});
   assert.equal(badHttp.isError,true);
   assert.equal(JSON.parse(badHttp.content[0].text).error,'zapi_media_https_required');

   const badPriv=await c7.callTool({name:'zapi_send_image',arguments:{phone:'5548900000001',image:'https://127.0.0.1/internal.jpg'}});
   assert.equal(badPriv.isError,true);
   assert.equal(JSON.parse(badPriv.content[0].text).error,'zapi_media_host_forbidden');

   const badB64=await c7.callTool({name:'zapi_send_video',arguments:{phone:'5548900000001',video:'data:video/mp4;base64,'+'A'.repeat(6000)}});
   assert.equal(badB64.isError,true);
   assert.equal(JSON.parse(badB64.content[0].text).error,'zapi_media_inline_base64_not_supported');

   // Invalid schema arguments & unknown tool rejected before upstream!
   const badSchema=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000001'}});
   assert.equal(badSchema.isError,true);
   await assert.rejects(()=>c7.callTool({name:'zapi_unknown_operation',arguments:{}}),/not found/i);
   await assert.rejects(()=>c7.callTool({name:'Future-dangerous-webhook-override',arguments:{webhookUrl:'https://evil.test'}}),/not found/i);
   assert.equal(zapiState.mcpCalls.length,callsBeforeBad,'zero invalid/unsafe calls reached upstream Z-API');
  }finally{
   await c7.close();
   await c9.close();
  }
 }finally{
  await g.close();
 }
});

test('3. OAuth refresh rotation, expired without refresh, upstream revocation (401), 403, 429, 503, isError redaction, no duplicate resend on drop/timeout & disconnect',async()=>{
 const {gateway:g}=makeGateway('suite-3');
 try{
  const op7=await connectCrmOperator(g,'fake-crm-sanctum-op7-secret');
  const op9=await connectCrmOperator(g,'fake-crm-sanctum-op9-secret');
  const c7=await openMcpClient(g,op7.access_token);
  const c9=await openMcpClient(g,op9.access_token);
  try{
   // Link op7 WITH refresh_token (short 10s access_token TTL) and op9 WITHOUT refresh_token (10s TTL).
   const st7=await c7.callTool({name:ZAPI_STATUS_TOOL_NAME,arguments:{}});
   await completeZapiBrowserOAuth(g,st7.structuredContent.authorization_url,{instanceLabel:'INST_REFRESH_7',issueRefresh:true,expiresIn:10});

   const st9=await c9.callTool({name:ZAPI_STATUS_TOOL_NAME,arguments:{}});
   await completeZapiBrowserOAuth(g,st9.structuredContent.authorization_url,{instanceLabel:'INST_EXP_9',issueRefresh:false,expiresIn:10});

   // Advance clock by 20s: op7 refreshes transparently; op9 transitions to 'expired'!
   clock+=20000;
   const refreshedCall=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000002',message:'Após refresh OAuth'}});
   assert.equal(refreshedCall.isError,undefined);
   assert.equal(refreshedCall.structuredContent.upstream_result.instance,'INST_REFRESH_7');

   const st9Expired=await c9.callTool({name:ZAPI_STATUS_TOOL_NAME,arguments:{}});
   assert.equal(st9Expired.structuredContent.oauth_status,'expired');
   const call9Expired=await c9.callTool({name:'zapi_send_text',arguments:{phone:'5548900000002',message:'Bloqueado expirado'}});
   assert.equal(call9Expired.isError,true);
   assert.equal(JSON.parse(call9Expired.content[0].text).oauth_status,'expired');

   // Upstream isError: true preserved + signed media URL secret redacted!
   zapiState.nextCallBehavior={type:'tool_error'};
   const toolErrRes=await c7.callTool({name:'zapi_send_video',arguments:{phone:'5548900000002',video:'https://cdn.example.test/v.mp4'}});
   assert.equal(toolErrRes.isError,true);
   assert.ok(!JSON.stringify(toolErrRes).includes(SIGNED_MEDIA_SIG),'presigned URL signature redacted');
   assert.match(toolErrRes.content[0].text,/\[REDACTED\]/);

   // Upstream HTTP 429 and 503 mapped cleanly.
   zapiState.nextCallBehavior={type:'http',status:429};
   const r429=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000003',message:'Teste 429'}});
   assert.equal(r429.isError,true);
   assert.equal(JSON.parse(r429.content[0].text).error,'zapi_http_429');

   zapiState.nextCallBehavior={type:'http',status:503};
   const r503=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000004',message:'Teste 503'}});
   assert.equal(r503.isError,true);
   assert.equal(JSON.parse(r503.content[0].text).error,'zapi_http_503');

   zapiState.nextCallBehavior={type:'http',status:403};
   const r403=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000005',message:'Teste 403'}});
   assert.equal(r403.isError,true);
   assert.equal(JSON.parse(r403.content[0].text).error,'zapi_http_403');

   // Network drop mid-send MUST NOT auto-retry, and immediate accidental duplicate retry is blocked!
   const callsBeforeDrop=zapiState.mcpCalls.length;
   zapiState.nextCallBehavior={type:'drop'};
   const rDrop=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000006',message:'Mensagem única sem duplicar'}});
   assert.equal(rDrop.isError,true);
   const dropBody=JSON.parse(rDrop.content[0].text);
   assert.equal(dropBody.retry_unsafe,true);
   assert.equal(zapiState.mcpCalls.length,callsBeforeDrop+1,'socket drop during send triggered ZERO automatic resends');

   const rDupAfterDrop=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000006',message:'Mensagem única sem duplicar'}});
   assert.equal(rDupAfterDrop.isError,true);
   assert.equal(JSON.parse(rDupAfterDrop.content[0].text).error,'zapi_duplicate_after_ambiguous_failure_blocked');
   assert.equal(zapiState.mcpCalls.length,callsBeforeDrop+1,'accidental retry after ambiguous failure blocked locally');

   // Timeout mid-send MUST NOT auto-retry either!
   const callsBeforeTimeout=zapiState.mcpCalls.length;
   zapiState.nextCallBehavior={type:'timeout',delayMs:1500};
   const rTimeout=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000007',message:'Mensagem com timeout'}});
   assert.equal(rTimeout.isError,true);
   const timeoutBody=JSON.parse(rTimeout.content[0].text);
   assert.equal(timeoutBody.error,'zapi_timeout');
   assert.equal(timeoutBody.retry_unsafe,true);
   assert.equal(zapiState.mcpCalls.length,callsBeforeTimeout+1,'timeout during send triggered ZERO automatic resends');

   // Distinct message immediately succeeds (no artificial commercial quota/cooldown), while exact duplicate of accepted send is blocked!
   const rOk1=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000008',message:'Mensagem distinta A'}});
   assert.equal(rOk1.isError,undefined);
   const rOk2=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000008',message:'Mensagem distinta B'}});
   assert.equal(rOk2.isError,undefined,'distinct message to same recipient has no artificial commercial cooldown');
   const rDupAccepted=await c7.callTool({name:'zapi_send_text',arguments:{phone:'5548900000008',message:'Mensagem distinta B'}});
   assert.equal(rDupAccepted.isError,true);
   assert.equal(JSON.parse(rDupAccepted.content[0].text).error,'zapi_duplicate_recent_dispatch_blocked');

   // Upstream revocation (both access_token and refresh_token revoked on provider) -> transitions to 'revoked'!
   for(const v of zapiState.accessTokens.values())if(v.instanceLabel==='INST_REFRESH_7')v.revoked=true;
   for(const v of zapiState.refreshTokens.values())if(v.instanceLabel==='INST_REFRESH_7')v.revoked=true;

   const rRevoked=await c7.callTool({name:'zapi_group_metadata',arguments:{groupId:'120363000000000099-group'}});
   assert.equal(rRevoked.isError,true);
   assert.equal(JSON.parse(rRevoked.content[0].text).oauth_status,'revoked');
   const st7Revoked=await c7.callTool({name:ZAPI_STATUS_TOOL_NAME,arguments:{}});
   assert.equal(st7Revoked.structuredContent.oauth_status,'revoked');

   // Explicit browser disconnect resets operator back to authorization_required and removes discovered tools.
   const managePage=await call(g,new URL(st7Revoked.structuredContent.authorization_url).pathname+new URL(st7Revoked.structuredContent.authorization_url).search);
   const disTxn=/name="form_txn" value="([^"]+)"/.exec(await managePage.text())[1];
   const disRes=await call(g,'/zapi/disconnect',form({form_txn:disTxn}));
   assert.equal(disRes.status,200);
   const st7AfterDis=await c7.callTool({name:ZAPI_STATUS_TOOL_NAME,arguments:{}});
   assert.equal(st7AfterDis.structuredContent.oauth_status,'authorization_required');
   assert.equal(st7AfterDis.structuredContent.discovered_tools_count,0);
  }finally{
   await c7.close();
   await c9.close();
  }
 }finally{
  await g.close();
 }
});

test('4. Zero secrets, tokens or signed URLs ever leaked into gateway logs',()=>{
 assert.ok(logs.length>0);
 const dump=JSON.stringify(logs);
 for(const s of secrets.filter(Boolean)){
  assert.ok(!dump.includes(s),`Secret leaked into gateway logs: ${s.slice(0,8)}...`);
 }
 assert.ok(!dump.includes('55489000000'),'No recipient phone numbers logged');
 assert.ok(!dump.includes('cdn.example.test'),'No media URLs logged');
 assert.ok(logs.some(l=>l.evt==='zapi_tool'&&l.ok===true&&typeof l.dispatch_id_masked==='string'));
});
