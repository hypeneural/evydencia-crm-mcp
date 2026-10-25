// Deterministic forensic audit test suite (100% synthetic fixtures — zero real customer PII).
// Covers all 6 forensic parity scenarios: Permuta vs Dinheiro + installments + status timeline,
// cross-order participant birth-date discrepancy + age_at_session, proven campaign bonuses vs
// untracked R$ 0 items, customer avatar vs initials, zero-order lead lookup + card completeness,
// global pagination (5,054 orders) and Cache-Control: private, no-store invariants.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createGateway} from '../src/live-gateway.mjs';
import {
 forensicOrderProjection,
 forensicCustomerProjection,
 buildCrossOrderParticipantAudit,
 humanAgeAt,
 customerInitials
} from '../src/legacy-api-read.mjs';

const OP_TOKEN='fake-forensic-op7-token-0001';
const INTERNAL_TOK='fake-forensic-internal-read-0001';
const KEY=randomBytes(32).toString('base64');
const REDIR='https://chatgpt.com/connector_platform_oauth_redirect';

// Synthetic fixtures mirroring exact CRM Eloquent/Resource structures (no real PII)
const CUST_FAMILY={
 id:101,
 uuid:'aaaaaaaa-1111-4111-8111-000000000101',
 name:'Jaciara Sintetica Familia',
 email:'jaciara.sintetica@example.test',
 document_type:'CPF',
 document:'11122233344',
 whatsapp:'48991000101',
 phone:'48991000101',
 birth:'1988-05-12',
 zipcode:'88200000',
 street:'Rua das Acacias',
 number:'120',
 district:'Centro',
 city:{name:'Tijucas',state:{abbr:'SC'}},
 avatar_url:null,
 avatar_revision:0,
 created_at:'2024-09-10T14:00:00.000000Z'
};

const CUST_AVATAR={
 id:202,
 uuid:'bbbbbbbb-2222-4222-8222-000000000202',
 name:'Larissa Sintetica Avatar',
 email:'larissa.sintetica@example.test',
 document_type:'CPF',
 document:'22233344455',
 whatsapp:'48991000202',
 birth:'1994-03-20',
 zipcode:'88200000',
 street:'Av Brasil',
 number:'45',
 district:'Universitario',
 city:{name:'Tijucas',state:{abbr:'SC'}},
 avatar_url:'https://evydencia.com/storage/customers/avatars/bbbbbbbb-2222-synthetic.webp',
 avatar_revision:3,
 created_at:'2026-10-23T12:00:00.000000Z'
};

const CUST_ZERO_ORDER_LEAD={
 id:3858,
 uuid:'40d9c6ab-0000-4000-8000-000000003858',
 name:'Bruna Sintetica Lead',
 email:'bruna.lead@example.test',
 document_type:'CPF',
 document:'33344455566',
 whatsapp:'48991003858',
 birth:'1996-07-08',
 zipcode:'88200000',
 street:'Rua Projetada',
 number:'10',
 district:'Centro',
 city:null,
 avatar_url:null,
 avatar_revision:0,
 orders_count:0,
 created_at:'2025-11-01T15:00:00.000000Z'
};

