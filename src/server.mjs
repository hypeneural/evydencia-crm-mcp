import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { crmClient } from './core.mjs';
import { mockCrmClient, mockScenarios } from './mock.mjs';
import { capabilityManifest } from './capabilities.mjs';
import { natalResumo, agendaHoje, buscarClienteNome, simularAgendamento } from './mock-business.mjs';
const mock=process.env.EVYD_MOCK_MODE==='1';
if(mock && !['development','test'].includes(process.env.NODE_ENV))throw Error('mock_requires_development_or_test');
const enabled=mock || process.env.EVYD_PRIVATE_TOOLS==='1';
const crm=mock ? mockCrmClient() : crmClient({baseUrl:process.env.CRM_BASE_URL||'https://invalid.example',token:process.env.CRM_READ_TOKEN||'',privateEnabled:enabled,timeoutMs:Number(process.env.CRM_REQUEST_TIMEOUT_MS||7000)});
const read={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const previewAnnotation={readOnlyHint:false,destructiveHint:false,openWorldHint:false};
const safe=fn=>async input=>{try{const result=await fn(input);return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result}}catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:/^(crm_|invalid_)/.test(e.message)?e.message:'crm_unavailable'})}]}}};
serveStdio(()=>{
 const m=new McpServer({name:'evydencia-crm-mcp',version:'0.4.0'});
 m.registerTool('crm_capacidades',{description:'Declara quais ações existem de verdade e quais são apenas MOCK ou WRITE_GATED; consulte antes de prometer dados.',inputSchema:z.object({}),annotations:read},safe(()=>capabilityManifest({mock,privateEnabled:enabled})));
 if(mock)m.registerTool('crm_mock_scenarios',{description:'Mostra cenários sintéticos de teste; nenhuma consulta externa.',inputSchema:z.object({}),annotations:read},safe(()=>mockScenarios()));
 m.registerTool('crm_status',{description:'Verifica liveness do CRM. Não garante disponibilidade de envio.',inputSchema:z.object({}),annotations:read},safe(()=>crm.status()));
 m.registerTool('crm_campanha_publica',{description:'Consulta catálogo público de uma campanha.',inputSchema:z.object({campanha:z.string().default('natal')}),annotations:read},safe(({campanha})=>crm.campaign(campanha)));
 m.registerTool('crm_horarios_publicos',{description:'Consulta horários públicos; não cria reservas.',inputSchema:z.object({campanha:z.string().default('natal'),pacote:z.string(),inicio:z.string(),fim:z.string()}),annotations:read},safe(({campanha,pacote,inicio,fim})=>crm.availability(campanha,pacote,inicio,fim)));
 if(mock){
  m.registerTool('crm_natal_resumo',{description:'SOMENTE MOCK: métricas fictícias de Natal 2026; NUNCA são vendas ou receita reais.',inputSchema:z.object({}),annotations:read},safe(()=>natalResumo()));
  m.registerTool('crm_agenda_hoje',{description:'SOMENTE MOCK: agenda FICTÍCIA de 24/10/2026, não representa compromissos reais.',inputSchema:z.object({data:z.string().optional()}),annotations:read},safe(({data})=>agendaHoje(data)));
  m.registerTool('crm_buscar_cliente_nome',{description:'SOMENTE MOCK: busca de cliente fictício por nome; não consulta CRM real.',inputSchema:z.object({nome:z.string().min(2).max(60)}),annotations:read},safe(({nome})=>buscarClienteNome(nome)));
  m.registerTool('crm_simular_agendamento_proposta_natal',{description:'SOMENTE MOCK: ensaia confirmação de prévia sintética. JAMAIS agenda, dispara ou envia WhatsApp; exige preview_ref e confirmação explícita.',inputSchema:z.object({telefone:z.string(),preview_ref:z.string(),confirmacao_usuario:z.boolean()}),annotations:read},safe(input=>simularAgendamento(input)));
 }
 if(enabled){
  m.registerTool('crm_conexao_privada',{description:'Mostra contexto mínimo do operador autenticado.',inputSchema:z.object({}),annotations:read},safe(()=>crm.bootstrap()));
  m.registerTool('crm_cliente_resumo',{description:'Consulta resumida por celular brasileiro, sem dados pessoais de participantes.',inputSchema:z.object({telefone:z.string()}),annotations:read},safe(({telefone})=>crm.customer(telefone)));
  m.registerTool('crm_cliente_360',{description:'Até 5 pedidos por página e agregados sem dados de crianças.',inputSchema:z.object({telefone:z.string(),pagina:z.number().int().min(1).max(100).default(1)}),annotations:read},safe(({telefone,pagina})=>crm.history(telefone,pagina)));
  m.registerTool('crm_previa_proposta_natal',{description:'Consulta prévia e elegibilidade da proposta. NÃO agenda nem dispara; pode acionar sonda de prontidão do worker no CRM. Nunca infira envio a partir da prévia.',inputSchema:z.object({telefone:z.string(),nome:z.string().max(80).optional()}),annotations:previewAnnotation},safe(({telefone,nome})=>crm.preview(telefone,nome)));
 }
 return m;
});
