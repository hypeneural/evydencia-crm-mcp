// Chart-ready aggregates for authenticated UI in a future gateway. No names, no PII.
import {validateSnapshot} from './natal-digest-snapshot.mjs';
const fmt=n=>Number.isSafeInteger(n)&&n>=0;
export function natalYearlyChart(verified,{now=Date.now()}={}){
 const s=validateSnapshot(verified,{now});
 const years=verified.comparison.years;
 return {
  graph_type:'annual_ytd_comparison',
  period:'01/08 até a data equivalente de corte',currency:'BRL',
  metric_unit:'orders',
  source:'LIVE_MYSQL',as_of:s.as_of,
  points:Object.entries(years).map(([year,v])=>({
   year,orders:v.data_status==='OK'&&fmt(v.orders)?v.orders:null,
   contracted_cents:v.data_status==='OK'?v.contracted_cents:null,
   received_cents:v.data_status==='OK'?v.received_cents:null,
   data_status:v.data_status
  })),
  comparable:s.ytd.comparison_confirmed,
  warning:!s.ytd.comparison_confirmed?s.ytd.warning:
   'Comparação canônica YTD validada; cifras contratadas não são recebimentos líquidos.',
 };
}
