import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {MOCK_TOOL_NAMES} from '../scripts/verify-tunnel-mock.mjs';

test('ChatGPT tool metadata describes fixed fixture date and excludes real sends',async()=>{
 const transport=new StdioClientTransport({
  command:process.execPath,args:['src/server.mjs'],cwd:process.cwd(),
  env:{NODE_ENV:'test',EVYD_MOCK_MODE:'1',EVYD_PRIVATE_TOOLS:'0',CRM_READ_TOKEN:'',CRM_BASE_URL:'https://invalid.example'}
 });
 const client=new Client({name:'mock-metadata-audit',version:'1.0.0'});
 try{
  await client.connect(transport);
  const tools=(await client.listTools()).tools;
  const names=tools.map(x=>x.name).sort();
  assert.deepEqual(names,[...MOCK_TOOL_NAMES].sort());
  assert.ok(!names.includes('crm_agendar_proposta_natal'));
  const agenda=tools.find(x=>x.name==='crm_agenda_hoje');
  assert.match(agenda.description,/24\/10\/2026/);
  assert.match(agenda.description,/data explícita/);
  const health=tools.find(x=>x.name==='crm_status');
  assert.match(health.description,/FICTÍCIO/);
  const operator=tools.find(x=>x.name==='crm_conexao_privada');
  assert.match(operator.description,/FICTÍCI/);
  const preview=tools.find(x=>x.name==='crm_previa_proposta_natal');
  assert.equal(preview.annotations.readOnlyHint,false);
  const simulation=tools.find(x=>x.name==='crm_simular_agendamento_proposta_natal');
  assert.equal(simulation.annotations.readOnlyHint,true);
 }finally{await client.close()}
});
