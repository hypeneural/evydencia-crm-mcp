import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateCanonicalLabel,renderCanonicalCrmLabel} from '../src/crm-label-render.mjs';
import {createBridgeSingleFlightCache} from '../src/legacy-api-read.mjs';
const orderUuid='11111111-aaaa-4111-8111-000000000101';
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(74,1)]);
const row=()=>({order_uuid:orderUuid,order_id:5001,width_mm:100,height_mm:40,width_px:1181,height_px:472,
 png_base64:png.toString('base64'),png_sha256:createHash('sha256').update(png).digest('hex')});
test('canonical bridge validates exact order, PNG signature, sha256 and page dimensions',()=>{
 const a=validateCanonicalLabel(row(),{orderUuid,orderId:5001});
 assert.equal(a.label_source,'crm_canonical');
 assert.equal(a.label_png_base64,row().png_base64);
 assert.equal(a.label_png_sha256,row().png_sha256);
});
test('canonical label fails closed on order mismatch, altered hash, wrong physical page or malformed PNG',()=>{
 assert.throws(()=>validateCanonicalLabel(row(),{orderUuid,orderId:5002}),/crm_label_invalid_render_contract/);
 assert.throws(()=>validateCanonicalLabel({...row(),png_sha256:'0'.repeat(64)},{orderUuid,orderId:5001}),/crm_label_invalid_png/);
 assert.throws(()=>validateCanonicalLabel({...row(),width_mm:150},{orderUuid,orderId:5001}),/crm_label_invalid_render_contract/);
 assert.throws(()=>validateCanonicalLabel({...row(),png_base64:'A'.repeat(7000000)},{orderUuid,orderId:5001}),/crm_label_invalid_render_contract/);
});
test('render bridge refuses missing feature before invoking PHP or CRM',async()=>{
 await assert.rejects(renderCanonicalCrmLabel({orderUuid,orderId:5001,env:{EVYD_CRM_LABEL_RENDER_ENABLED:'0'}}),/crm_label_disabled/);
});

test('fresh print-bound reads bypass 15-second forensic cache without invalidating read-only previews',async()=>{
 const cache=createBridgeSingleFlightCache({ttlMs:15000,now:()=>2000});
 let calls=0;
 const run=()=>Promise.resolve({sequence:++calls});
 const cached=await cache.execute('same-order',run);
 assert.equal(cached.sequence,1);
 const ordinary=await cache.execute('same-order',run);
 assert.equal(ordinary.sequence,1);
 const fresh=await cache.execute('same-order',run,{effectiveTtlMs:0});
 assert.equal(fresh.sequence,2);
 // Read-only preview can continue using the old TTL, but print pre-flight opts out.
 assert.equal((await cache.execute('same-order',run)).sequence,1);
 assert.equal(calls,2);
});
