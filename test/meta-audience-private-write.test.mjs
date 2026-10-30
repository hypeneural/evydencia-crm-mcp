import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {persistMetaAudienceCsv} from '../src/meta-audience-private-write.mjs';

const CSV='email,phone,fn,ln,country\r\nexample@example.invalid,5548999999999,teste,pessoa,br\r\n';

test('P25.9 private write creates complete 0600 file and refuses overwrite',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evyd-meta-write-'));
 const path=join(dir,'meta-audience-natal2026-synthetic.csv');
 try{
  await persistMetaAudienceCsv(path,CSV);
  assert.equal(await readFile(path,'utf8'),CSV);
  if(process.platform!=='win32')assert.equal((await stat(path)).mode&0o077,0);
  await assert.rejects(()=>persistMetaAudienceCsv(path,'email,phone,fn,ln,country\r\nother@x.com,5548999999998,x,x,br\r\n'),
    /crm_meta_audience_private_write_failed/);
  assert.equal(await readFile(path,'utf8'),CSV,'exclusive-open failure cannot delete/overwrite an existing file');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('P25.9 partial write failure closes descriptor, deletes partial file and redacts sensitive errors',async()=>{
 let removed=0,closed=0;
 const privatePath='/synthetic/private/secret-customer-list.csv';
 const fsMock={
  openFile:async(path,flags,mode)=>{
   assert.equal(path,privatePath);assert.equal(flags,'wx');assert.equal(mode,0o600);
   return {
    writeFile:async()=>{throw Error('disk full path=/synthetic/private/customer@example.com')},
    close:async()=>{closed++}
   };
  },
  removeFile:async path=>{assert.equal(path,privatePath);removed++}
 };
 await assert.rejects(()=>persistMetaAudienceCsv(privatePath,CSV,fsMock),
  err=>err.message==='crm_meta_audience_private_write_failed'
    &&!err.message.includes('customer@example.com'));
 assert.equal(closed,1);
 assert.equal(removed,1);
});

test('P25.9 failed exclusive open NEVER deletes an existing file',async()=>{
 let removeCalled=false;
 await assert.rejects(()=>persistMetaAudienceCsv('/synthetic/private/previous.csv',CSV,{
  openFile:async()=>{const err=Error('EEXIST');err.code='EEXIST';throw err},
  removeFile:async()=>{removeCalled=true}
 }),/private_write_failed/);
 assert.equal(removeCalled,false);
});

test('P25.9 sync error leaves no partial CSV and does not echo path',async()=>{
 let closed=0,deleted=0;
 const mock={
  openFile:async()=>({
   writeFile:async()=>{},
   sync:async()=>{throw Error('sync error in /secret/path/phone')},
   close:async()=>{closed++}
  }),
  removeFile:async()=>{deleted++}
 };
 await assert.rejects(()=>persistMetaAudienceCsv('/synthetic/failure.csv',CSV,mock),
  err=>err.message==='crm_meta_audience_private_write_failed');
 assert.equal(closed,1);
 assert.equal(deleted,1);
});

test('P25.9 invalid path/input fails before any filesystem action',async()=>{
 let writes=0;
 const mock={openFile:async()=>{writes++}};
 await assert.rejects(()=>persistMetaAudienceCsv('relative.csv',CSV,mock),/invalid_args/);
 await assert.rejects(()=>persistMetaAudienceCsv('/synthetic/private.csv','not CSV',mock),/invalid_args/);
 assert.equal(writes,0);
});
