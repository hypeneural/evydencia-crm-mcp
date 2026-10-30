// Presentation model, not a UI widget or MCP tool. Headless structuredContent works first.
export function natalChartModel(snapshot,{historical=null}={}){
 if(!snapshot||snapshot.is_live!==true||snapshot.source!=='LIVE_MYSQL'||!snapshot.ytd||!snapshot.season)
  throw Error('chart_source_unverified');
 const current=snapshot.ytd.current,previous=snapshot.ytd.prior;
 if(!Number.isSafeInteger(current.orders)||current.orders<0)throw Error('chart_counts_invalid');
 const comparison=snapshot.ytd.comparison_confirmed===true;
 const barData=comparison?[
   {year:'2025',orders:previous.orders},{year:'2026',orders:current.orders}
 ]:[{year:'2026',orders:current.orders}];
 const yearly={chartType:'bar',xKey:'year',series:[{dataKey:'orders',label:'Ensaios vendidos'}],data:barData};
 const finances={
  chartType:'bar',xKey:'metric',series:[{dataKey:'amount_cents',label:'Valor (centavos)'}],
  data:[{metric:'Contratado',amount_cents:snapshot.season.contracted_cents},
   {metric:'Recebido bruto registrado',amount_cents:snapshot.season.received_cents},
   {metric:'Saldo',amount_cents:snapshot.season.balance_cents}]
 };
 const legacy=historical?.source==='LEGACY_GIT_CALENDAR'&&historical?.canonical_comparison_allowed===false?
  {chartType:'bar',xKey:'year',series:[{dataKey:'legacy_orders',label:'Ensaios históricos legados'}],
   data:Object.entries(historical.years??{}).map(([year,v])=>({year,legacy_orders:v.archived_full_year_orders}))}:null;
 return {
  format:'mcp_chart_ready_v1',as_of:snapshot.as_of,source:snapshot.source,
  charts:{ytd_orders:yearly,finance_brl_cents:finances,...(legacy?{historical_legacy_unverified:legacy}:{})},
  flags:{canonical_yoy:comparison,legacy_separate_only:legacy!==null},
  disclaimer:comparison?'Comparativo canônico do CRM por datas equivalentes.':
   'Histórico canônico de 2025 não confirmado; gráfico não afirma crescimento ou queda.'
 };
}
