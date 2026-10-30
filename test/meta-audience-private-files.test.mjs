import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,utimes,readdir,rm,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {purgeExpiredAudienceExports} from '../src/meta-audience-private-files.mjs';

// The on-export sweep and the process janitor can examine the same file.
// Concurrent deletion must be idempotent, not abort a legitimate export.

test('private CSV janitor removes only expired, exact owned exports', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evyd-meta-private-'));
 await chmod(dir,0o700);
 try{
  const expired='meta-audience-natal2026-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.csv';
  const fresh='meta-audience-natal2026-11111111-2222-3333-4444-555555555555.csv';
  const unrelated='customer-list.csv';
  for(const name of [expired,fresh,unrelated])await writeFile(join(dir,name),'synthetic-only',{mode:0o600});
  await utimes(join(dir,expired),new Date(0),new Date(0));
  await utimes(join(dir,unrelated),new Date(0),new Date(0));
  const preview=await purgeExpiredAudienceExports(dir,{nowMs:Date.now(),ttlMs:3600_000,dryRun:true});
  assert.equal(preview.expired,1);
  assert.equal(preview.deleted,0);
  assert.equal((await readdir(dir)).includes(expired),true);
  const result=await purgeExpiredAudienceExports(dir,{nowMs:Date.now(),ttlMs:3600_000});
  assert.equal(result.deleted,1);
  assert.deepEqual((await readdir(dir)).sort(),[fresh,unrelated].sort());
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('private CSV janitor refuses invalid or insecure directories', async()=>{
 await assert.rejects(()=>purgeExpiredAudienceExports('relative/path'),/invalid_retention_policy/);
 const dir=await mkdtemp(join(tmpdir(),'evyd-meta-insecure-'));
 try{
  if(process.platform!=='win32'){
   await chmod(dir,0o777);
   await assert.rejects(()=>purgeExpiredAudienceExports(dir),/private_directory_insecure/);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('P25.8 two concurrent cleanup passes are idempotent on the same expired file',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evyd-meta-racing-'));
 await chmod(dir,0o700);
 try{
  const target='meta-audience-natal2026-aaaaaaaa-bbbb-cccc-dddd-111111111111.csv';
  await writeFile(join(dir,target),'synthetic',{mode:0o600});
  await utimes(join(dir,target),new Date(0),new Date(0));
  const results=await Promise.all([
   purgeExpiredAudienceExports(dir,{ttlMs:3600_000}),
   purgeExpiredAudienceExports(dir,{ttlMs:3600_000}),
  ]);
  assert.equal((await readdir(dir)).includes(target),false);
  assert.equal(results.reduce((sum,r)=>sum+r.deleted,0),1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
