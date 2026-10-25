// Offline, read-only preflight: never connect to the VPS or CRM.
import {readFileSync,existsSync} from 'node:fs';
const errors=[];
const base='deploy/vps/';
for(const p of ['compose.yaml','Dockerfile','entrypoint.sh','.env.mock','stack.yaml']){
 if(!existsSync(base+p))errors.push('missing:'+p);
}
if(errors.length===0){
 const y=readFileSync(base+'compose.yaml','utf8');
 const docker=readFileSync(base+'Dockerfile','utf8');
 const sh=readFileSync(base+'entrypoint.sh','utf8');
 const env=readFileSync(base+'.env.mock','utf8');
 const stack=readFileSync(base+'stack.yaml','utf8');
 for(const [name,ok] of Object.entries({
   'loopback_only':/127\.0\.0\.1:18090:8080/.test(y),
   'read_only':/read_only:\s*true/.test(y),
   'no_new_privileges':/no-new-privileges:true/.test(y),
   'no_privileged':!/^\s*privileged:\s*true\s*$/m.test(y),
   'no_host_network':!/network_mode:\s*host/.test(y),
   'cpu_limit':/cpus:\s*["']?0\.25/.test(y),
   'ram_limit':/mem_limit:\s*256m/.test(y),
   'entrypoint_in_context':/COPY.*deploy\/vps\/entrypoint\.sh/.test(docker),
   'mock_credentials_empty':/^CRM_READ_TOKEN=\s*$/m.test(env),
   'mock_mode':/^EVYD_MOCK_MODE=1\s*$/m.test(env),
   'mock_env_path':sh.includes('/app/.env'),
   'no_live_upstream_token':!sh.includes('CRM_WRITE_TOKEN'),
   'stack_standard':stack.includes('criticality: standard')
 }))if(!ok)errors.push(name);
}
if(errors.length){console.error('VPS_PREFLIGHT_BLOCKED '+errors.join(','));process.exit(1)}
console.log('VPS_PREFLIGHT_PASS offline configuration only; SSH/ChatGPT/LIVE not verified');
