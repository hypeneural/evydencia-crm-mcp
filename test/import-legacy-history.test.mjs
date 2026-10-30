import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const dates=Array.from({length:366},(_,i)=>{
 const d=new Date(Date.UTC(2000,0,1+i));
 return String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
});
const calendar=()=>{
 let count=0,base=0,extra=0,customers=0;
 return Object.fromEntries(dates.map(day=>{
  const n=day>='08-01'?1:0;count+=n;customers+=n;base+=n*10;extra+=n*2;
  return [day,{day_orders:n,day_revenue_base:n*10,day_revenue_extras:n*2,
   day_revenue_total:n*12,day_new_customers:n,accum_orders:count,
   accum_revenue_base:base,accum_revenue_extras:extra,
   accum_revenue_total:base+extra,accum_new_customers:customers}];
 }));
};
test('freeze 2021-25 sanitizes data and refuses overwrite or untrusted hash',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evyd-history-import-'));
 try{
  const input=join(dir,'private-source'),outdir=join(dir,'restricted');
  await mkdir(input,{mode:0o700});await mkdir(outdir,{mode:0o700});
  const src=join(input,'legacy.json');
  const out=join(outdir,'frozen.json');
  await writeFile(src,JSON.stringify(Object.fromEntries([2021,2022,2023,2024,2025].map(y=>[y,calendar()]))));
  const cmd=(other=[])=>spawnSync(process.execPath,['scripts/import-legacy-history.mjs',
    '--source='+src,'--output='+out,'--cutoff=10-25',...other],{cwd:process.cwd(),encoding:'utf8'});
  const done=cmd();
  assert.equal(done.status,0,done.stderr);
  assert.match(done.stdout,/canonical_comparison_allowed=false/);
  const data=JSON.parse(await readFile(out,'utf8'));
  assert.equal(data.years['2025'].archived_ytd_orders_aug01_to_cutoff,86);
  assert.equal(data.years['2021'].data_status,'LEGACY_UNVERIFIED');
  assert.equal(Object.keys(data).includes('customers'),false);
  if(process.platform!=='win32')assert.equal((await stat(out)).mode&0o077,0);
  const second=cmd();assert.notEqual(second.status,0);
  assert.match(second.stderr,/HISTORY_IMPORT_BLOCKED/);
  assert.equal(JSON.parse(await readFile(out,'utf8')).source_sha256,data.source_sha256);
  const third=cmd(['--sha256='+'0'.repeat(64)]);
  assert.notEqual(third.status,0);
  assert.ok(!third.stderr.includes(src));
 }finally{await rm(dir,{recursive:true,force:true})}
});
