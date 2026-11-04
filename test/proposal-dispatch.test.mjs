import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createProposalIntentJournal} from '../src/proposal-intent-journal.mjs';
import {createProposalDispatcher} from '../src/proposal-dispatch.mjs';

const actor={operatorId:7,origin:'https://crm.example.test'};
const dispatchId='11111111-2222-4333-8444-555555555555';
const phone='48999990001';
const ok=d=>({ok:true,status:200,json:{data:d,schema_version:'1.0'}});
const payload={phone,name:'Synthetic',confirmedByOperator:true};
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'evy-proposal-dispatch-'));await chmod(directory,0o700);
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const options={directory,key:randomBytes(32)};
 const state={scope:'full_cadence',post:[],preview:0,reads:0,answer:null,absent:false};
 const journal=createProposalIntentJournal(options);
 const dependencies={journal,actor,
  preview:async()=>{state.preview++;return ok({ready:true,delivery_scope:state.scope,selection:{variant:'with_name',campaign_id:415},message_preview:'Olá, Synthetic.'})},
  schedule:async(body,headers)=>{
   assert.equal((await journal.byRequest({actor,requestId:body.request_id})).request_id,body.request_id,'durable before POST');
   state.post.push({body,headers});if(state.answer)return state.answer(body);
   return ok({status:'scheduled',delivery_scope:state.scope,dispatch_uuid:dispatchId,scheduled_at:null});
  },
  outcome:async id=>{state.reads++;return ok({proposal_request_id:id,resolution:state.absent?'inconclusive':'confirmed',
   status:'scheduled',delivery_scope:state.scope,dispatch_uuid:dispatchId,scheduled_at:null})}
 };
 return {state,journal,options,dependencies,dispatcher:createProposalDispatcher(dependencies)};
}

test('one healthy explicit request does preview plus one POST and reports complete scheduling',async t=>{
 const {state,dispatcher}=await fixture(t);const result=await dispatcher.send(payload);
 assert.equal(result.resolution,'confirmed');assert.equal(result.delivery_scope,'full_cadence');
 assert.match(result.message,/não a entrega/);assert.equal(state.preview,1);assert.equal(state.post.length,1);
 assert.equal(state.post[0].body.allow_initial_only,false);
 assert.equal(state.post[0].body.request_id,state.post[0].headers['X-Idempotency-Key']);
 await dispatcher.send(payload);assert.equal(state.post.length,1);assert.equal(state.reads,1);
});

test('limited request requires explicit scope authorization and recovery never silently upgrades',async t=>{
 const {state,dispatcher}=await fixture(t);state.scope='initial_whatsapp_only';
 const blocked=await dispatcher.send(payload);assert.equal(blocked.error_code,'PROPOSAL_INITIAL_ONLY_CONFIRMATION_REQUIRED');assert.equal(state.post.length,0);
 const sent=await dispatcher.send({...payload,allowInitialOnly:true});
 assert.equal(sent.delivery_scope,'initial_whatsapp_only');assert.match(sent.message,/sem acompanhamentos/);
 assert.equal(state.post[0].body.allow_initial_only,true);
 const f=await fixture(t);const changed=await f.dispatcher.send({...payload,allowInitialOnly:true});
 assert.equal(changed.error_code,'PROPOSAL_DELIVERY_SCOPE_CHANGED');assert.equal(f.state.post.length,0);
});

test('two authoritative 409 codes settle refusal without any automatic POST retry',async t=>{
 for(const code of ['PROPOSAL_INITIAL_ONLY_CONFIRMATION_REQUIRED','PROPOSAL_DELIVERY_SCOPE_CHANGED']){
  const {state,dispatcher,journal}=await fixture(t);
  state.answer=async()=>({ok:false,status:409,json:{error:{code}}});
  const result=await dispatcher.send(payload);
  assert.equal(result.resolution,'rejected');assert.equal(result.error_code,code);assert.equal(state.post.length,1);
  assert.equal((await journal.byRequest({actor,requestId:result.request_id})).outcome.resolution,'rejected');
  await dispatcher.consult(result.request_id);assert.equal(state.post.length,1);
 }
});

