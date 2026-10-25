// Casos futuros de negócio: SOMENTE para MOCK, sem network/fetch/token ou CRM real.
import {readFile} from 'node:fs/promises';
import {phone} from './core.mjs';
const f=async name=>JSON.parse(await readFile(new URL('../fixtures/'+name+'.mock.json',import.meta.url),'utf8'));
const mark=data=>({mock:true,source:'fixture',real_dispatch:false,...data});
const DEMO_DAY='2026-10-24';
export async function natalResumo(){
 const r=await f('natal-summary');
 const s=r.sales;
 return mark({as_of:r.as_of,reference_year:r.reference_year,currency:r.currency,sales:s,
 average_ticket_cents:s.valid_orders?Math.round(s.gross_cents/s.valid_orders):null,
 packages:r.packages,warning:r.warning});
}
export async function agendaHoje(date=DEMO_DAY){
 if(typeof date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(date))throw Error('invalid_date');
 const r=await f('today-agenda');
 if(date!==r.date)return mark({date,fixture_date:r.date,available:false,appointments:[],total:0,warning:'Sem fixture para esta data. Não significa que a agenda real esteja vazia.'});
 return mark({date:r.date,timezone:r.timezone,available:true,appointments:r.appointments.map(x=>({time:x.time,duration_minutes:x.duration_minutes,package:x.package,customer:x.customer,status:x.status})),total:r.appointments.length,warning:r.warning});
}
export async function buscarClienteNome(term){
 if(typeof term!=='string'||term.trim().length<2||term.trim().length>60||/[\r\n;<>]/.test(term))throw Error('invalid_name');
 const q=term.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const r=await f('customer-name-search');
 const found=r.records.filter(x=>x.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)).slice(0,5);
 return mark({query:term.trim(),match_count:found.length,status:found.length===0?'not_found':found.length>1?'ambiguous':'matched',
 customers:found.map(x=>({name:x.name,natal_2026_purchased:x.natal_2026_purchased,package:x.package,order_status:x.order_status,session_at:x.session_at})),warning:r.warning});
}
export async function simularAgendamento({telefone,preview_ref,confirmacao_usuario}){
 const n=phone(telefone);
 if(!['48999990001','48999990002'].includes(n))throw Error('invalid_fixture_phone');
 if(preview_ref!=='demo-preview-'+n.slice(-4))throw Error('invalid_preview_ref');
 if(confirmacao_usuario!==true)throw Error('confirmation_required');
 return mark({status:'simulated_scheduled',request_id:'SIMULATION-NO-UUID',customer_phone_masked:'(**) *****-'+n.slice(-4),preview_ref,scheduled:false,real_dispatch:false,delivery_status:'NOT_SENT',warning:'SIMULAÇÃO: nenhum webhook, fila, CRM ou WhatsApp foi chamado.'});
}
