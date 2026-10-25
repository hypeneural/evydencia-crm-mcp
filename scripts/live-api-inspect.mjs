import {auditExtension,auditLegacy,shapeOnly} from '../src/live-api-audit.mjs';
import {readFile} from 'node:fs/promises';
const e=process.env;
try {
 const family=e.CRM_PROBE_FAMILY??'offline';
 let result;
 if(family==='offline'){
  const schemas={};
  for(const file of ['customer-context','customer-360','proposal-preview','campaign','availability']){
   const raw=JSON.parse(await readFile(new URL('../fixtures/'+file+'.json',import.meta.url),'utf8'));
   schemas[file]=shapeOnly(raw);
  }
  result={mode:'OFFLINE',network:false,schemas};
 }else if(['extension','legacy'].includes(family)){
  if(e.CRM_LIVE_NETWORK_CONSENT!=='1')throw Error('live_probe_network_consent_required');
  const host=new URL(e.CRM_BASE_URL).hostname.toLowerCase();
  if(host!==(e.CRM_EXPECTED_HOST??'evydencia.com').toLowerCase())throw Error('live_probe_host_mismatch');
  if(family==='extension'){
  result=await auditExtension({baseUrl:e.CRM_BASE_URL,token:e.CRM_READ_TOKEN,
   action:e.CRM_PROBE_ACTION??'bootstrap',phoneValue:e.CRM_TEST_PHONE,
   consent:e.CRM_LIVE_CUSTOMER_CONSENT==='1',
   previewConsent:e.CRM_LIVE_PREVIEW_PROBE_CONSENT==='1',publicDate:e.CRM_TEST_DATE});
 }else{
  result=await auditLegacy({baseUrl:e.CRM_BASE_URL,token:e.CRM_READ_TOKEN,
   action:e.CRM_PROBE_ACTION??'orders',uuid:e.CRM_TEST_ORDER_UUID,
   allowPrivilegedGet:e.EVYD_ACK_LEGACY_WRITE_POWER==='1'});
  }
 }else throw Error('probe_family_invalid');
 console.log('CRM_JSON_STRUCTURE_PASS '+JSON.stringify(result));
}catch(error){
 const code=String(error?.message??'');
 console.error('CRM_JSON_STRUCTURE_BLOCKED '+(/^(crm_|invalid_|live_probe_)[a-z0-9_]+$/.test(code)?code:'probe_failed'));
 process.exitCode=1;
}
