import test from 'node:test';import assert from 'node:assert/strict';
import {natalYearlyChart} from '../src/analytics-visual.mjs';
const dt='2026-10-25T09:00:00-03:00',now=Date.parse('2026-10-25T09:01:00-03:00');
const snapshot=()=>({schema_version:'evyd-natal-digest-v1',source:'LIVE_MYSQL',is_live:true,reference_year:2026,product_slug:'natal',population_scope:'NATAL_2026',as_of:dt,captured_at:dt,financial_status:'RECORDED_GROSS',financial_scope:'CURRENT_ITEMS_RECORDED_PAYMENTS',season:{orders:200,customers:190,new_customers:175,recurring_customers:15,scheduled:120,unscheduled:80,contracted_cents:20000000,received_cents:15000000,balance_cents:5000000,cash_today_cents:50000,new_sales_today_cents:50000},comparison:{window:'AUG01_TO_AS_OF_EQUIVALENT',years:Object.fromEntries([2022,2023,2024,2025,2026].map(y=>[String(y),{orders:y===2026?170:120,contracted_cents:12000000,received_cents:10000000,data_status:'OK',period_start:y+'-08-01',period_as_of:y+'-10-25T09:00:00-03:00'}]))}});
test('serie para gráfico preserva unidade e fonte',()=>{
 const r=natalYearlyChart(snapshot(),{now});
 assert.equal(r.points.length,5);assert.equal(r.points[4].year,'2026');assert.equal(r.points[4].orders,170);
 assert.equal(r.comparable,true);assert.equal(r.source,'LIVE_MYSQL');
});
test('serie invalida histórico nao confirmado, evitando gráfico enganoso',()=>{
 const x=snapshot();x.comparison.years['2025'].data_status='UNCONFIRMED';
 const r=natalYearlyChart(x,{now});
 assert.equal(r.comparable,false);assert.equal(r.points[3].orders,null);
});
