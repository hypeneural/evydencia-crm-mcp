import test from 'node:test';import assert from 'node:assert/strict';
import {baseURL,slug,phone,dates,customerProjection,historyProjection,proposalProjection,crmClient} from '../src/core.mjs';
test('URL somente HTTPS ou localhost',()=>{assert.throws(()=>baseURL('http://example.org'));assert.throws(()=>baseURL('https://user:pass@example.org'));assert.equal(baseURL('https://example.org/'),'https://example.org')});
test('slug e telefone validados',()=>{assert.throws(()=>slug('../etc'));assert.throws(()=>phone('000'));assert.equal(phone('48999990000'),'48999990000')});
test('datas limitadas',()=>{assert.throws(()=>dates('2026-10-01','2026-11-01'));assert.deepEqual(dates('2026-10-01','2026-10-03'),['2026-10-01','2026-10-03'])});
test('cliente ambiguo não vaza',()=>{assert.deepEqual(customerProjection({data:{lookup:{status:'ambiguous',match_count:2},customer:{name:'privado'}}}).customer,null)});
test('histórico não expõe nomes e nascimentos',()=>{const d=historyProjection({data:{lookup:{status:'matched'},orders:[{uuid:'x',participants:[{name:'Criança',birth:'2020-01-01'}]}]}});assert.equal(d.orders[0].participants_count,1);assert.ok(!JSON.stringify(d).includes('Criança'));assert.ok(!JSON.stringify(d).includes('2020-01-01'))});
test('prévia remove dados externos inesperados',()=>{const r=proposalProjection({data:{ready:true,message_preview:'Mensagem',raw_token:'segredo'}});assert.equal(r.message_preview,'Mensagem');assert.ok(!JSON.stringify(r).includes('segredo'))});
test('não agenda envios com cliente HTTP',async()=>{const fetchFn=async(url,opt)=>{assert.equal(opt.method,'POST');assert.ok(url.pathname.endsWith('/preview'));return {ok:true,headers:new Headers(),text:async()=>JSON.stringify({data:{ready:true,message_preview:'Ola'}})}};const c=crmClient({baseUrl:'https://crm.example',token:'mock',privateEnabled:true,fetchFn});assert.equal((await c.preview('48999990000')).ready,true)});
test('token sem opt-in não pode consultar privado',async()=>{const c=crmClient({baseUrl:'https://crm.example'});await assert.rejects(()=>c.preview('48999990000'))});

test('strictEnvelope in operator mode enforces schema version and generated timestamp',async()=>{
 const original={data:{operator:{id:1},server:{timezone:'America/Sao_Paulo'},token:{abilities:['extension:bootstrap']}},schema_version:'1.0',generated_at:'2026-10-25T03:30:00-03:00'};
 let mock=original;
 const fetchFn=async()=>new Response(JSON.stringify(mock),{headers:{'Content-Type':'application/json'}});
 const c=crmClient({baseUrl:'https://crm.example',token:'TEST_SANCTUM_KEY',privateEnabled:true,strictEnvelope:true,fetchFn});
 assert.equal((await c.bootstrap()).operator.id,1);
 mock={...original};delete mock.generated_at;
 await assert.rejects(()=>c.bootstrap(),/crm_extension_envelope_invalid/);
 mock={...original,schema_version:'2.0'};
 await assert.rejects(()=>c.bootstrap(),/crm_extension_envelope_invalid/);
});
