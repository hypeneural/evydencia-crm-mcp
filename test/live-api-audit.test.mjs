import test from 'node:test';
import assert from 'node:assert/strict';
import {auditExtension,auditLegacy,shapeOnly,legacyOrderProjection,legacyReadClient} from '../src/live-api-audit.mjs';
const response=x=>({ok:true,redirected:false,headers:new Headers({'content-type':'application/json'}),text:async()=>JSON.stringify(x)});
test('schema output only types and field names',()=>{
 const x=JSON.stringify(shapeOnly({name:'Private Name',phone:'48999990001',orders:[{person:'Private Child'}]}));
 for(const v of ['Private Name','48999990001','Private Child'])assert.ok(!x.includes(v));
 assert.ok(x.includes('name'));
});
test('bootstrap checks Sanctum scopes without leaking operator data',async()=>{
 const result=await auditExtension({baseUrl:'https://crm.example',token:'TEST_ONLY',action:'bootstrap',
 fetchFn:async(url,opts)=>{
  assert.equal(opts.method,'GET');assert.equal(opts.headers.Authorization,'Bearer TEST_ONLY');
  return response({data:{operator:{id:3,name:'Private Operator'},server:{timezone:'America/Sao_Paulo'},token:{abilities:['extension:bootstrap','extension:proposal-write']}}});
 }});
 assert.equal(result.broad_write_abilities,true);
 assert.equal(result.verified_contract,true);
 assert.ok(!JSON.stringify(result).includes('Private Operator'));
});
test('no customer or preview network calls without operator consent',async()=>{
 let calls=0;const opts={baseUrl:'https://crm.example',token:'TEST',phoneValue:'48999990001',fetchFn:async()=>{calls++;return response({data:{}})}};
 await assert.rejects(()=>auditExtension({...opts,action:'history'}),/customer_probe_consent_required/);
 await assert.rejects(()=>auditExtension({...opts,action:'preview',consent:true}),/preview_probe_consent_required/);
 assert.equal(calls,0);
});
test('legacy GET needs acknowledgement, maps status 10 and reduces PII',async()=>{
 const id='11111111-aaaa-4111-8111-000000000101';
 const sample={uuid:id,id:5001,status:{id:10,name:'Aguardando Retirar'},
  customer:{uuid:id,name:'Private Name',whatsapp:'48999990001'},participants:[{name:'Private Child'}],
  summary:{total:450,received:200,remaining:250},items:[]};
 assert.equal(legacyOrderProjection(sample).status_key,'waiting_product_retrieve');
 assert.equal(legacyOrderProjection(sample).finance.balance_cents,25000);
 assert.throws(()=>legacyReadClient({baseUrl:'https://crm.example',token:'LONG_TOKEN_EXAMPLE'}),/explicit_optin/);
 const output=await auditLegacy({baseUrl:'https://crm.example',token:'LONG_TOKEN_EXAMPLE',action:'orders',allowPrivilegedGet:true,
  fetchFn:async(url,opts)=>{assert.equal(opts.method,'GET');assert.equal(url.searchParams.get('product[slug]'),'natal');return response([sample])}});
 assert.equal(output.shared_key_has_write_capabilities,true);
 for(const v of ['Private Name','Private Child','48999990001'])assert.ok(!JSON.stringify(output).includes(v));
});
test('legacy forbids write-like action, invalid uuid and insecure URLs',async()=>{
 const client=legacyReadClient({baseUrl:'https://crm.example',token:'LONG_TOKEN_EXAMPLE',allowPrivilegedGet:true});
 await assert.rejects(()=>client.get('status'),/endpoint_forbidden/);
 await assert.rejects(()=>client.get('detail',{uuid:'../etc'}),/invalid_uuid/);
 assert.throws(()=>legacyReadClient({baseUrl:'http://crm.example',token:'LONG_TOKEN_EXAMPLE',allowPrivilegedGet:true}),/crm_https_required/);
});

test('schema never exposes dynamic object keys that may contain a customer name',()=>{
 const model=shapeOnly({data:{'CLIENTE_SENSIVEL_123':{amount:1},name:'PRIVATE_REAL_NAME',phone:'48999990001'}});
 const result=JSON.stringify(model);
 assert.ok(!result.includes('CLIENTE_SENSIVEL_123'));
 assert.ok(!result.includes('PRIVATE_REAL_NAME'));
 assert.ok(!result.includes('48999990001'));
 assert.equal(model.fields.data.redacted_dynamic_keys,1);
});

test('calendário público não consulta data inventada',async()=>{
 let called=0;
 await assert.rejects(()=>auditExtension({baseUrl:'https://crm.example',token:'TEST',action:'availability',
  fetchFn:async()=>{called++;return response({data:{}})}}),/date_required/);
 assert.equal(called,0);
});
