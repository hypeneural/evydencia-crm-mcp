import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const example='{"order_uuid":"11111111-aaaa-4111-8111-000000000101","order_id":5001}';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const js='scripts/verify-crm-label-render-live.mjs';
const php='scripts/diagnose-crm-label-render.php';
const env={...process.env,EVYD_CRM_LABEL_RENDER_ENABLED:'1',EVYD_CRM_APP_PATH:'/nonexistent-crm-label-synthetic-only'};
const call=(cmd,args,input)=>spawnSync(cmd,args,{cwd,env,input,encoding:'utf8',timeout:5000,maxBuffer:65536,shell:false});
const parse=out=>JSON.parse(out.stdout.trim());

test('Node live renderer diagnostic refuses invalid input without PHP, broker or changes',()=>{
 const out=call(process.execPath,[js],'{}');
 assert.equal(out.status,1,out.stderr);
 const result=parse(out);
 assert.equal(result.source,'CRM_LABEL_NODE_READONLY_PROBE');
 assert.equal(result.ok,false);
 assert.equal(result.changes_applied,false);
 assert.equal(result.broker_called,false);
 assert.equal(result.job_created,false);
 assert.equal(result.printed_physically,false);
 assert.equal(parse(out).error_code,'label_probe_invalid_input');
});

test('Node renderer attempts exact bridge path and never falls back to plain labels',()=>{
 const out=call(process.execPath,[js],example);
 assert.equal(out.status,1,out.stderr);
 assert.equal(parse(out).error_code,'crm_label_bridge_unavailable');
 assert.equal(parse(out).broker_called,false);
 assert.equal(parse(out).job_created,false);
 assert.ok(!out.stdout.includes('000000000101'),'UUID must not enter output');
});

test('PHP preflight validates stdin before touching Laravel',t=>{
 const probe=spawnSync('php',['-v'],{encoding:'utf8',timeout:5000});
 if(probe.error){t.skip('PHP CLI unavailable in this runner');return}
 const bad=call('php',[php],'{ }');
 assert.equal(bad.status,2,bad.stderr);
 assert.equal(parse(bad).stage,'input');
 const missing=call('php',[php],example);
 assert.equal(missing.status,2,missing.stderr);
 assert.equal(parse(missing).error_code,'bootstrap_not_readable');
 assert.equal(parse(missing).changes_applied,false);
 assert.equal(parse(missing).print_job_created,false);
 assert.ok(!missing.stdout.includes('000000000101'));
});

test('diagnostics never import broker, queue or irreversible print actions',()=>{
 const n=readFileSync(new URL('../'+js,import.meta.url),'utf8');
 const p=readFileSync(new URL('../'+php,import.meta.url),'utf8');
 const executable=n.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
 assert.doesNotMatch(executable,/printserverClient|printer\.enqueue|crm_solicitar_impressao_etiqueta/);
 assert.doesNotMatch(p,/printserverClient|printer\.enqueue|crm_solicitar_impressao_etiqueta/);
 assert.match(p,/SET SESSION TRANSACTION READ ONLY/);
 assert.match(n,/renderCanonicalCrmLabel/);
});
