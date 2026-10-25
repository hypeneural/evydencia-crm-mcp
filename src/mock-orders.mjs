// Mock-only order browser and Natal forensic KPIs. NEVER CALL NETWORK.
import {readFile} from 'node:fs/promises';
import {day} from './core.mjs';
const mark=x=>({mock:true,source:'fixture',is_live:false,real_dispatch:false,...x});
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const statuses=Object.freeze({
 order_aborted:'Pedido Cancelado',payment_chargeback:'Chargeback',order_created:'Pedido Emitido',
 waiting_payment:'Aguardando Pagamento',payment_confirmed:'Pagamento Confirmado',
 session_schedule:'Sessão Agendada',session_schedule_confirmed:'Sessão Finalizada',
 selection_schedule:'Seleção Agendada',selection_schedule_confirmed:'Seleção Finalizada',
 waiting_product_retrieve:'Aguardando Retirar',product_retrieve_confirmed:'Entrega Realizada',
 order_completed:'Pedido Concluído',payment_refunded:'Pagamento Estornado'
});
const choices=(v,allowed,f)=>{if(v===undefined||v===null)return undefined;if(!allowed.includes(v))throw Error('invalid_'+f);return v};
const validateText=(s,max=80)=>{if(s===undefined||s===null||s==='')return undefined;if(typeof s!=='string'||s.length>max||/[\x00-\x1f;<>]/.test(s))throw Error('invalid_search');return s.trim()};
const read=async()=>JSON.parse(await readFile(new URL('../fixtures/order-catalog.mock.json',import.meta.url),'utf8'));
const displayOrder=o=>({
 id:o.id,uuid:o.uuid,customer_name:o.name,package_name:o.package_name,product_slug:o.product_slug,
 status_key:o.status,status_label:statuses[o.status]??'Desconhecido',payment_status:o.payment_status,
 created_at:o.created_at,updated_at:o.updated_at,session_date:o.session_date,total_cents:o.total_cents,
 balance_cents:o.balance_cents,participants_count:o.participants_count
});
export function orderFilterContract(){
 return mark({types:{
  manager_order_list:['buscar','product_slug','status','data-tipo','data-inicio','data-fim','financial','participants','sort','limit','page'],
  integration_search:['order.id','order.uuid','order.created-start','order.created-end','order.session-start','order.session-end','order.selection-start','order.selection-end','order.status','product.uuid','product.name','product.slug','product.reference','customer.id','customer.uuid','customer.name','customer.email','customer.document','customer.whatsapp'],
  extension_customer360:['phone','page','per_page'],
  natal_transactions_manager:['year','search','status','type','limit','offset'],
  natal_nonbuyers_manager:['sort','search','limit','offset'],
  natal_loyal_manager:['sort','search','limit']
 },natal_segments:{nonbuyers_sort:['natal_spend','natal_orders','total_spend','total_orders'],loyal_sort:['recent_natal_spend','total_all_spend','total_all_orders','total_natal_spend']},statuses,warning:'Contratos de três SUPERFÍCIES diferentes; somente Extension Customer360 está autorizada no MCP real. A busca por pedidos e os filtros abaixo são simulação.'});
}
export async function buscarPedidosMock(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_filters');
 const search=validateText(input.busca),product=choices(input.product_slug,['natal','pascoa'],'product_slug');
 const financial=choices(input.financial,['all','open'],'financial')??'all';
 const participants=choices(input.participants,['all','with','without'],'participants')??'all';
 const dateType=choices(input.data_tipo,['emissao','sessao'],'data_type')??'emissao';
 const sort=choices(input.sort,['created_desc','schedule_asc','updated_desc'],'sort')??'created_desc';
 const status=input.status??[];
 if(!Array.isArray(status)||status.length>13||status.some(s=>!Object.hasOwn(statuses,s)))throw Error('invalid_status');
 const since=input.data_inicio===undefined?undefined:day(input.data_inicio);
 const until=input.data_fim===undefined?undefined:day(input.data_fim);
 if(since&&until&&since>until)throw Error('invalid_date_range');
 const limit=input.limit??10,page=input.page??1;
 if(![10,20,30].includes(limit)||!Number.isInteger(page)||page<1||page>100)throw Error('invalid_pagination');
 const f=await read();
 const matching=f.orders.filter(o=>{
  if(search&&!norm([o.id,o.uuid,o.name,o.package_name].join(' ')).includes(norm(search)))return false;
  if(product&&o.product_slug!==product)return false;
  if(status.length&&!status.includes(o.status))return false;
  if(financial==='open'&&!(Number.isInteger(o.balance_cents)&&o.balance_cents>0))return false;
  if(participants==='with'&&o.participants_count===0)return false;
  if(participants==='without'&&o.participants_count>0)return false;
  const date=(dateType==='sessao'?o.session_date:o.created_at)?.slice(0,10);
  if((since||until)&&(!date||(since&&date<since)||(until&&date>until)))return false;
  return true;
 });
 matching.sort((a,b)=>sort==='schedule_asc'
  ?(a.session_date??'9999').localeCompare(b.session_date??'9999')||a.id.localeCompare(b.id)
  :sort==='updated_desc' ?b.updated_at.localeCompare(a.updated_at)||b.id.localeCompare(a.id)
  :b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
 const start=(page-1)*limit;
 return mark({search_scope:'FIXTURE_SAMPLE_NOT_CRM',total_matches:matching.length,fixture_total:f.orders.length,
  page,per_page:limit,has_more:start+limit<matching.length,orders:matching.slice(start,start+limit).map(displayOrder),
  filters:{busca:search??null,product_slug:product??null,status,financial,participants,data_tipo:dateType,data_inicio:since??null,data_fim:until??null,sort},
  warning:'APENAS AMOSTRA DE 10 PEDIDOS FICTÍCIOS. Não representa todos os pedidos ou filtros reais; valores financeiros em centavos.'});
}
export async function detalhePedidoMock(identifier){
 if(typeof identifier!=='string'||identifier.length>70||!(/^[-a-f0-9]{36}$/i.test(identifier)||/^[0-9]{4,10}$/.test(identifier)))throw Error('invalid_order_id');
 const f=await read(),o=f.orders.find(x=>x.uuid===identifier||x.id===identifier);
 if(!o)throw Error('mock_order_not_found');
 return mark({detail_scope:'FIXTURE_SUMMARY_ONLY',order:{
  ...displayOrder(o),campaign_key:o.product_slug==='natal'?'natal_'+o.created_at.slice(0,4):'other',
  financial:{currency:'BRL',total_cents:o.total_cents,balance_pending_cents:o.balance_cents,payment_status:o.payment_status,
  balance_known:o.balance_cents!==null},
  coupon_available:!!o.coupon_code,
  participants_count:o.participants_count
 },warning:'Detalhe sintético resumido. Não contém participantes individuais, CPF, e-mail, parcelas, arquivos ou ações. Nenhum pedido real foi consultado.'});
}
export async function natalForenseMock(modulo='geral'){
 choices(modulo,['geral','financeiro','agenda','pacotes','clientes'],'module');
 const f=JSON.parse(await readFile(new URL('../fixtures/natal-summary.mock.json',import.meta.url),'utf8'));
 const s=f.sales;
 const kpis={
  total_orders:s.valid_orders,total_customers:s.customers,
  contracted_cents:s.gross_cents,paid_cents:s.received_cents,balance_due_cents:s.pending_cents,
  contracted_revenue:s.gross_cents/100,paid_revenue:s.received_cents/100,balance_due:s.pending_cents/100,
  scheduled_sessions:108,unscheduled_sessions:s.valid_orders-108,
  ticket_medio_order:s.gross_cents/s.valid_orders/100
 };
 const values={
  geral:{total_orders:kpis.total_orders,total_customers:kpis.total_customers,scheduled_sessions:kpis.scheduled_sessions},
  financeiro:{contracted_cents:kpis.contracted_cents,paid_cents:kpis.paid_cents,balance_due_cents:kpis.balance_due_cents,
    contracted_revenue:kpis.contracted_revenue,paid_revenue:kpis.paid_revenue,balance_due:kpis.balance_due},
  agenda:{scheduled_sessions:kpis.scheduled_sessions,unscheduled_sessions:kpis.unscheduled_sessions,scheduled_pct:Math.round(100*kpis.scheduled_sessions/s.valid_orders)},
  pacotes:{packages:f.packages},
  clientes:{total_customers:kpis.total_customers,ticket_medio_order:kpis.ticket_medio_order}
 };
 return mark({module:modulo,reference_year:f.reference_year,as_of:f.as_of,
  provenance:{source:'STATIC_FIXTURE_TEST',is_live:false,canonical_rule:'ISSUE_112_COMMERCIAL_EVIDENCE',population_scope:'NATAL_2026'},
  data:values[modulo],warning:'Indicadores fictícios derivados da fixture Natal. Os 10 pedidos do catálogo são apenas amostra e NÃO formam este agregado.'});
}
