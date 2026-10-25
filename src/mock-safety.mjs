// Fail-closed local MOCK: no real CRM token can share a demonstration process.
const SAFE_KEYS=new Set(['NODE_ENV','EVYD_MOCK_MODE','EVYD_PRIVATE_TOOLS','CRM_BASE_URL','CRM_READ_TOKEN','CRM_REQUEST_TIMEOUT_MS']);
export function inspectMockEnvironment(env){
 const issues=[];
 if(!['development','test'].includes(env.NODE_ENV))issues.push('mock_requires_development_or_test');
 if(env.EVYD_MOCK_MODE!=='1')issues.push('mock_mode_must_be_1');
 if(env.EVYD_PRIVATE_TOOLS!==undefined&&env.EVYD_PRIVATE_TOOLS!=='0')issues.push('mock_private_tools_must_be_0');
 if(env.CRM_READ_TOKEN)issues.push('mock_crm_token_must_be_empty');
 if(env.CRM_WRITE_TOKEN||env.ZAPI_TOKEN||env.Z_API_TOKEN)issues.push('mock_outbound_secret_forbidden');
 return {ok:issues.length===0,issues};
}
export function assertServerSafety(env){
 if(env.EVYD_MOCK_MODE!=='1')return;
 const r=inspectMockEnvironment(env);
 if(!r.ok)throw Error(r.issues.join(','));
}
// Accept only .env.example's simple literals; never output values.
export function inspectMockEnvText(text){
 const vars={};const issues=[];
 for(const line of String(text).split(/\r?\n/)){
  const s=line.trim();
  if(!s||s.startsWith('#'))continue;
  const m=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(s);
  if(!m){issues.push('env_invalid_line');continue}
  if(!SAFE_KEYS.has(m[1])){issues.push('env_unrecognized_key');continue}
  if(Object.hasOwn(vars,m[1])){issues.push('env_duplicate_key');continue}
  if(/["'$}{#\r\n]/.test(m[2])){issues.push('env_unsupported_syntax');continue}
  vars[m[1]]=m[2];
 }
 if(!Object.hasOwn(vars,'CRM_READ_TOKEN'))issues.push('env_missing_crm_read_token');
 if(!Object.hasOwn(vars,'CRM_BASE_URL'))issues.push('env_missing_crm_base_url');
 const validated=inspectMockEnvironment(vars);
 return {ok:issues.length===0&&validated.ok,issues:[...issues,...validated.issues]};
}
