// Zero-network targeted validation for the optional Gameplay/CRM MCP bridge.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tasks=[
 ['Syntax: Gameplay client',['--check','src/gameplay-read-client.mjs']],
 ['Syntax: OAuth live gateway',['--check','src/live-gateway.mjs']],
 ['Contract tests: Gameplay client',['--test',
  'test/gameplay-read-client.test.mjs','test/gameplay-read-client-hardening.test.mjs']]
];
let failed=false;
for(const [name,args] of tasks){
 const run=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',timeout:30000,env:{...process.env,EVYD_GAMEPLAY_READ_ENABLED:'0'}});
 const ok=run.status===0&&!run.error;
 console.log(JSON.stringify({step:name,status:ok?'PASS':'FAIL',exit_code:run.status}));
 if(!ok)failed=true;
}
if(failed){process.exitCode=1}else{console.log('GAMEPLAY_MCP_LOCAL_GATE_PASS')}