test('HTTP response loss after commit reconciles same UUID across restart with no duplicate POST',async t=>{
 const {state,dispatcher,dependencies,options}=await fixture(t);
 state.answer=()=>{throw Error('synthetic response lost after commit')};
 const pending=await dispatcher.send(payload);assert.equal(pending.resolution,'inconclusive');assert.ok(pending.request_id);
 const restarted=createProposalDispatcher({...dependencies,journal:createProposalIntentJournal(options)});
 const result=await restarted.send({...payload,name:'Changed synthetic name',allowInitialOnly:true});
 assert.equal(result.resolution,'confirmed');assert.equal(result.request_id,pending.request_id);assert.equal(state.post.length,1);
});

test('absent, pending, malformed and mismatched-scope outcomes keep the reference blocked',async t=>{
 const {state,dispatcher,dependencies}=await fixture(t);
 state.answer=()=>{throw Error('synthetic network failure')};state.absent=true;
 const first=await dispatcher.send(payload);
 for(let i=0;i<3;i++){
  const next=await dispatcher.send(payload);assert.equal(next.resolution,'inconclusive');assert.equal(next.request_id,first.request_id);
 }
 for(const d of [{resolution:'confirmed'}, {proposal_request_id:first.request_id,resolution:'confirmed',status:'scheduled',dispatch_uuid:dispatchId,delivery_scope:'initial_whatsapp_only'}]){
  const broken=createProposalDispatcher({...dependencies,outcome:async()=>ok(d)});
  assert.equal((await broken.consult(first.request_id)).resolution,'inconclusive');
 }
 assert.equal(state.post.length,1);
});

test('concurrent tool calls have one durable winner and one scheduling POST',async t=>{
 const {state,dispatcher}=await fixture(t);
 await Promise.all(Array.from({length:12},()=>dispatcher.send(payload)));
 assert.equal(state.post.length,1);
});

test('no confirmation, unknown scope, unavailable journal and resend modes never schedule',async t=>{
 const {state,dispatcher,dependencies}=await fixture(t);
 await dispatcher.send({...payload,confirmedByOperator:false});
 await dispatcher.send({...payload,resendMode:'send_again'});
 await dispatcher.send({...payload,resendMode:'abort_and_resend'});
 state.scope='unknown';await dispatcher.send(payload);
 const missing=createProposalDispatcher({...dependencies,journal:createProposalIntentJournal()});
 assert.equal((await missing.send(payload)).status,'unavailable');assert.equal(state.post.length,0);
});

test('actual synthetic Laravel #459 envelopes are accepted without inferring delivery from scheduling',async t=>{
 // Extracted from the PHPUnit HTTP fixture proposal-laravel-459.json,
 // APP_ENV=testing / crm_agent_459_6c4f / fake providers / transaction rollback.
 const {state,journal,dependencies}=await fixture(t);
 const response={schema_version:'1.0',generated_at:'2026-10-29T23:28:35-03:00',data:{
  status:'scheduled',delivery_scope:'full_cadence',replay:true,
  dispatch_uuid:'52dd0d6b-5e8d-46c2-bcc2-dd8d97bdfb4d',phone_masked:'(48) 9****-4567',
  variant:'with_name',variant_label:'Personalizada',scheduled_at:'2026-10-30T02:28:35.000000Z',resend_mode:'normal'}};
 const dispatcher=createProposalDispatcher({...dependencies,
  preview:async()=>({ok:true,status:200,json:{schema_version:'1.0',data:{ready:true,delivery_scope:'full_cadence',
   phone_status:'valid_current',selection:{variant:'with_name',label:'Personalizada',name_source:'input',campaign_id:618},
   summary:null,message_preview:'Ola, Ana. Sua proposta esta pronta.'}}}),
  schedule:async body=>{state.post.push(body);return {ok:true,status:200,json:response}},
  outcome:async id=>({ok:true,status:200,json:{schema_version:'1.0',data:{proposal_request_id:id,
   resolution:'confirmed',reason:null,delivery_scope:'full_cadence',status:'scheduled',dispatch_status:'scheduled',
   dispatch_uuid:response.data.dispatch_uuid,scheduled_at:response.data.scheduled_at,
   activity_url:'https://crm.example.test/gestao/campanhas/atividades/92/detalhes'}}})});
 const result=await dispatcher.send(payload);
 assert.equal(result.resolution,'confirmed');assert.equal(result.replay,true);
 assert.equal(result.dispatch_uuid,response.data.dispatch_uuid);
 assert.match(result.message,/não a entrega/);
 assert.equal((await journal.byRequest({actor,requestId:result.request_id})).outcome.delivery_scope,'full_cadence');
 assert.equal((await dispatcher.consult(result.request_id)).resolution,'confirmed');assert.equal(state.post.length,1);
});