// Synthetic mirror of #3369 (2024): untracked R$ 0 extra photos + birth_date 2005-08-14
const ORDER_3369_SYNTH={
 id:3369,
 uuid:'33333333-3369-4369-8369-000000003369',
 status:{id:12,key:'order_completed',name:'Pedido Concluído'},
 customer:CUST_FAMILY,
 created_at:'2024-10-10 14:20:00',
 schedule_1:'2024-11-15 15:00:00',
 participants_completed_at:'2024-10-12 10:00:00',
 participants_completed_source:'customer_portal',
 items:[
  {id:4001,quantity:'1.000',amount:'390.00',discount:'0.00',total:'390.00',entry:'120.00',product:{name:'Experiência Então é Natal',slug:'natal-2024',reference:'enatal24',bundle:'Y'}},
  {id:4002,quantity:'3.000',amount:'19.00',discount:'57.00',total:'0.00',entry:'0.00',product:{name:'Foto Extra Revelada 15x21',slug:'foto-extra',reference:'fextra',bundle:'N'}}
 ],
 bonuses:[],
 installments:[
  {id:7001,installment:1,installments:1,expiry_at:'2024-10-10 23:59:59',total:'390.00',payment_total:'390.00',payment_at:'2024-10-10 14:25:00',discount:'0.00',increase:'0.00',method:{name:'Pix - Pagar.me',type:{id:3,name:'Pix'}},transactions:[],bills:[]}
 ],
 statuses:[
  {id:20001,status:'order_created',created_at:'2024-10-10 14:20:00',updated_at:'2024-10-10 14:20:00'},
  {id:20002,status:'order_completed',created_at:'2024-12-05 18:00:00',updated_at:'2024-12-05 18:00:00'}
 ],
 participants:[
  {id:105,name:'Antônio Exemplo Neto',birth:'2005-08-14',relation:{id:1,name:'Filho (a)'}}
 ],
 summary:{total:390,received:390,remaining:0}
};

// Synthetic mirror of #4510 (2025): 2 Permuta installments (category Dinheiro), 10 status transitions,
// participants_completed_at = null ("Cadastro pendente"), and birth_date 2015-08-14 (10-year conflict!)
const ORDER_4510_SYNTH={
 id:4510,
 uuid:'44444444-4510-4510-8510-000000004510',
 status:{id:12,key:'order_completed',name:'Pedido Concluído'},
 customer:CUST_FAMILY,
 created_at:'2025-10-30 14:52:36',
 schedule_1:'2025-11-30 16:00:00',
 participants_completed_at:null,
 items:[
  {id:6001,quantity:'1.000',amount:'450.00',discount:'0.00',total:'450.00',entry:'120.00',product:{name:'Experiência Então é Natal',slug:'natal',reference:'enatal',bundle:'Y',description:'Ensaio de Natal completo com cenário exclusivo'}}
 ],
 bonuses:[],
 installments:[
  {
   id:9013,installment:1,installments:1,expiry_at:'2025-10-30 22:52:36',
   total:'120.00',payment_total:'120.00',payment_at:'2025-10-30 15:17:53',discount:'0.00',increase:'0.00',
   method:{name:'Permuta',type:{id:4,name:'Dinheiro'}},
   transactions:[{id:6380,status:1,message:'Aguardando Pagamento',original_id:'or_synth_01',original_status:'waiting_payment',created_at:'2025-10-30 14:52:37'}],
   bills:[{id:6794,amount:'120.00',payment_total:'120.00',closed_at:'2025-10-30 15:17:53',aborted_at:null}]
  },
  {
   id:9014,installment:2,installments:1,expiry_at:'2025-11-30 16:00:00',
   total:'330.00',payment_total:'330.00',payment_at:'2025-10-30 15:18:10',discount:'0.00',increase:'0.00',
   method:{name:'Permuta',type:{id:4,name:'Dinheiro'}},
   transactions:[],
   bills:[{id:6795,amount:'330.00',payment_total:'330.00',closed_at:'2025-10-30 15:18:10',aborted_at:null}]
  }
 ],
 statuses:[
  {id:34624,status:'order_created',created_at:'2025-10-30 14:52:36',updated_at:'2025-10-30 14:52:36'},
  {id:34625,status:'waiting_payment',created_at:'2025-10-30 14:52:37',updated_at:'2025-10-30 14:52:37'},
  {id:34626,status:'payment_confirmed',created_at:'2025-10-30 15:17:53',updated_at:'2025-10-30 15:17:53'},
  {id:34627,status:'session_schedule',created_at:'2025-10-30 15:18:10',updated_at:'2025-10-30 15:18:10'},
  {id:34628,status:'session_schedule_confirmed',created_at:'2025-11-30 17:05:00',updated_at:'2025-11-30 17:05:00'},
  {id:34629,status:'selection_schedule',created_at:'2025-12-01 10:00:00',updated_at:'2025-12-01 10:00:00'},
  {id:34630,status:'selection_schedule_confirmed',created_at:'2025-12-03 19:20:00',updated_at:'2025-12-03 19:20:00'},
  {id:34631,status:'waiting_product_retrieve',created_at:'2025-12-15 11:00:00',updated_at:'2025-12-15 11:00:00'},
  {id:34632,status:'product_retrieve_confirmed',created_at:'2025-12-19 16:40:00',updated_at:'2025-12-19 16:40:00'},
  {id:34633,status:'order_completed',created_at:'2025-12-19 16:41:00',updated_at:'2025-12-19 16:41:00'}
 ],
 participants:[
  {id:2056,name:'Antônio Exemplo Neto',birth:'2015-08-14',relation:{id:1,name:'Filho (a)'}},
  {id:2057,name:'Jaciara Sintetica Familia',birth:'1988-05-12',relation:{id:5,name:'Titular'}},
  {id:2058,name:'Marcos Exemplo',birth:'1986-02-10',relation:{id:2,name:'Esposo (a)'}},
  {id:2059,name:'Helena Exemplo',birth:'2020-01-25',relation:{id:1,name:'Filho (a)'}}
 ],
 summary:{total:450,received:450,remaining:0}
};

