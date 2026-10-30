import {readFile} from 'node:fs/promises';
import {inspectMockEnvText} from '../src/mock-safety.mjs';
import {resolve} from 'node:path';
const required=process.argv.includes('--require');
const fi=process.argv.find(x=>x.startsWith('--file='));
const file=fi?fi.slice(7):resolve('.env');
let content;
try{content=await readFile(file,'utf8')}catch(e){
 if(e?.code==='ENOENT'&&!required){console.log('MOCK_ENV_SKIP: no .env (CI uses isolated env)');process.exit(0)}
 console.error('MOCK_ENV_BLOCKED: missing .env; run scripts/bootstrap-mock.ps1');process.exit(1);
}
const result=inspectMockEnvText(content);
if(!result.ok){console.error('MOCK_ENV_BLOCKED: '+[...new Set(result.issues)].join(','));process.exit(1)}
console.log('MOCK_ENV_PASS: synthetic, private disabled, no CRM token');
