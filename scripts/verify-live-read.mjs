// Operator-only isolated CLI: access real Sanctum read endpoints without exposing JSON payloads.
// Run ONLY in private Windows terminal after authorization; stdout is metadata only.
import {crmClient} from '../src/core.mjs';
import {validateRealContract} from '../src/live-contracts.mjs';
import {readFile} from 'node:fs/promises';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const a=/^--([a-z-]+)=(.*)$/.exec(x);if(!a)throw Error('invalid_arguments');return [a[1],a[2]]}));
const mode=args.mode||'bootstrap';
if(!['bootstrap','customer-context','customer-360','proposal-preview'].includes(mode))throw Error('invalid_mode');
if(mode!=='bootstrap'&&!args.phone)throw Error('phone_required');
if(args.name&&mode!=='proposal-preview')throw Error('invalid_name_argument');
let key=(process.env.CRM_READ_TOKEN||'').trim();
if(key.length<12||!process.env.CRM_BASE_URL||process.env.EVYD_MOCK_MODE==='1')throw Error('private_live_config_required');
if(['customer-context','customer-360'].includes(mode)===false&&mode!=='bootstrap'&&process.env.EVYD_ALLOW_PREVIEW_DIAGNOSTIC!=='1')throw Error('preview_diagnostic_requires_optin');
const client=crmClient({baseUrl:process.env.CRM_BASE_URL,token:key,privateEnabled:true,timeoutMs:7000});
const modeToMethod={'bootstrap':'bootstrap','customer-context':'customer','customer-360':'history','proposal-preview':'preview'};
try{
 const result=mode==='bootstrap'?await client.bootstrap():mode==='customer-context'?await client.customer(args.phone):
  mode==='customer-360'?await client.history(args.phone,1):await client.preview(args.phone,args.name);
 // The client projections already enforce minimal fields, which are checked without persisting payload.
 const looksValid=mode==='bootstrap'?!!(result.operator&&result.server):
  mode==='proposal-preview'?typeof result.ready==='boolean':mode==='customer-360'?
  !!(result.history||result.lookup?.status!=='matched'):!!result.lookup;
 if(!looksValid)throw Error('crm_contract_invalid');
 console.log(JSON.stringify({result:'LIVE_READ_CHECK_PASS',mode,live:true,operator_validated:mode==='bootstrap',
  lookup_status:result.lookup?.status??null,has_current_order:!!result.current_order,
  page_size:mode==='customer-360'?result.orders?.length??0:undefined,
  read_only:mode!=='proposal-preview',preview_may_probe_worker:mode==='proposal-preview'}));
}catch(e){
 const allowed=/^(crm_http_(401|403|404|409|422|429|500|502|503|504)|crm_contract_invalid|crm_url_invalid|crm_https_required|invalid_)/;
 console.error('LIVE_READ_CHECK_BLOCKED '+(allowed.test(e.message)?e.message:'crm_unavailable'));
 process.exitCode=1;
}finally{key=''}
