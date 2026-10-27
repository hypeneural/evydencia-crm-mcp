#!/usr/bin/env node
/**
 * Synthetic, OFFLINE verification of THIS repository only.
 * No git/gh/ssh/network, file mutation, printer, server, DB or live credentials.
 *
 * Keep this script self-contained for a limited local coding agent.
 */
import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env=Object.fromEntries(['PATH','Path','PATHEXT','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
env.NODE_ENV='test';
env.CI='1';
const steps=[
 {name:'syntax',args:['--check','src/live-gateway.mjs']},
 {name:'batch_contract',args:['--test','test/malotes-batch.test.mjs']},
 {name:'client_contracts',args:['--test','test/malotes-ready-client.test.mjs','test/printserver-client.test.mjs','test/crm-label-render.test.mjs']},
 {name:'gateway_integration',args:['--test','test/live-gateway.test.mjs']}
];
const results=[];
for(const step of steps){
 const start=Date.now();
 const child=spawnSync(process.execPath,step.args,{
  cwd:root,env,windowsHide:true,encoding:'utf8',timeout:150000,maxBuffer:4*1024*1024,
  shell:false
 });
 const ok=!child.error&&child.status===0;
 results.push({
  name:step.name,ok,exit_code:child.status,
  elapsed_ms:Date.now()-start,
  error_code:child.error?.code||null
 });
 if(!ok)break; // One cause at a time; no test retry or cascading failures.
}
const ok=results.length===steps.length&&results.every(x=>x.ok);
process.stdout.write(JSON.stringify({
 source:'MCP_LOCAL_SYNTHETIC_VALIDATION',
 mode:'offline_only',
 changes_applied:false,
 external_requests_performed:false,
 commercial_writes_performed:false,
 physical_print_performed:false,
 steps:results,ok
},null,2)+'\n');
process.exitCode=ok?0:1;
