import test from 'node:test';
import assert from 'node:assert/strict';
import {readyForPickupClient} from '../src/malotes-ready-client.mjs';
const request={order_id:6002,expected_status_event_id:41,operator_id:'2',request_id:'e70b1b8c-7f62-4422-a833-6068fb244f4b',confirmed_by_operator:true};
test('dedicated CRM status route is invoked once and never marks WhatsApp as delivered',async()=>{
 let count=0;
 const call=readyForPickupClient({baseUrl:'https://test.example',operatorToken:'synthetic-example-token-123456789',fetchFn:async(url,options)=>{
  count++;
  assert.equal(url,'https://test.example/api/v1/extension/orders/6002/ready-for-pickup');
  assert.equal(JSON.parse(options.body).expected_status_event_id,41);
  return new Response(JSON.stringify({success:true,order_id:6002,state:'ready',status_key:'waiting_product_retrieve',status_event_id:42,changes_applied:true,replay:false}),{status:200});
 }});
 const result=await call(request);assert.equal(count,1);assert.equal(result.changes_applied,true);assert.equal(result.notification_delivery_verified,false);
});
test('conflict requires requery and cannot retry status POST',async()=>{
 let count=0;
 const call=readyForPickupClient({baseUrl:'https://test.example',operatorToken:'synthetic-example-token-123456789',fetchFn:async()=>{count++;return new Response('{}',{status:409})}});
 await assert.rejects(call(request),/crm_malotes_conflict_refresh_required/);assert.equal(count,1);
});
test('unconfirmed request does not touch the CRM',async()=>{
 let count=0;
 const call=readyForPickupClient({baseUrl:'https://test.example',operatorToken:'synthetic-example-token-123456789',fetchFn:async()=>{count++;return new Response('{}',{status:200})}});
 await assert.rejects(call({...request,confirmed_by_operator:false}),/crm_malotes_invalid_input/);assert.equal(count,0);
});