// Synthetic mirror of #5061 (2026): 4 proven automatic bonus rules in order_bonus_applications
const ORDER_5061_SYNTH={
 id:5061,
 uuid:'55555555-5061-4061-8061-000000005061',
 status:{id:6,key:'session_schedule',name:'Sessão Agendada'},
 customer:CUST_AVATAR,
 created_at:'2026-09-30 10:56:45',
 schedule_1:'2026-11-02 09:00:00',
 participants_completed_at:'2026-10-01 12:30:00',
 participants_completed_source:'customer_portal',
 items:[
  {id:8535,quantity:'1.000',amount:'480.00',discount:'0.00',total:'480.00',entry:'120.00',product:{name:'Experiência Então é Natal',slug:'natal',reference:'enatal',bundle:'Y'}},
  {id:8536,quantity:'1.000',amount:'65.00',discount:'65.00',total:'0.00',entry:'0.00',product:{name:'Globo de Neve personalizado',slug:'globo-neve',reference:'globo',bundle:'N'}},
  {id:8537,quantity:'1.000',amount:'45.00',discount:'45.00',total:'0.00',entry:'0.00',product:{name:'Calendário de mesa 2027',slug:'calendario',reference:'cal27',bundle:'N'}},
  {id:8538,quantity:'1.000',amount:'35.00',discount:'35.00',total:'0.00',entry:'0.00',product:{name:'Chaveiro acrílico personalizado',slug:'chaveiro',reference:'chav',bundle:'N'}},
  {id:8539,quantity:'3.000',amount:'25.00',discount:'75.00',total:'0.00',entry:'0.00',product:{name:'Foto Extra Digital',slug:'foto-extra-digital',reference:'fextd',bundle:'N'}}
 ],
 bonuses:[
  {uuid:'b-01',order_item_id:8536,source:'automatic_rule',status:'active',applied_at:'2026-09-30 10:56:46',rule_snapshot:JSON.stringify({benefit_key:'brinde-prevenda-globo-neve',campaign_slug:'natal-2026',discount_policy:'full_item_discount'})},
  {uuid:'b-02',order_item_id:8537,source:'automatic_rule',status:'active',applied_at:'2026-09-30 10:56:46',rule_snapshot:JSON.stringify({benefit_key:'brinde-prevenda-calendario',campaign_slug:'natal-2026',discount_policy:'full_item_discount'})},
  {uuid:'b-03',order_item_id:8538,source:'automatic_rule',status:'active',applied_at:'2026-09-30 10:56:46',rule_snapshot:JSON.stringify({benefit_key:'brinde-prevenda-chaveiro',campaign_slug:'natal-2026',discount_policy:'full_item_discount'})},
  {uuid:'b-04',order_item_id:8539,source:'automatic_rule',status:'active',applied_at:'2026-09-30 10:56:46',rule_snapshot:JSON.stringify({benefit_key:'fotos-extras-faixa-3',campaign_slug:'natal-2026',discount_policy:'full_item_discount'})}
 ],
 installments:[
  {id:9901,installment:1,installments:1,expiry_at:'2026-09-30 23:59:59',total:'120.00',payment_total:'120.00',payment_at:'2026-09-30 11:02:00',discount:'0.00',increase:'0.00',method:{name:'Pix - Pagar.me',type:{id:3,name:'Pix'}},transactions:[],bills:[]},
  {id:9902,installment:2,installments:1,expiry_at:'2026-11-02 09:00:00',total:'360.00',payment_total:'0.00',payment_at:null,discount:'0.00',increase:'0.00',method:{name:'Cartão de Crédito',type:{id:1,name:'Cartão de Crédito'}},transactions:[],bills:[]}
 ],
 statuses:[
  {id:41001,status:'order_created',created_at:'2026-09-30 10:56:45',updated_at:'2026-09-30 10:56:45'},
  {id:41002,status:'waiting_payment',created_at:'2026-09-30 10:56:46',updated_at:'2026-09-30 10:56:46'},
  {id:41003,status:'payment_confirmed',created_at:'2026-09-30 11:02:00',updated_at:'2026-09-30 11:02:00'},
  {id:41004,status:'session_schedule',created_at:'2026-09-30 11:05:00',updated_at:'2026-09-30 11:05:00'}
 ],
 participants:[
  {id:3101,name:'João Miguel Sintetico',birth:'2024-04-30',relation:{id:1,name:'Filho (a)'}}
 ],
 summary:{total:480,received:120,remaining:360}
};

