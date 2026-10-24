import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { phone, customerProjection, historyProjection, proposalProjection, crmClient } from '../src/core.mjs';
const fixture=async f=>JSON.parse(await readFile(new URL('../fixtures/'+f+'.json',import.meta.url),'utf8'));
test('normalização reproduz DDD e celular legado do CRM',()=>{
 assert.equal(phone('+55 (48) 99999-0001'),'48999990001');
 assert.equal(phone('(48) 9999-0001'),'48999990001');
 assert.throws(()=>phone('20 99999-0001'),/invalid_mobile/);
 assert.throws(()=>phone('+1 48 99999-0001'),/invalid_mobile/);
});
test('projeção de campanha corresponde ao Scribe sem enviar token',async()=>{
 const f=await fixture('campaign');
 const fetchFn=async(url,opts)=>{
   assert.equal(opts.method,'GET');assert.ok(!('Authorization' in opts.headers));assert.match(url.pathname,/\/api\/public\/v1\/agenda\/campaigns\/natal$/);
   return {ok:true,headers:new Headers(),text:async()=>JSON.stringify(f)};
 };
 const c=crmClient({baseUrl:'https://crm.example.com',fetchFn});
 const result=await c.campaign('natal');assert.equal(result.products[0].slug,'ho-ho-ho');assert.equal(result.campaign.period.timezone,'America/Sao_Paulo');
});
test('disponibilidade usa data.googleCalendar e data.slotsByDate',async()=>{
 const f=await fixture('availability');
 const c=crmClient({baseUrl:'https://crm.example.com',fetchFn:async()=>({ok:true,headers:new Headers(),text:async()=>JSON.stringify(f)})});
 const r=await c.availability('natal','ho-ho-ho','2026-10-25','2026-10-27');
 assert.equal(r.calendar.checked,true);assert.equal(r.days[0].times[0],'09:00');assert.equal(r.pagination.totalDays,1);
});
test('contexto real mantém status do pedido e omite telefone',async()=>{
 const f=await fixture('customer-context');const r=customerProjection(f);
 assert.equal(r.current_order.status.stage,'scheduled');assert.equal(r.history.lifetime_value,750);assert.ok(!JSON.stringify(r).includes('whatsapp_e164'));
});
test('customer360 omite PII individual e expõe KPIs do Laravel',async()=>{
 const f=await fixture('customer-360');const r=historyProjection(f);
 assert.equal(r.kpis.average_ticket,375);assert.equal(r.orders[0].participants_count,1);
 assert.ok(!JSON.stringify(r).includes('PARTICIPANTE-FICTICIO-NAO-EXIBIR'));
 assert.ok(!JSON.stringify(r).includes('2018-01-01'));
});
test('prévia respeita escopo de entrega e não confirma envio',async()=>{
 const f=await fixture('proposal-preview');const r=proposalProjection(f);
 assert.equal(r.delivery_scope,'initial_whatsapp_only');assert.equal(r.scheduled,false);assert.equal(r.selection.variant,'with_name');
});
test('requisição privada nunca vaza token para agenda pública',async()=>{
 let calls=0;const c=crmClient({baseUrl:'https://crm.example.com',token:'SECRET-DO-NOT-LEAK',privateEnabled:true,fetchFn:async(u,opts)=>{calls++;if(u.pathname.endsWith('/bootstrap'))assert.equal(opts.headers.Authorization,'Bearer SECRET-DO-NOT-LEAK');else assert.ok(!opts.headers.Authorization);return{ok:true,headers:new Headers(),text:async()=>JSON.stringify({data:{operator:{name:'Fictício'},server:{timezone:'America/Sao_Paulo'}}})}}});
 await c.bootstrap();await c.status();assert.equal(calls,2);
});
test('POST de preview nunca atinge schedule',async()=>{
 const c=crmClient({baseUrl:'https://crm.example.com',token:'MOCK',privateEnabled:true,fetchFn:async(u,opts)=>{assert.equal(u.pathname,'/api/v1/extension/proposals/preview');assert.equal(opts.method,'POST');return{ok:true,headers:new Headers(),text:async()=>JSON.stringify({data:{ready:true}})}}});
 assert.equal((await c.preview('48999990001')).scheduled,false);
});
