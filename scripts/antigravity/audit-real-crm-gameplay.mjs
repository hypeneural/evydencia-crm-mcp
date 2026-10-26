#!/usr/bin/env node
// Explicitly authorized LIVE READS only. No production modifications and no
// customer data, UUIDs, tokens or capability links in stdout or artifacts.
// This utility runs on an authorized host, never imports production env files.
import {legacyReadClient} from '../../src/legacy-api-read.mjs';
import {createGameplayReadClient,gameplayReadConfig} from '../../src/gameplay-read-client.mjs';
import {auditRealOrderGameplay} from '../../src/gameplay-real-audit.mjs';

const MODES=new Set(['--crm-only','--cross-check']);
function strictConfig(env,argv){
 if(argv.length!==1||!MODES.has(argv[0]))throw Error('INVALID_USAGE');
 if(env.EVYD_REAL_AUDIT_AUTHORIZED!=='1')throw Error('AUDIT_NOT_AUTHORIZED');
 const operatorId=String(env.EVYD_REAL_AUDIT_OPERATOR_ID||'');
 const allowed=String(env.EVYD_ALLOWED_OPERATOR_IDS||'').split(',').map(x=>x.trim());
 if(!/^[1-9]\d{0,9}$/.test(operatorId)||!allowed.includes(operatorId)||
    env.EVYD_REAL_AUDIT_OPERATOR_ACCESS_ATTESTED!=='1')
  throw Error('OPERATOR_AUTH_NOT_ATTESTED');
 const crmBase=env.CRM_BASE_URL;
 let endpoint;
 try{endpoint=new URL(crmBase)}catch{throw Error('CRM_BASE_URL_INVALID')}
 const local=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
 if((endpoint.protocol!=='https:'&&!(local&&endpoint.protocol==='http:'))||
  endpoint.username||endpoint.password||endpoint.hash||endpoint.search||
  !['/',''].includes(endpoint.pathname))
  throw Error('CRM_BASE_URL_INVALID');
 if(typeof env.EVYD_INTERNAL_READ_TOKEN!=='string'||env.EVYD_INTERNAL_READ_TOKEN.length<12)
  throw Error('CRM_READ_TOKEN_NOT_PROVISIONED');
 if(argv[0]==='--cross-check'&&env.EVYD_GAMEPLAY_READ_ENABLED!=='1')
  throw Error('GAMEPLAY_READ_NOT_PROVISIONED');
 return {mode:argv[0],operatorId,crmBase:endpoint.origin};
}
export async function runRealReadOnlyAudit({
 env=process.env,argv=process.argv.slice(2),fetchFn=fetch,now
}={}){
 const cfg=strictConfig(env,argv);
 const crm=legacyReadClient({
  baseUrl:cfg.crmBase,token:env.EVYD_INTERNAL_READ_TOKEN,
  fetchFn,timeoutMs:7000,includeParticipants:true,
  operatorContext:{
   requireOperator:true,operatorId:cfg.operatorId,
   authScope:'crm.read',
   upstreamGrantHash:'standalone-audited-readonly',
   cacheSecret:env.EVYD_GATEWAY_KEY||null
  }
 });
 const gameplay=cfg.mode==='--cross-check'
  ?createGameplayReadClient(gameplayReadConfig(env),{fetchFn}):null;
 const report=await auditRealOrderGameplay({crm,gameplay});
 return {...report,credential_transport:'preprovisioned_environment',
  operator_access_confirmation:'local_allowlist_and_explicit_attestation',
  operator_oauth_revalidated_by_script:false,
  // This is not the release authorization for photographs.
  customer_data_release_approved:false};
}
if(process.argv[1]&&process.argv[1].endsWith('/audit-real-crm-gameplay.mjs')){
 try{
  const report=await runRealReadOnlyAudit();
  console.log(JSON.stringify(report,null,2));
 }catch{
  // Never print raw exceptions; downstream errors may contain identifiers.
  console.error('REAL_AUDIT_FAILED: investigate using existing private service telemetry, no PII logs');
  process.exitCode=1;
 }
}
