// Offline, read-only preflight: never connect to the VPS or CRM.
import {readFileSync,existsSync} from 'node:fs';
const errors=[];
const check=(base,files,rules)=>{
 for(const p of files)if(!existsSync(base+p))errors.push('missing:'+base+p);
 if(errors.length)return;
 const f=Object.fromEntries(files.map(p=>[p,readFileSync(base+p,'utf8')]));
 for(const [name,ok] of Object.entries(rules(f)))if(!ok)errors.push(name);
};
check('deploy/vps/',['compose.yaml','Dockerfile','entrypoint.sh','.env.mock','stack.yaml'],f=>({
 'loopback_only':/127\.0\.0\.1:18090:8080/.test(f['compose.yaml']),
 'read_only':/read_only:\s*true/.test(f['compose.yaml']),
 'writable_home':/HOME:\s*\/tmp/.test(f['compose.yaml']),
 'no_new_privileges':/no-new-privileges:true/.test(f['compose.yaml']),
 'no_privileged':!/^\s*privileged:\s*true\s*$/m.test(f['compose.yaml']),
 'no_host_network':!/network_mode:\s*host/.test(f['compose.yaml']),
 'cpu_limit':/cpus:\s*["']?0\.25/.test(f['compose.yaml']),
 'ram_limit':/mem_limit:\s*256m/.test(f['compose.yaml']),
 'entrypoint_in_context':/COPY.*deploy\/vps\/entrypoint\.sh/.test(f['Dockerfile']),
 'mock_credentials_empty':/^CRM_READ_TOKEN=\s*$/m.test(f['.env.mock']),
 'mock_mode':/^EVYD_MOCK_MODE=1\s*$/m.test(f['.env.mock']),
 'mock_env_path':f['entrypoint.sh'].includes('/app/.env'),
 'no_live_upstream_token':!f['entrypoint.sh'].includes('CRM_WRITE_TOKEN'),
 'stack_standard':f['stack.yaml'].includes('criticality: standard')
}));
check('deploy/gateway/',['compose.yaml','Dockerfile','stack.yaml','Caddyfile.snippet','gateway.env.example'],f=>{
 const y=f['compose.yaml'],d=f['Dockerfile'],e=f['gateway.env.example'];
 return {
  'gateway_no_host_ports':!/^\s*ports:/m.test(y),
  'gateway_edge_external':/edge:\s*\n\s*external:\s*true/.test(y),
  'gateway_read_only':/read_only:\s*true/.test(y),
  'gateway_no_new_privileges':/no-new-privileges:true/.test(y),
  'gateway_cap_drop_all':/cap_drop:\s*\n\s*-\s*ALL/.test(y),
  'gateway_limits':/mem_limit:\s*256m/.test(y)&&/cpus:\s*["']?0\.5/.test(y)&&/pids_limit:\s*64/.test(y),
  'gateway_secret_outside_repo':/env_file:\s*\n\s*-\s*\/srv\/secrets\/evydencia-crm-mcp\/gateway\.env/.test(y),
  'gateway_not_mock':!/EVYD_MOCK_MODE/.test(y)&&!/\.env\.mock|deploy\/vps/.test(d),
  'gateway_image_no_env':!/COPY[^\n]*\.env/.test(d),
  'gateway_template_no_shared_token':!/^(CRM_READ_TOKEN|CRM_TOKEN|EVYDENCIA_LEGACY_TOKEN|ZAPI_)/m.test(e),
  'gateway_template_placeholders':/^EVYD_GATEWAY_KEY=__GENERATE_ON_HOST__$/m.test(e),
  'gateway_caddy_upstream':f['Caddyfile.snippet'].includes('evydencia-crm-mcp-gateway:8090')
 };
});
if(errors.length){console.error('VPS_PREFLIGHT_BLOCKED '+errors.join(','));process.exit(1)}
console.log('VPS_PREFLIGHT_PASS offline configuration only (mock tunnel + live gateway); SSH/ChatGPT/LIVE not verified');
