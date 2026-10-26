import test from 'node:test';
import assert from 'node:assert/strict';
import {printserverConfig,printserverClient} from '../src/printserver-client.mjs';

const token='A'.repeat(48);
const config={enabled:true,origin:'https://print.example.org',token};
test('print bridge defaults off without credentials',()=>{
 assert.deepEqual(printserverConfig({}),{enabled:false});
});
test('bridge refuses http and short credentials',()=>{
 assert.throws(()=>printserverConfig({EVYD_PRINTSERVER_ENABLED:'1',EVYD_PRINTSERVER_URL:'http://print.example.org',EVYD_PRINTSERVER_MCP_TOKEN:token}),/config_url/);
 assert.throws(()=>printserverConfig({EVYD_PRINTSERVER_ENABLED:'1',EVYD_PRINTSERVER_URL:'https://print.example.org',EVYD_PRINTSERVER_MCP_TOKEN:'short'}),/config_token/);
});
test('broker dispatch has one authenticated POST and returns job',async()=>{
 const calls=[];
 const api=printserverClient(config,{fetchFn:async (url,opts)=>{
  calls.push({url,opts});
  return new Response(JSON.stringify({replay:false,job:{job_id:'test-id',state:'queued'}}),{status:201});
 }});
 const answer=await api.enqueue({request_id:'x',order_id:1});
 assert.equal(answer.job.state,'queued');
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://print.example.org/v1/jobs');
 assert.equal(calls[0].opts.headers.Authorization,'Bearer '+token);
 assert.equal(calls[0].opts.redirect,'error');
});
test('timeout/500 never auto-retries',async()=>{
 let calls=0;
 const api=printserverClient(config,{fetchFn:async()=>{calls++;return new Response('{}',{status:503})}});
 await assert.rejects(api.enqueue({order_id:1}),/printserver_result_unknown/);
 assert.equal(calls,1);
});
test('409 requires manual reconciliation',async()=>{
 const api=printserverClient(config,{fetchFn:async()=>new Response('{}',{status:409})});
 await assert.rejects(api.enqueue({order_id:1}),/manual_reconciliation/);
});
