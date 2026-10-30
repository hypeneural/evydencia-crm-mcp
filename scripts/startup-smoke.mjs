// End-to-end proof that the REAL stdio entrypoint starts only in safe MOCK mode.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
const dir=await mkdtemp(join(tmpdir(),'evyd-stdio-start-'));
const serverPath=fileURLToPath(new URL('start-mock.mjs',import.meta.url));
const text='NODE_ENV=development\nEVYD_MOCK_MODE=1\nEVYD_PRIVATE_TOOLS=0\nCRM_BASE_URL=https://crm.example.com\nCRM_READ_TOKEN=\nCRM_REQUEST_TIMEOUT_MS=7000\n';
let client;
try{
 await writeFile(join(dir,'.env'),text);
 const transport=new StdioClientTransport({
  command:process.execPath,args:['--env-file=.env',serverPath],cwd:dir,
  env:{NODE_ENV:'development',EVYD_MOCK_MODE:'1',EVYD_PRIVATE_TOOLS:'0',CRM_BASE_URL:'https://crm.example.com',CRM_READ_TOKEN:''}
 });
 client=new Client({name:'evyd-startup-check',version:'1.0.0'});
 await client.connect(transport);
 const tools=(await client.listTools()).tools.map(t=>t.name);
 assert.ok(tools.includes('crm_natal_resumo'));
 assert.ok(!tools.includes('crm_agendar_proposta_natal'));
 const reply=await client.callTool({name:'crm_natal_resumo',arguments:{}});
 assert.equal(JSON.parse(reply.content[0].text).mock,true);
 await client.close();client=null;
 await writeFile(join(dir,'.env'),text.replace('CRM_READ_TOKEN=','CRM_READ_TOKEN=CANARY_DONT_PRINT'));
 const invalid=spawnSync(process.execPath,['--env-file=.env',serverPath],{cwd:dir,encoding:'utf8',timeout:7000,
  env:{...process.env,NODE_ENV:'development',EVYD_MOCK_MODE:'1',EVYD_PRIVATE_TOOLS:'0',CRM_READ_TOKEN:'CANARY_DONT_PRINT'}});
 assert.notEqual(invalid.status,0);
 assert.match(invalid.stderr,/MOCK_START_BLOCKED/);
 assert.ok(!invalid.stderr.includes('CANARY_DONT_PRINT'));
 assert.equal(invalid.stdout,'');
 console.log('STARTUP SMOKE PASS: verified safe stdio startup and invalid secret rejection');
}finally{if(client)await client.close();await rm(dir,{recursive:true,force:true})}
