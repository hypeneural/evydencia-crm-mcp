// Decoupled ChatGPT Web MCP Apps UI Card v2 resource & strict cent-first contract builders.
// Follows OpenAI MCP Apps / ChatGPT UI specification (`text/html;profile=mcp-app`, JSON-RPC 2.0 over postMessage):
// - Analytical & CRM data tools remain 100% pure JSON (`structuredContent` + concise text summary).
// - Only the explicit `crm_renderizar_card_visual` tool declares `_meta.ui.resourceUri` (`ui://evydencia/crm-visual-card-v2.html`).
// - `ui://evydencia/crm-visual-card-v1.html` remains registered as a rollback/compatibility fallback resource.
// - Never confuses HTTP asset reachability (`url_validated_pending_widget_load`) with actual ChatGPT DOM rendering (`image_loaded`).
// - Never coerces missing financial fields to zero (`centsOrNull`), never sums paginated order slices in place of canonical KPIs,
//   never treats `sync_enabled=false` as proof of unsynced event, and never leaks minor PII into visual widgets.
import * as z from 'zod/v4';
import {AVATAR_RENDER_STATES,buildAvatarRenderContract} from './legacy-api-read.mjs';

export const MCP_UI_CARD_RESOURCE_URI='ui://evydencia/crm-visual-card-v2.html';
export const MCP_UI_CARD_V1_FALLBACK_URI='ui://evydencia/crm-visual-card-v1.html';
export const MCP_UI_CARD_MIME_TYPE='text/html;profile=mcp-app';
export const UI_CRM_TOOL_NAMES=Object.freeze(['crm_renderizar_card_visual']);
export {AVATAR_RENDER_STATES};

const ALLOWED_CRM_ORIGIN='https://evydencia.com';
const ALLOWED_CALENDAR_ORIGINS=['https://calendar.google.com','https://www.google.com'];

export function centsOrNull(value){
 return Number.isSafeInteger(value)?value:null;
}

export function reaisFromCentsOrNull(cents){
 return Number.isSafeInteger(cents)?Math.round(cents)/100:null;
}

function centsFromCanonicalOrExplicitReais(centsValue,explicitReaisValue){
 if(Number.isSafeInteger(centsValue))return centsValue;
 if(centsValue!==undefined)return null;
 if(typeof explicitReaisValue==='number'&&Number.isFinite(explicitReaisValue)){
  const c=Math.round(explicitReaisValue*100);
  return Number.isSafeInteger(c)?c:null;
 }
 return null;
}

function intOrNull(value){
 return Number.isSafeInteger(value)?value:null;
}

function safeStr(v,max=180){
 if(typeof v!=='string')return null;
 const t=v.trim();
 return t?t.slice(0,max):null;
}

function safeHttpsUrl(v,allowedOrigins=[ALLOWED_CRM_ORIGIN]){
 if(typeof v!=='string'||!v.trim())return null;
 try{
  const u=new URL(v.trim());
  if(u.protocol!=='https:'||u.username||u.password)return null;
  if(!allowedOrigins.includes(u.origin))return null;
  return u.toString();
 }catch{
  return null;
 }
}

