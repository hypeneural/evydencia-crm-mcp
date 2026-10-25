import {readFile,access} from 'node:fs/promises';
import {inspectMockEnvText} from '../src/mock-safety.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const need=['AGENTS.md','docs/FORENSE_LEGADO_NATAL_20261025.md','PROMPT_ANTIGRAVITY_LEGADO_NATAL_20261025.md','src/AGENTS.md','test/AGENTS.md','fixtures/AGENTS.md',
 '.agents/hooks.json','.agents/rules/security.md','.agents/rules/flash-guardrails.md',
 'src/core.mjs','src/mock-orders.mjs','src/natal-digest-snapshot.mjs','src/order-readiness.mjs','src/live-api-audit.mjs','src/chart-ready.mjs','src/operational-summary.mjs','src/legacy-historical.mjs','src/server.mjs','src/capabilities.mjs','src/mock.mjs','src/mock-business.mjs',
 'scripts/smoke.mjs','scripts/conversation-smoke.mjs','scripts/check-private-snapshot.mjs','scripts/import-legacy-history.mjs','scripts/live-api-inspect.mjs','scripts/validate-crm-key.ps1','scripts/validate-mvp.ps1','tools/export-natal-digest.php','scripts/antigravity-hook.mjs',
 'fixtures/natal-summary.mock.json','fixtures/order-catalog.mock.json','fixtures/today-agenda.mock.json','fixtures/customer-name-search.mock.json'];
let fail=0,warn=0;
const error=s=>{fail++;console.error('FAIL '+s)};
const warning=s=>{warn++;console.warn('WARN '+s)};
const ok=s=>console.log('PASS '+s);
for(const path of need){try{await access(resolve(root,path))}catch{error('Missing '+path)}}
const major=Number(process.versions.node.split('.')[0]);
if(major<22)error('Node >=22 required: '+process.version);else ok('Node '+process.version);
for(const p of ['.agents/rules/security.md','.agents/rules/flash-guardrails.md']){
 try{
  const s=await readFile(resolve(root,p),'utf8');
  if(!/^---\r?\ntrigger:\s*(always_on|model_decision|glob|manual)\r?\n/m.test(s))error('Antigravity rule frontmatter: '+p);
  else ok('Rule: '+p);
 }catch{error('Rule unreadable: '+p)}
}
try{
 const h=JSON.parse(await readFile(resolve(root,'.agents/hooks.json'),'utf8'));
 const ev=Object.values(h).flatMap(x=>Object.keys(x));
 if(!ev.includes('PreToolUse')||!ev.includes('SessionStart'))error('hooks.json missing PreToolUse/SessionStart');
 else ok('Antigravity hooks schema basics');
}catch{error('Invalid hooks.json')}
for(const p of ['natal-summary','order-catalog','today-agenda','customer-name-search']){
 try{
  const f=JSON.parse(await readFile(resolve(root,'fixtures',p+'.mock.json'),'utf8'));
  if(!f.schema_version?.startsWith('mock-')||!f.warning)error('Fixture not labeled: '+p);
  else ok('Fixture: '+p);
 }catch{error('Invalid fixture: '+p)}
}
try{await access(resolve(root,'package-lock.json'));const trackedLock=spawnSync('git',['ls-files','--error-unmatch','package-lock.json'],{cwd:root,encoding:'utf8'});if(trackedLock.status!==0)error('Lockfile exists but is not tracked');else ok('package-lock.json tracked')}catch{
 if(process.argv.includes('--strict-lock'))error('package-lock.json missing: run npm install --package-lock-only then commit it');
 else warning('package-lock.json not yet generated; npm install --package-lock-only then commit and prefer npm ci');
}
try{const env=await readFile(resolve(root,'.env'),'utf8');const safety=inspectMockEnvText(env);if(!safety.ok)error('Unsafe local .env: '+safety.issues.join(','));else ok('Local .env is MOCK-only and zero-token')}catch(e){if(e?.code==='ENOENT')ok('No local .env: CI isolated mode');else error('Local .env cannot be validated')}
const tracked=spawnSync('git',['ls-files','--error-unmatch','.env'],{cwd:root,encoding:'utf8'});
if(tracked.status===0)error('Real .env is tracked');else ok('No .env tracked by git');
try{
 const s=await readFile(resolve(root,'src/core.mjs'),'utf8');
 if(/['"]\/api\/v1\/extension\/proposals\/schedule['"]/.test(s))error('Real schedule endpoint found in core.mjs');
 else ok('No real proposal schedule in CRM adapter');
}catch{error('core.mjs unavailable')}
if(fail){console.error('DOCTOR BLOCKED '+fail+' error(s); '+warn+' warning(s)');process.exitCode=1}
else console.log('DOCTOR PASS ('+warn+' warning(s)) — LOCAL MOCK ONLY, not CRM/ChatGPT production proof');
