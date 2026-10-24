import test from 'node:test';
import assert from 'node:assert/strict';
import { crmClient, proposalName, phone } from '../src/core.mjs';

const make=(fetchFn,extra={})=>crmClient({baseUrl:'https://crm.example.test',token:'FAKE-LOCAL-ONLY',privateEnabled:true,fetchFn,...extra});
const json=(body,opts={})=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'},...opts});

test('limite de resposta é aplicado DURANTE o streaming, antes de acumular memória',async()=>{
 const bytes=new Uint8Array(1024*1024+1).fill(65);
 const response=new Response(new ReadableStream({start(c){c.enqueue(bytes);c.close()}}),{headers:{'content-type':'application/json'}});
 const c=make(async()=>response);
 await assert.rejects(()=>c.status(),/crm_response_too_large/);
});
test('content-length antecipado bloqueia download grande',async()=>{
 const c=make(async()=>new Response('{}',{headers:{'content-length':'1048577','content-type':'application/json'}}));
 await assert.rejects(()=>c.status(),/crm_response_too_large/);
});
test('content-type incorreto e JSON inválido falham sem ecoar payload',async()=>{
 const c1=make(async()=>new Response('html',{headers:{'content-type':'text/html'}}));
 await assert.rejects(()=>c1.status(),/crm_invalid_content_type/);
 const c2=make(async()=>new Response('{senha:invalida}',{headers:{'content-type':'application/json'}}));
 await assert.rejects(()=>c2.status(),/crm_invalid_json/);
});
test('contrato desconhecido não é interpretado como cliente não encontrado',async()=>{
 const c=make(async()=>json({data:{customer:{uuid:'x'}}}));
 await assert.rejects(()=>c.customer('48999990001'),/crm_contract_invalid/);
});
test('cliente matched sem UUID e histórico sem pedidos falham fechado',async()=>{
 const c=make(async()=>json({data:{lookup:{status:'matched'},customer:{first_name:'Teste'},orders:[]}}));
 await assert.rejects(()=>c.customer('48999990001'),/crm_contract_invalid/);
 await assert.rejects(()=>c.history('48999990001'),/crm_contract_invalid/);
});
test('campanha e disponibilidade com contrato alterado são rejeitadas',async()=>{
 const c=make(async()=>json({data:{campaign:{slug:'natal'}}}));
 await assert.rejects(()=>c.campaign('natal'),/crm_contract_invalid/);
 await assert.rejects(()=>c.availability('natal','ho-ho-ho','2026-10-25','2026-10-26'),/crm_contract_invalid/);
});
test('prévia sem ready boolean não vira elegível por acidente',async()=>{
 const c=make(async()=>json({data:{message_preview:'qualquer'}}));
 await assert.rejects(()=>c.preview('48999990001'),/crm_contract_invalid/);
});
test('nome de proposta segue ProposalRecipientName Laravel e normaliza espaços',async()=>{
 assert.equal(proposalName('  Maria    Clara  '),'Maria Clara');
 assert.equal(proposalName('   '),undefined);
 assert.throws(()=>proposalName('Maria;Clara'),/invalid_name/);
 assert.throws(()=>proposalName('Maria\nClara'),/invalid_name/);
 assert.throws(()=>proposalName('12345'),/invalid_name/);
 assert.throws(()=>proposalName('Á'.repeat(81)),/invalid_name/);
 let calls=0;
 const c=make(async(_url,opts)=>{calls++;assert.equal(JSON.parse(opts.body).name,'Maria Clara');return json({data:{ready:true}})});
 await c.preview('48999990001','  Maria    Clara  ');
 await assert.rejects(()=>c.preview('48999990001','Nome;Inválido'),/invalid_name/);
 assert.equal(calls,1,'nome inválido não deve chamar CRM');
});
test('DDD válido e celular legado normalizado como fromProposalInput do CRM',()=>{
 assert.equal(phone('(48) 9999-0001'),'48999990001');
 assert.equal(phone('+55 (48) 99999-0001'),'48999990001');
});
test('timeout inválido é rejeitado antes de consultar rede',()=>{
 assert.throws(()=>make(async()=>json({}),{timeoutMs:NaN}),/crm_timeout_invalid/);
 assert.throws(()=>make(async()=>json({}),{timeoutMs:999999}),/crm_timeout_invalid/);
});
test('429 e 503 mantêm códigos genéricos, sem corpo privado',async()=>{
 for(const status of [429,503]){
   const c=make(async()=>new Response('TOKEN-SENSITIVE',{status}));
   await assert.rejects(()=>c.status(),new RegExp('crm_http_'+status));
 }
});
test('mock não é executado quando NODE_ENV é produção ou indefinido',async()=>{
 const {spawnSync}=await import('node:child_process');
 for(const nodeEnv of ['production','']){
   const env={...process.env,EVYD_MOCK_MODE:'1',NODE_ENV:nodeEnv};
   const p=spawnSync(process.execPath,['src/server.mjs'],{cwd:process.cwd(),env,encoding:'utf8',timeout:8000});
   assert.notEqual(p.status,0,'mock deve falhar em NODE_ENV='+JSON.stringify(nodeEnv));
   assert.match(p.stderr,/mock_requires_development_or_test/);
 }
});
