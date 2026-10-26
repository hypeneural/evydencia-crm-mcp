// Decoupled ChatGPT Web MCP App visual card module (ui://evydencia/crm-visual-card-v1.html).
// Preserves fast JSON-only analytical tools while offering rich interactive Order & Customer 360 cards on demand.
// Zero external JS/CSS dependencies, strict CSP allowlist, light/dark + mobile/desktop responsive,
// full textual fallback, zero unnecessary minor PII, and 4 explicit avatar rendering states.

export const MCP_UI_CARD_RESOURCE_URI='ui://evydencia/crm-visual-card-v1.html';
export const MCP_UI_CARD_MIME_TYPE='text/html;profile=mcp-app';
export const UI_CRM_TOOL_NAMES=Object.freeze(['crm_renderizar_card_visual']);

export const MCP_UI_RESOURCE_META=Object.freeze({
 ui:Object.freeze({
  prefersBorder:true,
  csp:Object.freeze({
   connectDomains:Object.freeze([]),
   resourceDomains:Object.freeze(['https://evydencia.com','https://pps.whatsapp.net'])
  })
 })
});

export const AVATAR_RENDER_STATES=Object.freeze([
 'url_validated_pending_widget_load',
 'image_loaded',
 'image_blocked_or_error',
 'initials_fallback'
]);

function safeStr(v,max=160){
 if(typeof v!=='string')return null;
 const s=v.trim();
 return s?s.slice(0,max):null;
}

function safeNum(v){
 return typeof v==='number'&&Number.isFinite(v)?Math.round(v*100)/100:0;
}

