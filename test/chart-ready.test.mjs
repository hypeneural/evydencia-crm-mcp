import test from 'node:test';
import assert from 'node:assert/strict';
import {natalChartModel} from '../src/chart-ready.mjs';
const snap=(ok)=>({is_live:true,source:'LIVE_MYSQL',as_of:'2026-10-25T11:00:00-03:00',
 season:{contracted_cents:15000000,received_cents:12000000,balance_cents:3000000},
 ytd:{current:{orders:180},prior:{orders:160},comparison_confirmed:ok}});
test('diagramas de comparação somente com ambos os anos confirmados',()=>{
 const r=natalChartModel(snap(true));
 assert.equal(r.charts.ytd_orders.data.length,2);
 assert.equal(r.charts.ytd_orders.data[0].year,'2025');
 assert.equal(r.charts.finance_brl_cents.data[1].amount_cents,12000000);
 assert.equal(r.flags.canonical_yoy,true);
});
test('2025 não confirmado não participa de gráfico comparativo',()=>{
 const r=natalChartModel(snap(false));
 assert.equal(r.charts.ytd_orders.data.length,1);
 assert.equal(r.charts.ytd_orders.data[0].year,'2026');
 assert.equal(r.flags.canonical_yoy,false);
});
test('legado 2021-25 é grupo separado, sempre não conciliado',()=>{
 const h={source:'LEGACY_GIT_CALENDAR',canonical_comparison_allowed:false,
  years:{2021:{archived_full_year_orders:100},2025:{archived_full_year_orders:200}}};
 const r=natalChartModel(snap(true),{historical:h});
 assert.equal(r.charts.historical_legacy_unverified.data.length,2);
 assert.equal(r.flags.legacy_separate_only,true);
 assert.equal(r.charts.ytd_orders.data.length,2);
});
test('nunca constrói gráfico com fonte de fixture ou valor desconhecido',()=>{
 assert.throws(()=>natalChartModel({...snap(true),is_live:false}),/source_unverified/);
 assert.throws(()=>natalChartModel({...snap(true),ytd:{...snap(true).ytd,current:{orders:-1}}}),/counts_invalid/);
});
