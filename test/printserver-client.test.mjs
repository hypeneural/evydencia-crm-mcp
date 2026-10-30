import test from 'node:test';
import assert from 'node:assert/strict';
import {printserverConfig,printserverClient} from '../src/printserver-client.mjs';

const token='A'.repeat(48);
const config={enabled:true,origin:'https://print.example.org',token};
import {gatewayConfig,supportedGatewayScopes} from '../src/oauth-gateway.mjs';
const baseEnv={EVYD_PUBLIC_URL:'http://localhost',CRM_BASE_URL:'https://evydencia.com',EVYD_GATEWAY_KEY:Buffer.alloc(32,5).toString('base64'),EVYD_ALLOWED_OPERATOR_IDS:'7,9',EVYD_ENABLE_OPERATOR_FULL_CRM:'1'};

test('print OAuth is denied without a separate authorized operator allowlist',()=>{
 const printEnv={...baseEnv,EVYD_PRINTSERVER_ENABLED:'1'};
 assert.throws(()=>gatewayConfig(printEnv),/print_operator_allowlist/);
 assert.throws(()=>gatewayConfig({...printEnv,EVYD_PRINT_ALLOWED_OPERATOR_IDS:'99'}),/print_operator_allowlist/);
 const cfg=gatewayConfig({...printEnv,EVYD_PRINT_ALLOWED_OPERATOR_IDS:'7'});
 assert.equal(cfg.printAllowedOperators.has('7'),true);
 assert.equal(cfg.printAllowedOperators.has('9'),false);
 assert.ok(supportedGatewayScopes(cfg).includes('print.jobs.write'));
});

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

test('broker agent heartbeat uses admin-scoped GET and never queues a print',async()=>{
 const calls=[];
 const api=printserverClient(config,{fetchFn:async(url,opts)=>{
  calls.push({url,method:opts.method});
  return new Response(JSON.stringify({agent_online:true,agent_poll_age_seconds:3,physical_print_verified:false}),{status:200});
 }});
 const r=await api.agentStatus();
 assert.equal(r.agent_online,true);
 assert.equal(r.physical_print_verified,false);
 assert.deepEqual(calls,[{url:'https://print.example.org/v1/agent/status',method:'GET'}]);
});
