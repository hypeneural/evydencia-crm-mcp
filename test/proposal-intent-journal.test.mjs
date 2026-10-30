import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readdir,readFile,writeFile,rm,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {createProposalIntentJournal} from '../src/proposal-intent-journal.mjs';

const actor={operatorId:7,origin:'https://crm.example.test'};
const phone='48999990001';
const requestId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const dispatchId='11111111-2222-4333-8444-555555555555';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'evy-proposal-journal-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await chmod(root,0o700);
 const key=randomBytes(32);
 const options={directory:root,key};
 const journal=createProposalIntentJournal(options);
 const args={actor,phone,fingerprint:journal.fingerprint(actor,{phone,name:'Synthetic Only'}),
  deliveryScope:'full_cadence',requestId};
 return {root,key,options,journal,args};
}

test('intent and index are durable before return, private and free of raw customer context',async t=>{
 const {root,journal,args,options}=await fixture(t);
 const first=await journal.begin(args);
 assert.equal(first.created,true);
 const restarted=createProposalIntentJournal(options);
 assert.equal((await restarted.byRequest({actor,requestId})).request_id,requestId);
 const repeated=await restarted.begin({...args,requestId:undefined});
 assert.equal(repeated.created,false);assert.equal(repeated.intent.request_id,requestId);
 const paths=async folder=>(await Promise.all((await readdir(folder,{withFileTypes:true})).map(async entry=>
  entry.isDirectory()?paths(join(folder,entry.name)):[join(folder,entry.name)]))).flat();
 for(const path of await paths(root)){
  const text=await readFile(path,'utf8');
  for(const sensitive of [phone,'Synthetic Only','https://crm.example.test','Bearer'])assert.ok(!text.includes(sensitive));
 }
});

test('confirmed and unresolved references never expire into a fresh POST intention',async t=>{
 const {journal,args,options}=await fixture(t);
 const first=await journal.begin(args);
 await journal.settle(first.intent,{resolution:'confirmed',dispatch_uuid:dispatchId,delivery_scope:'full_cadence',scheduled_at:null});
 const future=createProposalIntentJournal({...options,now:()=>Date.now()+365*86400_000});
 const repeated=await future.begin({...args,fingerprint:'a'.repeat(64)});
 assert.equal(repeated.created,false);assert.equal(repeated.intent.request_id,requestId);
 await assert.rejects(()=>journal.settle(first.intent,{resolution:'rejected',error_code:'SOMETHING_CHANGED'}),/outcome_conflict/);
});

test('authenticated definitive refusal permits a new generation but preserves the old UUID receipt',async t=>{
 const {journal,args}=await fixture(t);
 const first=await journal.begin(args);
 await journal.settle(first.intent,{resolution:'rejected',error_code:'PROPOSAL_DELIVERY_SCOPE_CHANGED'});
 const next=await journal.begin({...args,requestId:undefined});
 assert.equal(next.created,true);assert.notEqual(next.intent.request_id,requestId);
 assert.equal((await journal.byRequest({actor,requestId})).outcome.resolution,'rejected');
});

test('UUID reuse with another context is refused and never points to another operator',async t=>{
 const {journal,args}=await fixture(t);
 await journal.begin(args);
 await assert.rejects(()=>journal.begin({...args,phone:'48999990002'}),/request_context_changed/);
 assert.equal(await journal.byRequest({actor:{...actor,operatorId:9},requestId}),null);
 const different=await journal.begin({...args,actor:{...actor,operatorId:9}});
 assert.equal(different.created,true);
 assert.equal((await journal.byRequest({actor,requestId})).context,(await journal.latest({actor,phone})).context);
});

test('real worker concurrency publishes one context intention, never two schedule winners',async t=>{
 const {root,key}=await fixture(t);
 const moduleUrl=new URL('../src/proposal-intent-journal.mjs',import.meta.url).href;
 const gate=new SharedArrayBuffer(4),state=new Int32Array(gate);
 const source=`const {parentPort,workerData}=require('node:worker_threads');
 (async()=>{const {createProposalIntentJournal}=await import(workerData.moduleUrl);
 const j=createProposalIntentJournal({directory:workerData.root,key:Buffer.from(workerData.key,'hex')});
 const gate=new Int32Array(workerData.gate);parentPort.postMessage({ready:true});Atomics.wait(gate,0,0);
 const value=await j.begin({actor:${JSON.stringify(actor)},phone:'${phone}',fingerprint:'a'.repeat(64),deliveryScope:'full_cadence'});
 parentPort.postMessage({created:value.created,requestId:value.intent.request_id});})().catch(e=>{throw e});`;
 const workers=Array.from({length:4},()=>new Worker(source,{eval:true,workerData:{moduleUrl,root,key:key.toString('hex'),gate}}));
 let ready=0;
 const results=await Promise.all(workers.map(worker=>new Promise((resolve,reject)=>{
  worker.on('error',reject);worker.on('message',m=>{
   if(m.ready){if(++ready===workers.length){Atomics.store(state,0,1);Atomics.notify(state,0)}}
   else resolve(m);
  });
 })));
 assert.equal(results.filter(x=>x.created).length,1);
 assert.equal(new Set(results.map(x=>x.requestId)).size,1);
});

test('malformed journal fails closed without replacing its bytes',async t=>{
 const {root,journal,args}=await fixture(t);
 const {intent}=await journal.begin(args);
 const path=join(root,'contexts',intent.context,'0000000001.intent.json');
 const bad='{malformed';await writeFile(path,bad);
 await assert.rejects(()=>journal.latest({actor,phone}));
 assert.equal(await readFile(path,'utf8'),bad);
});

test('journal root is explicit, private, preprovisioned and cannot be a symlink',async t=>{
 assert.equal(createProposalIntentJournal().available,false);
 const {root,key}=await fixture(t);
 const missing=createProposalIntentJournal({directory:join(root,'missing'),key});
 await assert.rejects(()=>missing.latest({actor,phone}));
 assert.deepEqual(await readdir(root),[]);
 if(process.platform!=='win32'){
  await chmod(root,0o755);
  await assert.rejects(()=>createProposalIntentJournal({directory:root,key}).latest({actor,phone}),/unsafe_path/);
  await chmod(root,0o700);
 }
 const target=join(root,'target');await mkdir(target,{mode:0o700});
 const pointer=join(root,'pointer');await symlink(target,pointer,process.platform==='win32'?'junction':'dir');
 await assert.rejects(()=>createProposalIntentJournal({directory:pointer,key}).latest({actor,phone}),/unsafe_path/);
});
