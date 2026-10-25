// Deterministic forensic & analytical audit test suite (100% synthetic fixtures — zero real customer PII).
// Covers:
// 1. Permuta vs Dinheiro + individual installments/bills/transactions + 10 status transitions + edit lock + cents
// 2. Cross-order participant birth-date conflict (10 years) + age_at_session vs age_today + /consultar canonical URL
// 3. Proven campaign_bonus (order_bonus_applications) vs untracked R$ 0 legacy items
// 4. Customer 3-order 360 + SSRF-safe HTTP HEAD/Range GET WebP avatar probe (RIFF....WEBP) + Google Calendar + personalization
// 5. Zero-order lead lookup + incomplete card registration diagnostics + initials fallback
// 6. Global pagination (5,054 orders), Cache-Control: private, no-store, and operator vs read-only PII isolation
// 7. Natal 2026 historical invariants (2022: 374 vs 379; 2024: 397 vs 398 vs 399), confirmed vs past scheduled sessions,
//    payload budget (<15 KB), and crm_natal_participantes_estatisticas (326 = 134 + 186 + 1 + 5 + #5001 kinship anomaly)
// 8. All 10 mandatory negative/security cases (not_found, ambiguous, missing avatar, invalid/SSRF/404/403/non-WebP avatar,
//    invalid birth dates, unavailable stats, 401/403, empty pagination, 503/timeout, missing write confirmation)
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createGateway} from '../src/live-gateway.mjs';
import {
 forensicOrderProjection,
 forensicCustomerProjection,
 probeCustomerAvatarAsset,
 buildCrossOrderParticipantAudit,
 humanAgeAt,
 customerInitials
} from '../src/legacy-api-read.mjs';

const OP_TOKEN='fake-forensic-op7-token-0001';
const INTERNAL_TOK='fake-forensic-internal-read-0001';
const KEY=randomBytes(32).toString('base64');
const REDIR='https://chatgpt.com/connector_platform_oauth_redirect';

// Valid 32-byte synthetic WebP header: "RIFF" + uint32LE(24) + "WEBPVP8 " + 16 payload bytes
const SYNTH_WEBP_BYTES=Buffer.concat([
 Buffer.from('RIFF','ascii'),
 Buffer.from([24,0,0,0]),
 Buffer.from('WEBPVP8 ','ascii'),
 Buffer.alloc(16,0x5a)
]);

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

let crm,crmUrl;

const makeCustAvatar=()=>({
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
 avatar_url:crmUrl+'/storage/customers/avatars/bbbbbbbb-2222-valid.webp',
 avatar_revision:3,
 created_at:'2024-10-01T12:00:00.000000Z'
});

