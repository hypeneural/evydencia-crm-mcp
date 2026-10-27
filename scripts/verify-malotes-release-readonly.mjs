#!/usr/bin/env node
// Release readiness snapshot for Antigravity. READ ONLY: git/gh metadata queries;
// never invokes SSH, prints a customer record, creates a job or mutates refs.
// It cannot certify VPS release drift, physical printing, MySQL HIGH or operator consent.
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';

const here=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const opts={crm:resolve(here,'../evydencia-crm'),mcp:here,print:resolve(here,'../printserver')};
const argv=process.argv.slice(2);
for(let i=0;i<argv.length;i+=2){
 const key=argv[i],value=argv[i+1];
 if(!['--crm','--mcp','--print'].includes(key)||!value){process.stderr.write('Usage: node scripts/verify-malotes-release-readonly.mjs [--crm DIR] [--mcp DIR] [--print DIR]\n');process.exit(2)}
 opts[key.slice(2)]=resolve(value);
}
const execute=(dir,bin,args)=>{
 const result=spawnSync(bin,args,{cwd:dir,encoding:'utf8',timeout:15000,maxBuffer:1024*512,
  windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GH_PROMPT_DISABLED:'1'}});
 if(result.error||result.status!==0)throw Error(bin+'_metadata_unavailable');
 return (result.stdout||'').trim();
};
const safe=(fn)=>{try{return {ok:true,value:fn()}}catch(e){return {ok:false,reason:String(e.message||'unavailable').slice(0,80)}}};
const specs=[
 {key:'crm',repo:'hypeneural/evydencia-crm',pr:432},
 {key:'mcp',repo:'hypeneural/evydencia-crm-mcp',pr:12},
 {key:'print',repo:'hypeneural/printserver',pr:1}
];
const outputs=[];
for(const spec of specs){
 const dir=opts[spec.key];
 const git=(...args)=>execute(dir,'git',args);
 const gh=(...args)=>execute(dir,'gh',args);
 const local=safe(()=>({head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),
  clean:git('status','--porcelain').length===0,remoteMain:git('ls-remote','origin','refs/heads/main').split(/\s+/)[0]}));
 const pr=safe(()=>JSON.parse(gh('pr','view',String(spec.pr),'--repo',spec.repo,'--json',
   'headRefName,headRefOid,baseRefName,baseRefOid,isDraft,state')));
 const item={repo:spec.repo,pr:spec.pr,local:local.value??null,
   metadata_checked:local.ok&&pr.ok,checks:[],failures:[]};
 if(!local.ok)item.failures.push('LOCAL_GIT_UNAVAILABLE');
 if(!pr.ok)item.failures.push('PR_METADATA_UNAVAILABLE');
 if(local.ok&&pr.ok){
  item.remote_pr={head:pr.value.headRefOid,branch:pr.value.headRefName,
   base:pr.value.baseRefOid,state:pr.value.state,draft:pr.value.isDraft};
  if(local.value.head!==pr.value.headRefOid)item.failures.push('LOCAL_HEAD_DIFFERS_FROM_PR');
  if(local.value.branch!==pr.value.headRefName)item.failures.push('LOCAL_BRANCH_DIFFERS_FROM_PR');
  if(!local.value.clean)item.failures.push('DIRTY_WORKTREE');
  if(local.value.remoteMain!==pr.value.baseRefOid)item.failures.push('PR_BASE_DIFFERS_FROM_LIVE_MAIN');
 }
 if(spec.key==='crm'){
  const issue=safe(()=>JSON.parse(gh('issue','view','431','--repo',spec.repo,'--json','body')));
  if(!issue.ok||!issue.value.body.includes('<!-- evydencia-resource-contract:v1'))item.failures.push('ISSUE_RESOURCE_CONTRACT_MISSING');
  const ref=safe(()=>git('ls-remote','origin','refs/_agent-claims/issue-431'));
  if(!ref.ok||!ref.value)item.failures.push('OWNER_CLAIM_MISSING');
  if(local.ok&&!/^(codex|antigravity)\/431-[a-z0-9-]+$/.test(local.value.branch))
   item.failures.push('NON_CANONICAL_BRANCH_DO_NOT_RENAME_OPEN_PR');
  // A passing GitHub check is NOT the local HIGH/RELEASE_CANDIDATE gate.
  item.failures.push('HIGH_RECEIPT_AND_VPS_DRIFT_REQUIRE_SEPARATE_VERIFICATION');
 }
 item.state=item.failures.length?'BLOCKED':'SOURCE_METADATA_OK_ONLY';
 outputs.push(item);
}
const result={tool:'malotes_release_readonly_preflight',changes_applied:false,production_mutations:false,
 generated_at:new Date().toISOString(),repositories:outputs,
 reminders:['Do not rename PR #432 HEAD without a PR preservation plan.',
 'Never use GitHub CI alone as CRM HIGH evidence.',
 'Source metadata does not certify systemd, Windows, Z-API or physical QR.']};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
process.exitCode=outputs.some(o=>o.failures.length)?2:0;
