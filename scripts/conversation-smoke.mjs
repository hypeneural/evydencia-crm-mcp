// E2E MCP protocol + conversas representativas, sem LLM nem chamadas ao CRM.
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
const transport=new StdioClientTransport({
 command:process.execPath,args:['src/server.mjs'],cwd:process.cwd(),
 env:{NODE_ENV:'test',EVYD_MOCK_MODE:'1',EVYD_PRIVATE_TOOLS:'0',CRM_BASE_URL:'https://invalid.example',CRM_READ_TOKEN:''}
});
const client=new Client({name:'evydencia-conversation-smoke',version:'1.0.0'},{versionNegotiation:{mode:'auto'}});
const invoked=[];
try{
 await client.connect(transport);
 assert.equal(client.getProtocolEra(),'modern','MCP v2 2026-07-28 negotiation required');
 const list=await client.listTools();
 const names=new Set(list.tools.map(t=>t.name));
 const capabilitiesTool=list.tools.find(t=>t.name==='crm_capacidades');
 assert.equal(capabilitiesTool.title,'Capacidades disponíveis');
 const simTool=list.tools.find(t=>t.name==='crm_simular_agendamento_proposta_natal');
 assert.match(simTool.title,/SEM ENVIO/);
 assert.equal(simTool.annotations?.readOnlyHint,true);
 for(const n of ['crm_capacidades','crm_mock_scenarios','crm_natal_resumo','crm_agenda_hoje','crm_buscar_cliente_nome','crm_previa_proposta_natal','crm_simular_agendamento_proposta_natal'])
  assert.ok(names.has(n),'tool missing: '+n);
 assert.ok(!names.has('crm_agendar_proposta_natal'),'real schedule tool forbidden');
 async function call(name,args={},error=false){
  const r=await client.callTool({name,arguments:args});
  assert.equal(Boolean(r.isError),error,name+' isError unexpected');
  const val=JSON.parse(r.content.find(c=>c.type==='text').text);
  if(!error){
   assert.deepEqual(r.structuredContent,val,'structuredContent must equal content');
   assert.equal(val.mock,true,'all mock calls must say mock=true');
  }
  invoked.push(name+(error?' (expected error)':''));
  return val;
 }
 const caps=await call('crm_capacidades');
 assert.equal(caps.tools.find(x=>x.tool==='crm_natal_resumo').state,'MOCK_ACTIVE');
 assert.equal(caps.tools.find(x=>x.tool==='crm_agendar_proposta_natal').state,'WRITE_GATED');
 const natal=await call('crm_natal_resumo');
 assert.equal(natal.sales.sessions_sold,137);
 const agenda=await call('crm_agenda_hoje',{data:'2026-10-24'});
 assert.equal(agenda.total,6);
 const otherDate=await call('crm_agenda_hoje',{data:'2026-10-25'});
 assert.equal(otherDate.available,false);
 const clientInfo=await call('crm_buscar_cliente_nome',{nome:'Marina'});
 assert.equal(clientInfo.status,'matched');assert.equal(clientInfo.customers[0].natal_2026_purchased,true);
 const ambiguous=await call('crm_buscar_cliente_nome',{nome:'Mari'});
 assert.equal(ambiguous.status,'ambiguous');
 const preview=await call('crm_previa_proposta_natal',{telefone:'48999990001'});
 assert.equal(preview.scheduled,false);assert.equal(preview.preview_ref,'demo-preview-0001');
 await call('crm_simular_agendamento_proposta_natal',{telefone:'48999990001',preview_ref:preview.preview_ref,confirmacao_usuario:false},true);
 await call('crm_simular_agendamento_proposta_natal',{telefone:'48999990001',preview_ref:'invalido',confirmacao_usuario:true},true);
 const simulated=await call('crm_simular_agendamento_proposta_natal',{telefone:'48999990001',preview_ref:preview.preview_ref,confirmacao_usuario:true});
 assert.equal(simulated.real_dispatch,false);assert.equal(simulated.scheduled,false);assert.equal(simulated.status,'simulated_scheduled');
 assert.ok(!JSON.stringify(simulated).includes('Bearer '));
 console.log('CONVERSATION SMOKE PASS ('+invoked.length+' MCP calls): modern, Natal, agenda, cliente, prévia, confirmação simulada');
}finally{await client.close()}
