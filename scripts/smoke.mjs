// Testa o transporte stdio REAL do SDK, sempre em modo mock e sem CRM.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const transport=new StdioClientTransport({command:process.execPath,args:['src/server.mjs'],cwd:process.cwd(),env:{EVYD_MOCK_MODE:'1',EVYD_PRIVATE_TOOLS:'0',NODE_ENV:'test',CRM_BASE_URL:'https://invalid.example'}});
const client=new Client({name:'evydencia-smoke-test',version:'1.0.0'});
try {
 await client.connect(transport);
 const list=await client.listTools();
 const names=list.tools.map(x=>x.name);
 for(const n of ['crm_mock_scenarios','crm_status','crm_campanha_publica','crm_cliente_resumo','crm_cliente_360','crm_previa_proposta_natal'])assert.ok(names.includes(n),'Ferramenta ausente: '+n);
 assert.ok(!names.some(x=>x.includes('agendar')||x.includes('enviar')||x.includes('schedule')),'Ferramenta de escrita exposta');
 async function invoke(name,args={}){const r=await client.callTool({name,arguments:args});assert.equal(r.isError??false,false,name+' falhou: '+JSON.stringify(r));return JSON.parse(r.content.find(x=>x.type==='text').text)}
 const status=await invoke('crm_status');assert.equal(status.mock,true);
 const ctx=await invoke('crm_cliente_resumo',{telefone:'48999990001'});assert.equal(ctx.customer.first_name,'Cliente');assert.equal(ctx.mock,true);
 const history=await invoke('crm_cliente_360',{telefone:'48999990001',pagina:1});assert.equal(history.orders.length,2);assert.ok(!JSON.stringify(history).includes('PARTICIPANTE-FICTICIO-NAO-EXIBIR'));
 const preview=await invoke('crm_previa_proposta_natal',{telefone:'48999990001'});assert.equal(preview.scheduled,false);assert.equal(preview.mock,true);
 const slots=await invoke('crm_horarios_publicos',{campanha:'natal',pacote:'ho-ho-ho',inicio:'2026-10-25',fim:'2026-10-27'});assert.equal(slots.calendar.checked,false);assert.equal(slots.mock,true);
 console.log('MCP stdio smoke PASS: ferramentas, privacidade e prévia mock');
} finally {await client.close()}
