import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,utimes,chmod,readdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startMetaAudienceJanitor,META_AUDIENCE_JANITOR_INTERVAL_MS} from '../src/meta-audience-janitor.mjs';

const ownedOld='meta-audience-natal2026-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.csv';
const ownedFresh='meta-audience-natal2026-11111111-2222-3333-4444-555555555555.csv';

test('P25.8 janitor removes expired owned CSV on boot, without external cron',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evyd-meta-sweeper-'));
 await chmod(dir,0o700);
 let ticker=null,cleared=false,unreffed=false;
 try{
  await writeFile(join(dir,ownedOld),'synthetic-customer-list',{mode:0o600});
  await writeFile(join(dir,ownedFresh),'synthetic-new-file',{mode:0o600});
  await writeFile(join(dir,'not-owned.csv'),'other',{mode:0o600});
  await utimes(join(dir,ownedOld),new Date(0),new Date(0));
  const bootDone=new Promise(resolve=>{
   const sweeper=startMetaAudienceJanitor(dir,{
    onResult:result=>resolve({result,sweeper}),
    setIntervalFn:fn=>{ticker=fn;return {unref(){unreffed=true}}},
    clearIntervalFn:()=>{cleared=true}
   });
  });
  const {result,sweeper}=await bootDone;
  assert.equal(result.deleted,1);
  assert.equal(unreffed,true);
  assert.deepEqual((await readdir(dir)).sort(),[ownedFresh,'not-owned.csv'].sort());
  assert.equal(META_AUDIENCE_JANITOR_INTERVAL_MS,900000);
  ticker();
  const followup=await sweeper.sweep();
  assert.ok(['ok','busy'].includes(followup.status));
  sweeper.stop();
  assert.equal(cleared,true);
  assert.deepEqual(await sweeper.sweep(),{status:'stopped'});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('P25.8 janitor does not overlap sweeps and redacts failing filesystem errors',async()=>{
 let release,seenError=null,trigger=null;
 const wait=new Promise(resolve=>{release=resolve});
 let count=0;
 const janitor=startMetaAudienceJanitor('/synthetic/private',{
  startOnBoot:false,
  purge:async()=>{
   count++;
   await wait;
   throw Error('sensitive/test/path@example.com');
  },
  onError:code=>{seenError=code},
  setIntervalFn:fn=>{trigger=fn;return {unref(){}}},
  clearIntervalFn:()=>{}
 });
 const first=janitor.sweep();
 assert.deepEqual(await janitor.sweep(),{status:'busy'});
 trigger();
 assert.equal(count,1);
 release();
 assert.deepEqual(await first,{status:'error'});
 assert.equal(seenError,'crm_meta_audience_retention_sweep_failed');
 assert.equal(JSON.stringify(seenError).includes('example.com'),false);
 janitor.stop();
 assert.deepEqual(await janitor.sweep(),{status:'stopped'});
});

test('P25.8 gateway starts and stops only its own janitor when export is enabled',async()=>{
 const s=await readFile(new URL('../src/live-gateway.mjs',import.meta.url),'utf8');
 assert.match(s,/cfg\.audienceExportEnabled&&cfg\.audiencePrivateCsvDir/);
 assert.match(s,/startMetaAudienceJanitor\(cfg\.audiencePrivateCsvDir/);
 assert.match(s,/audienceJanitor\?\.stop\(\)/);
 assert.doesNotMatch(s,/execSync\(['"]systemctl/);
});

test('P25.8 janitor rejects invalid directory and interval at setup',()=>{
 assert.throws(()=>startMetaAudienceJanitor('relative/file',{startOnBoot:false}),/invalid_retention_policy/);
 assert.throws(()=>startMetaAudienceJanitor('/absolute',{intervalMs:1,startOnBoot:false}),/invalid_retention_policy/);
});
