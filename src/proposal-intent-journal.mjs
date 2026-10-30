// Durable proposal references only. No names, phones, content or bearer tokens on disk.
import {createHmac,hkdfSync,randomUUID} from 'node:crypto';
import {mkdir,lstat,realpath,readdir,open,link,unlink} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const SCOPES=new Set(['full_cadence','initial_whatsapp_only']);
const fail=code=>{throw Error(code)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)
 &&same(Object.keys(value).sort(),[...expected].sort());

export function createProposalIntentJournal({directory,key,now=()=>Date.now()}={}){
 const available=typeof directory==='string'&&isAbsolute(directory)&&Buffer.isBuffer(key)&&key.length>=32;
 const root=available?resolve(directory):null;
 const secret=available?Buffer.from(hkdfSync('sha256',key,Buffer.from('evydencia-proposal-intents'),Buffer.from('v1'),32)):null;
 const mac=value=>createHmac('sha256',secret).update(JSON.stringify(value)).digest('hex');
 const number=n=>String(n).padStart(10,'0');
 const actorHash=({operatorId,origin})=>{
  if(!available)fail('proposal_journal_unavailable');
  if(!/^[1-9][0-9]{0,19}$/.test(String(operatorId))||typeof origin!=='string')fail('proposal_journal_invalid_context');
  return mac(['actor',origin,String(operatorId),'natal-2026']);
 };
 const contextHash=(actor,phone)=>{
  if(typeof phone!=='string'||!/^\d{10,15}$/.test(phone))fail('proposal_journal_invalid_context');
  return mac(['recipient',actorHash(actor),phone]);
 };
 async function directoryAt(path,create=false){
  if(create)await mkdir(path,{recursive:true,mode:0o700});
  const stat=await lstat(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||resolve(await realpath(path))!==resolve(path)
    ||(process.platform!=='win32'&&(stat.mode&0o077)!==0))fail('proposal_journal_unsafe_path');
 }
 async function ready(){
  if(!available)fail('proposal_journal_unavailable');
  await directoryAt(root); // Provisioned privately before enabling writes; never follow/create an arbitrary root.
 }
 async function read(path){
  let stat;
  try{stat=await lstat(path)}catch(error){if(error.code==='ENOENT')return null;throw error}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192
    ||(process.platform!=='win32'&&(stat.mode&0o077)!==0))fail('proposal_journal_invalid_record');
  const file=await open(path,'r');
  try{
   const current=await file.stat();
   if(current.ino!==stat.ino||current.dev!==stat.dev)fail('proposal_journal_invalid_record');
   return JSON.parse(await file.readFile('utf8'));
  }finally{await file.close()}
 }
 async function create(path,value){
  const bytes=JSON.stringify(value)+'\n';
  if(Buffer.byteLength(bytes)>8192)fail('proposal_journal_invalid_record');
  const temporary=path+'.tmp-'+randomUUID();
  let file;
  try{
   file=await open(temporary,'wx',0o600);
   await file.writeFile(bytes);await file.sync();await file.close();file=null;
   try{await link(temporary,path)}catch(error){if(error.code==='EEXIST')return false;throw error}
   if(process.platform!=='win32'){
    const parent=await open(resolve(path,'..'),'r');
    try{await parent.sync()}finally{await parent.close()}
   }
   return true;
  }finally{
   if(file)await file.close();
   await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error});
  }
 }
 function validateIntent(value,actor,context,generation){
  if(!keys(value,['version','actor','context','generation','request_id','fingerprint','delivery_scope','created_at'])
   ||value.version!==1||value.actor!==actor||value.context!==context||value.generation!==generation
   ||!UUID.test(value.request_id)||!HASH.test(value.fingerprint)||!SCOPES.has(value.delivery_scope)
   ||typeof value.created_at!=='string'||!Number.isFinite(Date.parse(value.created_at)))fail('proposal_journal_invalid_record');
  return value;
 }
 function validateOutcome(value){
  if(value===null)return null;
  if(value.resolution==='confirmed'&&keys(value,['resolution','dispatch_uuid','delivery_scope','scheduled_at'])
   &&UUID.test(value.dispatch_uuid)&&SCOPES.has(value.delivery_scope)
   &&(value.scheduled_at===null||Number.isFinite(Date.parse(value.scheduled_at))))return value;
  if(value.resolution==='rejected'&&keys(value,['resolution','error_code'])
   &&typeof value.error_code==='string'&&/^[A-Z][A-Z0-9_]{0,99}$/.test(value.error_code))return value;
  fail('proposal_journal_invalid_record');
 }
 async function contextDirectory(hash,createMissing=false){
  if(!HASH.test(hash))fail('proposal_journal_invalid_context');
  await ready();
  const parent=join(root,'contexts');
  await directoryAt(parent,true);
  const path=join(parent,hash);
  try{await directoryAt(path,createMissing)}catch(error){if(!createMissing&&error.code==='ENOENT')return null;throw error}
  return path;
 }
 async function load(actor,context,generation){
  const path=await contextDirectory(context);
  if(!path)return null;
  const value=await read(join(path,number(generation)+'.intent.json'));
  if(!value)return null;
  const intent=validateIntent(value,actor,context,generation);
  return {...intent,outcome:validateOutcome(await read(join(path,number(generation)+'.result.json')))};
 }
 async function latest({actor,phone}){
  const actorId=actorHash(actor),context=contextHash(actor,phone),path=await contextDirectory(context);
  if(!path)return null;
  const entries=(await readdir(path)).filter(name=>/^\d{10}\.intent\.json$/.test(name)).sort();
  if(entries.length>1000)fail('proposal_journal_limit');
  if(!entries.length)return null;
  return load(actorId,context,Number(entries.at(-1).slice(0,10)));
 }
 async function byRequest({actor,requestId}){
  if(typeof requestId!=='string'||!UUID.test(requestId))fail('proposal_journal_invalid_request');
  const actorId=actorHash(actor);
  await ready();
  const parent=join(root,'requests');await directoryAt(parent,true);
  const path=join(parent,actorId);
  try{await directoryAt(path)}catch(error){if(error.code==='ENOENT')return null;throw error}
  const index=await read(join(path,requestId.toLowerCase()+'.json'));
  if(index===null)return null;
  if(!keys(index,['version','actor','context','generation','request_id'])||index.version!==1
   ||index.actor!==actorId||!HASH.test(index.context)||!Number.isSafeInteger(index.generation)||index.generation<1
   ||index.request_id!==requestId.toLowerCase())fail('proposal_journal_invalid_record');
  const intent=await load(actorId,index.context,index.generation);
  if(!intent||intent.request_id!==index.request_id)fail('proposal_journal_invalid_record');
  return intent;
 }
 async function settle(intent,outcome){
  const sanitized=validateOutcome(outcome);
  if(!sanitized)fail('proposal_journal_invalid_record');
  const stored=await load(intent.actor,intent.context,intent.generation);
  if(!stored||stored.request_id!==intent.request_id||stored.fingerprint!==intent.fingerprint
    ||stored.delivery_scope!==intent.delivery_scope)fail('proposal_journal_invalid_record');
  if(sanitized.resolution==='confirmed'&&sanitized.delivery_scope!==stored.delivery_scope)fail('proposal_journal_outcome_conflict');
  if(stored.outcome){if(!same(stored.outcome,sanitized))fail('proposal_journal_outcome_conflict');return stored.outcome}
  const path=await contextDirectory(intent.context);
  if(!await create(join(path,number(intent.generation)+'.result.json'),sanitized)){
   const winner=validateOutcome(await read(join(path,number(intent.generation)+'.result.json')));
   if(!same(winner,sanitized))fail('proposal_journal_outcome_conflict');
  }
  return sanitized;
 }
 async function begin({actor,phone,fingerprint,deliveryScope,requestId}){
  if(!HASH.test(fingerprint)||!SCOPES.has(deliveryScope)||(requestId!==undefined&&!UUID.test(requestId)))fail('proposal_journal_invalid_context');
  const previous=await latest({actor,phone});
  if(previous&&previous.outcome?.resolution!=='rejected')return {created:false,intent:previous};
  const generation=(previous?.generation??0)+1;
  if(generation>1000)fail('proposal_journal_limit');
  const actorId=actorHash(actor),context=contextHash(actor,phone),path=await contextDirectory(context,true);
  const intent={version:1,actor:actorId,context,generation,request_id:(requestId??randomUUID()).toLowerCase(),
   fingerprint,delivery_scope:deliveryScope,created_at:new Date(now()).toISOString()};
  if(!await create(join(path,number(generation)+'.intent.json'),intent))return {created:false,intent:await latest({actor,phone})};
  const parent=join(root,'requests');await directoryAt(parent,true);
  const actorPath=join(parent,actorId);await directoryAt(actorPath,true);
  const index={version:1,actor:actorId,context,generation,request_id:intent.request_id};
  const indexPath=join(actorPath,intent.request_id+'.json');
  if(!await create(indexPath,index)&&!same(await read(indexPath),index)){
   await settle(intent,{resolution:'rejected',error_code:'PROPOSAL_REQUEST_CONTEXT_CHANGED'});
   fail('proposal_request_context_changed');
  }
  return {created:true,intent:{...intent,outcome:null}};
 }
 return {available,latest,byRequest,begin,settle,
  fingerprint:(actor,value)=>mac(['intent',actorHash(actor),value])};
}