const ALL_ORDERS=[ORDER_5061_SYNTH,ORDER_4510_SYNTH,ORDER_3369_SYNTH];
const ALL_CUSTOMERS=[CUST_ZERO_ORDER_LEAD,CUST_AVATAR,CUST_FAMILY];

let crm,crmUrl;
const clock=Date.now();
const env1=data=>JSON.stringify({schema_version:'1.0',generated_at:new Date(clock).toISOString(),data});

before(async()=>{
 crm=createServer((req,res)=>{
  const u=new URL(req.url,'http://x'),auth=req.headers.authorization||'',tok=auth.replace(/^Bearer /,'');
  const send=(s,b)=>res.writeHead(s,{'Content-Type':'application/json'}).end(JSON.stringify(b));
  if(u.pathname==='/health/live')return send(200,{status:'ok'});
  if(u.pathname.startsWith('/api/v1/extension/')){
   if(tok!==OP_TOKEN)return send(401,{message:'Unauthenticated.'});
   if(u.pathname==='/api/v1/extension/bootstrap')
    return res.writeHead(200,{'Content-Type':'application/json'}).end(env1({operator:{id:7,name:'Operadora Auditoria'},server:{timezone:'America/Sao_Paulo',api_version:'1.0',minimum_extension_version:'1.0.0'},features:{proposals:{enabled:true},natal_2026:{enabled:true,reference_year:2026}},token:{abilities:['extension:bootstrap','extension:customer-read','extension:proposal-read','extension:proposal-write'],expires_at:'2099-01-01T00:00:00Z'}}));
   if(u.pathname==='/api/v1/extension/customer-context'){
    const ph=u.searchParams.get('phone')||'';
    const purchased=ph.endsWith('0202');
    return res.writeHead(200,{'Content-Type':'application/json'}).end(env1({
     lookup:{status:'matched',match_count:1,normalized_e164:'+55'+ph},
     customer:{uuid:'ext-cust',display_name:'Cliente Ext',first_name:'Cliente',customer_since:'2024-01-01',lifecycle_stage:'recurring'},
     current_order:null,
     natal_2026:{purchased,mode:purchased?'buyer':'prospect'},
     history:{lifecycle_stage:'recurring',orders_count:1,completed_sessions_count:1,lifetime_value:450,average_ticket:450,years_attended:[2025]},
     capabilities:{proposal_preview:{allowed:!purchased,reason:purchased?'ALREADY_PURCHASED_NATAL_2026':null},proposal_schedule:{allowed:!purchased,reason:null}}
    }));
   }
   return send(404,{});
  }
  if(auth!==INTERNAL_TOK)return send(401,{message:'Unauthorized'});
  if(u.pathname==='/api/orders/search'){
   let rows=[...ALL_ORDERS];
   const idQ=u.searchParams.get('order[id]');
   if(idQ)rows=rows.filter(o=>String(o.id)===idQ);
   const nameQ=u.searchParams.get('customer[name]');
   if(nameQ)rows=rows.filter(o=>o.customer.name.toLowerCase().includes(nameQ.toLowerCase()));
   return send(200,{data:rows,meta:{total:idQ||nameQ?rows.length:5054}});
  }
  const detMatch=/^\/api\/orders\/([^/]+)\/detail$/.exec(u.pathname);
  if(detMatch){
   const found=ALL_ORDERS.find(o=>o.uuid===detMatch[1]);
   return found?send(200,{data:found}):send(404,{error:'not_found'});
  }
  if(u.pathname==='/api/customers/search'){
   const q=(u.searchParams.get('busca')||u.searchParams.get('nome_cliente')||'').toLowerCase();
   const zeroOnly=u.searchParams.get('somente_sem_pedidos')==='true';
   let rows=[...ALL_CUSTOMERS];
   if(q)rows=rows.filter(c=>c.name.toLowerCase().includes(q)||(c.email||'').toLowerCase().includes(q)||(c.document||'').includes(q));
   if(zeroOnly)rows=rows.filter(c=>(c.orders_count??1)===0);
   return send(200,{data:rows,meta:{total:rows.length}});
  }
  if(u.pathname==='/api/customers/forensic-360'){
   const nameQ=(u.searchParams.get('nome_cliente')||'').toLowerCase();
   const uuidQ=u.searchParams.get('customer_uuid')||'';
   const docQ=(u.searchParams.get('documento')||'').replace(/\D/g,'');
   const phQ=(u.searchParams.get('telefone')||'').replace(/\D/g,'');
   const cust=ALL_CUSTOMERS.find(c=>
    (uuidQ&&c.uuid===uuidQ)||
    (docQ&&c.document===docQ)||
    (phQ&&c.whatsapp.endsWith(phQ.slice(-8)))||
    (nameQ&&c.name.toLowerCase().includes(nameQ))
   );
   if(!cust)return send(200,{lookup:{status:'not_found',match_count:0},customer:null,orders:[]});
   const custOrders=ALL_ORDERS.filter(o=>o.customer.uuid===cust.uuid);
   return send(200,{
    lookup:{status:'matched',match_count:1},
    customer:{...cust,orders_count:custOrders.length},
    kpis:{
     lifecycle_stage:custOrders.length===0?'lead':(custOrders.length===1?'first_time':'recurring'),
     total_orders_registered:custOrders.length,
     valid_orders_count:custOrders.length
    },
    orders:custOrders
   });
  }
  return send(404,{});
 });
 await new Promise(r=>crm.listen(0,'127.0.0.1',r));
 crmUrl='http://127.0.0.1:'+crm.address().port;
});
after(()=>new Promise(r=>crm.close(r)));