function formatBrlText(cents){
 if(!Number.isSafeInteger(cents))return 'Não informado';
 const reais=(cents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 return `R$ ${reais}`;
}

// ============================================================================
// SPECIFIC ZOD V4 OUTPUT SCHEMAS (Section 6)
// ============================================================================
const AvatarStateEnum=z.enum([
 'url_validated_pending_widget_load',
 'image_loaded',
 'image_blocked_or_error',
 'initials_fallback'
]);

export const AvatarRenderStateSchema=z.object({
 initial_state:AvatarStateEnum,
 allowed_states:z.array(AvatarStateEnum),
 initials:z.string(),
 avatar_url:z.string().nullable(),
 allow_img_tag:z.boolean(),
 asset_check_status:z.string(),
 chat_rendered_confirmed:z.boolean(),
 honesty_note:z.string()
});

export const InstallmentVisualRowSchema=z.object({
 sequence:z.number().int(),
 total_cents:z.number().int().nullable(),
 total_reais:z.number().nullable(),
 value_reais:z.number().nullable(),
 paid_cents:z.number().int().nullable(),
 paid_reais:z.number().nullable(),
 remaining_cents:z.number().int().nullable(),
 remaining_reais:z.number().nullable(),
 is_paid:z.boolean(),
 status:z.enum(['paid','partial','open','unknown']),
 status_label:z.string(),
 expiry_at_brt:z.string().nullable(),
 due_date_brt:z.string().nullable(),
 paid_at_brt:z.string().nullable(),
 method_name:z.string().nullable(),
 card_split_count:z.number().int().nullable()
});

export const PaymentSummarySchema=z.object({
 total_cents:z.number().int().nullable(),
 total_reais:z.number().nullable(),
 received_cents:z.number().int().nullable(),
 received_reais:z.number().nullable(),
 remaining_cents:z.number().int().nullable(),
 remaining_reais:z.number().nullable(),
 subtotal_cents:z.number().int().nullable(),
 total_discounts_cents:z.number().int().nullable(),
 coupon_code:z.string().nullable(),
 installments_count:z.number().int(),
 paid_installments_count:z.number().int(),
 partial_installments_count:z.number().int(),
 open_installments_count:z.number().int(),
 effective_paid_methods:z.array(z.string()),
 payment_needs_review:z.boolean(),
 data_status:z.enum(['complete','partial','unavailable'])
});

export const CalendarSyncStateSchema=z.object({
 state:z.enum(['synced','not_synced','sync_failed','unknown']),
 state_label:z.string(),
 available:z.boolean(),
 is_synced:z.boolean().nullable(),
 auto_sync_enabled:z.boolean().nullable(),
 html_link:z.string().nullable(),
 synced_at_label:z.string().nullable(),
 status_message:z.string().nullable(),
 schedule_change_history_count:z.number().int(),
 unavailable_reason:z.string().nullable()
});

const OrderItemVisualRowSchema=z.object({
 name:z.string(),
 quantity:z.number(),
 is_bundle:z.boolean(),
 unit_amount_cents:z.number().int().nullable(),
 discount_cents:z.number().int().nullable(),
 total_cents:z.number().int().nullable(),
 total_reais:z.number().nullable(),
 bonus_kind:z.string(),
 bonus_origin:z.string(),
 is_proven_bonus:z.boolean(),
 badge_label:z.string().nullable()
});

const StatusTimelineEntrySchema=z.object({
 event_id:z.number().int().nullable(),
 status_key:z.string(),
 status_label:z.string(),
 recorded_at_brt:z.string().nullable(),
 is_current:z.boolean()
});

const StageProgressSchema=z.object({
 current_step_index:z.number().int(),
 total_steps:z.number().int(),
 is_reversed:z.boolean(),
 steps:z.array(z.object({
  key:z.string(),
  label:z.string(),
  state:z.enum(['done','current','upcoming','reversed'])
 }))
});

export const OrderVisualCardSchema=z.object({
 schema_version:z.literal('2.0'),
 card_type:z.literal('pedido'),
 ui_resource_uri:z.string(),
 source:z.string(),
 as_of:z.string(),
 timezone:z.string(),
 data_status:z.enum(['complete','partial','unavailable']),
 scope:z.string(),
 warnings:z.array(z.string()),
 integrity_checks:z.object({
  financial_reconciled:z.boolean().nullable(),
  calendar_known:z.boolean()
 }),
 bridge_telemetry:z.record(z.string(),z.unknown()).nullable(),
 header:z.object({
  title:z.string(),
  order_id:z.number().int().nullable(),
  order_uuid:z.string().nullable(),
  status_key:z.string().nullable(),
  status_label:z.string(),
  package_name:z.string().nullable(),
  created_at_brt:z.string().nullable()
 }),
 avatar:AvatarRenderStateSchema,
 customer:z.object({
  display_name:z.string(),
  customer_uuid:z.string().nullable(),
  phone_masked:z.string().nullable(),
  city:z.string().nullable(),
  state:z.string().nullable(),
  registration_complete:z.boolean().nullable(),
  missing_field_labels:z.array(z.string())
 }),
 financial:PaymentSummarySchema,
 schedule:z.object({
  session_at_brt:z.string().nullable(),
  selection_at_brt:z.string().nullable(),
  google_calendar:CalendarSyncStateSchema
 }),
 stage_progress:StageProgressSchema,
 status_timeline:z.array(StatusTimelineEntrySchema),
 items:z.array(OrderItemVisualRowSchema),
 installments:z.array(InstallmentVisualRowSchema),
 participants_summary:z.object({
  count:z.number().int().nullable(),
  registration_status:z.string().nullable(),
  minor_pii_redacted_in_widget:z.literal(true)
 }),
 links:z.object({
  crm_order_url:z.string().nullable(),
  crm_customer_url:z.string().nullable(),
  google_calendar_url:z.string().nullable()
 })
});

const Customer360FinancialSchema=z.object({
 total_contracted_cents:z.number().int().nullable(),
 total_contracted_reais:z.number().nullable(),
 total_received_cents:z.number().int().nullable(),
 total_received_reais:z.number().nullable(),
 open_balance_cents:z.number().int().nullable(),
 open_balance_reais:z.number().nullable(),
 orders_count:z.number().int().nullable(),
 valid_orders_count:z.number().int().nullable(),
 reversed_or_aborted_orders_count:z.number().int().nullable(),
 completed_sessions_count:z.number().int().nullable(),
 years_attended:z.array(z.number().int()),
 data_status:z.enum(['complete','partial','unavailable'])
});

const Natal2026CardStatusSchema=z.object({
 purchased:z.boolean().nullable(),
 status:z.enum(['purchased','not_purchased','unverified']),
 label:z.string(),
 order_id:z.number().int().nullable(),
 order_uuid:z.string().nullable()
});

const RecentOrderRowSchema=z.object({
 order_id:z.number().int().nullable(),
 order_uuid:z.string().nullable(),
 package_name:z.string(),
 status_label:z.string(),
 total_cents:z.number().int().nullable(),
 total_reais:z.number().nullable(),
 session_at_brt:z.string().nullable(),
 crm_order_url:z.string().nullable()
});

export const Customer360VisualCardSchema=z.object({
 schema_version:z.literal('2.0'),
 card_type:z.literal('cliente_360'),
 ui_resource_uri:z.string(),
 source:z.string(),
 as_of:z.string(),
 timezone:z.string(),
 data_status:z.enum(['complete','partial','unavailable']),
 scope:z.string(),
 warnings:z.array(z.string()),
 integrity_checks:z.object({
  kpis_canonical:z.boolean(),
  natal_2026_verified:z.boolean()
 }),
 bridge_telemetry:z.record(z.string(),z.unknown()).nullable(),
 header:z.object({
  title:z.string(),
  subtitle:z.string(),
  status_label:z.string()
 }),
 avatar:AvatarRenderStateSchema,
 customer:z.object({
  display_name:z.string(),
  customer_uuid:z.string().nullable(),
  phone_masked:z.string().nullable(),
  city:z.string().nullable(),
  state:z.string().nullable(),
  lifecycle_stage:z.string().nullable(),
  registration_complete:z.boolean().nullable(),
  missing_field_labels:z.array(z.string())
 }),
 financial:Customer360FinancialSchema,
 natal_2026:Natal2026CardStatusSchema,
 last_order:RecentOrderRowSchema.nullable(),
 recent_orders:z.array(RecentOrderRowSchema),
 links:z.object({
  crm_order_url:z.string().nullable(),
  crm_customer_url:z.string().nullable()
 })
});

export const VisualCardUnionSchema=z.discriminatedUnion('card_type',[
 OrderVisualCardSchema,
 Customer360VisualCardSchema
]);

// Root `type: "object"` schema required by MCP SDK / OpenAI Connector JSON Schema validator,
// while runtime builder enforces exact discriminated `VisualCardUnionSchema`.
export const OUT_VISUAL_CARD_OBJECT_SCHEMA=z.object({
 schema_version:z.literal('2.0'),
 card_type:z.enum(['pedido','cliente_360']),
 ui_resource_uri:z.string(),
 source:z.string(),
 as_of:z.string(),
 timezone:z.string(),
 data_status:z.enum(['complete','partial','unavailable']),
 scope:z.string(),
 warnings:z.array(z.string()),
 integrity_checks:z.object({
  financial_reconciled:z.boolean().nullable().optional(),
  calendar_known:z.boolean().optional(),
  kpis_canonical:z.boolean().optional(),
  natal_2026_verified:z.boolean().optional()
 }),
 bridge_telemetry:z.record(z.string(),z.unknown()).nullable(),
 header:z.object({
  title:z.string(),
  subtitle:z.string().optional(),
  order_id:z.number().int().nullable().optional(),
  order_uuid:z.string().nullable().optional(),
  status_key:z.string().nullable().optional(),
  status_label:z.string(),
  package_name:z.string().nullable().optional(),
  created_at_brt:z.string().nullable().optional()
 }),
 avatar:AvatarRenderStateSchema,
 customer:z.object({
  display_name:z.string(),
  customer_uuid:z.string().nullable(),
  phone_masked:z.string().nullable(),
  city:z.string().nullable(),
  state:z.string().nullable(),
  lifecycle_stage:z.string().nullable().optional(),
  registration_complete:z.boolean().nullable(),
  missing_field_labels:z.array(z.string())
 }),
 financial:z.union([PaymentSummarySchema,Customer360FinancialSchema]),
 schedule:z.object({
  session_at_brt:z.string().nullable(),
  selection_at_brt:z.string().nullable(),
  google_calendar:CalendarSyncStateSchema
 }).optional(),
 stage_progress:StageProgressSchema.optional(),
 status_timeline:z.array(StatusTimelineEntrySchema).optional(),
 items:z.array(OrderItemVisualRowSchema).optional(),
 installments:z.array(InstallmentVisualRowSchema).optional(),
 participants_summary:z.object({
  count:z.number().int().nullable(),
  registration_status:z.string().nullable(),
  minor_pii_redacted_in_widget:z.literal(true)
 }).optional(),
 natal_2026:Natal2026CardStatusSchema.optional(),
 last_order:RecentOrderRowSchema.nullable().optional(),
 recent_orders:z.array(RecentOrderRowSchema).optional(),
 links:z.object({
  crm_order_url:z.string().nullable(),
  crm_customer_url:z.string().nullable(),
  google_calendar_url:z.string().nullable().optional()
 })
});

// ============================================================================
// PROJECTION HELPERS
// ============================================================================
function buildAvatarBlock(rawAvatar,fallbackInitials='EV'){
 const rc=rawAvatar?.render_contract||buildAvatarRenderContract(rawAvatar||{has_avatar:false,url:null});
 const validUrl=rc.state==='url_validated_pending_widget_load'
  ?safeHttpsUrl(rawAvatar?.url,[ALLOWED_CRM_ORIGIN,'https://pps.whatsapp.net'])
  :null;
 const initialState=(rc.state==='url_validated_pending_widget_load'&&!validUrl)
  ?'image_blocked_or_error'
  :(AVATAR_RENDER_STATES.includes(rc.state)?rc.state:'initials_fallback');
 return {
  initial_state:initialState,
  allowed_states:[...AVATAR_RENDER_STATES],
  initials:safeStr(rawAvatar?.initials,4)||fallbackInitials,
  avatar_url:validUrl,
  allow_img_tag:Boolean(validUrl&&initialState==='url_validated_pending_widget_load'),
  asset_check_status:safeStr(rawAvatar?.asset_check_status,40)||'not_checked',
  chat_rendered_confirmed:false,
  honesty_note:'HTTP 200 + WebP válido comprova apenas acessibilidade do asset na origem; somente o evento onload no iframe confirma image_loaded.'
 };
}

function buildCalendarSyncBlock(gcal){
 if(!gcal||typeof gcal!=='object'){
  return {
   state:'unknown',
   state_label:'Não verificado',
   available:false,
   is_synced:null,
   auto_sync_enabled:null,
   html_link:null,
   synced_at_label:null,
   status_message:null,
   schedule_change_history_count:0,
   unavailable_reason:'calendar_not_loaded'
  };
 }
 const histCount=Array.isArray(gcal.schedule_change_history)
  ?gcal.schedule_change_history.length
  :(intOrNull(gcal.schedule_change_history_count)??0);
 const unavailReason=safeStr(gcal.unavailable_reason,80);

 if(gcal.available!==true||!gcal.order_session||typeof gcal.order_session!=='object'){
  return {
   state:'unknown',
   state_label:'Não verificado',
   available:false,
   is_synced:null,
   auto_sync_enabled:typeof gcal.sync_enabled==='boolean'?gcal.sync_enabled:null,
   html_link:null,
   synced_at_label:null,
   status_message:null,
   schedule_change_history_count:histCount,
   unavailable_reason:unavailReason||'calendar_state_unavailable'
  };
 }

 const sess=gcal.order_session;
 const autoSyncEnabled=typeof gcal.sync_enabled==='boolean'?gcal.sync_enabled:null;
 const htmlLink=safeHttpsUrl(sess.html_link,ALLOWED_CALENDAR_ORIGINS);
 const syncedAtLabel=safeStr(sess.synced_at_label,60);
 const statusMsg=safeStr(sess.status_message,140);
 const rawSessStatus=safeStr(sess.status,40)?.toLowerCase()||null;

 // NEVER interpret sync_enabled=false as proof that the order's event is unsynced!
 // order_session.is_synced is the authoritative per-order event indicator.
 if(sess.is_synced===true){
  return {
   state:'synced',
   state_label:'Sincronizado no Google Calendar',
   available:true,
   is_synced:true,
   auto_sync_enabled:autoSyncEnabled,
   html_link:htmlLink,
   synced_at_label:syncedAtLabel,
   status_message:statusMsg,
   schedule_change_history_count:histCount,
   unavailable_reason:null
  };
 }

 if(rawSessStatus&&(rawSessStatus.includes('error')||rawSessStatus.includes('fail'))){
  return {
   state:'sync_failed',
   state_label:'Falha na sincronização',
   available:true,
   is_synced:false,
   auto_sync_enabled:autoSyncEnabled,
   html_link:htmlLink,
   synced_at_label:syncedAtLabel,
   status_message:statusMsg,
   schedule_change_history_count:histCount,
   unavailable_reason:null
  };
 }

 if(sess.is_synced===false){
  return {
   state:'not_synced',
   state_label:'Não sincronizado no Google Calendar',
   available:true,
   is_synced:false,
   auto_sync_enabled:autoSyncEnabled,
   html_link:htmlLink,
   synced_at_label:syncedAtLabel,
   status_message:statusMsg,
   schedule_change_history_count:histCount,
   unavailable_reason:null
  };
 }

 return {
  state:'unknown',
  state_label:'Não verificado',
  available:true,
  is_synced:null,
  auto_sync_enabled:autoSyncEnabled,
  html_link:htmlLink,
  synced_at_label:syncedAtLabel,
  status_message:statusMsg,
  schedule_change_history_count:histCount,
  unavailable_reason:'session_sync_flag_missing'
 };
}

function buildInstallmentRow(inst,idx){
 const seq=intOrNull(inst?.sequence)??intOrNull(inst?.installment)??(idx+1);
 const totalCents=centsFromCanonicalOrExplicitReais(inst?.total_cents,inst?.total_reais??inst?.value_reais);
 const rawPaidCents=centsFromCanonicalOrExplicitReais(inst?.paid_cents,inst?.paid_reais??inst?.paid_value_reais??inst?.payment_total_reais);
 const paidAtBrt=safeStr(inst?.paid_at_brt??inst?.payment_at_brt??inst?.payment_at,40);
 const expiryAtBrt=safeStr(inst?.expiry_at_brt??inst?.due_date_brt??inst?.expiry_at,40);
 const methodName=safeStr(inst?.method_name??inst?.payment_method??inst?.method?.name,60);
 const cardSplitCount=intOrNull(inst?.card_split_count);

 const isConfirmedPaid=Boolean(inst?.is_paid)||(paidAtBrt!==null&&rawPaidCents!==null&&rawPaidCents>0);
 const paidCents=rawPaidCents!==null?rawPaidCents:(isConfirmedPaid&&totalCents!==null?totalCents:(totalCents!==null?0:null));

 let status='unknown';
 let statusLabel='Não informado';
 let remainingCents=null;

 if(totalCents!==null){
  const effectivePaid=paidCents??0;
  if(isConfirmedPaid&&(effectivePaid>=totalCents||effectivePaid>0&&inst?.is_paid===true&&effectivePaid===totalCents)){
   status='paid';
   statusLabel='Paga';
   remainingCents=0;
  }else if(effectivePaid>0&&effectivePaid<totalCents){
   status='partial';
   statusLabel='Parcial';
   remainingCents=Math.max(0,totalCents-effectivePaid);
  }else if(isConfirmedPaid&&effectivePaid>0){
   status='paid';
   statusLabel='Paga';
   remainingCents=Math.max(0,totalCents-effectivePaid);
  }else{
   status='open';
   statusLabel='Em aberto';
   remainingCents=Math.max(0,totalCents-effectivePaid);
  }
 }

 return {
  sequence:seq,
  total_cents:totalCents,
  total_reais:reaisFromCentsOrNull(totalCents),
  value_reais:reaisFromCentsOrNull(totalCents),
  paid_cents:paidCents,
  paid_reais:reaisFromCentsOrNull(paidCents),
  remaining_cents:remainingCents,
  remaining_reais:reaisFromCentsOrNull(remainingCents),
  is_paid:status==='paid',
  status,
  status_label:statusLabel,
  expiry_at_brt:expiryAtBrt,
  due_date_brt:expiryAtBrt,
  paid_at_brt:paidAtBrt,
  method_name:methodName,
  card_split_count:cardSplitCount
 };
}

function buildItemRow(it){
 const name=safeStr(it?.product_name??it?.name,90)||'Item';
 const qtyRaw=typeof it?.quantity==='number'&&Number.isFinite(it.quantity)?it.quantity:Number(it?.quantity);
 const quantity=Number.isFinite(qtyRaw)&&qtyRaw>0?qtyRaw:1;
 const isBundle=Boolean(it?.is_bundle);
 const unitCents=centsFromCanonicalOrExplicitReais(it?.unit_amount_cents,it?.unit_amount_reais);
 const discountCents=centsFromCanonicalOrExplicitReais(it?.discount_cents,it?.discount_reais);
 const totalCents=centsFromCanonicalOrExplicitReais(
  it?.net_total_cents??it?.total_cents,
  it?.net_total_reais??it?.total_reais??it?.total
 );

 const bc=it?.bonus_classification&&typeof it.bonus_classification==='object'?it.bonus_classification:null;
 const bonusKind=safeStr(bc?.classification,50)||(isBundle?'package_bundle':(totalCents===0?'zero_net_untracked':'regular_paid_item'));
 const bonusOrigin=safeStr(bc?.origin,50)||'unknown';
 const isProvenBonus=Boolean(
  bc?.proven===true&&(bonusKind==='campaign_bonus'||bonusKind==='manual_bonus_override')
 );

 let badgeLabel=null;
 if(isBundle){
  badgeLabel='Pacote';
 }else if(bonusKind==='campaign_bonus'&&bc?.proven===true){
  badgeLabel='Bônus de campanha comprovado';
 }else if(bonusKind==='manual_bonus_override'&&bc?.proven===true){
  badgeLabel='Cortesia / bônus manual registrado';
 }else if(bonusKind==='zero_net_untracked'||(totalCents===0&&!isProvenBonus)){
  badgeLabel='Valor R$ 0 (origem não comprovada)';
 }else if(discountCents!==null&&discountCents>0){
  badgeLabel='Com desconto';
 }

 return {
  name,
  quantity,
  is_bundle:isBundle,
  unit_amount_cents:unitCents,
  discount_cents:discountCents,
  total_cents:totalCents,
  total_reais:reaisFromCentsOrNull(totalCents),
  bonus_kind:bonusKind,
  bonus_origin:bonusOrigin,
  is_proven_bonus:isProvenBonus,
  badge_label:badgeLabel
 };
}

const CANONICAL_STAGE_DEFS=[
 {key:'payment_confirmed',label:'Pagamento',rank:1},
 {key:'session_schedule',label:'Agendamento',rank:2},
 {key:'session_schedule_confirmed',label:'Sessão',rank:3},
 {key:'selection_schedule',label:'Seleção',rank:4},
 {key:'waiting_product_retrieve',label:'Entrega',rank:5},
 {key:'order_completed',label:'Concluído',rank:6}
];

const STATUS_KEY_TO_RANK={
 order_created:0,
 waiting_payment:0,
 payment_confirmed:1,
 session_schedule:2,
 session_scheduled:2,
 session_schedule_confirmed:3,
 selection_schedule:4,
 selection_schedule_confirmed:4,
 waiting_product_retrieve:5,
 product_retrieve_confirmed:6,
 order_completed:6
};

function buildStageProgress(statusKey){
 const key=safeStr(statusKey,50)||'';
 const isReversed=['order_aborted','payment_chargeback','payment_refunded'].includes(key);
 const rank=STATUS_KEY_TO_RANK[key]??0;
 const steps=CANONICAL_STAGE_DEFS.map((st,i)=>{
  let state='upcoming';
  if(isReversed){
   state='reversed';
  }else if(st.rank<rank||key==='order_completed'){
   state='done';
  }else if(st.rank===rank||(rank===0&&i===0)){
   state='current';
  }
  return {key:st.key,label:st.label,state};
 });
 return {
  current_step_index:isReversed?-1:Math.max(0,rank-1),
  total_steps:CANONICAL_STAGE_DEFS.length,
  is_reversed:isReversed,
  steps
 };
}

function buildStatusTimeline(rawHistory){
 if(!Array.isArray(rawHistory)||rawHistory.length===0)return [];
 // Sort strictly by real chronological timestamp (then event_id); NEVER invent events or timestamps.
 const indexed=rawHistory.map((ev,idx)=>({
  idx,
  event_id:intOrNull(ev?.event_id??ev?.id),
  status_key:safeStr(ev?.status_key??ev?.status,50)||'unknown',
  status_label:safeStr(ev?.status_label,80)||safeStr(ev?.status_key??ev?.status,50)||'Status registrado',
  recorded_at_brt:safeStr(ev?.recorded_at_brt??ev?.created_at_brt??ev?.created_at,40),
  is_current:Boolean(ev?.is_current)
 }));
 indexed.sort((a,b)=>{
  if(a.recorded_at_brt&&b.recorded_at_brt&&a.recorded_at_brt!==b.recorded_at_brt){
   return a.recorded_at_brt.localeCompare(b.recorded_at_brt);
  }
  if(a.event_id!==null&&b.event_id!==null&&a.event_id!==b.event_id){
   return a.event_id-b.event_id;
  }
  return a.idx-b.idx;
 });
 return indexed.slice(0,20).map(({event_id,status_key,status_label,recorded_at_brt,is_current})=>({
  event_id,
  status_key,
  status_label,
  recorded_at_brt,
  is_current
 }));
}

function buildNatal2026Status(rawNatal){
 if(!rawNatal||typeof rawNatal!=='object'||typeof rawNatal.purchased!=='boolean'){
  return {
   purchased:null,
   status:'unverified',
   label:'Não verificado',
   order_id:null,
   order_uuid:null
  };
 }
 if(rawNatal.purchased===true){
  return {
   purchased:true,
   status:'purchased',
   label:'Comprador Natal 2026 confirmado',
   order_id:intOrNull(rawNatal.order_id),
   order_uuid:safeStr(rawNatal.order_uuid,64)
  };
 }
 return {
  purchased:false,
  status:'not_purchased',
  label:'Sem compra Natal 2026',
  order_id:null,
  order_uuid:null
 };
}

function buildRecentOrderSummary(o){
 if(!o||typeof o!=='object')return null;
 const orderUuid=safeStr(o.order_uuid??o.uuid,64);
 const totalCents=centsFromCanonicalOrExplicitReais(
  o.total_cents??o.payment_summary?.total_cents,
  o.total_reais??o.total_amount??o.total
 );
 const fallbackUrl=orderUuid?`${ALLOWED_CRM_ORIGIN}/gestao/pedidos/${orderUuid}/detalhes`:null;
 return {
  order_id:intOrNull(o.order_id??o.id),
  order_uuid:orderUuid,
  package_name:safeStr(o.package_name??o.title,90)||'Pedido',
  status_label:safeStr(o.status_label??o.status?.label??o.status,60)||'Registrado',
  total_cents:totalCents,
  total_reais:reaisFromCentsOrNull(totalCents),
  session_at_brt:safeStr(o.session_at??o.schedule_details?.session_at_brt??o.session_date,40),
  crm_order_url:safeHttpsUrl(o.crm_order_url)||fallbackUrl
 };
}

export function buildVisualCardPayload({tipo,detailResult=null,customerResult=null}){
 const nowIso=new Date().toISOString();

 if(tipo==='pedido'){
  const ord=detailResult?.order||detailResult||{};
  const cust=ord?.customer||{};
  const fin=ord?.payment_summary||ord?.financial_summary||{};
  const avatar=buildAvatarBlock(cust?.avatar||ord?.customer_avatar,safeStr(ord?.customer_initials,4)||'EV');

  const installments=(Array.isArray(ord?.installments)?ord.installments:[]).slice(0,12).map(buildInstallmentRow);
  const items=(Array.isArray(ord?.items)?ord.items:[]).slice(0,12).map(buildItemRow);

  const totalCents=centsFromCanonicalOrExplicitReais(
   ord?.total_cents??fin?.total_cents,
   ord?.total_reais??fin?.total_reais??ord?.total
  );
  const receivedCents=centsFromCanonicalOrExplicitReais(
   ord?.received_cents??fin?.received_cents,
   ord?.received_reais??fin?.received_reais
  );
  const remainingCents=centsFromCanonicalOrExplicitReais(
   ord?.remaining_cents??fin?.remaining_cents,
   ord?.remaining_reais??fin?.remaining_reais
  );
  const subtotalCents=centsFromCanonicalOrExplicitReais(fin?.subtotal_cents,fin?.subtotal_reais);
  const totalDiscountsCents=centsFromCanonicalOrExplicitReais(fin?.total_discounts_cents,fin?.total_discounts_reais);

  const finDataStatus=(totalCents!==null&&receivedCents!==null&&remainingCents!==null)
   ?'complete'
   :((totalCents!==null||receivedCents!==null||remainingCents!==null)?'partial':'unavailable');

  const calendar=buildCalendarSyncBlock(ord?.schedule_details?.google_calendar);
  const warnings=[];
  if(finDataStatus!=='complete')warnings.push('missing_canonical_order_financial_fields');
  if(calendar.state==='unknown')warnings.push('google_calendar_sync_unverified');
  if(fin?.payment_needs_review===true)warnings.push('order_financial_needs_review');

  const orderUuid=safeStr(ord?.order_uuid??ord?.uuid,64);
  const custUuid=safeStr(cust?.uuid,64);
  const crmOrderUrl=safeHttpsUrl(ord?.crm_order_url)||(orderUuid?`${ALLOWED_CRM_ORIGIN}/gestao/pedidos/${orderUuid}/detalhes`:null);
  const crmCustomerUrl=safeHttpsUrl(ord?.crm_customer_url??cust?.crm_customer_url)||(custUuid?`${ALLOWED_CRM_ORIGIN}/gestao/clientes/${custUuid}/consultar`:null);

  const statusKey=safeStr(ord?.status_key??ord?.status?.key??ord?.current_status?.key,50);
  const statusLabel=safeStr(ord?.status_label??ord?.status?.label??ord?.current_status?.label,60)||'Registrado';
  const timeline=buildStatusTimeline(ord?.status_history);
  const partCount=intOrNull(ord?.participant_count??ord?.participants_registration?.count??ord?.participants_summary?.total_count)
   ??(Array.isArray(ord?.participants)?ord.participants.length:null);

  const paidCount=installments.filter(i=>i.status==='paid').length;
  const partialCount=installments.filter(i=>i.status==='partial').length;
  const openCount=installments.filter(i=>i.status==='open').length;
  const financialReconciled=(totalCents!==null&&receivedCents!==null&&remainingCents!==null)
   ?(totalCents===(receivedCents+remainingCents))
   :null;

  const cardDataStatus=finDataStatus==='unavailable'
   ?'unavailable'
   :(finDataStatus==='partial'||calendar.state==='unknown'?'partial':'complete');

  const card={
   schema_version:'2.0',
   card_type:'pedido',
   ui_resource_uri:MCP_UI_CARD_RESOURCE_URI,
   source:safeStr(detailResult?.source,80)||'CRM_ORDER_VISUAL_PROJECTION',
   as_of:safeStr(detailResult?.as_of,50)||nowIso,
   timezone:'America/Sao_Paulo',
   data_status:cardDataStatus,
   scope:'SINGLE_ORDER_CARD_V2',
   warnings,
   integrity_checks:{
    financial_reconciled:financialReconciled,
    calendar_known:calendar.state!=='unknown'
   },
   bridge_telemetry:detailResult?.bridge_telemetry&&typeof detailResult.bridge_telemetry==='object'?detailResult.bridge_telemetry:null,
   header:{
    title:ord?.order_id?`Pedido #${ord.order_id}`:'Pedido CRM',
    order_id:intOrNull(ord?.order_id??ord?.id),
    order_uuid:orderUuid,
    status_key:statusKey,
    status_label:statusLabel,
    package_name:safeStr(ord?.package_name,90)||items[0]?.name||null,
    created_at_brt:safeStr(ord?.created_at_brt,40)
   },
   avatar,
   customer:{
    display_name:safeStr(cust?.name??cust?.display_name??ord?.customer_name,100)||'Cliente',
    customer_uuid:custUuid,
    phone_masked:safeStr(cust?.phone_masked??ord?.customer_phone_masked,32),
    city:safeStr(cust?.address?.city??cust?.city,60),
    state:safeStr(cust?.address?.state??cust?.state,8),
    registration_complete:typeof cust?.registration_completeness?.is_complete_for_card==='boolean'
     ?cust.registration_completeness.is_complete_for_card
     :null,
    missing_field_labels:Array.isArray(cust?.registration_completeness?.missing_field_labels)
     ?cust.registration_completeness.missing_field_labels.map(x=>safeStr(x,60)).filter(Boolean)
     :[]
   },
   financial:{
    total_cents:totalCents,
    total_reais:reaisFromCentsOrNull(totalCents),
    received_cents:receivedCents,
    received_reais:reaisFromCentsOrNull(receivedCents),
    remaining_cents:remainingCents,
    remaining_reais:reaisFromCentsOrNull(remainingCents),
    subtotal_cents:subtotalCents,
    total_discounts_cents:totalDiscountsCents,
    coupon_code:safeStr(fin?.coupon_code,40),
    installments_count:intOrNull(fin?.installments_count)??installments.length,
    paid_installments_count:paidCount,
    partial_installments_count:partialCount,
    open_installments_count:openCount,
    effective_paid_methods:Array.isArray(fin?.effective_paid_methods)
     ?fin.effective_paid_methods.map(m=>safeStr(m,60)).filter(Boolean)
     :[],
    payment_needs_review:Boolean(fin?.payment_needs_review),
    data_status:finDataStatus
   },
   schedule:{
    session_at_brt:safeStr(ord?.schedule_details?.session_at_brt??ord?.session_at,40),
    selection_at_brt:safeStr(ord?.schedule_details?.selection_at_brt??ord?.selection_at,40),
    google_calendar:calendar
   },
   stage_progress:buildStageProgress(statusKey),
   status_timeline:timeline,
   items,
   installments,
   participants_summary:{
    count:partCount,
    registration_status:safeStr(ord?.participants_registration?.status_label,60),
    minor_pii_redacted_in_widget:true
   },
   links:{
    crm_order_url:crmOrderUrl,
    crm_customer_url:crmCustomerUrl,
    google_calendar_url:calendar.html_link
   }
  };
  return OrderVisualCardSchema.parse(card);
 }

 // ==========================================================================
 // CLIENTE 360 VISUAL CARD V2
 // ==========================================================================
 const cust=customerResult?.customer||{};
 const kpis=customerResult?.kpis||{};
 const avatar=buildAvatarBlock(cust?.avatar,'EV');

 // Strictly read canonical lifetime cents from `kpis`; NEVER sum paginated `orders`!
 const totalContractedCents=centsOrNull(kpis?.lifetime_contracted_valid_cents);
 const totalReceivedCents=centsOrNull(kpis?.lifetime_received_cents);
 const openBalanceCents=centsOrNull(kpis?.lifetime_remaining_valid_cents);

 const ordersCount=intOrNull(kpis?.total_orders_registered??kpis?.orders_count);
 const validOrdersCount=intOrNull(kpis?.valid_orders_count);
 const reversedCount=intOrNull(kpis?.reversed_or_aborted_orders_count);
 const completedSessionsCount=intOrNull(kpis?.completed_sessions_count);
 const yearsAttended=Array.isArray(kpis?.years_attended)
  ?kpis.years_attended.filter(y=>Number.isSafeInteger(y))
  :[];

 const finComplete=(totalContractedCents!==null&&totalReceivedCents!==null&&openBalanceCents!==null);
 const finAny=(totalContractedCents!==null||totalReceivedCents!==null||openBalanceCents!==null);
 const finDataStatus=finComplete?'complete':(finAny?'partial':'unavailable');

 const natal2026=buildNatal2026Status(customerResult?.natal_2026);
 const recentOrders=(Array.isArray(customerResult?.orders)?customerResult.orders:[])
  .slice(0,5)
  .map(buildRecentOrderSummary)
  .filter(Boolean);
 const lastOrder=customerResult?.current_order
  ?buildRecentOrderSummary(customerResult.current_order)
  :(recentOrders[0]||null);

 const custUuid=safeStr(cust?.uuid,64);
 const crmCustomerUrl=safeHttpsUrl(cust?.crm_customer_url)||(custUuid?`${ALLOWED_CRM_ORIGIN}/gestao/clientes/${custUuid}/consultar`:null);

 const warnings=[];
 if(!finComplete)warnings.push('missing_canonical_customer_360_kpis');
 if(natal2026.status==='unverified')warnings.push('natal_2026_purchase_unverified');

 const cardDataStatus=!finComplete
  ?'unavailable'
  :(natal2026.status==='unverified'?'partial':'complete');

 const lifecycle=safeStr(cust?.lifecycle_stage??kpis?.lifecycle_stage,40);

 const card={
  schema_version:'2.0',
  card_type:'cliente_360',
  ui_resource_uri:MCP_UI_CARD_RESOURCE_URI,
  source:safeStr(customerResult?.source,80)||'CRM_CUSTOMER_360_VISUAL_PROJECTION',
  as_of:safeStr(customerResult?.as_of,50)||nowIso,
  timezone:'America/Sao_Paulo',
  data_status:cardDataStatus,
  scope:'CUSTOMER_360_LIFETIME_CANONICAL_V2',
  warnings,
  integrity_checks:{
   kpis_canonical:finComplete,
   natal_2026_verified:natal2026.status!=='unverified'
  },
  bridge_telemetry:customerResult?.bridge_telemetry&&typeof customerResult.bridge_telemetry==='object'?customerResult.bridge_telemetry:null,
  header:{
   title:safeStr(cust?.name??cust?.display_name,100)||'Cliente 360',
   subtitle:ordersCount!==null?`${ordersCount} pedido(s) registrado(s)`:'Histórico de pedidos não informado',
   status_label:lifecycle||'Cliente CRM'
  },
  avatar,
  customer:{
   display_name:safeStr(cust?.name??cust?.display_name,100)||'Cliente',
   customer_uuid:custUuid,
   phone_masked:safeStr(cust?.phone_masked,32),
   city:safeStr(cust?.address?.city??cust?.city,60),
   state:safeStr(cust?.address?.state??cust?.state,8),
   lifecycle_stage:lifecycle,
   registration_complete:typeof cust?.registration_completeness?.is_complete_for_card==='boolean'
    ?cust.registration_completeness.is_complete_for_card
    :null,
   missing_field_labels:Array.isArray(cust?.registration_completeness?.missing_field_labels)
    ?cust.registration_completeness.missing_field_labels.map(x=>safeStr(x,60)).filter(Boolean)
    :[]
  },
  financial:{
   total_contracted_cents:totalContractedCents,
   total_contracted_reais:reaisFromCentsOrNull(totalContractedCents),
   total_received_cents:totalReceivedCents,
   total_received_reais:reaisFromCentsOrNull(totalReceivedCents),
   open_balance_cents:openBalanceCents,
   open_balance_reais:reaisFromCentsOrNull(openBalanceCents),
   orders_count:ordersCount,
   valid_orders_count:validOrdersCount,
   reversed_or_aborted_orders_count:reversedCount,
   completed_sessions_count:completedSessionsCount,
   years_attended:yearsAttended,
   data_status:finDataStatus
  },
  natal_2026:natal2026,
  last_order:lastOrder,
  recent_orders:recentOrders,
  links:{
   crm_order_url:lastOrder?.crm_order_url||null,
   crm_customer_url:crmCustomerUrl
  }
 };

 return Customer360VisualCardSchema.parse(card);
}

export function formatVisualCardTextFallback(card){
 if(card?.card_type==='pedido'){
  const lines=[
   `Card Visual — ${card.header?.title||'Pedido'} (${card.header?.status_label||'-'})`,
   `Titular: ${card.customer?.display_name||'-'}${card.customer?.city?` (${card.customer.city}${card.customer.state?'/'+card.customer.state:''})`:''}`,
   `Pacote: ${card.header?.package_name||'Não informado'} | Sessão: ${card.schedule?.session_at_brt||'Não agendada'} | Google Calendar: ${card.schedule?.google_calendar?.state_label||'Não verificado'}`,
   `Financeiro: Contratado ${formatBrlText(card.financial?.total_cents)} | Pago ${formatBrlText(card.financial?.received_cents)} | Em aberto ${formatBrlText(card.financial?.remaining_cents)}`,
   `Parcelas (${card.installments?.length||0}): ${(card.installments||[]).map(i=>`#${i.sequence} ${i.status_label} ${formatBrlText(i.total_cents)} (pago ${formatBrlText(i.paid_cents)})`).join('; ')||'Nenhuma'}`,
   `Avatar (estado inicial do contrato): ${card.avatar?.initial_state||'initials_fallback'}`
  ];
  if(card.links?.crm_order_url)lines.push(`Abrir pedido no CRM: ${card.links.crm_order_url}`);
  if(card.links?.crm_customer_url)lines.push(`Abrir cliente no CRM: ${card.links.crm_customer_url}`);
  return lines.join('\n');
 }

 const lines=[
  `Card Visual Cliente 360 — ${card?.customer?.display_name||'-'}`,
  `Pedidos registrados: ${card?.financial?.orders_count??'Não informado'} (válidos: ${card?.financial?.valid_orders_count??'Não informado'}) | Natal 2026: ${card?.natal_2026?.label||'Não verificado'}`,
  `Financeiro canônico: Contratado válido ${formatBrlText(card?.financial?.total_contracted_cents)} | Recebido histórico ${formatBrlText(card?.financial?.total_received_cents)} | Saldo em aberto ${formatBrlText(card?.financial?.open_balance_cents)}`,
  `Avatar (estado inicial do contrato): ${card?.avatar?.initial_state||'initials_fallback'}`
 ];
 if(card?.last_order){
  lines.push(`Último pedido: #${card.last_order.order_id??'-'} — ${card.last_order.package_name} (${card.last_order.status_label}) — ${formatBrlText(card.last_order.total_cents)}`);
 }
 if(card?.links?.crm_customer_url)lines.push(`Abrir cliente no CRM: ${card.links.crm_customer_url}`);
 return lines.join('\n');
}

export const CRM_VISUAL_CARD_HTML=`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evydência CRM — Card Visual v2</title>
<style>
:root{
 --bg:#ffffff;--surface:#f8fafc;--border:#e2e8f0;--text:#0f172a;--muted:#475569;
 --accent:#0f766e;--accent-soft:#ccfbf1;--accent-text:#115e59;
 --warn-bg:#fef3c7;--warn-text:#92400e;--danger-bg:#fee2e2;--danger-text:#991b1b;
 --neutral-bg:#f1f5f9;--neutral-text:#334155;--ok-bg:#dcfce7;--ok-text:#166534;
}
@media (prefers-color-scheme: dark){
 :root{
  --bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#f8fafc;--muted:#94a3b8;
  --accent:#14b8a6;--accent-soft:#134e4a;--accent-text:#ccfbf1;
  --warn-bg:#451a03;--warn-text:#fde68a;--danger-bg:#450a0a;--danger-text:#fecaca;
  --neutral-bg:#334155;--neutral-text:#e2e8f0;--ok-bg:#052e16;--ok-text:#bbf7d0;
 }
}
*{box-sizing:border-box}
body{margin:0;padding:10px;font:13.5px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:transparent;color:var(--text)}
.card{background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px;max-width:660px;margin:0 auto}
.top{display:flex;gap:12px;align-items:center}
.avatar{width:50px;height:50px;border-radius:50%;background:var(--accent-soft);color:var(--accent-text);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;flex-shrink:0;overflow:hidden;border:1px solid var(--border)}
.avatar img{width:100%;height:100%;object-fit:cover;display:none}
.title-wrap{min-width:0;flex:1}
.title{font-weight:700;font-size:15.5px;margin:0;overflow-wrap:anywhere}
.sub{color:var(--muted);font-size:12px;margin:2px 0 0;overflow-wrap:anywhere}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:var(--accent-soft);color:var(--accent-text)}
.badge.ok{background:var(--ok-bg);color:var(--ok-text)}
.badge.warn{background:var(--warn-bg);color:var(--warn-text)}
.badge.danger{background:var(--danger-bg);color:var(--danger-text)}
.badge.neutral{background:var(--neutral-bg);color:var(--neutral-text)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
@media (max-width:480px){.grid{grid-template-columns:1fr}}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:9px 10px}
.kpi-l{color:var(--muted);font-size:11px;display:block}
.kpi-v{font-weight:700;font-size:14px;margin-top:2px;display:block}
.sec{margin-top:12px;padding-top:10px;border-top:1px solid var(--border)}
.sec-h{font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;margin:0 0 7px}
.steps{display:flex;flex-wrap:wrap;gap:4px}
.step{flex:1;min-width:74px;text-align:center;font-size:10.5px;padding:4px 5px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--muted)}
.step.done{background:var(--ok-bg);color:var(--ok-text);border-color:transparent;font-weight:600}
.step.current{background:var(--accent-soft);color:var(--accent-text);border-color:var(--accent);font-weight:700}
.step.reversed{background:var(--danger-bg);color:var(--danger-text)}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12.5px;padding:5px 0;border-bottom:1px dashed var(--border)}
.row:last-child{border-bottom:0}
.row-main{min-width:0;flex:1}
.row-sub{display:block;font-size:11px;color:var(--muted)}
.av-state{font-size:11px;color:var(--muted);margin-top:6px}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.btn{display:inline-block;text-decoration:none;font-size:12px;font-weight:600;padding:6px 11px;border-radius:8px;background:var(--accent);color:#fff}
.btn.sec-btn{background:var(--surface);color:var(--text);border:1px solid var(--border)}
.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
</head>
<body>
<main id="root" class="card" aria-live="polite"><div class="sub">Aguardando dados estruturados do conector Evydência CRM…</div></main>
<script>
(function(){
 const root=document.getElementById('root');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const brlFromCents=c=>Number.isSafeInteger(c)?(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Não informado';
 const safeUrl=(u,origins)=>{
  if(typeof u!=='string'||!u)return null;
  try{const p=new URL(u);return p.protocol==='https:'&&origins.includes(p.origin)?p.toString():null}catch{return null}
 };

 function setAvatarState(box,caption,state){
  box.setAttribute('data-avatar-state',state);
  const labels={
   initials_fallback:'Iniciais (cliente sem foto cadastrada)',
   url_validated_pending_widget_load:'Foto validada no CRM — carregando no card…',
   image_loaded:'Foto carregada no card (onload confirmado)',
   image_blocked_or_error:'Foto indisponível/bloqueada no navegador — exibindo iniciais'
  };
  caption.textContent='Avatar: '+(labels[state]||state);
 }

 function calBadge(gcal){
  if(!gcal||gcal.state==='unknown')return '<span class="badge neutral">Calendar: Não verificado</span>';
  if(gcal.state==='synced')return '<span class="badge ok">Calendar: Sincronizado'+(gcal.synced_at_label?' ('+esc(gcal.synced_at_label)+')':'')+'</span>';
  if(gcal.state==='sync_failed')return '<span class="badge danger">Calendar: Falha de sync</span>';
  return '<span class="badge warn">Calendar: Não sincronizado</span>';
 }

 function natalBadge(n){
  if(!n||n.status==='unverified'||n.purchased===null)return '<span class="badge neutral">Natal 2026: Não verificado</span>';
  if(n.purchased===true)return '<span class="badge ok">Natal 2026: Comprador confirmado</span>';
  return '<span class="badge warn">Natal 2026: Sem compra</span>';
 }

 function render(card){
  if(!card||typeof card!=='object')return;
  const isOrder=card.card_type==='pedido';
  const av=card.avatar||{};
  const initials=esc(av.initials||'EV');
  const title=esc(card.header?.title||card.customer?.display_name||'Evydência CRM');
  const loc=[card.customer?.city,card.customer?.state].filter(Boolean).join('/');
  const subParts=[];
  if(isOrder){
   subParts.push(card.customer?.display_name||'Cliente');
   if(loc)subParts.push(loc);
   if(card.customer?.phone_masked)subParts.push(card.customer.phone_masked);
  }else{
   if(card.header?.subtitle)subParts.push(card.header.subtitle);
   if(loc)subParts.push(loc);
   if(card.customer?.phone_masked)subParts.push(card.customer.phone_masked);
  }

  let badgesHtml='<span class="badge">'+esc(card.header?.status_label||'CRM')+'</span>';
  if(isOrder){
   if(card.header?.package_name)badgesHtml+='<span class="badge neutral">'+esc(card.header.package_name)+'</span>';
   badgesHtml+=calBadge(card.schedule?.google_calendar);
  }else{
   badgesHtml+=natalBadge(card.natal_2026);
  }
  if(card.data_status==='unavailable')badgesHtml+='<span class="badge danger">Dados parciais/indisponíveis</span>';

  let kpisHtml='';
  if(isOrder){
   const f=card.financial||{};
   kpisHtml=
    '<div class="kpi"><span class="kpi-l">Contratado</span><span class="kpi-v">'+esc(brlFromCents(f.total_cents))+'</span></div>'+
    '<div class="kpi"><span class="kpi-l">Efetivamente pago</span><span class="kpi-v">'+esc(brlFromCents(f.received_cents))+'</span></div>'+
    '<div class="kpi"><span class="kpi-l">Saldo em aberto</span><span class="kpi-v">'+esc(brlFromCents(f.remaining_cents))+'</span></div>';
  }else{
   const f=card.financial||{};
   kpisHtml=
    '<div class="kpi"><span class="kpi-l">Contratado válido</span><span class="kpi-v">'+esc(brlFromCents(f.total_contracted_cents))+'</span></div>'+
    '<div class="kpi"><span class="kpi-l">Recebido histórico</span><span class="kpi-v">'+esc(brlFromCents(f.total_received_cents))+'</span></div>'+
    '<div class="kpi"><span class="kpi-l">Saldo em aberto</span><span class="kpi-v">'+esc(brlFromCents(f.open_balance_cents))+'</span></div>';
  }

  let detailsHtml='';
  if(isOrder){
   const steps=Array.isArray(card.stage_progress?.steps)?card.stage_progress.steps:[];
   if(steps.length){
    detailsHtml+='<section class="sec" aria-label="Progresso do pedido"><h2 class="sec-h">Progresso das etapas</h2><div class="steps">'+
     steps.map(s=>'<div class="step '+esc(s.state)+'">'+esc(s.label)+'</div>').join('')+
    '</div></section>';
   }

   const partCnt=card.participants_summary?.count;
   const partTxt=Number.isSafeInteger(partCnt)?String(partCnt):'Não informado';
   detailsHtml+='<section class="sec" aria-label="Agenda e participantes"><h2 class="sec-h">Sessão & Participantes</h2>'+
    '<div class="row"><span class="row-main">Data/horário da sessão</span><strong>'+esc(card.schedule?.session_at_brt||'Não agendada')+'</strong></div>'+
    '<div class="row"><span class="row-main">Participantes resumidos'+(card.participants_summary?.registration_status?' ('+esc(card.participants_summary.registration_status)+')':'')+'</span><strong>'+esc(partTxt)+'</strong></div>'+
    '</section>';

   const items=Array.isArray(card.items)?card.items:[];
   if(items.length){
    detailsHtml+='<section class="sec" aria-label="Produtos e bônus"><h2 class="sec-h">Produtos, quantidades & bônus ('+items.length+')</h2>'+
     items.map(it=>{
      const sub=[];
      if(Number.isSafeInteger(it.discount_cents)&&it.discount_cents>0)sub.push('Desconto: '+brlFromCents(it.discount_cents));
      if(it.badge_label)sub.push(it.badge_label);
      return '<div class="row"><div class="row-main">'+esc(it.quantity)+'x '+esc(it.name)+(sub.length?'<span class="row-sub">'+esc(sub.join(' • '))+'</span>':'')+'</div><strong>'+esc(brlFromCents(it.total_cents))+'</strong></div>';
     }).join('')+
    '</section>';
   }

   const insts=Array.isArray(card.installments)?card.installments:[];
   if(insts.length){
    detailsHtml+='<section class="sec" aria-label="Parcelas"><h2 class="sec-h">Parcelas ('+insts.length+')</h2>'+
     insts.map(i=>{
      const bCls=i.status==='paid'?'ok':(i.status==='partial'?'warn':'neutral');
      const meta=[];
      if(i.method_name)meta.push(i.method_name);
      if(i.expiry_at_brt)meta.push('Venc.: '+i.expiry_at_brt);
      if(i.paid_at_brt)meta.push('Pago em: '+i.paid_at_brt);
      if(Number.isSafeInteger(i.remaining_cents)&&i.remaining_cents>0)meta.push('Aberto: '+brlFromCents(i.remaining_cents));
      return '<div class="row"><div class="row-main">Parcela #'+esc(i.sequence)+' <span class="badge '+bCls+'">'+esc(i.status_label)+'</span>'+
       '<span class="row-sub">'+esc(meta.join(' • ')||'Sem detalhes adicionais')+'</span></div>'+
       '<strong>Pago '+esc(brlFromCents(i.paid_cents))+' / '+esc(brlFromCents(i.total_cents))+'</strong></div>';
     }).join('')+
    '</section>';
   }

   const tl=Array.isArray(card.status_timeline)?card.status_timeline:[];
   if(tl.length){
    detailsHtml+='<section class="sec" aria-label="Histórico real de status"><h2 class="sec-h">Linha do tempo real de status ('+tl.length+')</h2>'+
     tl.map(ev=>'<div class="row"><span class="row-main">'+esc(ev.status_label)+(ev.is_current?' <strong>(atual)</strong>':'')+'</span><span class="sub">'+esc(ev.recorded_at_brt||'Horário não registrado')+'</span></div>').join('')+
    '</section>';
   }
  }else{
   const f=card.financial||{};
   detailsHtml+='<section class="sec" aria-label="Indicadores do cliente"><h2 class="sec-h">Resumo histórico canônico</h2>'+
    '<div class="row"><span class="row-main">Pedidos válidos / total registrado</span><strong>'+esc(f.valid_orders_count??'—')+' / '+esc(f.orders_count??'Não informado')+'</strong></div>'+
    '<div class="row"><span class="row-main">Sessões concluídas</span><strong>'+esc(f.completed_sessions_count??'Não informado')+'</strong></div>'+
   '</section>';

   if(card.last_order){
    const lo=card.last_order;
    detailsHtml+='<section class="sec" aria-label="Último pedido"><h2 class="sec-h">Último pedido</h2>'+
     '<div class="row"><div class="row-main">#'+esc(lo.order_id??'—')+' — '+esc(lo.package_name)+'<span class="row-sub">'+esc(lo.status_label)+(lo.session_at_brt?' • Sessão: '+esc(lo.session_at_brt):'')+'</span></div><strong>'+esc(brlFromCents(lo.total_cents))+'</strong></div>'+
    '</section>';
   }

   const orders=Array.isArray(card.recent_orders)?card.recent_orders:[];
   if(orders.length>1){
    detailsHtml+='<section class="sec" aria-label="Pedidos recentes"><h2 class="sec-h">Amostra de pedidos recentes ('+orders.length+')</h2>'+
     orders.map(o=>'<div class="row"><span class="row-main">#'+esc(o.order_id||'-')+' '+esc(o.package_name)+' ('+esc(o.status_label)+')</span><strong>'+esc(brlFromCents(o.total_cents))+'</strong></div>').join('')+
    '</section>';
   }
  }

  const orderUrl=safeUrl(card.links?.crm_order_url,['https://evydencia.com']);
  const custUrl=safeUrl(card.links?.crm_customer_url,['https://evydencia.com']);
  const calUrl=safeUrl(card.links?.google_calendar_url,['https://calendar.google.com','https://www.google.com']);
  let linksHtml='';
  if(orderUrl||custUrl||calUrl){
   linksHtml='<nav class="actions" aria-label="Links do CRM">'+
    (orderUrl?'<a class="btn" href="'+esc(orderUrl)+'" target="_blank" rel="noopener noreferrer">Abrir pedido no CRM</a>':'')+
    (custUrl?'<a class="btn sec-btn" href="'+esc(custUrl)+'" target="_blank" rel="noopener noreferrer">Abrir cliente no CRM</a>':'')+
    (calUrl?'<a class="btn sec-btn" href="'+esc(calUrl)+'" target="_blank" rel="noopener noreferrer">Ver evento no Calendar</a>':'')+
   '</nav>';
  }

  root.innerHTML=
   '<div class="top">'+
    '<div class="avatar" id="avBox" data-avatar-state="'+esc(av.initial_state||'initials_fallback')+'">'+
     '<span id="avInit">'+initials+'</span>'+
     '<img id="avImg" alt="Foto de '+esc(card.customer?.display_name||'cliente')+'" referrerpolicy="no-referrer">'+
    '</div>'+
    '<div class="title-wrap">'+
     '<h1 class="title">'+title+'</h1>'+
     '<p class="sub">'+esc(subParts.join(' • '))+'</p>'+
     '<div class="badges">'+badgesHtml+'</div>'+
    '</div>'+
   '</div>'+
   '<div class="av-state" id="avCap"></div>'+
   '<div class="grid">'+kpisHtml+'</div>'+
   detailsHtml+linksHtml;

  const avBox=document.getElementById('avBox');
  const avInit=document.getElementById('avInit');
  const avImg=document.getElementById('avImg');
  const avCap=document.getElementById('avCap');
  const initSt=av.initial_state||'initials_fallback';
  setAvatarState(avBox,avCap,initSt);

  const imgSrc=safeUrl(av.avatar_url,['https://evydencia.com','https://pps.whatsapp.net']);
  if(av.allow_img_tag&&imgSrc&&initSt==='url_validated_pending_widget_load'){
   avImg.onload=function(){
    avInit.style.display='none';
    avImg.style.display='block';
    setAvatarState(avBox,avCap,'image_loaded');
   };
   avImg.onerror=function(){
    avImg.style.display='none';
    avInit.style.display='inline';
    setAvatarState(avBox,avCap,'image_blocked_or_error');
   };
   avImg.src=imgSrc;
  }
 }

 window.addEventListener('message',function(ev){
  const msg=ev.data;
  if(!msg||msg.jsonrpc!=='2.0')return;
  if(msg.method==='ui/notifications/tool-result'){
   const sc=msg.params?.structuredContent||msg.params?.result?.structuredContent;
   if(sc)render(sc);
  }
 });

 try{
  window.parent.postMessage({
   jsonrpc:'2.0',
   id:1,
   method:'ui/initialize',
   params:{
    protocolVersion:'2026-01-26',
    appInfo:{name:'evydencia-crm-visual-card',version:'0.12.0'},
    appCapabilities:{}
   }
  },'*');
 }catch{}
})();
</script>
</body>
</html>`;

const UI_RESOURCE_META={
 ui:{
  csp:{
   connectDomains:[],
   resourceDomains:['https://evydencia.com','https://pps.whatsapp.net'],
   frameDomains:[],
   baseUriDomains:[]
  }
 }
};

export function registerCrmVisualCardUi(mcpServer){
 mcpServer.registerResource(
  'evydencia-crm-visual-card-v2',
  MCP_UI_CARD_RESOURCE_URI,
  {
   title:'Evydência CRM — Card Visual Interativo v2 (Pedido & Cliente 360)',
   description:'Widget HTML leve e seguro para renderização visual de Pedido e Cliente 360 no ChatGPT Web (MCP Apps v2).',
   mimeType:MCP_UI_CARD_MIME_TYPE,
   _meta:UI_RESOURCE_META
  },
  async()=>({
   contents:[{
    uri:MCP_UI_CARD_RESOURCE_URI,
    mimeType:MCP_UI_CARD_MIME_TYPE,
    text:CRM_VISUAL_CARD_HTML,
    _meta:UI_RESOURCE_META
   }]
  })
 );
 mcpServer.registerResource(
  'evydencia-crm-visual-card-v1-fallback',
  MCP_UI_CARD_V1_FALLBACK_URI,
  {
   title:'Evydência CRM — Card Visual v1 (Compatibilidade Temporária)',
   description:'Recurso de compatibilidade temporária para sessões existentes do ChatGPT Web durante transição para v2.',
   mimeType:MCP_UI_CARD_MIME_TYPE,
   _meta:UI_RESOURCE_META
  },
  async()=>({
   contents:[{
    uri:MCP_UI_CARD_V1_FALLBACK_URI,
    mimeType:MCP_UI_CARD_MIME_TYPE,
    text:CRM_VISUAL_CARD_HTML,
    _meta:UI_RESOURCE_META
   }]
  })
 );
}
