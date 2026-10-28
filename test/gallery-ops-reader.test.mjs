import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGalleryOpsReader } from '../src/gallery-ops-reader.mjs';
const secret = 'test-only-long-auth-secret-for-gallery-ops';
const example = {schema_version:1,source:'crm_canonical_valid_natal_orders',year:2026,as_of:'2026-10-28T10:00:00-03:00',total_valid:1,items:[{order_id:991,order_uuid:'11111111-1111-4111-8111-111111111111',customer_name:'FAMÍLIA SINTÉTICA',package_name:'Exemplo',status_key:'session_schedule',session_at:null,created_at:null}],next_cursor:null,has_more:false};
async function server(fn, testFn) {
  const app = createGalleryOpsReader({secret, queryOrders:fn});
  await new Promise(resolve => app.listen(0,'127.0.0.1',resolve));
  try { await testFn('http://127.0.0.1:'+app.address().port+'/internal/v1/gallery-ops/valid-orders'); }
  finally { await new Promise(resolve => app.close(resolve)); }
}
test('denies missing/wrong service token and wrong method',async () => {
 await server(async()=>example,async url=>{
  assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(url,{method:'POST',headers:{authorization:'Bearer wrong','content-type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(url)).status,405);
  assert.equal((await fetch(url.replace('valid-orders','unknown'))).status,404);
 });
});
test('accepts one scoped canonical page, blocks unapproved fields and hides internal errors', async () => {
 let captured=null;
 await server(async input=>{captured=input;return example},async url=>{
  const base={method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'}};
  assert.equal((await fetch(url,{...base,body:'{"limit":100,"after_id":0}'})).status,200);
  assert.deepEqual(captured,{limit:100,after_id:0});
  assert.equal((await fetch(url,{...base,body:'{"include_full_pii":true}'})).status,422);
  assert.equal((await fetch(url,{...base,body:'{"limit":500}'})).status,422);
  assert.equal((await fetch(url,{...base,body:'{"as_of":"tomorrow"}'})).status,422);
 });
 await server(async()=>{throw Error('sensitive customer value')},async url=>{
  const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:'{}'});
  assert.equal(r.status,503);assert.ok(!(await r.text()).includes('sensitive'));
 });
});
test('cannot start without an independent 32-character secret',()=>{
  assert.throws(()=>createGalleryOpsReader({secret:'weak'}),/SECRET_REQUIRED/);
});