const CUST_AMBIGUOUS_1={
 id:401,
 uuid:'cccccccc-4401-4401-8401-000000000401',
 name:'Camila Sintetica Homonima',
 email:'camila1@example.test',
 document_type:'CPF',
 document:'44455566677',
 whatsapp:'48991000401',
 orders_count:2
};
const CUST_AMBIGUOUS_2={
 id:402,
 uuid:'cccccccc-4402-4402-8402-000000000402',
 name:'Camila Sintetica Homonima',
 email:'camila2@example.test',
 document_type:'CPF',
 document:'55566677788',
 whatsapp:'48991000402',
 orders_count:1
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

// Synthetic mirror of #5001 (2026): Kinship "Mãe" registered with child birth_date 2024-06-15
const ORDER_5001_ANOMALY_SYNTH={
 id:5001,
 uuid:'50015001-5001-4001-8001-000000005001',
 status:{id:6,key:'session_schedule',name:'Sessão Agendada'},
 customer:CUST_FAMILY,
 created_at:'2026-09-25 11:00:00',
 schedule_1:'2026-11-08 14:00:00',
 participants_completed_at:'2026-09-26 09:00:00',
 items:[
  {id:8101,quantity:'1.000',amount:'480.00',discount:'0.00',total:'480.00',entry:'120.00',product:{name:'Experiência Então é Natal',slug:'natal',reference:'enatal',bundle:'Y'}}
 ],
 bonuses:[],
 installments:[
  {id:9101,installment:1,installments:1,expiry_at:'2026-09-25 23:59:59',total:'480.00',payment_total:'480.00',payment_at:'2026-09-25 11:05:00',discount:'0.00',increase:'0.00',method:{name:'Pix - Pagar.me',type:{id:3,name:'Pix'}},transactions:[],bills:[]}
 ],
 statuses:[
  {id:40001,status:'order_created',created_at:'2026-09-25 11:00:00',updated_at:'2026-09-25 11:00:00'},
  {id:40002,status:'session_schedule',created_at:'2026-09-25 11:06:00',updated_at:'2026-09-25 11:06:00'}
 ],
 participants:[
  {id:2935,name:'Sofia Exemplo Invertida',birth:'2024-06-15',relation:{id:3,name:'Mãe'}}
 ],
 summary:{total:480,received:480,remaining:0}
};

const makeAvatarOrders=()=>{
 const cust=makeCustAvatar();
 const order5127={
  id:5127,
  uuid:'51275127-5127-4127-8127-000000005127',
  status:{id:6,key:'session_schedule',name:'Sessão Agendada'},
  customer:cust,
  created_at:'2026-10-23 14:33:09',
  schedule_1:'2026-11-02 09:00:00',
  schedule_2:null,
  schedule_3:null,
  note:'Cliente pediu pontualidade',
  inner:'Observação interna de teste',
  participants_completed_at:'2026-10-23 15:10:00',
  participants_completed_source:'customer_portal',
  google_calendar:{
   available:true,
   sync_enabled:true,
   order_session:{is_synced:true,status:'synced',synced_at_label:'23/10/2026 14:35',html_link:'https://calendar.google.com/calendar/event?eid=synth5127'},
   order_selection:{is_synced:false,status:'not_scheduled'},
   schedule_change_history:[{event_type:'order_session',action:'scheduled',recorded_at_brt:'2026-10-23 14:35:00'}]
  },
  items:[
   {id:8901,quantity:'1.000',amount:'480.00',discount:'0.00',total:'480.00',entry:'120.00',product:{name:'Experiência Então é Natal',slug:'natal',reference:'enatal',bundle:'Y'}}
  ],
  bonuses:[],
  installments:[
   {id:9951,installment:1,installments:1,expiry_at:'2026-10-23 23:59:59',total:'120.00',payment_total:'120.00',payment_at:'2026-10-23 14:34:00',discount:'0.00',increase:'0.00',method:{name:'Pix - Pagar.me',type:{id:3,name:'Pix'}},transactions:[],bills:[]},
   {id:9952,installment:2,installments:1,expiry_at:'2026-11-02 09:00:00',total:'360.00',payment_total:'0.00',payment_at:null,discount:'0.00',increase:'0.00',method:{name:'Cartão de Crédito',type:{id:1,name:'Cartão de Crédito'}},transactions:[],bills:[]}
  ],
  statuses:[
   {id:42001,status:'order_created',created_at:'2026-10-23 14:33:09',updated_at:'2026-10-23 14:33:09'},
   {id:42002,status:'waiting_payment',created_at:'2026-10-23 14:33:10',updated_at:'2026-10-23 14:33:10'},
   {id:42003,status:'payment_confirmed',created_at:'2026-10-23 14:34:00',updated_at:'2026-10-23 14:34:00'},
   {id:42004,status:'session_schedule',created_at:'2026-10-23 14:35:00',updated_at:'2026-10-23 14:35:00'}
  ],
  participants:[
   {id:3201,name:'João Miguel Sintetico',birth:'2024-04-30',relation:{id:1,name:'Filho (a)'}}
  ],
  summary:{total:480,received:120,remaining:360}
 };
 const order5061={
  id:5061,
  uuid:'55555555-5061-4061-8061-000000005061',
  status:{id:12,key:'order_completed',name:'Pedido Concluído'},
  customer:cust,
  created_at:'2025-09-30 10:56:45',
  schedule_1:'2025-11-02 09:00:00',
  participants_completed_at:'2025-10-01 12:30:00',
  participants_completed_source:'customer_portal',
  items:[
   {id:8535,quantity:'1.000',amount:'480.00',discount:'0.00',total:'480.00',entry:'120.00',product:{name:'Experiência Então é Natal',slug:'natal',reference:'enatal',bundle:'Y'}},
   {id:8536,quantity:'1.000',amount:'65.00',discount:'65.00',total:'0.00',entry:'0.00',product:{name:'Globo de Neve personalizado',slug:'globo-neve',reference:'globo',bundle:'N'}},
   {id:8537,quantity:'1.000',amount:'45.00',discount:'45.00',total:'0.00',entry:'0.00',product:{name:'Calendário de mesa 2027',slug:'calendario',reference:'cal27',bundle:'N'}},
   {id:8538,quantity:'1.000',amount:'35.00',discount:'35.00',total:'0.00',entry:'0.00',product:{name:'Chaveiro acrílico personalizado',slug:'chaveiro',reference:'chav',bundle:'N'}},
   {id:8539,quantity:'3.000',amount:'25.00',discount:'75.00',total:'0.00',entry:'0.00',product:{name:'Foto Extra Digital',slug:'foto-extra-digital',reference:'fextd',bundle:'N'}}
  ],
  bonuses:[
   {uuid:'b-01',order_item_id:8536,source:'automatic_rule',status:'active',applied_at:'2025-09-30 10:56:46',rule_snapshot:JSON.stringify({benefit_key:'brinde-prevenda-globo-neve',campaign_slug:'natal-2025',discount_policy:'full_item_discount'})},
   {uuid:'b-02',order_item_id:8537,source:'automatic_rule',status:'active',applied_at:'2025-09-30 10:56:46',rule_snapshot:JSON.stringify({benefit_key:'brinde-prevenda-calendario',campaign_slug:'natal-2025',discount_policy:'full_item_discount'})},
   {uuid:'b-03',order_item_id:8538,source:'automatic_rule',status:'active',applied_at:'2025-09-30 10:56:46',rule_snapshot:JSON.stringify({benefit_key:'brinde-prevenda-chaveiro',campaign_slug:'natal-2025',discount_policy:'full_item_discount'})},
   {uuid:'b-04',order_item_id:8539,source:'automatic_rule',status:'active',applied_at:'2025-09-30 10:56:46',rule_snapshot:JSON.stringify({benefit_key:'fotos-extras-faixa-3',campaign_slug:'natal-2025',discount_policy:'full_item_discount'})}
  ],
  installments:[
   {id:9901,installment:1,installments:1,expiry_at:'2025-09-30 23:59:59',total:'480.00',payment_total:'480.00',payment_at:'2025-09-30 11:02:00',discount:'0.00',increase:'0.00',method:{name:'Pix - Pagar.me',type:{id:3,name:'Pix'}},transactions:[],bills:[]}
  ],
  statuses:[
   {id:41001,status:'order_created',created_at:'2025-09-30 10:56:45',updated_at:'2025-09-30 10:56:45'},
   {id:41002,status:'order_completed',created_at:'2025-11-20 18:00:00',updated_at:'2025-11-20 18:00:00'}
  ],
  participants:[
   {id:3101,name:'João Miguel Sintetico',birth:'2024-04-30',relation:{id:1,name:'Filho (a)'}}
  ],
  summary:{total:480,received:480,remaining:0}
 };
 const order3477={
  id:3477,
  uuid:'34773477-3477-4477-8477-000000003477',
  status:{id:12,key:'order_completed',name:'Pedido Concluído'},
  customer:cust,
  created_at:'2024-10-15 10:00:00',
  schedule_1:'2024-11-20 10:00:00',
  participants_completed_at:'2024-10-16 10:00:00',
  items:[
   {id:7101,quantity:'1.000',amount:'390.00',discount:'0.00',total:'390.00',entry:'120.00',product:{name:'Experiência Então é Natal',slug:'natal-2024',reference:'enatal24',bundle:'Y'}}
  ],
  bonuses:[],
  installments:[
   {id:8101,installment:1,installments:1,expiry_at:'2024-10-15 23:59:59',total:'390.00',payment_total:'390.00',payment_at:'2024-10-15 10:05:00',discount:'0.00',increase:'0.00',method:{name:'Pix - Pagar.me',type:{id:3,name:'Pix'}},transactions:[],bills:[]}
  ],
  statuses:[
   {id:31001,status:'order_created',created_at:'2024-10-15 10:00:00',updated_at:'2024-10-15 10:00:00'},
   {id:31002,status:'order_completed',created_at:'2024-12-01 18:00:00',updated_at:'2024-12-01 18:00:00'}
  ],
  participants:[
   {id:2101,name:'João Miguel Sintetico',birth:'2024-04-30',relation:{id:1,name:'Filho (a)'}}
  ],
  summary:{total:390,received:390,remaining:0}
 };
 return [order5127,order5061,order3477];
};

const SYNTH_NATAL_STATS=({cutoff='10-25',detailLevel='resumo',sections=[]}={})=>({
 source:'CRM_CANONICAL_NATAL_STATISTICS',
 reference_year:2026,
 cutoff_mmdd:cutoff,
 detail_level:detailLevel,
 sections_loaded:sections.length?sections:['resumo','historico'],
 kpis_2026:{
  valid_orders:101,
  unique_customers:100,
  new_customers:30,
  recurring_customers:70,
  scheduled_sessions:91,
  confirmed_realized_sessions:23,
  past_scheduled_sessions:27,
  past_scheduled_pending_confirmation:4,
  contracted_revenue_cents:5477600,
  contracted_revenue_reais:54776,
  received_revenue_cents:2690100,
  received_revenue_reais:26901,
  open_receivable_cents:2787500,
  open_receivable_reais:27875
 },
 goal_cockpit_2026:{
  base_packages_goal_cents:30000000,
  base_packages_goal_reais:300000,
  expanded_revenue_goal_cents:40000000,
  expanded_revenue_goal_reais:400000,
  contracts_goal_count:500
 },
 ytd_comparison_at_cutoff:{
  '2026':{year:2026,accum_orders:101,full_year_valid_orders:101},
  '2025':{year:2025,accum_orders:142,full_year_valid_orders:375,diff_orders_2026_vs_year:-41},
  '2024':{year:2024,accum_orders:124,full_year_valid_orders:397,diff_orders_2026_vs_year:-23},
  '2022':{year:2022,accum_orders:98,full_year_valid_orders:374,season_end_snapshot_valid_orders:379,post_season_aborted_orders_count:5}
 },
 realized_sessions_comparison_at_cutoff:{
  '2026':{year:2026,confirmed_realized_sessions:23,past_scheduled_sessions:27,past_scheduled_pending_confirmation:4},
  '2025':{year:2025,confirmed_realized_sessions:30,past_scheduled_sessions:30,past_scheduled_pending_confirmation:0}
 },
 annual_evolution_full_season:{
  '2022':{orders:374},
  '2024':{orders:397},
  '2025':{orders:375}
 },
 packages_matrix_by_year:{
  '2024':{
   distinct_valid_orders:397,
   package_order_occurrences_sum:398,
   total_bundle_units:399,
   multi_package_orders_count:1,
   multi_unit_bundle_orders_count:2
  }
 },
 historical_reconciliation_invariants:{
  all_years_distinct_orders_consistent:true,
  reconciliation_2022:{consolidated_valid_orders:374,season_end_2022_12_31_snapshot:379,post_season_aborted_in_2023:5},
  reconciliation_2024:{distinct_valid_orders:397,package_order_occurrences_sum:398,total_bundle_units:399}
 },
 sections:Object.fromEntries(sections.map(s=>[s,{loaded:true}]))
});

const SYNTH_PARTICIPANTS_STATS=({includeAnomalies=true}={})=>({
 source:'CRM_CANONICAL_NATAL_PARTICIPANTS_ANALYTICS',
 year_scope:'2026',
 population_reconciliation:{
  valid_natal_orders_count:101,
  sessions_with_participants_count:93,
  valid_orders_without_participants_count:8,
  total_participants_count:326,
  children_0_17_count:134,
  adults_18_plus_count:186,
  pets_count:1,
  humans_without_birth_date_count:5,
  reconciled_sum:326,
  reconciled:true
 },
 age_distribution:{
  key_child_rollups:{
   babies_under_1_year_0_to_11m_count:21,
   children_under_3_years_incomplete_0_to_2y_count:55,
   children_up_to_3_years_complete_0_to_3y_count:70,
   all_children_0_to_17y_count:134,
   adults_18_plus_count:186
  },
  gender_distribution:{available:false,unavailable_reason:'photo_participants_has_no_gender_column_never_inferred_by_name'}
 },
 kinship_distribution:[
  {kinship:'Filho (a)',count:138,pct_of_participants:42.3},
  {kinship:'Mãe',count:90,pct_of_participants:27.6},
  {kinship:'Pai',count:72,pct_of_participants:22.1},
  {kinship:'Pet',count:1,pct_of_participants:0.3}
 ],
 family_children_composition:{
  sessions_evaluated_with_participants:93,
  by_children_age_0_17:{'0_children':6,'1_child':50,'2_children':30,'3_or_more_children':7,two_or_more_children_families_count:37}
 },
 packages_by_child_age_profile:[
  {package_name:'Experiência Então é Natal',orders_with_participants:60,families_with_baby_under_1y:14,families_with_child_under_3y:36}
 ],
 historical_2024_2026:{summary_by_year:{'2024':{participants:1210},'2025':{participants:1180},'2026':{participants:326}}},
 data_quality_anomalies:includeAnomalies?{
  parent_or_adult_kinship_with_child_age_count:1,
  parent_or_adult_kinship_with_child_age:[{order_id:5001,participant_id:2935,participant_name:'Sofia Exemplo Invertida',kinship:'Mãe',birth_date:'2024-06-15',age_years_at_session:2}],
  cross_order_birth_date_discrepancies_count:1,
  missing_or_invalid_birth_date_count:5
 }:null
});

const clock=Date.now();
const env1=data=>JSON.stringify({schema_version:'1.0',generated_at:new Date(clock).toISOString(),data});

before(async()=>{
 crm=createServer((req,res)=>{
  const u=new URL(req.url,'http://x'),auth=req.headers.authorization||'',tok=auth.replace(/^Bearer /,'');
  const send=(s,b)=>res.writeHead(s,{'Content-Type':'application/json'}).end(JSON.stringify(b));

  // Public storage avatar endpoints (HEAD + Range GET)
  if(u.pathname.startsWith('/storage/customers/avatars/')){
   if(u.pathname.endsWith('/bbbbbbbb-2222-valid.webp')){
    if(req.method==='HEAD'){
     res.writeHead(200,{'Content-Type':'image/webp','Content-Length':String(SYNTH_WEBP_BYTES.length)});
     return res.end();
    }
    res.writeHead(206,{'Content-Type':'image/webp','Content-Length':String(SYNTH_WEBP_BYTES.length),'Content-Range':`bytes 0-${SYNTH_WEBP_BYTES.length-1}/${SYNTH_WEBP_BYTES.length}`});
    return res.end(SYNTH_WEBP_BYTES);
   }
   if(u.pathname.endsWith('/missing-404.webp'))return res.writeHead(404,{'Content-Type':'text/plain'}).end('Not Found');
   if(u.pathname.endsWith('/forbidden-403.webp'))return res.writeHead(403,{'Content-Type':'text/plain'}).end('Forbidden');
   if(u.pathname.endsWith('/corrupt-html.webp'))return res.writeHead(200,{'Content-Type':'image/webp','Content-Length':'24'}).end('<html>not an image</html>');
   if(u.pathname.endsWith('/redirect-302.webp'))return res.writeHead(302,{Location:'https://evil.example/steal.webp'}).end();
  }

  if(u.pathname==='/health/live')return send(200,{status:'ok'});
  if(u.pathname.startsWith('/api/v1/extension/')){
   if(tok!==OP_TOKEN)return send(401,{message:'Unauthenticated.'});
   if(u.pathname==='/api/v1/extension/bootstrap')
    return res.writeHead(200,{'Content-Type':'application/json'}).end(env1({operator:{id:7,name:'Operadora Auditoria'},server:{timezone:'America/Sao_Paulo',api_version:'1.0',minimum_extension_version:'1.0.0'},features:{proposals:{enabled:true},natal_2026:{enabled:true,reference_year:2026}},token:{abilities:['extension:bootstrap','extension:customer-read','extension:proposal-read','extension:proposal-write'],expires_at:'2099-01-01T00:00:00Z'}}));
   if(u.pathname==='/api/v1/extension/customer-context'){
    const ph=u.searchParams.get('phone')||'';
    if(ph.endsWith('0503'))return send(503,{message:'Upstream unavailable'});
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
  const allOrders=[...makeAvatarOrders(),ORDER_5001_ANOMALY_SYNTH,ORDER_4510_SYNTH,ORDER_3369_SYNTH];
  const allCustomers=[CUST_ZERO_ORDER_LEAD,makeCustAvatar(),CUST_FAMILY,CUST_AMBIGUOUS_1,CUST_AMBIGUOUS_2];

  if(u.pathname==='/api/reports/natal-statistics'){
   const secStr=u.searchParams.get('sections')||'';
   return send(200,SYNTH_NATAL_STATS({
    cutoff:u.searchParams.get('date')||'10-25',
    detailLevel:u.searchParams.get('detail_level')||'resumo',
    sections:secStr?secStr.split(','):[]
   }));
  }
  if(u.pathname==='/api/reports/natal-participants-statistics'){
   return send(200,SYNTH_PARTICIPANTS_STATS({includeAnomalies:u.searchParams.get('include_anomalies')!=='false'}));
  }
  if(u.pathname==='/api/orders/search'){
   let rows=[...allOrders];
   const idQ=u.searchParams.get('order[id]');
   if(idQ)rows=rows.filter(o=>String(o.id)===idQ);
   const nameQ=u.searchParams.get('customer[name]');
   if(nameQ)rows=rows.filter(o=>o.customer.name.toLowerCase().includes(nameQ.toLowerCase()));
   return send(200,{data:rows,meta:{total:idQ||nameQ?rows.length:5054}});
  }
  const detMatch=/^\/api\/orders\/([^/]+)\/detail$/.exec(u.pathname);
  if(detMatch){
   const found=allOrders.find(o=>o.uuid===detMatch[1]);
   return found?send(200,{data:found}):send(404,{error:'not_found'});
  }
  if(u.pathname==='/api/customers/search'){
   const q=(u.searchParams.get('busca')||u.searchParams.get('nome_cliente')||'').toLowerCase();
   const zeroOnly=u.searchParams.get('somente_sem_pedidos')==='true';
   let rows=[...allCustomers];
   if(q)rows=rows.filter(c=>c.name.toLowerCase().includes(q)||(c.email||'').toLowerCase().includes(q)||(c.document||'').includes(q));
   if(zeroOnly)rows=rows.filter(c=>(c.orders_count??1)===0);
   return send(200,{data:rows,meta:{total:rows.length}});
  }
  if(u.pathname==='/api/customers/forensic-360'){
   const nameQ=(u.searchParams.get('nome_cliente')||'').toLowerCase();
   const uuidQ=u.searchParams.get('customer_uuid')||'';
   const docQ=(u.searchParams.get('documento')||'').replace(/\D/g,'');
   const phQ=(u.searchParams.get('telefone')||'').replace(/\D/g,'');
   if(phQ.endsWith('0503'))return send(503,{message:'Upstream unavailable'});
   const matches=allCustomers.filter(c=>
    (uuidQ&&c.uuid===uuidQ)||
    (docQ&&c.document===docQ)||
    (phQ&&c.whatsapp.endsWith(phQ.slice(-8)))||
    (nameQ&&c.name.toLowerCase().includes(nameQ))
   );
   if(matches.length===0)return send(200,{lookup:{status:'not_found',match_count:0},customer:null,orders:[]});
   if(matches.length>1){
    return send(200,{
     lookup:{
      status:'ambiguous',
      match_count:matches.length,
      candidates:matches.map(m=>({uuid:m.uuid,name:m.name,orders_count:m.orders_count??0}))
     },
     customer:null,
     orders:[]
    });
   }
   const cust=matches[0];
   const custOrders=allOrders.filter(o=>o.customer.uuid===cust.uuid);
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

test('Scenario 1 — Permuta vs Dinheiro, canonical cents + reais, installments/bills/transactions, 10 status events and participant edit lock',async()=>{
 const projected=forensicOrderProjection(ORDER_4510_SYNTH,{includeParticipants:true,fullProfile:true,todayYmd:'2026-10-25'});
 assert.deepEqual(projected.payment_methods,['Permuta']);
 assert.equal(projected.total_cents,45000);
 assert.equal(projected.received_cents,45000);
 assert.equal(projected.remaining_cents,0);
 assert.deepEqual(projected.payment_summary.effective_paid_methods,['Permuta']);
 assert.deepEqual(projected.payment_summary.effective_paid_by_method_reais,{Permuta:450});
 assert.deepEqual(projected.payment_summary.effective_paid_by_method_cents,{Permuta:45000});
 assert.deepEqual(projected.payment_summary.paid_method_categories,['Dinheiro']);
 assert.equal(projected.payment_summary.payment_needs_review,false);
 assert.equal(projected.installments.length,2);
 assert.equal(projected.installments[0].total_cents,12000);
 assert.equal(projected.installments[0].total_reais,120);
 assert.equal(projected.installments[0].method_name,'Permuta');
 assert.equal(projected.installments[0].method_category_label,'Dinheiro');
 assert.equal(projected.installments[0].bills[0].paid_cents,12000);
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
 assert.equal(projected.participants_registration.customer_can_edit_now,false);
 assert.equal(projected.participants_registration.edit_lock_reason,'order_finalized_or_reversed');
 assert.equal(projected.participants_registration.count,4);
 assert.equal(projected.crm_customer_url,`https://evydencia.com/gestao/clientes/${CUST_FAMILY.uuid}/consultar`);

 const {client}=await makeAuthorizedClient({EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 try{
  const det=await client.callTool({name:'crm_pedido_detalhe',arguments:{order_id:4510}});
  assert.equal(det.isError,undefined);
  assert.deepEqual(det.structuredContent.order.payment_summary.effective_paid_methods,['Permuta']);
  assert.equal(det.structuredContent.order.installments.length,2);
  assert.equal(det.structuredContent.order.status_history.length,10);
  assert.equal(det.structuredContent.order.participants_registration.status_label,'Cadastro pendente');
  assert.ok(det.structuredContent.order.crm_customer_url.endsWith('/consultar'));

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
  assert.ok(c360.structuredContent.customer.crm_customer_url.endsWith('/consultar'));
  assert.equal(c360.structuredContent.participants_cross_order_audit.has_discrepancies,true);
  assert.equal(c360.structuredContent.participants_cross_order_audit.birth_date_discrepancies[0].difference_years_approx,10);
  assert.equal(c360.structuredContent.participants_cross_order_audit.kinship_age_anomalies_count,1,'detects #5001 Mãe with child birth date across family orders');
  assert.deepEqual(c360.structuredContent.financial_audit_summary.received_by_effective_method_reais,{Permuta:450,'Pix - Pagar.me':870});
 }finally{await client.close()}
});

test('Scenario 3 — Products & bonuses: proven campaign_bonus (order_bonus_applications) vs untracked R$ 0 item',async()=>{
 const {client}=await makeAuthorizedClient({EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 try{
  const d5061=await client.callTool({name:'crm_pedido_detalhe',arguments:{uuid:'55555555-5061-4061-8061-000000005061'}});
  const items5061=d5061.structuredContent.order.items;
  assert.equal(items5061.length,5);
  assert.equal(items5061[0].is_bundle,true);
  assert.equal(items5061[0].bonus_classification.classification,'package_bundle');
  const bonusItems=items5061.slice(1);
  assert.equal(bonusItems.length,4);
  assert.ok(bonusItems.every(i=>i.net_total_cents===0&&i.discount_cents>0&&i.bonus_classification.proven===true&&i.bonus_classification.origin==='automatic_rule'));
  assert.deepEqual(bonusItems.map(i=>i.bonus_classification.benefit_key),[
   'brinde-prevenda-globo-neve',
   'brinde-prevenda-calendario',
   'brinde-prevenda-chaveiro',
   'fotos-extras-faixa-3'
  ]);

  const d3369=await client.callTool({name:'crm_pedido_detalhe',arguments:{uuid:ORDER_3369_SYNTH.uuid}});
  const zeroLegacy=d3369.structuredContent.order.items[1];
  assert.equal(zeroLegacy.gross_amount_cents,5700);
  assert.equal(zeroLegacy.discount_cents,5700);
  assert.equal(zeroLegacy.net_total_cents,0);
  assert.equal(zeroLegacy.bonus_classification.proven,false);
  assert.equal(zeroLegacy.bonus_classification.origin,'unknown');
 }finally{await client.close()}
});

test('Scenario 4 — #5127 parity: 3-order Customer 360, real SSRF-safe WebP HTTP probe, Google Calendar sync and explicit personalization',async()=>{
 assert.equal(customerInitials('Bruna Sintetica Lead'),'BL');
 const custAvatar=makeCustAvatar();
 const withPhoto=forensicCustomerProjection({...custAvatar,avatar_path:'customers/avatars/internal-secret.webp'},{fullProfile:true});
 assert.equal(withPhoto.avatar.has_avatar,true);
 assert.equal(withPhoto.avatar.initials,'LA');
 assert.ok(withPhoto.crm_customer_url.endsWith('/consultar'));
 assert.ok(!JSON.stringify(withPhoto).includes('internal-secret.webp'));

 const {client}=await makeAuthorizedClient({EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 try{
  const d5127=await client.callTool({name:'crm_pedido_detalhe',arguments:{order_id:5127}});
  assert.equal(d5127.isError,undefined);
  const ord=d5127.structuredContent.order;
  assert.equal(ord.total_cents,48000);
  assert.equal(ord.received_cents,12000);
  assert.equal(ord.remaining_cents,36000);
  assert.equal(ord.status_history_count,4);
  assert.equal(ord.customer.avatar.has_avatar,true);
  assert.equal(ord.customer.avatar.asset_accessible,true);
  assert.equal(ord.customer.avatar.asset_check_status,'validated');
  assert.equal(ord.customer.avatar.asset_probe.webp_magic_valid,true);
  assert.equal(ord.customer_avatar_accessible,true);
  assert.equal(ord.customer_avatar_check_status,'validated');
  assert.equal(ord.schedule_details.google_calendar.order_session.is_synced,true);
  assert.equal(ord.schedule_details.google_calendar.schedule_change_history.length,1);
  assert.equal(ord.personalization.observation_public,'Cliente pediu pontualidade');
  assert.equal(ord.personalization.internal_note,'Observação interna de teste');
  assert.equal(ord.personalization.santa_audio.available,false);
  assert.equal(typeof ord.personalization.santa_audio.unavailable_reason,'string');

  const c360=await client.callTool({name:'crm_cliente_360',arguments:{customer_uuid:custAvatar.uuid}});
  assert.equal(c360.structuredContent.orders.length,3,'3 historical orders linked to the same customer record');
  assert.equal(c360.structuredContent.customer.avatar.asset_check_status,'validated');
 }finally{await client.close()}
});

test('Scenario 5 — Zero-order lead lookup by name + full holder profile + incomplete card registration diagnostics',async()=>{
 const {client}=await makeAuthorizedClient({EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 try{
  const list=await client.callTool({name:'crm_clientes_buscar',arguments:{nome_cliente:'Bruna Sintetica',somente_sem_pedidos:true,verificar_avatar_http:true}});
  assert.equal(list.isError,undefined);
  assert.equal(list.structuredContent.customers.length,1);
  const c=list.structuredContent.customers[0];
  assert.equal(c.orders_count,0);
  assert.equal(c.lifecycle_stage,'lead');
  assert.equal(c.email,'bruna.lead@example.test');
  assert.equal(c.document,'33344455566');
  assert.ok(c.crm_customer_url.endsWith('/consultar'));
  assert.equal(c.avatar.has_avatar,false);
  assert.equal(c.avatar.url,null);
  assert.equal(c.avatar.asset_accessible,false);
  assert.equal(c.avatar.initials,'BL');
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
  assert.equal(ordersRes.structuredContent.orders[0].order_id,5127);
  assert.equal(ordersRes.structuredContent.orders[0].customer_has_avatar,true);
  assert.equal(ordersRes.structuredContent.orders[0].payment_summary.open_installments_count,1);
 }finally{await full.client.close()}

 const restricted=await makeAuthorizedClient({});
 try{
  const {tools}=await restricted.client.listTools();
  assert.ok(!tools.some(t=>t.name==='crm_clientes_buscar'));
  const ord=await restricted.client.callTool({name:'crm_pedido_detalhe',arguments:{uuid:'55555555-5061-4061-8061-000000005061'}});
  const dump=JSON.stringify(ord.structuredContent);
  assert.ok(!dump.includes('larissa.sintetica@example.test'));
  assert.ok(!dump.includes('22233344455'));
  assert.ok(!dump.includes('João Miguel Sintetico'));
 }finally{await restricted.client.close()}
});

test('Scenario 7 — Natal 2026 historical invariants (2022/2024), confirmed vs past scheduled sessions, payload budget and participants demographics',async()=>{
 const {client}=await makeAuthorizedClient({EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 try{
  const stats=await client.callTool({name:'crm_estatisticas_natal',arguments:{data_corte_mm_dd:'10-25'}});
  assert.equal(stats.isError,undefined);
  const wireBytes=Buffer.byteLength(JSON.stringify(stats),'utf8');
  assert.ok(wireBytes<15360,`default summary wire payload (${wireBytes} B) stays well below 15 KB`);
  const sc=stats.structuredContent;
  assert.equal(sc.kpis_2026.confirmed_realized_sessions,23);
  assert.equal(sc.kpis_2026.past_scheduled_sessions,27);
  assert.equal(sc.kpis_2026.past_scheduled_pending_confirmation,4);
  assert.equal(sc.ytd_comparison_at_cutoff['2022'].full_year_valid_orders,374);
  assert.equal(sc.ytd_comparison_at_cutoff['2022'].season_end_snapshot_valid_orders,379);
  assert.equal(sc.annual_evolution_full_season['2022'].orders,374);
  assert.equal(sc.packages_matrix_by_year['2024'].distinct_valid_orders,397);
  assert.equal(sc.packages_matrix_by_year['2024'].package_order_occurrences_sum,398);
  assert.equal(sc.packages_matrix_by_year['2024'].total_bundle_units,399);
  assert.equal(sc.historical_reconciliation_invariants.all_years_distinct_orders_consistent,true);

  const withSections=await client.callTool({
   name:'crm_estatisticas_natal',
   arguments:{secoes:['simulador_previsao','financeiro_caixa','clientes_recompra_campanhas','agenda_demanda','pacotes_produtos_bonus']}
  });
  assert.equal(withSections.isError,undefined);
  assert.equal(withSections.structuredContent.sections.financeiro_caixa.loaded,true);

  const demo=await client.callTool({name:'crm_natal_participantes_estatisticas',arguments:{ano:'2026'}});
  assert.equal(demo.isError,undefined);
  const pr=demo.structuredContent.population_reconciliation;
  assert.equal(pr.total_participants_count,326);
  assert.equal(pr.children_0_17_count+pr.adults_18_plus_count+pr.pets_count+pr.humans_without_birth_date_count,326);
  assert.equal(pr.reconciled,true);
  assert.equal(demo.structuredContent.age_distribution.key_child_rollups.children_under_3_years_incomplete_0_to_2y_count,55);
  assert.equal(demo.structuredContent.age_distribution.gender_distribution.available,false);
  assert.equal(demo.structuredContent.data_quality_anomalies.parent_or_adult_kinship_with_child_age[0].order_id,5001);
  assert.equal(demo.structuredContent.data_quality_anomalies.parent_or_adult_kinship_with_child_age[0].participant_name,'Sofia Exemplo Invertida');
  assert.equal(demo.structuredContent.data_quality_anomalies.parent_or_adult_kinship_with_child_age[0].birth_date,'2024-06-15');
 }finally{await client.close()}
});

test('Scenario 8 — All 10 mandatory negative, edge, SSRF and write-confirmation cases fail safely without leaking secrets',async()=>{
 const {client,call}=await makeAuthorizedClient({EVYD_ENABLE_OPERATOR_FULL_CRM:'1'});
 try{
  // 1. Customer not found
  const nf=await client.callTool({name:'crm_cliente_360',arguments:{nome_cliente:'Inexistente Xyz 999'}});
  assert.equal(nf.isError,undefined);
  assert.equal(nf.structuredContent.lookup.status,'not_found');
  assert.equal(nf.structuredContent.orders.length,0);

  // 2. Ambiguous customer name
  const amb=await client.callTool({name:'crm_cliente_360',arguments:{nome_cliente:'Camila Sintetica Homonima'}});
  assert.equal(amb.isError,undefined);
  assert.equal(amb.structuredContent.lookup.status,'ambiguous');
  assert.equal(amb.structuredContent.lookup.match_count,2);
  assert.equal(amb.structuredContent.orders.length,0);

  // 3. Missing avatar (no URL — metadata says no avatar, so no HTTP check needed)
  const noAv=await probeCustomerAvatarAsset({has_avatar:false,url:null,initials:'BL'},{crmBaseUrl:crmUrl});
  assert.equal(noAv.asset_accessible,false);
  assert.equal(noAv.asset_check_status,'not_checked');

  // 4. Invalid / SSRF-blocked / 404 / 403 / redirect / corrupt non-WebP avatar URLs
  const ssrfBlocked=await probeCustomerAvatarAsset({has_avatar:true,url:'https://evil.example/storage/customers/avatars/x.webp'},{crmBaseUrl:crmUrl});
  assert.equal(ssrfBlocked.asset_accessible,false);
  assert.equal(ssrfBlocked.asset_check_status,'restricted');
  const av404=await probeCustomerAvatarAsset({has_avatar:true,url:crmUrl+'/storage/customers/avatars/missing-404.webp'},{crmBaseUrl:crmUrl});
  assert.equal(av404.asset_accessible,false);
  assert.equal(av404.asset_check_status,'unavailable');
  const av403=await probeCustomerAvatarAsset({has_avatar:true,url:crmUrl+'/storage/customers/avatars/forbidden-403.webp'},{crmBaseUrl:crmUrl});
  assert.equal(av403.asset_accessible,false);
  assert.equal(av403.asset_check_status,'restricted');
  const avRedir=await probeCustomerAvatarAsset({has_avatar:true,url:crmUrl+'/storage/customers/avatars/redirect-302.webp'},{crmBaseUrl:crmUrl});
  assert.equal(avRedir.asset_accessible,false);
  assert.equal(avRedir.asset_check_status,'restricted');
  const avCorrupt=await probeCustomerAvatarAsset({has_avatar:true,url:crmUrl+'/storage/customers/avatars/corrupt-html.webp'},{crmBaseUrl:crmUrl});
  assert.equal(avCorrupt.asset_accessible,false);
  assert.equal(avCorrupt.asset_check_status,'unavailable');

  // 5. Invalid birth dates (0000-00-00 and future date) + kinship anomaly on #5001
  assert.equal(humanAgeAt('0000-00-00','2026-10-25'),null);
  assert.equal(humanAgeAt('2099-01-01','2026-10-25'),null);
  const badBirthProj=forensicOrderProjection({
   ...ORDER_5001_ANOMALY_SYNTH,
   participants:[
    {id:1,name:'Sem Data',birth:'0000-00-00',relation:{id:1,name:'Filho (a)'}},
    {id:2,name:'Data Futura',birth:'2099-05-01',relation:{id:1,name:'Filho (a)'}},
    {id:2935,name:'Sofia Exemplo Invertida',birth:'2024-06-15',relation:{id:3,name:'Mãe'}}
   ]
  },{includeParticipants:true,fullProfile:true,todayYmd:'2026-10-25'});
  assert.equal(badBirthProj.participants[0].birth_date,null);
  assert.equal(badBirthProj.participants[1].age_today,null);
  assert.equal(badBirthProj.participants_registration.kinship_age_anomalies_count,1);

  // 6. Unavailable statistic explicitly reported as available: false (never silent zero)
  const d5001=await client.callTool({name:'crm_pedido_detalhe',arguments:{order_id:5001}});
  assert.equal(d5001.structuredContent.order.personalization.santa_audio.available,false);
  assert.equal(d5001.structuredContent.order.personalization.cake.available,false);

  // 7. Unauthorized (401 without token)
  const r401=await call('/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:'{}'});
  assert.equal(r401.status,401);

  // 8. Empty paginated query
  const emptyPage=await client.callTool({name:'crm_pedidos_buscar',arguments:{pagina:99,limite:10}});
  assert.equal(emptyPage.isError,undefined);
  assert.equal(emptyPage.structuredContent.orders.length,0);
  assert.equal(emptyPage.structuredContent.pagination.returned_count,0);

  // 9. Integration 503 failure fails closed without leaking tokens
  const err503=await client.callTool({name:'crm_cliente_resumo',arguments:{telefone:'48999990503'}});
  assert.equal(err503.isError,true);
  assert.ok(!JSON.stringify(err503).includes(OP_TOKEN)&&!JSON.stringify(err503).includes(INTERNAL_TOK));

  // 10. Missing write confirmation fails closed before hitting CRM
  const noConfirm=await client.callTool({name:'crm_enviar_proposta_natal',arguments:{telefone:'48991000202',nome:'Teste'}});
  assert.equal(noConfirm.isError,true);
 }finally{await client.close()}
});
