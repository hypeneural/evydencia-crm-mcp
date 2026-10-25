// Safe Windows/Linux CLI entrypoint: verify only localhost tunnel health.
import {evaluateTunnel} from './verify-tunnel-mock.mjs';
const arg=process.argv.find(x=>x.startsWith('--port='));
const port=arg?Number(arg.slice(7)):8080;
if(!Number.isInteger(port)||port<1||port>65535){
 console.error('TUNNEL_MOCK_BLOCKED invalid_port');process.exitCode=1;
}else{
 const base='http://127.0.0.1:'+port;
 async function read(route){
  const response=await fetch(base+route,{signal:AbortSignal.timeout(2500),redirect:'error'});
  if(!response.ok)throw Error('bad_health_status');
  return response.json();
 }
 try{
  const [health,mcp]=await Promise.all([read('/health?details=true'),read('/health/mcp')]);
  const v=evaluateTunnel(health,mcp);
  if(!v.ok){
   console.error('TUNNEL_MOCK_BLOCKED '+v.errors.join(',')+' tools='+v.count);
   process.exitCode=1;
  }else{
   console.log('TUNNEL_MOCK_PASS: '+v.count+'/'+v.expected+' permitted tools, localhost ready. Snapshot only.');
  }
 }catch{
  console.error('TUNNEL_MOCK_BLOCKED: no local admin health; check tunnel-client doctor/run');
  process.exitCode=1;
 }
}
