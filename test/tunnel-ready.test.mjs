import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {evaluateTunnel,MOCK_TOOL_NAMES} from '../scripts/verify-tunnel-mock.mjs';

const health={live:true,ready:true,components:{'control-plane':{status:'ok',state:'polling'}}};
const mcp={status:'ok',state:'discovered',details:{transport:'stdio',tools_list:{complete:true,partial:false,tool_names:[...MOCK_TOOL_NAMES]}}};

test('exactly 17 approved tools and no write tool',()=>{
 const result=evaluateTunnel(health,mcp);
 assert.equal(MOCK_TOOL_NAMES.length,17);
 assert.equal(result.ok,true);
 assert.equal(result.count,17);
 assert.ok(!MOCK_TOOL_NAMES.includes('crm_agendar_proposta_natal'));
});

test('fail closed on missing, extra, partial or not-ready tool discovery',()=>{
 for(const altered of [
  {...mcp,details:{tools_list:{complete:true,partial:false,tool_names:[...MOCK_TOOL_NAMES,'crm_agendar_proposta_natal']}}},
  {...mcp,details:{tools_list:{complete:true,partial:false,tool_names:MOCK_TOOL_NAMES.slice(1)}}},
  {...mcp,details:{tools_list:{complete:false,partial:true,tool_names:MOCK_TOOL_NAMES}}},
  {...mcp,state:'server_discovered'}
 ])assert.equal(evaluateTunnel(health,altered).ok,false);
 assert.equal(evaluateTunnel({...health,ready:false},mcp).ok,false);
});

test('CLI reads only localhost health endpoints without showing secrets',async()=>{
 const paths=[];
 const server=createServer((req,res)=>{
  paths.push(req.url);
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify(req.url==='/health/mcp'?mcp:health));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const port=server.address().port;
  const child=spawn(process.execPath,['scripts/tunnel-ready.mjs','--port='+port],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],env:process.env});
  let stdout='',stderr='';
  child.stdout.on('data',d=>stdout+=d);
  child.stderr.on('data',d=>stderr+=d);
  const code=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject)});
  assert.equal(code,0,stderr);
  assert.match(stdout,/TUNNEL_MOCK_PASS/);
  assert.deepEqual(paths.sort(),['/health/mcp','/health?details=true'].sort());
  assert.ok(!stdout.includes('tunnel_'));
 }finally{await new Promise(r=>server.close(r))}
});
