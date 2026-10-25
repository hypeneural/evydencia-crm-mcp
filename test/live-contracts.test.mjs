import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRealContract} from '../src/live-contracts.mjs';
const fixture=async f=>JSON.parse(await readFile(new URL('../fixtures/'+f+'.json',import.meta.url),'utf8'));
test('contrato cliente/contexto e Cliente360 com metadados envelope reais',async()=>{
 for(const [type,file] of [['customer-context','customer-context'],['customer-360','customer-360']]){
  const f=await fixture(file);f.generated_at='2026-10-25T03:00:00-03:00';
  const result=validateRealContract(type,f);
  assert.equal(result.valid,true);assert.equal(result.has_customer,true);
  assert.ok(!JSON.stringify(result).includes('whatsapp'));
 }
});
test('contrato de preview exige sinalizacao ready e nao dispara',async()=>{
 const f=await fixture('proposal-preview');f.generated_at='2026-10-25T03:00:00-03:00';
 const result=validateRealContract('proposal-preview',f);
 assert.equal(result.valid,true);assert.equal(result.ready,true);
 assert.ok(!JSON.stringify(result).includes('phone'));
});
test('bootstrap ficticio testa envelope, scopes e operador',()=>{
 const f={schema_version:'1.0',generated_at:'2026-10-25T03:00:00-03:00',
  data:{operator:{id:1},server:{timezone:'America/Sao_Paulo'},token:{abilities:['extension:customer-read']}}};
 assert.equal(validateRealContract('bootstrap',f).valid,true);
 delete f.data.token.abilities;
 assert.throws(()=>validateRealContract('bootstrap',f),/live_contract_bootstrap/);
});
test('nega envelope ausente, mismatch e modo desconhecido',async()=>{
 const f=await fixture('customer-360');
 assert.throws(()=>validateRealContract('customer-360',f),/live_contract_envelope/);
 f.generated_at='2026-10-25T03:00:00-03:00';f.data.lookup.status='fake';
 assert.throws(()=>validateRealContract('customer-360',f),/live_contract_lookup/);
 assert.throws(()=>validateRealContract('orders-search',f),/live_contract_unknown_type/);
});
test('diagnostico LIVE usa codigo separado de servidor MCP anonimo',async()=>{
 const server=await readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
 assert.ok(!server.includes('verify-live-read.mjs'));
 assert.match(server,/crm_private_requires_authenticated_gateway/);
});