async function makeAuthorizedClient(extraEnv={}){
 const g=createGateway({
  EVYD_PUBLIC_URL:'http://localhost',
  CRM_BASE_URL:crmUrl,
  EVYD_GATEWAY_KEY:KEY,
  EVYD_ALLOWED_OPERATOR_IDS:'7',
  EVYD_INTERNAL_READ_TOKEN:INTERNAL_TOK,
  ...extraEnv
 },{log:()=>{},now:()=>clock});
 const call=(path,init={})=>g.handle(new Request(new URL(path,'http://localhost'),init),{ip:'10.0.0.1',host:'localhost'});
 const reg=await call('/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:[REDIR],token_endpoint_auth_method:'none',client_name:'ForensicAuditTest'})});
 const {client_id}=await reg.json();
 const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
 const pg=await call('/authorize?'+new URLSearchParams({response_type:'code',client_id,redirect_uri:REDIR,code_challenge:challenge,code_challenge_method:'S256',state:'s1',resource:'http://localhost/mcp',scope:'crm.read'}));
 const txn=/name="txn" value="([^"]+)"/.exec(await pg.text())[1];
 const post=await call('/authorize',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({txn,crm_token:OP_TOKEN,action:'approve'}).toString()});
 const code=new URL(post.headers.get('location')).searchParams.get('code');
 const tokRes=await call('/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:REDIR,client_id,code_verifier:verifier,resource:'http://localhost/mcp'}).toString()});
 const tokens=await tokRes.json();
 const transport=new StreamableHTTPClientTransport(new URL('http://localhost/mcp'),{
  fetch:(u,init)=>{const r=new Request(u,init);r.headers.set('authorization','Bearer '+tokens.access_token);return g.handle(r,{ip:'10.0.0.1',host:'localhost'})}
 });
 const client=new Client({name:'forensic-suite',version:'1.0.0'});
 await client.connect(transport);
 return {g,call,tokens,client};
}

