import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SCHEMA,validateSnapshot,loadPrivateSnapshot} from '../src/natal-digest-snapshot.mjs';
const at='2026-10-25T10:30:00-03:00';
const issued='2026-10-25T10:30:02-03:00';
const now=Date.parse('2026-10-25T10:31:00-03:00');
const fixture=()=>({
 schema_version:SCHEMA,source:'LIVE_MYSQL',is_live:true,reference_year:2026,product_slug:'natal',
 population_scope:'NATAL_2026',as_of:at,captured_at:issued,
 financial_status:'RECORDED_GROSS',financial_scope:'CURRENT_ITEMS_RECORDED_PAYMENTS',
 season:{orders:180,customers:175,new_customers:150,recurring_customers:25,scheduled:145,
  unscheduled:35,contracted_cents:15000000,received_cents:11700000,balance_cents:3300000,
  cash_today_cents:50000,new_sales_today_cents:100000},
 comparison:{window:'AUG01_TO_AS_OF_EQUIVALENT',years:Object.fromEntries([2022,2023,2024,2025,2026].map(
  (year)=>[String(year),{orders:year===2026?170:year===2025?140:120,
   contracted_cents:year===2026?14000000:12000000,received_cents:year===2026?11000000:9000000,
   data_status:'OK',period_start:year+'-08-01',period_as_of:year+'-10-25T10:30:00-03:00'}]))}
});
const copy=v=>JSON.parse(JSON.stringify(v));
test('paridade do snapshot agregado com o método Laravel e YoY 2026 vs 2025',()=>{
 const value=validateSnapshot(fixture(),{now});
 assert.equal(value.is_live,true);
 assert.equal(value.season.orders,180);
 assert.equal(value.ytd.current.orders,170);
 assert.equal(value.ytd.prior.orders,140);
 assert.equal(value.ytd.delta_orders,30);
 assert.equal(value.ytd.delta_orders_pct,21.43);
 assert.equal(value.season.received_cents,11700000);
 assert.equal(value.ytd.comparison_confirmed,true);
 assert.ok(!JSON.stringify(value).includes('telefone'));
});
test('histórico UNCONFIRMED ou DATA_UNAVAILABLE não vira comparativo certificado',()=>{
 for(const state of ['UNCONFIRMED','DATA_UNAVAILABLE']){
  const x=fixture();x.comparison.years['2025'].data_status=state;
  const result=validateSnapshot(x,{now});
  assert.equal(result.ytd.comparison_confirmed,false);
  assert.equal(result.ytd.delta_orders,null);
  assert.equal(result.ytd.delta_orders_pct,null);
  assert.match(result.ytd.warning,/não confirmado/);
 }
});
test('base 2025 igual a zero não gera divisão por zero',()=>{
 const x=fixture();x.comparison.years['2025'].orders=0;
 const result=validateSnapshot(x,{now});
 assert.equal(result.ytd.delta_orders,170);
 assert.equal(result.ytd.delta_orders_pct,null);
});
test('rejeita PII, propriedades não previstas e marcação de fixture disfarçada',()=>{
 for(const extra of [{customer_name:'FAKE'},{customer_phone:'48999990001'},{orders:[1,2,3]}]){
  assert.throws(()=>validateSnapshot({...fixture(),...extra},{now}),/natal_snapshot_schema_invalid/);
 }
 for(const change of [{source:'STATIC_FALLBACK_TEST'},{is_live:false},{reference_year:2025}]){
  assert.throws(()=>validateSnapshot({...fixture(),...change},{now}),/natal_snapshot_source_invalid/);
 }
 const x=fixture();x.season.phone='48999990001';
 assert.throws(()=>validateSnapshot(x,{now}),/natal_snapshot_schema_invalid/);
});
test('invariantes comerciais e status das colunas financeiras são verificados',()=>{
 const x=fixture();x.season.unscheduled=999;
 assert.throws(()=>validateSnapshot(x,{now}),/natal_snapshot_invariant_invalid/);
 const y=fixture();y.season.balance_cents=0;
 assert.throws(()=>validateSnapshot(y,{now}),/natal_snapshot_invariant_invalid/);
 const z=fixture();z.season.orders='180';
 assert.throws(()=>validateSnapshot(z,{now}),/natal_snapshot_number_invalid/);
 const w=fixture();w.comparison.years['2025'].orders=-1;
 assert.throws(()=>validateSnapshot(w,{now}),/natal_snapshot_comparison_invalid/);
});
test('nega snapshot vencido, no futuro ou com janela histórica adulterada',()=>{
 const raw=fixture();
 assert.throws(()=>validateSnapshot(raw,{now:now+360000}),/natal_snapshot_stale_or_future/);
 assert.throws(()=>validateSnapshot(raw,{now:now-180000}),/natal_snapshot_stale_or_future/);
 const x=fixture();x.comparison.years['2025'].period_start='2025-09-01';
 assert.throws(()=>validateSnapshot(x,{now}),/natal_snapshot_comparison_window_invalid/);
});
test('snapshot privado requer caminho absoluto externo ao Git, arquivo regular e permissão restrita',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evyd-natal-snapshot-'));
 const file=join(dir,'digest.json');
 try{
  await writeFile(file,JSON.stringify(fixture()),{mode:0o600});
  await chmod(file,0o600);
  assert.equal((await loadPrivateSnapshot(file,{now})).source,'LIVE_MYSQL');
  await assert.rejects(()=>loadPrivateSnapshot('digest.json',{now}),/natal_snapshot_path_invalid/);
  await assert.rejects(()=>loadPrivateSnapshot(join(process.cwd(),'sensitive.json'),{now}),/natal_snapshot_path_in_repository/);
  if(process.platform!=='win32'){
   await chmod(file,0o644);
   await assert.rejects(()=>loadPrivateSnapshot(file,{now}),/natal_snapshot_permissions_invalid/);
  }
  await writeFile(file,'not JSON');
  await chmod(file,0o600);
  await assert.rejects(()=>loadPrivateSnapshot(file,{now}),/natal_snapshot_json_invalid/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('MCP anônimo não inclui nenhum adaptador de estatísticas reais',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
 assert.ok(!source.includes("natal-digest-snapshot"));
 assert.ok(!source.includes("crm_natal_digest_live"));
 assert.match(source,/crm_private_requires_authenticated_gateway/);
});
