// Local benchmark of the LIVE gateway over real HTTP (node:http bridge) against a fake Sanctum CRM.
// Synthetic data only. Prints latency percentiles, CPU and memory; never prints tokens.
//   node scripts/bench-gateway.mjs [--calls=300] [--concurrency=10] [--crm-latency-ms=0]
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createGateway,nodeListener} from '../src/live-gateway.mjs';

const arg=(n,d)=>{const a=process.argv.find(x=>x.startsWith('--'+n+'='));return a?Number(a.split('=')[1]):d};
const CALLS=arg('calls',300),CONC=arg('concurrency',10),LAT=arg('crm-latency-ms',0);
const TOKEN='bench-op7-read-'+randomBytes(8).toString('hex');
const env1=data=>JSON.stringify({schema_version:'1.0',generated_at:new Date().toISOString(),data});
const crm=createServer((req,res)=>{
 const u=new URL(req.url,'http://x'),send=(s,b)=>setTimeout(()=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(b)},LAT);
 if(req.headers.authorization!=='Bearer '+TOKEN)return send(401,'{}');
 if(u.pathname==='/api/v1/extension/bootstrap')return send(200,env1({operator:{id:7,name:'Bench'},server:{timezone:'America/Sao_Paulo',api_version:'1.0'},token:{abilities:['extension:bootstrap','extension:customer-read'],expires_at:'2099-01-01T00:00:00Z'}}));
 if(u.pathname==='/api/v1/extension/customer-context')return send(200,env1({lookup:{status:'matched',match_count:1},customer:{uuid:'c-1',display_name:'Cliente Bench',first_name:'Bench'},current_order:null,natal_2026:{purchased:false,mode:'prospect'},history:{orders_count:1}}));
 send(404,'{}');
});
await new Promise(r=>crm.listen(0,'127.0.0.1',r));
const gwServer=createServer();
await new Promise(r=>gwServer.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+gwServer.address().port;
const gateway=createGateway({EVYD_PUBLIC_URL:base,CRM_BASE_URL:'http://127.0.0.1:'+crm.address().port,EVYD_GATEWAY_KEY:randomBytes(32).toString('base64'),EVYD_ALLOWED_OPERATOR_IDS:'7',EVYD_RATE_MCP_PER_MIN:'10000'},{log:()=>{}});
gwServer.on('request',nodeListener(gateway));

const REDIR='https://chatgpt.com/connector_platform_oauth_redirect';
const reg=await (await fetch(base+'/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:[REDIR]})})).json();
const ver=randomBytes(32).toString('base64url');
const q=new URLSearchParams({response_type:'code',client_id:reg.client_id,redirect_uri:REDIR,code_challenge:createHash('sha256').update(ver).digest('base64url'),code_challenge_method:'S256',state:'b',resource:base+'/mcp'});
const txn=/name="txn" value="([^"]+)"/.exec(await (await fetch(base+'/authorize?'+q)).text())[1];
const loc=(await fetch(base+'/authorize',{method:'POST',redirect:'manual',body:new URLSearchParams({txn,crm_token:TOKEN,action:'approve'})})).headers.get('location');
const tok=await (await fetch(base+'/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',code:new URL(loc).searchParams.get('code'),redirect_uri:REDIR,client_id:reg.client_id,code_verifier:ver})})).json();
if(!tok.access_token)throw Error('bench_oauth_failed');

const clients=await Promise.all(Array.from({length:CONC},async()=>{
 const c=new Client({name:'bench',version:'1'});
 await c.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+tok.access_token}}}));
 return c;
}));
for(const c of clients)await c.callTool({name:'crm_cliente_resumo',arguments:{telefone:'11999990001'}}); // warm-up
global.gc?.();
const cpu0=process.cpuUsage(),t0=performance.now(),lat=[];let errors=0,next=0,totalBytes=0;
await Promise.all(clients.map(async c=>{
 while(next<CALLS){next++;const s=performance.now();
  const r=await c.callTool({name:'crm_cliente_resumo',arguments:{telefone:'11999990001'}});
  if(r.isError)errors++;
  totalBytes+=Buffer.byteLength(JSON.stringify(r??null),'utf8');
  lat.push(performance.now()-s);}
}));
const wall=performance.now()-t0,cpu=process.cpuUsage(cpu0),mem=process.memoryUsage();
const perfSnap=gateway.perf?.snapshot?.()||null;
lat.sort((a,b)=>a-b);const p=x=>+lat[Math.min(lat.length-1,Math.floor(x*lat.length))].toFixed(2);
console.log(JSON.stringify({benchmark:'live-gateway-http',calls:lat.length,concurrency:CONC,crm_latency_ms:LAT,errors,
 error_rate:lat.length?+(errors/lat.length).toFixed(4):0,
 latency_ms:{p50:p(.5),p95:p(.95),p99:p(.99),max:+lat.at(-1).toFixed(2)},
 gateway_telemetry:perfSnap?{gateway_ms:perfSnap.gateway_ms,response_bytes:perfSnap.response_bytes,error_rate:perfSnap.error_rate}:null,
 avg_wire_response_bytes:lat.length?Math.round(totalBytes/lat.length):0,
 throughput_rps:+(lat.length/(wall/1000)).toFixed(1),
 cpu_ms_per_call:+((cpu.user+cpu.system)/1000/lat.length).toFixed(3),rss_mb:+(mem.rss/1048576).toFixed(1),heap_used_mb:+(mem.heapUsed/1048576).toFixed(1),
 note:'gateway + fake CRM + clients share one process; CPU/RSS are upper bounds for the gateway'}));
for(const c of clients)await c.close();
await gateway.close();gwServer.close();crm.close();
