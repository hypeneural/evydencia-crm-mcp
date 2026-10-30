#!/usr/bin/env node
// Privacy-safe, offline inspection of Meta Audience feature flags for a canary.
// No database, CRM, network, tokens, paths or PII are printed.
import {lstat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';

const env=process.env;
const master=env.EVYD_META_AUDIENCE_ENABLED==='1';
const exportFlag=env.EVYD_AUDIENCE_EXPORT_ENABLED==='1';
const legalFlag=env.EVYD_META_AUDIENCE_LGPD_APPROVED==='1';
const policyRef=/^[A-Za-z0-9_.:-]{8,120}$/.test(String(env.EVYD_META_AUDIENCE_LGPD_POLICY_REF||''));
const operators=String(env.EVYD_AUDIENCE_ALLOWED_OPERATOR_IDS||env.EVYD_AUDIENCE_ALLOWED_OPERATORS||'')
 .split(',').map(s=>s.trim()).filter(Boolean);
const uniqueOperators=new Set(operators);
const directory=env.META_PRIVATE_CSV_DIR;
let privateDir=false;
if(directory&&isAbsolute(directory)){
 try {
  const st=await lstat(directory);
  privateDir=st.isDirectory()&&!st.isSymbolicLink()
    &&(process.platform==='win32'||(st.mode&0o077)===0);
 }catch{}
}
const contract={
 master_enabled:master,
 export_switch_enabled:exportFlag,
 operators_explicitly_configured:operators.length>0&&uniqueOperators.size===operators.length,
 legal_server_attested:legalFlag&&policyRef,
 private_export_directory_ready:privateDir,
 legacy_reader_token_configured:typeof env.EVYD_INTERNAL_READ_TOKEN==='string'
   &&env.EVYD_INTERNAL_READ_TOKEN.length>=12,
};
const blockers=[];
if(exportFlag&&!master)blockers.push('master_switch_off');
if(master&&!contract.legacy_reader_token_configured)blockers.push('legacy_read_token_missing');
if(exportFlag){
 if(!contract.operators_explicitly_configured)blockers.push('audience_operator_allowlist_missing');
 if(!contract.legal_server_attested)blockers.push('documented_legal_policy_unapproved');
 if(!privateDir)blockers.push('private_export_directory_not_ready');
}
const status=blockers.length?'BLOCKED_CONFIG':!master?'FEATURE_DISABLED':
 !exportFlag?'PREVIEW_CONFIGURED_EXPORT_DISABLED':'EXPORT_CONFIG_READY_NOT_AUTHORIZED_FOR_LIVE';
console.log(JSON.stringify({feature:'meta_audience_p25',status,checks:contract,blockers,
  live_data_validated:false,chatgpt_download_available:false,meta_upload_authorized:false,
  contains_personal_data:false},null,2));
if(blockers.length)process.exitCode=2;
