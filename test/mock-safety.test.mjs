import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {inspectMockEnvironment,inspectMockEnvText} from '../src/mock-safety.mjs';
const good='NODE_ENV=development\nEVYD_MOCK_MODE=1\nEVYD_PRIVATE_TOOLS=0\nCRM_BASE_URL=https://crm.example.com\nCRM_READ_TOKEN=\nCRM_REQUEST_TIMEOUT_MS=7000\n';
test('validated synthetic .env is accepted',()=>assert.equal(inspectMockEnvText(good).ok,true));
test('unsafe .env rejects token without leaking its value',()=>{
 const v=inspectMockEnvText(good.replace('CRM_READ_TOKEN=','CRM_READ_TOKEN=top_secret'));
 assert.equal(v.ok,false);assert.ok(v.issues.includes('mock_crm_token_must_be_empty'));assert.ok(!JSON.stringify(v).includes('top_secret'));
});
test('unintended LIVE settings and environment ambiguity fail closed',()=>{
 for(const text of [good.replace('EVYD_MOCK_MODE=1','EVYD_MOCK_MODE=0'),good.replace('EVYD_PRIVATE_TOOLS=0','EVYD_PRIVATE_TOOLS=1'),good+'CRM_READ_TOKEN=otra\n',good+'UNSUPPORTED_KEY=1\n',good.replace('NODE_ENV=development','NODE_ENV=production'),good.replace('CRM_BASE_URL=https://crm.example.com','CRM_BASE_URL="$HOST"')])assert.equal(inspectMockEnvText(text).ok,false);
});
test('server guard blocks inherited live secrets even when .env is safe',()=>{
 assert.equal(inspectMockEnvironment({NODE_ENV:'development',EVYD_MOCK_MODE:'1',EVYD_PRIVATE_TOOLS:'0',CRM_READ_TOKEN:''}).ok,true);
 for(const e of [{CRM_READ_TOKEN:'private'},{EVYD_PRIVATE_TOOLS:'1'},{NODE_ENV:'production'},{ZAPI_TOKEN:'x'}]){
 const r=inspectMockEnvironment({NODE_ENV:'development',EVYD_MOCK_MODE:'1',EVYD_PRIVATE_TOOLS:'0',CRM_READ_TOKEN:'',...e});assert.equal(r.ok,false);
 }
});
test('CLI checker never prints token content',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'evyd-mock-env-'));
 try{
 const path=join(dir,'.env');await writeFile(path,good.replace('CRM_READ_TOKEN=','CRM_READ_TOKEN=private-DO-NOT-ECHO'));
 const p=spawnSync(process.execPath,['scripts/check-mock-env.mjs','--require','--file='+path],{encoding:'utf8'});
 assert.notEqual(p.status,0);assert.match(p.stderr,/MOCK_ENV_BLOCKED/);assert.ok(!p.stderr.includes('private-DO-NOT-ECHO'));
 }finally{await rm(dir,{recursive:true,force:true})}
});
