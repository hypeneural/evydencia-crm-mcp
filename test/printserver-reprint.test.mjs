import test from 'node:test';
import assert from 'node:assert/strict';
import {printserverClient} from '../src/printserver-client.mjs';
const config={enabled:true,origin:'https://print.example.invalid',token:'X'.repeat(48)};
test('reprint and audit history call only dedicated, authenticated broker routes',async()=>{
 const calls=[];
 const client=printserverClient(config,{fetchFn:async(url,opts)=>{
  calls.push([url,opts.method,opts.headers.Authorization]);
  return new Response(JSON.stringify(url.endsWith('label-history')?{order_id:7401,history:[]}:{job:{order_id:7401,job_id:'synthetic',state:'queued',reprint_of_job_id:'previous'}}),{status:200});
 }});
 await client.history(7401);
 await client.reprint({order_id:7401,reprint_of_job_id:'previous'});
 assert.deepEqual(calls.map(x=>x.slice(0,2)),[
  ['https://print.example.invalid/v1/orders/7401/label-history','GET'],
  ['https://print.example.invalid/v1/jobs/reprint','POST']
 ]);
 assert.ok(calls.every(x=>x[2]==='Bearer '+config.token));
});
test('reprint never retries when broker response is uncertain',async()=>{
 let count=0;const client=printserverClient(config,{fetchFn:async()=>{count++;return new Response('{}',{status:503})}});
 await assert.rejects(client.reprint({order_id:7401}),/printserver_result_unknown/);
 assert.equal(count,1);
});
