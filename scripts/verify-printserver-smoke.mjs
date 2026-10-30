// Read-only authenticated production smoke for the synthetic PrintServer job.
// Run on the authorized VPS with gateway environment already loaded.
// NEVER prints a label, alters CRM state or sends WhatsApp.
import {printserverClient,printserverConfig} from '../src/printserver-client.mjs';

const syntheticJobId=process.env.EVYD_PRINTSERVER_SMOKE_JOB_ID||'95bab7dc-62e9-498f-afbd-68775f05e549';
const knownUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(!knownUuid.test(syntheticJobId))throw Error('synthetic_job_id_invalid');
try{
 const config=printserverConfig(process.env);
 if(!config.enabled)throw Error('printserver_feature_disabled');
 const client=printserverClient(config);
 const result=await client.status(syntheticJobId);
 const job=result?.job;
 if(job?.job_id!==syntheticJobId||job?.order_id!==999999)throw Error('synthetic_job_contract_mismatch');
 const state=job.state;
 if(!['spooled','queued','claimed','failed','unknown','expired'].includes(state))throw Error('synthetic_job_state_invalid');
 // An older broker can lack this endpoint; preserve the core durable-job smoke.
 const agent=await client.agentStatus().catch(()=>null);
 console.log(JSON.stringify({
  source:'PRINTSERVER_READ_ONLY_SMOKE',broker_reachable:true,
  job_is_synthetic:true,job_state:state,
  spooled:state==='spooled',physical_print_verified:false,
  agent_online:typeof agent?.agent_online==='boolean'?agent.agent_online:null,
  agent_poll_age_seconds:Number.isSafeInteger(agent?.agent_poll_age_seconds)?agent.agent_poll_age_seconds:null,
  changes_applied:false
 }));
 if(state!=='spooled')process.exitCode=2;
}catch(e){
 // Deliberately exclude exception stack, URL, request headers, tokens and PII.
 console.error(JSON.stringify({source:'PRINTSERVER_READ_ONLY_SMOKE',
  broker_reachable:false,error_code:/^[a-z0-9_]+$/.test(e?.message||'')?e.message:'unknown_error',
  changes_applied:false}));
 process.exitCode=1;
}