function resolveInitialAvatarCardState(avatarRaw,fallbackInitials='CL'){
 const av=avatarRaw&&typeof avatarRaw==='object'?avatarRaw:{};
 const initials=safeStr(av.initials,4)||safeStr(fallbackInitials,4)||'CL';
 const url=safeStr(av.url,512);
 const checkStatus=safeStr(av.asset_check_status,32)||'not_checked';
 const hasAvatar=Boolean(av.has_avatar&&url);
 const allowOrigin=Boolean(url&&(/^https:\/\/evydencia\.com\/storage\//i.test(url)||/^https:\/\/pps\.whatsapp\.net\//i.test(url)));

 if(!hasAvatar){
  return {
   initial_state:'initials_fallback',
   allow_img_tag:false,
   url:null,
   initials,
   asset_check_status:checkStatus,
   badge_label:'Iniciais (sem foto cadastrada)',
   honest_note:'Cliente não possui foto cadastrada; iniciais exibidas normalmente.'
  };
 }
 if(checkStatus==='validated'&&av.asset_accessible===true&&allowOrigin){
  return {
   initial_state:'url_validated_pending_widget_load',
   allow_img_tag:true,
   url,
   initials,
   asset_check_status:'validated',
   badge_label:'URL validada (aguardando renderização)',
   honest_note:'URL validada via HTTP/binário no servidor; somente onload do navegador confirma image_loaded (se CSP/rede bloquear, onerror muda para image_blocked_or_error).'
  };
 }
 if((checkStatus==='unavailable'||checkStatus==='restricted')||!allowOrigin){
  return {
   initial_state:'image_blocked_or_error',
   allow_img_tag:false,
   url:null,
   initials,
   asset_check_status:checkStatus,
   badge_label:'Imagem indisponível/restrita · Iniciais',
   honest_note:'Asset de avatar indisponível, restrito ou fora do domínio permitido; exibindo iniciais com segurança.'
  };
 }
 return {
  initial_state:'url_validated_pending_widget_load',
  allow_img_tag:allowOrigin,
  url:allowOrigin?url:null,
  initials,
  asset_check_status:checkStatus,
  badge_label:allowOrigin?'URL elegível (aguardando renderização)':'Iniciais',
  honest_note:'Verificação prévia não conclusiva; widget confirmará onload ou cairá em iniciais via onerror.'
 };
}

export function buildVisualCardPayload({tipo,detailResult=null,customerResult=null}){
 if(tipo==='pedido'){
  const ord=detailResult?.order&&typeof detailResult.order==='object'?detailResult.order:{};
  const cust=ord.customer&&typeof ord.customer==='object'?ord.customer:{};
  const avatar=resolveInitialAvatarCardState(cust.avatar,{fallbackInitials:ord.customer_initials||cust.avatar?.initials||'CL'});
  const installments=(Array.isArray(ord.installments)?ord.installments:[]).slice(0,8).map((inst,idx)=>({
   index:idx+1,
   method_name:safeStr(inst.method_name||inst.method_category_label,60)||'Não informado',
   method_category_label:safeStr(inst.method_category_label,40)||null,
   paid:Boolean(inst.is_paid||inst.paid_at),
   value_reais:safeNum(inst.value_reais??inst.total_reais??0),
   paid_reais:safeNum(inst.paid_value_reais??inst.payment_total_reais??(inst.is_paid?inst.value_reais:0)),
   due_date:safeStr(inst.due_date_brt||inst.due_date,32),
   paid_at:safeStr(inst.paid_at_brt||inst.paid_at,32)
  }));
  const items=(Array.isArray(ord.items)?ord.items:[]).slice(0,8).map(it=>({
   name:safeStr(it.name||it.title||it.product_name,90)||'Item',
   quantity:Number.isInteger(it.quantity)?it.quantity:1,
   total_reais:safeNum(it.total_reais??it.price_reais??0),
   is_bonus:Boolean(it.bonus_classification?.is_zero_price_item||safeNum(it.total_reais??it.price_reais??0)===0)
  }));
  const partReg=ord.participants_registration&&typeof ord.participants_registration==='object'?ord.participants_registration:{};
  const participantsCount=Number.isInteger(ord.participant_count)?ord.participant_count:(Array.isArray(ord.participants)?ord.participants.length:0);
  return {
   source:'MCP_UI_VISUAL_CARD_V1',
   card_type:'pedido',
   ui_resource_uri:MCP_UI_CARD_RESOURCE_URI,
   supported_avatar_states:AVATAR_RENDER_STATES,
   avatar,
   header:{
    title:`Pedido #${ord.order_id??'N/D'}`,
    subtitle:safeStr(ord.package_name,100)||'Pacote / Serviço CRM',
    status_label:safeStr(ord.status_label||ord.status,60)||'Em andamento',
    customer_name:safeStr(cust.name||ord.customer_name,100)||'Cliente CRM',
    city_state:[safeStr(cust.city,50),safeStr(cust.state,10)].filter(Boolean).join('/')||null
   },
   links:{
    crm_order_url:safeStr(ord.crm_order_url,240),
    crm_customer_url:safeStr(ord.crm_customer_url||cust.crm_customer_url,240)
   },
   financial:{
    total_reais:safeNum(ord.total_reais),
    received_reais:safeNum(ord.received_reais),
    remaining_reais:safeNum(ord.remaining_reais),
    payment_methods:Array.isArray(ord.payment_methods)?ord.payment_methods.slice(0,6):[]
   },
   schedule:{
    created_at_brt:safeStr(ord.created_at_brt||ord.created_at,40),
    session_at:safeStr(ord.session_at||ord.schedule_details?.current_session_at_brt,40),
    calendar_synced:Boolean(ord.schedule_details?.google_calendar_event_id||ord.schedule_details?.has_google_calendar_link)
   },
   participants_summary:{
    count:participantsCount,
    status_label:safeStr(partReg.status_label,60)||(participantsCount>0?'Preenchido':'Sem participantes'),
    edit_lock_reason:safeStr(partReg.edit_lock_reason,120),
    minor_pii_redacted_in_widget:true
   },
   installments,
   items
  };
 }

 const cust=customerResult?.customer&&typeof customerResult.customer==='object'?customerResult.customer:{};
 const kpis=customerResult?.kpis&&typeof customerResult.kpis==='object'?customerResult.kpis:{};
 const fin=customerResult?.financial_audit_summary&&typeof customerResult.financial_audit_summary==='object'?customerResult.financial_audit_summary:{};
 const regComp=cust.registration_completeness&&typeof cust.registration_completeness==='object'?cust.registration_completeness:{};
 const avatar=resolveInitialAvatarCardState(cust.avatar,{fallbackInitials:cust.avatar?.initials||'CL'});
 const rawOrders=Array.isArray(customerResult?.orders)&&customerResult.orders.length
  ?customerResult.orders
  :(customerResult?.current_order?[customerResult.current_order]:[]);
 const recentOrders=rawOrders.slice(0,5).map(o=>({
  order_id:o.order_id??null,
  uuid:safeStr(o.uuid,40),
  package_name:safeStr(o.package_name,80)||'Pedido CRM',
  status_label:safeStr(o.status_label||o.status,50)||'Registrado',
  session_at:safeStr(o.session_at||o.created_at_brt,40),
  total_reais:safeNum(o.total_reais),
  remaining_reais:safeNum(o.remaining_reais),
  crm_order_url:safeStr(o.crm_order_url,240)
 }));
 const totalContracted=safeNum(fin.total_contracted_reais??kpis.total_contracted_reais??recentOrders.reduce((s,o)=>s+o.total_reais,0));
 const totalReceived=safeNum(fin.total_received_reais??kpis.total_received_reais??0);
 const openBalance=safeNum(fin.total_open_balance_reais??kpis.open_balance_reais??Math.max(0,totalContracted-totalReceived));

 return {
  source:'MCP_UI_VISUAL_CARD_V1',
  card_type:'cliente_360',
  ui_resource_uri:MCP_UI_CARD_RESOURCE_URI,
  supported_avatar_states:AVATAR_RENDER_STATES,
  avatar,
  header:{
   title:safeStr(cust.name||cust.display_name,100)||'Cliente CRM',
   subtitle:safeStr(cust.lifecycle_stage,60)||'Cadastro CRM',
   status_label:regComp.is_complete_for_card===false?'Cadastro incompleto p/ cartão':'Cadastro regular',
   customer_name:safeStr(cust.name||cust.display_name,100)||'Cliente CRM',
   city_state:[safeStr(cust.city,50),safeStr(cust.state,10)].filter(Boolean).join('/')||null
  },
  links:{
   crm_order_url:recentOrders[0]?.crm_order_url||null,
   crm_customer_url:safeStr(cust.crm_customer_url,240)
  },
  financial:{
   total_reais:totalContracted,
   received_reais:totalReceived,
   remaining_reais:openBalance,
   payment_methods:Object.keys(fin.received_by_effective_method_reais||{}).slice(0,6)
  },
  customer_kpis:{
   orders_count:Number.isInteger(kpis.total_orders_registered)?kpis.total_orders_registered:(Number.isInteger(cust.orders_count)?cust.orders_count:recentOrders.length),
   natal_2026_purchased:Boolean(customerResult?.natal_2026?.purchased),
   missing_card_fields:Array.isArray(regComp.missing_fields)?regComp.missing_fields.slice(0,6):[]
  },
  recent_orders:recentOrders
 };
}

const fmtBRL=v=>`R$ ${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export function formatVisualCardTextFallback(card){
 if(!card||typeof card!=='object')return 'Card visual indisponível.';
 const lines=[];
 if(card.card_type==='pedido'){
  lines.push(`Card Visual — ${card.header?.title||'Pedido'} (${card.header?.status_label||'N/D'})`);
  lines.push(`Titular: ${card.header?.customer_name||'N/D'}${card.header?.city_state?` (${card.header.city_state})`:''} | Pacote: ${card.header?.subtitle||'N/D'}`);
  lines.push(`Financeiro: Total ${fmtBRL(card.financial?.total_reais)} | Recebido ${fmtBRL(card.financial?.received_reais)} | Saldo ${fmtBRL(card.financial?.remaining_reais)}`);
  lines.push(`Sessão: ${card.schedule?.session_at||'Não agendada'} | Participantes: ${card.participants_summary?.count??0} (${card.participants_summary?.status_label||'N/D'})`);
  lines.push(`Avatar: estado_inicial=${card.avatar?.initial_state||'initials_fallback'} (${card.avatar?.badge_label||'Iniciais'})`);
  if(card.links?.crm_order_url)lines.push(`Link do Pedido: ${card.links.crm_order_url}`);
  if(card.links?.crm_customer_url)lines.push(`Link do Cliente: ${card.links.crm_customer_url}`);
  return lines.join('\n');
 }
 lines.push(`Card Visual Cliente 360 — ${card.header?.title||'Cliente'} (${card.header?.subtitle||'CRM'})`);
 lines.push(`Status cadastral: ${card.header?.status_label||'N/D'}${card.header?.city_state?` | Local: ${card.header.city_state}`:''}`);
 lines.push(`Pedidos registrados: ${card.customer_kpis?.orders_count??0} | Contratado: ${fmtBRL(card.financial?.total_reais)} | Recebido: ${fmtBRL(card.financial?.received_reais)} | Em aberto: ${fmtBRL(card.financial?.remaining_reais)}`);
 lines.push(`Avatar: estado_inicial=${card.avatar?.initial_state||'initials_fallback'} (${card.avatar?.badge_label||'Iniciais'})`);
 if(card.links?.crm_customer_url)lines.push(`Link do Cliente: ${card.links.crm_customer_url}`);
 if(card.links?.crm_order_url)lines.push(`Último Pedido: ${card.links.crm_order_url}`);
 return lines.join('\n');
}

export const CRM_VISUAL_CARD_HTML=`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evydência CRM — Card Visual</title>
<style>
:root {
 --bg: #ffffff;
 --surface: #f8fafc;
 --border: #e2e8f0;
 --text: #0f172a;
 --muted: #475569;
 --accent: #0f766e;
 --accent-soft: #ccfbf1;
 --warn-bg: #fef3c7;
 --warn-text: #92400e;
 --ok-bg: #dcfce7;
 --ok-text: #166534;
}
@media (prefers-color-scheme: dark) {
 :root:not([data-theme="light"]) {
  --bg: #0f172a;
  --surface: #1e293b;
  --border: #334155;
  --text: #f8fafc;
  --muted: #94a3b8;
  --accent: #2dd4bf;
  --accent-soft: #134e4a;
  --warn-bg: #451a03;
  --warn-text: #fde68a;
  --ok-bg: #052e16;
  --ok-text: #86efac;
 }
}
:root[data-theme="dark"] {
 --bg: #0f172a;
 --surface: #1e293b;
 --border: #334155;
 --text: #f8fafc;
 --muted: #94a3b8;
 --accent: #2dd4bf;
 --accent-soft: #134e4a;
 --warn-bg: #451a03;
 --warn-text: #fde68a;
 --ok-bg: #052e16;
 --ok-text: #86efac;
}
* { box-sizing: border-box; }
body {
 margin: 0;
 padding: 12px;
 font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
 background: var(--bg);
 color: var(--text);
 line-height: 1.4;
}
.card {
 border: 1px solid var(--border);
 border-radius: 14px;
 background: var(--bg);
 overflow: hidden;
}
.hdr {
 display: flex;
 align-items: center;
 gap: 12px;
 padding: 14px 16px;
 background: var(--surface);
 border-bottom: 1px solid var(--border);
}
.avatar-box {
 position: relative;
 width: 52px;
 height: 52px;
 border-radius: 50%;
 background: var(--accent-soft);
 color: var(--accent);
 display: flex;
 align-items: center;
 justify-content: center;
 font-weight: 700;
 font-size: 16px;
 flex-shrink: 0;
 overflow: hidden;
 border: 2px solid var(--border);
}
.avatar-box img {
 position: absolute;
 inset: 0;
 width: 100%;
 height: 100%;
 object-fit: cover;
 display: none;
}
.avatar-box[data-avatar-state="image_loaded"] img { display: block; }
.avatar-box[data-avatar-state="image_loaded"] .initials { display: none; }
.hdr-main { flex: 1; min-width: 0; }
.title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.title { font-size: 16px; font-weight: 700; margin: 0; }
.sub { font-size: 13px; color: var(--muted); margin: 2px 0 0; }
.badge {
 display: inline-flex;
 align-items: center;
 padding: 2px 8px;
 border-radius: 999px;
 font-size: 11px;
 font-weight: 600;
 background: var(--ok-bg);
 color: var(--ok-text);
}
.badge.warn { background: var(--warn-bg); color: var(--warn-text); }
.avatar-caption { font-size: 11px; color: var(--muted); margin-top: 3px; }
.kpis {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
 gap: 10px;
 padding: 14px 16px;
}
.kpi {
 padding: 10px 12px;
 border-radius: 10px;
 background: var(--surface);
 border: 1px solid var(--border);
}
.kpi-lbl { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.kpi-val { font-size: 15px; font-weight: 700; margin-top: 2px; }
.sec { padding: 0 16px 14px; }
.sec-title { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; margin: 0 0 8px; }
.list { display: flex; flex-direction: column; gap: 6px; }
.row {
 display: flex;
 justify-content: space-between;
 align-items: center;
 gap: 8px;
 padding: 8px 10px;
 border-radius: 8px;
 background: var(--surface);
 font-size: 12px;
}
.ftr {
 display: flex;
 flex-wrap: wrap;
 gap: 8px;
 padding: 12px 16px;
 border-top: 1px solid var(--border);
 background: var(--surface);
}
.btn {
 display: inline-flex;
 align-items: center;
 padding: 6px 12px;
 border-radius: 8px;
 font-size: 12px;
 font-weight: 600;
 text-decoration: none;
 background: var(--accent);
 color: #ffffff;
 border: none;
 cursor: pointer;
}
.empty { padding: 18px; text-align: center; font-size: 13px; color: var(--muted); }
@media (max-width: 520px) {
 body { padding: 8px; }
 .hdr { align-items: flex-start; }
 .kpis { grid-template-columns: 1fr 1fr; }
 .row { flex-direction: column; align-items: flex-start; }
}
</style>
</head>
<body>
<div id="root" class="card"><div class="empty">Aguardando dados estruturados do Evydência CRM...</div></div>
<script>
(function(){
 const root = document.getElementById('root');
 let rpcId = 1;
 const pending = new Map();

 function sendRpc(method, params, isNotification) {
  if (!window.parent || window.parent === window) return Promise.resolve(null);
  if (isNotification) {
   window.parent.postMessage({ jsonrpc: '2.0', method, params: params || {} }, '*');
   return Promise.resolve(null);
  }
  const id = rpcId++;
  return new Promise(resolve => {
   pending.set(id, resolve);
   window.parent.postMessage({ jsonrpc: '2.0', id, method, params: params || {} }, '*');
   setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve(null); } }, 3000);
  });
 }

 function esc(s) {
  return String(s == null ? '' : s)
   .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
 }

 function brl(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 }

 function applyTheme(theme) {
  if (theme === 'dark' || theme === 'light') {
   document.documentElement.setAttribute('data-theme', theme);
  }
 }

 function setAvatarState(box, captionEl, state, labelText) {
  if (!box) return;
  box.setAttribute('data-avatar-state', state);
  if (captionEl) captionEl.textContent = labelText + ' [' + state + ']';
 }

 function renderCard(data) {
  if (!data || typeof data !== 'object' || !data.card_type) return;
  const av = data.avatar || {};
  const initAvatarState = av.initial_state || 'initials_fallback';
  const hdr = data.header || {};
  const fin = data.financial || {};
  const links = data.links || {};
  const warnBadge = (fin.remaining_reais || 0) > 0 || (hdr.status_label || '').toLowerCase().includes('incompleto');

  let middleHtml = '';
  if (data.card_type === 'pedido') {
   const sch = data.schedule || {};
   const part = data.participants_summary || {};
   const insts = Array.isArray(data.installments) ? data.installments : [];
   middleHtml += '<div class="kpis">'
    + '<div class="kpi"><div class="kpi-lbl">Total do Pedido</div><div class="kpi-val">' + esc(brl(fin.total_reais)) + '</div></div>'
    + '<div class="kpi"><div class="kpi-lbl">Recebido</div><div class="kpi-val">' + esc(brl(fin.received_reais)) + '</div></div>'
    + '<div class="kpi"><div class="kpi-lbl">Saldo em Aberto</div><div class="kpi-val">' + esc(brl(fin.remaining_reais)) + '</div></div>'
    + '<div class="kpi"><div class="kpi-lbl">Participantes</div><div class="kpi-val">' + esc(part.count || 0) + ' · ' + esc(part.status_label || '') + '</div></div>'
    + '</div>';
   middleHtml += '<div class="sec"><div class="sec-title">Agenda & Parcelas (' + insts.length + ')</div><div class="list">';
   middleHtml += '<div class="row"><span>Sessão: <strong>' + esc(sch.session_at || 'Não agendada') + '</strong></span><span>Emissão: ' + esc(sch.created_at_brt || 'N/D') + '</span></div>';
   for (let i = 0; i < insts.length; i++) {
    const it = insts[i];
    middleHtml += '<div class="row"><span>#' + esc(it.index) + ' · ' + esc(it.method_name) + '</span><span>'
     + esc(brl(it.value_reais)) + ' · <strong>' + (it.paid ? 'Pago (' + esc(it.paid_at || 'ok') + ')' : 'Venc. ' + esc(it.due_date || 'pendente')) + '</strong></span></div>';
   }
   middleHtml += '</div></div>';
  } else {
   const ck = data.customer_kpis || {};
   const ords = Array.isArray(data.recent_orders) ? data.recent_orders : [];
   middleHtml += '<div class="kpis">'
    + '<div class="kpi"><div class="kpi-lbl">Pedidos CRM</div><div class="kpi-val">' + esc(ck.orders_count || 0) + '</div></div>'
    + '<div class="kpi"><div class="kpi-lbl">Contratado</div><div class="kpi-val">' + esc(brl(fin.total_reais)) + '</div></div>'
    + '<div class="kpi"><div class="kpi-lbl">Recebido</div><div class="kpi-val">' + esc(brl(fin.received_reais)) + '</div></div>'
    + '<div class="kpi"><div class="kpi-lbl">Em Aberto</div><div class="kpi-val">' + esc(brl(fin.remaining_reais)) + '</div></div>'
    + '</div>';
   if (ords.length) {
    middleHtml += '<div class="sec"><div class="sec-title">Pedidos Recentes</div><div class="list">';
    for (let i = 0; i < ords.length; i++) {
     const o = ords[i];
     middleHtml += '<div class="row"><span><strong>#' + esc(o.order_id || 'N/D') + '</strong> · ' + esc(o.package_name) + ' (' + esc(o.status_label) + ')</span>'
      + '<span>' + esc(brl(o.total_reais)) + (o.remaining_reais > 0 ? ' · Saldo ' + esc(brl(o.remaining_reais)) : ' · Quitado') + '</span></div>';
    }
    middleHtml += '</div></div>';
   }
  }

  let ftrHtml = '';
  if (links.crm_order_url || links.crm_customer_url) {
   ftrHtml = '<div class="ftr">'
    + (links.crm_order_url ? '<a class="btn" data-crm-link="' + esc(links.crm_order_url) + '" href="' + esc(links.crm_order_url) + '" target="_blank" rel="noopener noreferrer">Abrir Pedido no CRM</a>' : '')
    + (links.crm_customer_url ? '<a class="btn" data-crm-link="' + esc(links.crm_customer_url) + '" href="' + esc(links.crm_customer_url) + '" target="_blank" rel="noopener noreferrer">Abrir Cliente no CRM</a>' : '')
    + '</div>';
  }

  root.innerHTML = '<div class="hdr">'
   + '<div id="avBox" class="avatar-box" data-avatar-state="' + esc(initAvatarState) + '">'
   + '<span class="initials">' + esc(av.initials || 'CL') + '</span>'
   + '<img id="avImg" alt="Avatar do cliente" referrerpolicy="no-referrer">'
   + '</div>'
   + '<div class="hdr-main">'
   + '<div class="title-row"><h1 class="title">' + esc(hdr.title || 'CRM') + '</h1>'
   + '<span class="badge' + (warnBadge ? ' warn' : '') + '">' + esc(hdr.status_label || 'OK') + '</span></div>'
   + '<p class="sub">' + esc(hdr.customer_name || '') + (hdr.city_state ? ' · ' + esc(hdr.city_state) : '') + ' — ' + esc(hdr.subtitle || '') + '</p>'
   + '<div id="avCap" class="avatar-caption">' + esc(av.badge_label || 'Iniciais') + ' [' + esc(initAvatarState) + ']</div>'
   + '</div></div>'
   + middleHtml
   + ftrHtml;

  const avBox = document.getElementById('avBox');
  const avImg = document.getElementById('avImg');
  const avCap = document.getElementById('avCap');
  if (av.allow_img_tag && av.url && avImg) {
   setAvatarState(avBox, avCap, 'url_validated_pending_widget_load', 'Carregando foto validada');
   avImg.onload = function() {
    if (avImg.naturalWidth > 0) {
     setAvatarState(avBox, avCap, 'image_loaded', 'Foto renderizada');
    } else {
     setAvatarState(avBox, avCap, 'image_blocked_or_error', 'Imagem vazia · Iniciais');
    }
   };
   avImg.onerror = function() {
    setAvatarState(avBox, avCap, 'image_blocked_or_error', 'Bloqueada no sandbox/rede · Iniciais');
   };
   avImg.src = av.url;
  }

  const anchors = root.querySelectorAll('[data-crm-link]');
  for (let i = 0; i < anchors.length; i++) {
   anchors[i].addEventListener('click', function(ev) {
    const url = anchors[i].getAttribute('data-crm-link');
    if (url && window.parent && window.parent !== window) {
     ev.preventDefault();
     sendRpc('ui/open-link', { url }, false).then(function(res) {
      if (!res) window.open(url, '_blank', 'noopener,noreferrer');
     });
    }
   });
  }
 }

 window.addEventListener('message', function(event) {
  if (event.source !== window.parent) return;
  const msg = event.data;
  if (!msg || msg.jsonrpc !== '2.0') return;
  if (msg.id !== undefined && pending.has(msg.id)) {
   const fn = pending.get(msg.id);
   pending.delete(msg.id);
   fn(msg.result || null);
   return;
  }
  if (msg.method === 'ui/notifications/host-context-changed') {
   applyTheme(msg.params && msg.params.theme);
   return;
  }
  if (msg.method === 'ui/notifications/tool-result') {
   const sc = (msg.params && msg.params.structuredContent) || (msg.params && msg.params.result && msg.params.result.structuredContent);
   if (sc) renderCard(sc);
  }
 }, { passive: true });

 if (typeof ResizeObserver === 'function') {
  const ro = new ResizeObserver(function() {
   const h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 220);
   sendRpc('ui/notifications/size-changed', { height: h }, true);
  });
  ro.observe(document.body);
 }

 sendRpc('ui/initialize', {
  protocolVersion: '2026-01-26',
  appInfo: { name: 'evydencia-crm-visual-card', version: '0.12.0' },
  appCapabilities: {}
 }, false).then(function(initRes) {
  if (initRes && initRes.hostContext && initRes.hostContext.theme) {
   applyTheme(initRes.hostContext.theme);
  }
  sendRpc('ui/notifications/initialized', {}, true);
 });
})();
</script>
</body>
</html>`;

export function registerCrmVisualCardUi(mcpServer){
 mcpServer.registerResource(
  'crm-visual-card-v1',
  MCP_UI_CARD_RESOURCE_URI,
  {
   title:'Evydência CRM — Card Visual (Pedido & Cliente 360)',
   description:'Widget MCP App leve, responsivo (desktop/mobile, claro/escuro) e sem dependências externas para visualização opcional de Pedido ou Cliente 360 no ChatGPT Web.',
   mimeType:MCP_UI_CARD_MIME_TYPE,
   _meta:MCP_UI_RESOURCE_META
  },
  async uri=>({
   contents:[{
    uri:uri?.href||MCP_UI_CARD_RESOURCE_URI,
    mimeType:MCP_UI_CARD_MIME_TYPE,
    text:CRM_VISUAL_CARD_HTML,
    _meta:MCP_UI_RESOURCE_META
   }]
  })
 );
}