test('Scenario 1 — Permuta vs Dinheiro, individual installments, bills/transactions, 10 status events and Cadastro pendente',async()=>{
 const projected=forensicOrderProjection(ORDER_4510_SYNTH,{includeParticipants:true,fullProfile:true,todayYmd:'2026-10-25'});
 assert.deepEqual(projected.payment_methods,['Permuta']);
 assert.deepEqual(projected.payment_summary.effective_paid_methods,['Permuta']);
 assert.deepEqual(projected.payment_summary.effective_paid_by_method_reais,{Permuta:450});
 assert.deepEqual(projected.payment_summary.paid_method_categories,['Dinheiro']);
 assert.equal(projected.payment_summary.payment_needs_review,false);
 assert.equal(projected.installments.length,2);
 assert.equal(projected.installments[0].total_reais,120);
 assert.equal(projected.installments[0].method_name,'Permuta');
 assert.equal(projected.installments[0].method_category_label,'Dinheiro');
 assert.equal(projected.installments[0].bills[0].paid_reais,120);
 assert.equal(projected.installments[0].transactions[0].gateway_status,'waiting_payment');
 assert.equal(projected.installments[1].total_reais,330);
 assert.equal(projected.installments[1].method_name,'Permuta');
 assert.equal(projected.status_history_count,10);
 assert.equal(projected.status_history[0].status_key,'order_created');
 assert.equal(projected.status_history[9].status_key,'order_completed');
 assert.equal(projected.status_history[9].is_current,true);
 assert.equal(projected.participants_registration.completed,false);
 assert.equal(projected.participants_registration.status_label,'Cadastro pendente');
 assert.equal(projected.participants_registration.count,4);

 // End-to-end via MCP crm_pedido_detalhe (numeric order_id) & crm_pedidos_buscar (payment_method_name)
 const {client}=await makeAuthorizedClient({EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 try{
  const det=await client.callTool({name:'crm_pedido_detalhe',arguments:{order_id:4510}});
  assert.equal(det.isError,undefined);
  assert.deepEqual(det.structuredContent.order.payment_summary.effective_paid_methods,['Permuta']);
  assert.equal(det.structuredContent.order.installments.length,2);
  assert.equal(det.structuredContent.order.status_history.length,10);
  assert.equal(det.structuredContent.order.participants_registration.status_label,'Cadastro pendente');

  const searchPermuta=await client.callTool({name:'crm_pedidos_buscar',arguments:{payment_method_name:'Permuta'}});
  assert.equal(searchPermuta.structuredContent.orders.length,1);
  assert.equal(searchPermuta.structuredContent.orders[0].order_id,4510);
 }finally{await client.close()}
});

test('Scenario 2 — Participant cross-order 10-year birth-date discrepancy and age_at_session vs age_today',async()=>{
 assert.equal(humanAgeAt('2015-08-14','2025-11-30'),'10 anos e 3 meses');
 assert.equal(humanAgeAt('2015-08-14','2026-10-25'),'11 anos e 2 meses');

 const o3369=forensicOrderProjection(ORDER_3369_SYNTH,{includeParticipants:true,fullProfile:true,todayYmd:'2026-10-25'});
 const o4510=forensicOrderProjection(ORDER_4510_SYNTH,{includeParticipants:true,fullProfile:true,todayYmd:'2026-10-25'});
 const audit=buildCrossOrderParticipantAudit([o4510,o3369]);
 assert.equal(audit.has_discrepancies,true);
 assert.equal(audit.birth_date_discrepancies_count,1);
 assert.equal(audit.birth_date_discrepancies[0].participant_name,'Antônio Exemplo Neto');
 assert.deepEqual(audit.birth_date_discrepancies[0].distinct_birth_dates.sort(),['2005-08-14','2015-08-14']);
 assert.equal(audit.birth_date_discrepancies[0].difference_years_approx,10);

 const {client}=await makeAuthorizedClient({EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 try{
  const c360=await client.callTool({name:'crm_cliente_360',arguments:{nome_cliente:'Jaciara Sintetica'}});
  assert.equal(c360.isError,undefined);
  assert.equal(c360.structuredContent.lookup.status,'matched');
  assert.equal(c360.structuredContent.participants_cross_order_audit.has_discrepancies,true);
  assert.equal(c360.structuredContent.participants_cross_order_audit.birth_date_discrepancies[0].difference_years_approx,10);
  assert.deepEqual(c360.structuredContent.financial_audit_summary.received_by_effective_method_reais,{Permuta:450,'Pix - Pagar.me':390});
 }finally{await client.close()}
});

test('Scenario 3 — Products & bonuses: proven campaign_bonus (order_bonus_applications) vs untracked R$ 0 item',async()=>{
 const {client}=await makeAuthorizedClient({EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 try{
  const d5061=await client.callTool({name:'crm_pedido_detalhe',arguments:{uuid:ORDER_5061_SYNTH.uuid}});
  const items5061=d5061.structuredContent.order.items;
  assert.equal(items5061.length,5);
  assert.equal(items5061[0].is_bundle,true);
  assert.equal(items5061[0].bonus_classification.classification,'package_bundle');
  const bonusItems=items5061.slice(1);
  assert.equal(bonusItems.length,4);
  assert.ok(bonusItems.every(i=>i.net_total_reais===0&&i.discount_reais>0&&i.bonus_classification.proven===true&&i.bonus_classification.origin==='automatic_rule'));
  assert.deepEqual(bonusItems.map(i=>i.bonus_classification.benefit_key),[
   'brinde-prevenda-globo-neve',
   'brinde-prevenda-calendario',
   'brinde-prevenda-chaveiro',
   'fotos-extras-faixa-3'
  ]);

  const d3369=await client.callTool({name:'crm_pedido_detalhe',arguments:{uuid:ORDER_3369_SYNTH.uuid}});
  const zeroLegacy=d3369.structuredContent.order.items[1];
  assert.equal(zeroLegacy.gross_amount_reais,57);
  assert.equal(zeroLegacy.discount_reais,57);
  assert.equal(zeroLegacy.net_total_reais,0);
  assert.equal(zeroLegacy.bonus_classification.proven,false);
  assert.equal(zeroLegacy.bonus_classification.origin,'unknown');
 }finally{await client.close()}
});

test('Scenario 4 — Customer real avatar URL vs initials without photo (never exposing internal disk path)',()=>{
 assert.equal(customerInitials('Bruna Sintetica Lead'),'BL');
 const withPhoto=forensicCustomerProjection({...CUST_AVATAR,avatar_path:'customers/avatars/internal-secret.webp'},{fullProfile:true});
 assert.equal(withPhoto.avatar.has_avatar,true);
 assert.equal(withPhoto.avatar.url,'https://evydencia.com/storage/customers/avatars/bbbbbbbb-2222-synthetic.webp');
 assert.equal(withPhoto.avatar.initials,'LA');
 assert.ok(!JSON.stringify(withPhoto).includes('internal-secret.webp'));

 const noPhoto=forensicCustomerProjection(CUST_ZERO_ORDER_LEAD,{fullProfile:true});
 assert.equal(noPhoto.avatar.has_avatar,false);
 assert.equal(noPhoto.avatar.url,null);
 assert.equal(noPhoto.avatar.initials,'BL');
});

test('Scenario 5 — Zero-order lead lookup by name + full holder profile + incomplete card registration diagnostics',async()=>{
 const {client}=await makeAuthorizedClient({EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 try{
  const list=await client.callTool({name:'crm_clientes_buscar',arguments:{nome_cliente:'Bruna Sintetica',somente_sem_pedidos:true}});
  assert.equal(list.isError,undefined);
  assert.equal(list.structuredContent.customers.length,1);
  const c=list.structuredContent.customers[0];
  assert.equal(c.orders_count,0);
  assert.equal(c.lifecycle_stage,'lead');
  assert.equal(c.email,'bruna.lead@example.test');
  assert.equal(c.document,'33344455566');
  assert.equal(c.avatar.has_avatar,false);
  assert.equal(c.avatar.url,null);
  assert.equal(c.registration_completeness.is_complete_for_card,false);
  assert.equal(c.registration_completeness.status_label,'Cadastro incompleto');
  assert.ok(c.registration_completeness.missing_fields.includes('city'));
  assert.ok(c.registration_completeness.missing_fields.includes('state'));

  const resumo=await client.callTool({name:'crm_cliente_resumo',arguments:{nome_cliente:'Bruna Sintetica Lead'}});
  assert.equal(resumo.isError,undefined);
  assert.equal(resumo.structuredContent.lookup.status,'matched');
  assert.equal(resumo.structuredContent.customer.uuid,CUST_ZERO_ORDER_LEAD.uuid);
  assert.equal(resumo.structuredContent.current_order,null);
  assert.equal(resumo.structuredContent.kpis.total_orders_registered,0);
 }finally{await client.close()}
});

test('Scenario 6 — Global order pagination (5,054 total), Cache-Control: private, no-store, and strict default mode isolation',async()=>{
 const full=await makeAuthorizedClient({EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 try{
  const unauth=await full.call('/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:'{}'});
  assert.equal(unauth.status,401);
  assert.equal(unauth.headers.get('cache-control'),'private, no-store');

  const ordersRes=await full.client.callTool({name:'crm_pedidos_buscar',arguments:{limite:2}});
  assert.equal(ordersRes.structuredContent.pagination.total_matching_orders,5054);
  assert.equal(ordersRes.structuredContent.pagination.has_more,true);
  assert.equal(ordersRes.structuredContent.orders[0].order_id,5061);
  assert.equal(ordersRes.structuredContent.orders[0].customer_has_avatar,true);
  assert.equal(ordersRes.structuredContent.orders[0].payment_summary.open_installments_count,1);
 }finally{await full.client.close()}

 // Default read-only mode (EVYD_ENABLE_OPERATOR_FULL_CRM unset) omits full holder PII & forensic-only tool
 const restricted=await makeAuthorizedClient({});
 try{
  const {tools}=await restricted.client.listTools();
  assert.ok(!tools.some(t=>t.name==='crm_clientes_buscar'));
  const ord=await restricted.client.callTool({name:'crm_pedido_detalhe',arguments:{uuid:ORDER_5061_SYNTH.uuid}});
  const dump=JSON.stringify(ord.structuredContent);
  assert.ok(!dump.includes('larissa.sintetica@example.test'));
  assert.ok(!dump.includes('22233344455'));
  assert.ok(!dump.includes('João Miguel Sintetico'));
 }finally{await restricted.client.close()}
});
