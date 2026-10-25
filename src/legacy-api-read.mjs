// Operator-only direct CRM integration READ adapter (replaces intermediary api.evydencia.com.br).
// NEVER register on anonymous MCP. Requires authenticated OAuth + Sanctum operator session.
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {baseURL,day,phone} from './core.mjs';

const execFileAsync=promisify(execFile);
const SCRIPTS_DIR=resolve(dirname(fileURLToPath(import.meta.url)),'..','scripts');
const BRIDGE_SCRIPT=resolve(SCRIPTS_DIR,'crm-natal-bridge.php');
const FORENSIC_BRIDGE_SCRIPT=resolve(SCRIPTS_DIR,'crm-forensic-bridge.php');

const allowedStatuses=new Set(['order_aborted','payment_chargeback','order_created','waiting_payment',
 'payment_confirmed','session_schedule','session_schedule_confirmed','selection_schedule',
 'selection_schedule_confirmed','waiting_product_retrieve','product_retrieve_confirmed',
 'order_completed','payment_refunded']);

const STATUS_LABELS={
 order_created:'Pedido Efetuado',
 waiting_payment:'Aguardando Pagamento',
 payment_confirmed:'Pagamento Confirmado',
 session_schedule:'Sessão Agendada',
 session_schedule_confirmed:'Sessão Fotográfica Realizada',
 selection_schedule:'Seleção Agendada',
 selection_schedule_confirmed:'Seleção Concluída',
 waiting_product_retrieve:'Aguardando Retirada',
 product_retrieve_confirmed:'Produtos Entregues',
 order_completed:'Pedido Concluído',
 order_aborted:'Pedido Cancelado',
 payment_refunded:'Pagamento Estornado',
 payment_chargeback:'Chargeback'
};

const MISSING_FIELD_LABELS={
 name:'Nome',email:'E-mail',document:'Documento',document_type:'Tipo de documento',
 phone:'Telefone',zipcode:'CEP',street:'Rua',district:'Bairro',city:'Cidade',state:'UF'
};

const fail=x=>{throw Error('legacy_read_'+x)};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const name=x=>{if(typeof x!=='string'||x.trim().length<2||x.trim().length>100||/[\x00-\x1f<>]/.test(x))fail('invalid_name');return x.trim()};
const money=x=>{const n=typeof x==='number'?x:(typeof x==='string'&&x.trim()!==''?Number(x):NaN);return Number.isFinite(n)?Math.round(n*100):null};
const reais=cents=>typeof cents==='number'&&Number.isFinite(cents)?Math.round(cents)/100:null;
const value=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const maskPhone=x=>{if(typeof x!=='string')return null;const d=x.replace(/\D/g,'');return d.length>=4?'(**) *****-'+d.slice(-4):null};

const toBrt=iso=>{
 if(typeof iso!=='string'||!iso.trim()||iso.startsWith('0000-00-00'))return null;
 if(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(iso.trim()))return iso.trim();
 const ms=Date.parse(iso);if(!Number.isFinite(ms))return iso;
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date(ms));
 const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}:${m.second}`;
};

const todayBrtYmd=()=>{
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return `${m.year}-${m.month}-${m.day}`;
};

export function customerInitials(rawName){
 const parts=String(rawName||'').trim().split(/\s+/u).filter(Boolean);
 if(!parts.length)return '?';
 return (parts[0][0]+(parts.length>1?parts[parts.length-1][0]:'')).toUpperCase();
}

export function humanAgeAt(birthYmd,refYmd){
 if(typeof birthYmd!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(birthYmd)||birthYmd.startsWith('0000-'))return null;
 if(typeof refYmd!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(refYmd))return null;
 const [by,bm,bd]=birthYmd.split('-').map(Number);
 const [ry,rm,rd]=refYmd.split('-').map(Number);
 const bDate=Date.UTC(by,bm-1,bd),rDate=Date.UTC(ry,rm-1,rd);
 if(!Number.isFinite(bDate)||!Number.isFinite(rDate)||bDate>rDate)return null;
 let years=ry-by,months=rm-bm,days=rd-bd;
 if(days<0){
  months--;
  const prevMonthDays=new Date(Date.UTC(ry,rm-1,0)).getUTCDate();
  days+=prevMonthDays;
 }
 if(months<0){years--;months+=12}
 if(years===0&&months===0)return days<=1?'recém-nascido':`${days} dias`;
 const out=[];
 if(years>0)out.push(years===1?'1 ano':`${years} anos`);
 if(months>0)out.push(months===1?'1 mês':`${months} meses`);
 return out.join(' e ');
}

export function forensicCustomerProjection(raw,{fullProfile=false}={}){
 const c=value(raw);
 if(!Object.keys(c).length)return null;
 const validUuid=uuid(c.uuid)?c.uuid:null;
 const avatarObj=value(c.avatar);
 const avatarUrl=typeof c.avatar_url==='string'&&/^https?:\/\//i.test(c.avatar_url)
  ?c.avatar_url
  :(typeof avatarObj.url==='string'&&/^https?:\/\//i.test(avatarObj.url)?avatarObj.url:null);
 const hasAvatar=typeof avatarObj.has_avatar==='boolean'?avatarObj.has_avatar:Boolean(avatarUrl);
 const initials=typeof avatarObj.initials==='string'&&avatarObj.initials?avatarObj.initials:customerInitials(c.name);
 const avatarRevision=Number.isInteger(c.avatar_revision)?c.avatar_revision:(Number.isInteger(avatarObj.revision)?avatarObj.revision:0);

 // Registration completeness (mirrors PagarmeCardProfileService::check)
 let completeness=c.registration_completeness&&typeof c.registration_completeness==='object'?c.registration_completeness:null;
 if(!completeness){
  const missing=[];
  if(!String(c.name||'').trim())missing.push('name');
  if(!String(c.email||'').trim())missing.push('email');
  const docDigits=String(c.document||'').replace(/\D/g,'');
  if(!docDigits)missing.push('document');
  const docType=String(c.document_type||'').trim().toUpperCase();
  if(!['CPF','CNPJ','PASSPORT'].includes(docType))missing.push('document_type');
  const phDigits=String(c.whatsapp||c.phone||'').replace(/\D/g,'');
  if(phDigits.length<10)missing.push('phone');
  const addr=value(c.address);
  const zip=String(c.zipcode??addr.zipcode??'').replace(/\D/g,'');
  const street=String(c.street??addr.street??'').trim();
  const district=String(c.district??addr.district??'').trim();
  const cityVal=typeof c.city==='string'?c.city:(value(c.city).name??addr.city??'');
  const stateVal=typeof c.state==='string'?c.state:(value(value(c.city).state).abbr??addr.state??'');
  if(!zip)missing.push('zipcode');
  if(!street)missing.push('street');
  if(!district)missing.push('district');
  if(!String(cityVal||'').trim())missing.push('city');
  if(!String(stateVal||'').trim())missing.push('state');
  completeness={
   is_complete_for_card:missing.length===0,
   status_label:missing.length===0?'Cadastro completo':'Cadastro incompleto',
   missing_fields:missing,
   missing_field_labels:missing.map(f=>MISSING_FIELD_LABELS[f]||f)
  };
 }

 const base={
  id:Number.isSafeInteger(c.id)?c.id:null,
  uuid:validUuid,
  crm_customer_url:validUuid?`https://evydencia.com/gestao/clientes/${validUuid}/ler`:null,
  name:typeof c.name==='string'?c.name.slice(0,120):null,
  customer_since_brt:toBrt(c.created_at||c.customer_since_brt||c.customer_since),
  phone_masked:maskPhone(c.whatsapp||c.phone),
  avatar:{has_avatar:hasAvatar,url:avatarUrl,revision:avatarRevision,initials},
  registration_completeness:completeness,
  ...(Number.isInteger(c.orders_count)?{orders_count:c.orders_count,lifecycle_stage:c.lifecycle_stage||(c.orders_count===0?'lead':c.orders_count===1?'first_time':'recurring')}:{})
 };

 if(fullProfile){
  const addr=value(c.address);
  const cityObj=value(c.city);
  const birthRaw=typeof c.birth_date==='string'?c.birth_date:(typeof c.birth==='string'?c.birth.slice(0,10):null);
  base.email=typeof c.email==='string'&&c.email.trim()?c.email.trim():null;
  base.document_type=typeof c.document_type==='string'&&c.document_type.trim()?c.document_type.trim().toUpperCase():null;
  base.document=typeof c.document==='string'&&c.document.trim()?c.document.trim():null;
  base.whatsapp=typeof c.whatsapp==='string'&&c.whatsapp.trim()?c.whatsapp.trim():null;
  base.phone=typeof c.phone==='string'&&c.phone.trim()?c.phone.trim():null;
  base.birth_date=birthRaw&&!birthRaw.startsWith('0000-')?birthRaw:null;
  base.address={
   zipcode:(c.zipcode??addr.zipcode)||null,
   street:(c.street??addr.street)||null,
   number:(c.number??addr.number)||null,
   district:(c.district??addr.district)||null,
   city:(typeof c.city==='string'?c.city:(cityObj.name??addr.city))||null,
   state:(typeof c.state==='string'?c.state:(value(cityObj.state).abbr??addr.state))||null
  };
 }
 return base;
}

export function forensicOrderProjection(raw,{includeParticipants=false,fullProfile=false,todayYmd=todayBrtYmd()}={}){
 if(raw&&raw.payment_summary&&Array.isArray(raw.installments)&&raw.participants_registration){
  return raw;
 }
 const x=value(raw),s=value(x.status),c=value(x.customer),sum=value(x.summary);
 const statusId=Number.isInteger(s.id)?s.id:null;
 const statusKey=typeof x.status_key==='string'?x.status_key:(typeof s.key==='string'?s.key:null);
 const statusLabel=typeof s.name==='string'?s.name.slice(0,70):(typeof x.status_label==='string'?x.status_label:null);

 const rawBonuses=Array.isArray(x.bonuses)?x.bonuses:[];
 const bonusByItemId=new Map(rawBonuses.filter(b=>b?.order_item_id!=null).map(b=>[Number(b.order_item_id),b]));

 const rawItems=Array.isArray(x.items)?x.items:[];
 const items=rawItems.slice(0,25).map(it=>{
  const p=value(it?.product);
  const itemName=typeof p.name==='string'?p.name:typeof it?.name==='string'?it.name:null;
  const slug=typeof p.slug==='string'?p.slug:typeof it?.slug==='string'?it.slug:null;
  const ref=typeof p.reference==='string'?p.reference:typeof it?.reference==='string'?it.reference:null;
  const desc=typeof p.description==='string'?p.description:(typeof it?.description==='string'?it.description:null);
  const isBundle=p.bundle==='Y'||it?.is_bundle===true;
  const qty=Number.isFinite(Number(it?.quantity))?Number(it.quantity):1;
  const unitCents=money(it?.amount??it?.unit_price_reais)??money(it?.total)??0;
  const grossCents=Math.round(unitCents*qty);
  const discCents=money(it?.discount??it?.discount_reais)??0;
  const netCents=money(it?.total??it?.net_total_reais)??Math.max(0,grossCents-discCents);
  const entryCents=money(it?.entry??it?.entry_reais)??0;

  let bonus_classification=it?.bonus_classification||null;
  if(!bonus_classification){
   const bRow=it?.id!=null?bonusByItemId.get(Number(it.id)):null;
   if(bRow){
    let snap={};try{snap=typeof bRow.rule_snapshot==='string'?JSON.parse(bRow.rule_snapshot):(bRow.rule_snapshot||{})}catch{}
    const hasOverride=bRow.order_bonus_rule_override_id!=null||Boolean(bRow.manual_override_type);
    bonus_classification={
     classification:hasOverride?'manual_bonus_override':'campaign_bonus',
     origin:bRow.source||'automatic_rule',
     proven:true,
     application_uuid:bRow.uuid||null,
     status:bRow.status||'active',
     reason:bRow.reason||null,
     benefit_key:snap.benefit_key||null,
     campaign_slug:snap.campaign_slug||null,
     discount_policy:snap.discount_policy||null,
     applied_at_brt:toBrt(bRow.applied_at)
    };
   }else if(isBundle){
    bonus_classification={classification:'package_bundle',origin:'catalog_bundle',proven:true};
   }else if(netCents>0&&discCents===0){
    bonus_classification={classification:'regular_paid_item',origin:'paid_addition',proven:true};
   }else if(netCents>0&&discCents>0){
    bonus_classification={classification:'partially_discounted_item',origin:'item_discount',proven:false};
   }else{
    bonus_classification={
     classification:'zero_net_untracked',
     origin:'unknown',
     proven:false,
     note:'Item com valor líquido R$ 0,00 sem registro em order_bonus_applications; origem exata não rastreada automaticamente.'
    };
   }
  }

  return {
   order_item_id:Number.isSafeInteger(it?.id)?it.id:(Number.isSafeInteger(it?.order_item_id)?it.order_item_id:null),
   name:itemName?itemName.slice(0,100):null,
   slug:slug?slug.slice(0,60):null,
   reference:ref?ref.slice(0,40):null,
   description:desc||null,
   is_bundle:isBundle,
   quantity:qty,
   unit_price_reais:reais(unitCents),
   gross_amount_reais:reais(grossCents),
   discount_reais:reais(discCents),
   net_total_reais:reais(netCents),
   total_reais:reais(netCents),
   entry_reais:reais(entryCents),
   bonus_classification
  };
 }).filter(it=>it.name);

 const rawInst=Array.isArray(x.installments)?x.installments:[];
 const effectivePaidMethods=[];
 const configuredMethods=[];
 const paidCategories=[];
 const effectivePaidByMethodCents={};
 let paidInstCount=0,openInstCount=0,openInstCents=0;

 const installments=rawInst.map((inst,idx)=>{
  const m=value(inst?.method),t=value(m.type),pay=value(inst?.payment);
  const methodName=typeof inst?.method_name==='string'&&inst.method_name.trim()
   ?inst.method_name.trim()
   :(typeof m.name==='string'&&m.name.trim()?m.name.trim():(typeof t.name==='string'&&t.name.trim()?t.name.trim():null));
  const categoryLabel=typeof inst?.method_category_label==='string'
   ?inst.method_category_label
   :(typeof t.name==='string'&&t.name.trim()?t.name.trim():null);
  const categoryKey=typeof inst?.method_category_key==='string'?inst.method_category_key:null;

  const totCents=money(inst?.total)??0;
  const paidCents=money(inst?.payment_total??pay.total)??0;
  const paidAtBrt=toBrt(inst?.payment_at??pay.paid_at);
  const isPaid=Boolean(paidAtBrt)&&paidCents>0;
  if(isPaid){
   paidInstCount++;
   const eff=methodName||'Método não informado';
   effectivePaidMethods.push(eff);
   effectivePaidByMethodCents[eff]=(effectivePaidByMethodCents[eff]||0)+paidCents;
   if(categoryLabel)paidCategories.push(categoryLabel);
  }else if(totCents>0){
   openInstCount++;
   openInstCents+=totCents;
  }
  if(methodName)configuredMethods.push(methodName);

  const rawTx=Array.isArray(inst?.transactions)?inst.transactions:(Array.isArray(pay.transactions)?pay.transactions:[]);
  const rawBills=Array.isArray(inst?.bills)?inst.bills:[];
  return {
   installment_id:Number.isSafeInteger(inst?.id)?inst.id:null,
   number:Number.isSafeInteger(inst?.installment)?inst.installment:(idx+1),
   card_split_count:Number.isSafeInteger(inst?.installments)?inst.installments:1,
   expiry_at_brt:toBrt(inst?.expiry_at),
   total_reais:reais(totCents),
   total_cents:totCents,
   paid_reais:reais(paidCents),
   paid_cents:paidCents,
   paid_at_brt:paidAtBrt,
   is_paid:isPaid,
   discount_reais:reais(money(inst?.discount??pay.discount)??0),
   increase_reais:reais(money(inst?.increase??pay.accrual)??0),
   method_name:methodName,
   method_category_key:categoryKey,
   method_category_label:categoryLabel,
   transactions:rawTx.slice(0,10).map(tx=>({
    transaction_id:Number.isSafeInteger(tx?.id)?tx.id:null,
    status_code:Number.isSafeInteger(tx?.status)?tx.status:null,
    message:tx?.message||null,
    gateway_order_or_tx_id:tx?.original_id||null,
    gateway_status:tx?.original_status||null,
    recorded_at_brt:toBrt(tx?.created_at)
   })),
   bills:rawBills.slice(0,10).map(b=>({
    bill_id:Number.isSafeInteger(b?.id)?b.id:null,
    amount_reais:reais(money(b?.amount)??0),
    paid_reais:reais(money(b?.payment_total)??0),
    closed_at_brt:toBrt(b?.closed_at),
    aborted_at_brt:toBrt(b?.aborted_at)
   }))
  };
 });

 const uniqEffMethods=[...new Set(effectivePaidMethods)];
 const uniqCfgMethods=[...new Set(configuredMethods)];
 const uniqCategories=[...new Set(paidCategories)];

 // Legacy read-only compatibility: keep category label (e.g. 'Pix') when not in forensic mode,
 // EXCEPT when category is 'Dinheiro' and actual method.name is a distinct non-cash method like 'Permuta'!
 const legacyCompatMethods=[...new Set(rawInst.map(i=>{
  const m=value(i?.method),t=value(m.type);
  const mName=typeof m.name==='string'?m.name.trim():(typeof i?.method_name==='string'?i.method_name.trim():'');
  const tName=typeof t.name==='string'?t.name.trim():(typeof i?.method_category_label==='string'?i.method_category_label.trim():'');
  if(includeParticipants||fullProfile)return mName||tName||null;
  if(tName==='Dinheiro'&&mName&&!/^dinheiro$/i.test(mName))return mName;
  return tName||mName||null;
 }).filter(Boolean))];

 const totalCents=money(sum.total);
 const receivedCents=money(sum.received);
 const remainingCents=money(sum.remaining);
 const validUuid=uuid(x.uuid)?x.uuid:null;

 const sessionAtBrt=toBrt(x.schedule_1);
 const sessionRefYmd=sessionAtBrt&&/^\d{4}-\d{2}-\d{2}/.test(sessionAtBrt)?sessionAtBrt.slice(0,10):null;

 const participants=includeParticipants
  ?(Array.isArray(x.participants)?x.participants:[]).slice(0,20).map(p=>{
    const pName=typeof p?.name==='string'&&p.name.trim()?p.name.trim().slice(0,120):null;
    const bRaw=typeof p?.birth==='string'&&p.birth?p.birth:(typeof p?.birth_date==='string'&&p.birth_date?p.birth_date:(typeof p?.birthday==='string'&&p.birthday?p.birthday:null));
    const birthDate=bRaw&&!bRaw.startsWith('0000-')?bRaw.slice(0,10):null;
    const computedToday=birthDate?humanAgeAt(birthDate,todayYmd):null;
    const fallbackAge=typeof p?.birth_for_extense==='string'&&p.birth_for_extense.trim()?p.birth_for_extense.replace(/^h[áa]\s+/i,'').trim():(typeof p?.age==='string'?p.age:null);
    const ageToday=computedToday||fallbackAge;
    const ageAtSession=birthDate&&sessionRefYmd?humanAgeAt(birthDate,sessionRefYmd):null;
    const kinship=typeof p?.relation?.name==='string'&&p.relation.name.trim()?p.relation.name.trim():(typeof p?.kinship==='string'&&p.kinship.trim()?p.kinship.trim():(typeof p?.relationship==='string'&&p.relationship.trim()?p.relationship.trim():null));
    return {
     participant_id:Number.isSafeInteger(p?.id)?p.id:(Number.isSafeInteger(p?.participant_id)?p.participant_id:null),
     name:pName,
     birth_date:birthDate,
     age:ageToday,
     age_today:ageToday,
     age_reference_date:todayYmd,
     age_at_session:ageAtSession,
     session_reference_date:sessionRefYmd,
     kinship
    };
   }).filter(p=>p.name)
  :undefined;

 const rawStatuses=Array.isArray(x.status_history)?x.status_history:(Array.isArray(x.statuses)?x.statuses:[]);
 const statusHistory=rawStatuses.map((st,idx)=>{
  if(st?.status_key&&st?.recorded_at_brt!==undefined)return st;
  const stObj=value(st?.status);
  const key=typeof stObj.name==='string'?stObj.name:(typeof st?.status==='string'?st.status:'unknown');
  const label=typeof stObj.description==='string'?stObj.description:(STATUS_LABELS[key]||key);
  const rec=toBrt(st?.created_at);
  const upd=toBrt(st?.updated_at);
  return {
   event_id:Number.isSafeInteger(st?.id)?st.id:null,
   status_id:Number.isSafeInteger(stObj.id)?stObj.id:null,
   status_key:key,
   status_label:label,
   recorded_at_brt:rec,
   updated_at_brt:upd&&upd!==rec?upd:null,
   is_current:idx===rawStatuses.length-1
  };
 });

 const completedAtBrt=toBrt(x.participants_completed_at);
 const partCount=Array.isArray(x.participants)?x.participants.length:0;
 const participantsRegistration=x.participants_registration||{
  count:partCount,
  completed:Boolean(completedAtBrt),
  completed_at_brt:completedAtBrt,
  completed_source:x.participants_completed_source||null,
  status_label:completedAtBrt?`Concluído em ${completedAtBrt}`:'Cadastro pendente'
 };

 const effectivePaidByMethodReais=Object.fromEntries(
  Object.entries(effectivePaidByMethodCents).map(([k,v])=>[k,reais(v)])
 );

 const reviewReasons=[];
 if(!rawInst.length)reviewReasons.push('no_installments');
 if(totalCents!==null&&receivedCents!==null&&totalCents!==(receivedCents+openInstCents)&&paidInstCount>0)
  reviewReasons.push('commercial_balance_mismatch');

 const custProjected=(includeParticipants||fullProfile)?forensicCustomerProjection(c,{fullProfile}):null;
 const bundleItem=items.find(i=>i.is_bundle)||items[0]||null;

 return {
  order_id:Number.isSafeInteger(x.id)?x.id:null,
  order_uuid:validUuid,
  crm_order_url:validUuid?'https://evydencia.com/gestao/pedidos/'+validUuid+'/detalhes':null,
  customer_name:typeof c.name==='string'?c.name.slice(0,100):null,
  customer_phone_masked:maskPhone(c.whatsapp||c.phone),
  status_id:statusId,
  status_label:statusLabel,
  created_at:typeof x.created_at==='string'?x.created_at:null,
  created_at_brt:toBrt(x.created_at),
  session_at:typeof x.schedule_1==='string'?x.schedule_1:null,
  package_name:bundleItem?.name||null,
  items:(includeParticipants||fullProfile)?items:items.slice(0,5).map(({name:n,slug:sl,reference:rf,quantity:qt,total_reais:tr})=>({name:n,slug:sl,reference:rf,quantity:qt,total_reais:tr})),
  payment_methods:(includeParticipants||fullProfile)?(uniqEffMethods.length?uniqEffMethods:uniqCfgMethods):legacyCompatMethods,
  total_reais:reais(totalCents),
  received_reais:reais(receivedCents),
  remaining_reais:reais(remainingCents),
  total_cents:totalCents,received_cents:receivedCents,remaining_cents:remainingCents,
  item_count:Array.isArray(x.items)?x.items.length:null,
  participant_count:Array.isArray(x.participants)?x.participants.length:null,
  ...((includeParticipants||fullProfile)?{
   customer_avatar_url:custProjected?.avatar?.url??null,
   customer_has_avatar:custProjected?.avatar?.has_avatar??false,
   customer_initials:custProjected?.avatar?.initials??customerInitials(c.name),
   customer:custProjected,
   status_history_count:statusHistory.length,
   status_history:statusHistory,
   payment_summary:{
    total_reais:reais(totalCents),
    received_reais:reais(receivedCents),
    remaining_reais:reais(remainingCents),
    installments_count:installments.length,
    paid_installments_count:paidInstCount,
    open_installments_count:openInstCount,
    open_installments_reais:reais(openInstCents),
    effective_paid_methods:uniqEffMethods,
    effective_paid_by_method_reais:effectivePaidByMethodReais,
    configured_installment_methods:uniqCfgMethods,
    paid_method_categories:uniqCategories,
    payment_needs_review:reviewReasons.length>0,
    financial_review_reasons:reviewReasons
   },
   installments,
   participants_registration:participantsRegistration,
   participants
  }:{})
 };
}

export function buildCrossOrderParticipantAudit(orders=[]){
 const groups=new Map();
 for(const ord of orders){
  for(const p of (ord?.participants||[])){
   const norm=String(p?.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
   if(!norm)continue;
   if(!groups.has(norm))groups.set(norm,[]);
   groups.get(norm).push({
    order_id:ord.order_id,
    order_uuid:ord.order_uuid,
    crm_order_url:ord.crm_order_url,
    session_at:ord.session_at,
    participant_id:p.participant_id??null,
    name:p.name,
    birth_date:p.birth_date??null,
    kinship:p.kinship??null,
    age_at_session:p.age_at_session??null,
    age_today:p.age_today??p.age??null
   });
  }
 }
 const birthDiscrepancies=[],kinshipDiscrepancies=[],timeline=[];
 for(const [,occurrences] of groups){
  const births=[...new Set(occurrences.map(o=>o.birth_date).filter(Boolean))];
  const kinships=[...new Set(occurrences.map(o=>o.kinship).filter(Boolean))];
  const displayName=occurrences[occurrences.length-1]?.name||'';
  if(births.length>1){
   const sorted=[...births].sort();
   const diffDays=Math.round((Date.parse(sorted[sorted.length-1])-Date.parse(sorted[0]))/86400000);
   birthDiscrepancies.push({
    participant_name:displayName,
    distinct_birth_dates:births,
    difference_days:Number.isFinite(diffDays)?diffDays:null,
    difference_years_approx:Number.isFinite(diffDays)?Math.round((diffDays/365.25)*10)/10:null,
    occurrences,
    advisory:'Divergência histórica de data de nascimento entre pedidos distintos da família. Conferir com o titular antes de qualquer correção manual; não sobrescrever automaticamente.'
   });
  }
  if(kinships.length>1){
   kinshipDiscrepancies.push({participant_name:displayName,distinct_kinships:kinships,occurrences});
  }
  timeline.push({
   participant_name:displayName,
   orders_appeared_count:occurrences.length,
   distinct_birth_dates:births,
   distinct_kinships:kinships,
   has_birth_date_discrepancy:births.length>1,
   occurrences
  });
 }
 return {
  unique_named_participants_count:timeline.length,
  has_discrepancies:birthDiscrepancies.length>0||kinshipDiscrepancies.length>0,
  birth_date_discrepancies_count:birthDiscrepancies.length,
  birth_date_discrepancies:birthDiscrepancies,
  kinship_discrepancies:kinshipDiscrepancies,
  participants_timeline:timeline
 };
}

const allKeys=new Set(['customer.name','customer.whatsapp','order.uuid','order.id','order.status',
 'order.created-start','order.created-end','order.session-start','order.session-end','product.slug']);

export function legacyFilters(filters={}){
 if(!filters||typeof filters!=='object'||Array.isArray(filters)||!Object.keys(filters).length||
    Object.keys(filters).some(k=>!allKeys.has(k)))fail('filters_not_allowlisted');
 const params=new URLSearchParams();
 for(const [key,raw] of Object.entries(filters)){
  let v;
  if(key==='customer.name')v=name(raw);
  else if(key==='customer.whatsapp')v=phone(raw);
  else if(key==='order.status'){if(!allowedStatuses.has(raw))fail('invalid_status');v=raw}
  else if(key==='order.uuid'){if(!uuid(raw))fail('invalid_uuid');v=raw}
  else if(key==='order.id'){if(!Number.isSafeInteger(raw)||raw<1)fail('invalid_id');v=String(raw)}
  else if(key==='product.slug'){if(typeof raw!=='string'||!/^[a-z0-9-]{1,60}$/.test(raw))fail('invalid_slug');v=raw}
  else v=day(raw);
  params.set(key.replace('.', '[').replace(/^([^[]+)\[([^[]+)$/, '$1[$2]'),v);
 }
 return params;
}

export function legacyOrderProjection(raw,{includeParticipants=false,fullProfile=false}={}){
 return forensicOrderProjection(raw,{includeParticipants,fullProfile});
}

export function legacyReadClient({baseUrl,token,fetchFn=fetch,timeoutMs=7000,includeParticipants=false}){
 const base=baseURL(baseUrl);if(typeof token!=='string'||token.length<12)fail('missing_token');
 const fullProfile=Boolean(includeParticipants);

 const canUseForensicBridge=()=>{
  const crmAppPath=process.env.EVYD_CRM_APP_PATH||'/var/www/evydencia/current';
  return fetchFn===fetch&&existsSync(crmAppPath+'/vendor/autoload.php')&&existsSync(FORENSIC_BRIDGE_SCRIPT);
 };

 async function runForensicBridge(payload){
  const crmAppPath=process.env.EVYD_CRM_APP_PATH||'/var/www/evydencia/current';
  try{
   const {stdout}=await execFileAsync('php',[FORENSIC_BRIDGE_SCRIPT,JSON.stringify(payload)],{
    timeout:Math.max(timeoutMs,15000),maxBuffer:4194304,env:{...process.env,EVYD_CRM_APP_PATH:crmAppPath}
   });
   const parsed=JSON.parse(stdout);
   if(parsed?.error)fail(String(parsed.error));
   return parsed;
  }catch(e){
   if(typeof e?.message==='string'&&e.message.startsWith('legacy_read_'))throw e;
   fail('forensic_bridge_unavailable');
  }
 }

 async function get(path,params){
  const url=new URL(base+path);
  if(params)url.search=params.toString();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetchFn(url,{method:'GET',redirect:'error',signal:controller.signal,
    headers:{Authorization:token,Accept:'application/json'}});
   if(response.redirected||response.status>=300&&response.status<400)fail('redirect');
   if(!response.ok)fail('http_'+response.status);
   const len=Number(response.headers.get('content-length')||0);if(len>1048576)fail('oversize');
   const chunks=[];let size=0;
   if(response.body&&typeof response.body.getReader==='function'){
    const reader=response.body.getReader();
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>1048576)fail('oversize');chunks.push(value)}}
    finally{reader.releaseLock()}
   }else{const text=await response.text();if(Buffer.byteLength(text)>1048576)fail('oversize');chunks.push(Buffer.from(text))}
   const bytes=Buffer.concat(chunks.map(x=>Buffer.from(x)));
   try{return JSON.parse(bytes.toString('utf8'))}catch{fail('invalid_json')}
  }finally{clearTimeout(timeout)}
 }

 return {
  async search(filters={},opts={}){
   const max=Math.min(25,Math.max(1,Number(opts?.limit)||10));
   const page=Math.max(1,Number(opts?.page)||1);
   if(fullProfile&&canUseForensicBridge()){
    const bridgeFilters={};
    const keyMap={'customer.name':'customer_name','customer.whatsapp':'customer_whatsapp','customer.uuid':'customer_uuid','order.uuid':'order_uuid','order.id':'order_id','order.status':'order_status','product.slug':'product_slug','order.created-start':'created_start','order.created-end':'created_end','order.session-start':'session_start','order.session-end':'session_end','payment_method_name':'payment_method_name','has_open_balance':'has_open_balance'};
    for(const [k,v] of Object.entries(filters||{})){
     if(v!==undefined&&v!==null&&v!==''&&keyMap[k])bridgeFilters[keyMap[k]]=v;
    }
    return await runForensicBridge({action:'orders.search',filters:bridgeFilters,limit:max,page,full_profile:true});
   }
   const cleanFilters={};
   for(const [k,v] of Object.entries(filters||{})){if(allKeys.has(k)&&v!==undefined&&v!==null&&v!=='')cleanFilters[k]=v}
   const eff=!Object.keys(cleanFilters).length
    ?{'order.created-start':new Date(Date.now()-30*86400000).toISOString().slice(0,10)}
    :cleanFilters;
   const raw=await get('/api/orders/search',legacyFilters(eff));
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows)fail('invalid_list_contract');
   let sorted=[...rows].sort((a,b)=>(Number(b?.id)||0)-(Number(a?.id)||0));
   if(typeof filters?.['customer.uuid']==='string'&&filters['customer.uuid'].trim()){
    const cu=filters['customer.uuid'].trim().toLowerCase();
    sorted=sorted.filter(r=>String(r?.customer?.uuid||'').toLowerCase()===cu);
   }
   if(typeof filters?.payment_method_name==='string'&&filters.payment_method_name.trim()){
    const pmQ=filters.payment_method_name.trim().toLowerCase();
    sorted=sorted.filter(r=>(Array.isArray(r?.installments)?r.installments:[]).some(i=>String(i?.method?.name||i?.method_name||'').toLowerCase().includes(pmQ)));
   }
   if(typeof filters?.has_open_balance==='boolean'){
    sorted=sorted.filter(r=>{
     const hasOpen=(Array.isArray(r?.installments)?r.installments:[]).some(i=>!i?.payment_at&&!i?.payment?.paid_at&&(money(i?.total)??0)>0);
     return hasOpen===filters.has_open_balance;
    });
   }
   const totalMatching=Number.isInteger(raw?.meta?.total)?raw.meta.total:sorted.length;
   const paged=sorted.slice((page-1)*max,page*max);
   return {source:'LEGACY_SINGLE_AUTH_READ',scope:'PAGINATED_ORDER_SAMPLE',
    sort:'order_id_desc_most_recent_first',
    pagination:{page,per_page:max,returned_count:paged.length,total_matching_orders:totalMatching,total_pages:Math.max(1,Math.ceil(totalMatching/max)),has_more:(page*max)<totalMatching||raw?.links?.next!=null},
    total_in_page:rows.length,
    sampled_count:paged.length,has_more:(page*max)<totalMatching||raw?.links?.next!=null,
    orders:paged.map(r=>forensicOrderProjection(r,{includeParticipants,fullProfile})),
    warning:'Ordenado do pedido mais recente para o mais antigo (horário de emissão em created_at_brt America/Sao_Paulo).'};
  },
  async resolvePhoneByName(customerName){
   const q=name(customerName);
   if(canUseForensicBridge()){
    const res=await runForensicBridge({action:'customers.search',nome_cliente:q,limit:5,full_profile:true});
    const cust=(res?.customers||[]).find(c=>c?.whatsapp||c?.phone);
    if(cust){try{return phone(cust.whatsapp||cust.phone)}catch{}}
   }
   const raw=await get('/api/orders/search',legacyFilters({'customer.name':q}));
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows||!rows.length)fail('customer_not_found');
   const sorted=[...rows].sort((a,b)=>(Number(b?.id)||0)-(Number(a?.id)||0));
   for(const r of sorted){
    const w=r?.customer?.whatsapp||r?.customer?.phone;
    if(typeof w==='string'&&w.replace(/\D/g,'').length>=10){
     try{return phone(w)}catch{}
    }
   }
   fail('customer_phone_unavailable');
  },
  async detail(locator){
   const isObj=locator&&typeof locator==='object';
   const idUuid=isObj?locator.uuid:locator;
   const orderId=isObj&&Number.isSafeInteger(locator.order_id)?locator.order_id:null;
   if(idUuid!==undefined&&idUuid!==null&&idUuid!==''&&!uuid(idUuid))fail('invalid_uuid');
   if(!idUuid&&(!orderId||orderId<1))fail('invalid_uuid');

   if(fullProfile&&canUseForensicBridge()){
    return await runForensicBridge({action:'orders.detail',...(idUuid?{uuid:idUuid}:{order_id:orderId}),full_profile:true});
   }
   if(idUuid){
    const raw=await get('/api/orders/'+idUuid+'/detail');
    const entry=raw?.data??raw;
    if(!entry||typeof entry!=='object'||!entry.uuid)fail('invalid_order_contract');
    return {source:'LEGACY_SINGLE_AUTH_READ',order:forensicOrderProjection(entry,{includeParticipants,fullProfile})};
   }
   const raw=await get('/api/orders/search',legacyFilters({'order.id':orderId}));
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows||!rows.length)fail('order_not_found');
   return {source:'LEGACY_SINGLE_AUTH_READ',order:forensicOrderProjection(rows[0],{includeParticipants,fullProfile})};
  },
  async searchCustomers(params={}){
   const limit=Math.min(25,Math.max(1,Number(params?.limit)||10));
   const page=Math.max(1,Number(params?.page)||1);
   if(canUseForensicBridge()){
    return await runForensicBridge({
     action:'customers.search',
     busca:params.busca||undefined,
     nome_cliente:params.nome_cliente||undefined,
     telefone:params.telefone||undefined,
     email:params.email||undefined,
     documento:params.documento||undefined,
     customer_uuid:params.customer_uuid||undefined,
     only_without_orders:Boolean(params.somente_sem_pedidos),
     only_incomplete_registration:Boolean(params.somente_cadastro_incompleto),
     limit,page,full_profile:fullProfile
    });
   }
   const qParams=new URLSearchParams();
   for(const [k,v] of Object.entries(params||{})){if(v!==undefined&&v!==null&&v!=='')qParams.set(k,String(v))}
   const raw=await get('/api/customers/search',qParams);
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:(Array.isArray(raw?.customers)?raw.customers:null);
   if(!rows)fail('invalid_customer_list_contract');
   const customers=rows.slice(0,limit).map(c=>forensicCustomerProjection(c,{fullProfile}));
   return {
    source:'CRM_DIRECT_CUSTOMER_SEARCH',
    pagination:{page,per_page:limit,returned_count:customers.length,total_matching_customers:raw?.meta?.total??rows.length,total_pages:1,has_more:rows.length>limit},
    customers
   };
  },
  async customerForensic360(locator={}){
   if(canUseForensicBridge()){
    return await runForensicBridge({
     action:'customers.forensic360',
     customer_uuid:locator.customer_uuid||undefined,
     telefone:locator.telefone||undefined,
     nome_cliente:locator.nome_cliente||undefined,
     email:locator.email||undefined,
     documento:locator.documento||undefined,
     page:Math.max(1,Number(locator.pagina)||1),
     per_page:Math.min(20,Math.max(1,Number(locator.por_pagina)||10)),
     full_profile:fullProfile
    });
   }
   const qParams=new URLSearchParams();
   for(const [k,v] of Object.entries(locator||{})){if(v!==undefined&&v!==null&&v!=='')qParams.set(k,String(v))}
   const raw=await get('/api/customers/forensic-360',qParams);
   if(!raw||typeof raw!=='object')fail('invalid_customer_360_contract');
   if(raw.lookup?.status!=='matched')return raw;
   const cust=forensicCustomerProjection(raw.customer,{fullProfile});
   const orders=(Array.isArray(raw.orders)?raw.orders:[]).map(o=>forensicOrderProjection(o,{includeParticipants,fullProfile}));
   const receivedByMethod={};
   for(const o of orders){
    for(const [mk,val] of Object.entries(o?.payment_summary?.effective_paid_by_method_reais||{})){
     receivedByMethod[mk]=Math.round(((receivedByMethod[mk]||0)+val)*100)/100;
    }
   }
   return {
    source:'CRM_DIRECT_CUSTOMER_360',
    lookup:raw.lookup,
    customer:cust,
    kpis:raw.kpis||{total_orders_registered:orders.length},
    financial_audit_summary:raw.financial_audit_summary||{received_by_effective_method_reais:receivedByMethod},
    participants_cross_order_audit:fullProfile?buildCrossOrderParticipantAudit(orders):undefined,
    current_order:orders[0]||null,
    history:raw.history||{page:1,per_page:10,total:orders.length,has_more:false},
    orders
   };
  },
  async natalStatistics({cutoffMmDd}={}){
   let mmdd='';
   if(cutoffMmDd!==undefined&&cutoffMmDd!==null&&cutoffMmDd!==''){
    if(typeof cutoffMmDd!=='string'||!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(cutoffMmDd))fail('invalid_mmdd');
    mmdd=cutoffMmDd;
   }
   const crmAppPath=process.env.EVYD_CRM_APP_PATH||'/var/www/evydencia/current';
   if(fetchFn===fetch&&existsSync(crmAppPath+'/vendor/autoload.php')&&existsSync(BRIDGE_SCRIPT)){
    try{
     const {stdout}=await execFileAsync('php',[BRIDGE_SCRIPT,...(mmdd?[mmdd]:[])],{
      timeout:Math.max(timeoutMs,15000),maxBuffer:2097152,env:{...process.env,EVYD_CRM_APP_PATH:crmAppPath}
     });
     return JSON.parse(stdout);
    }catch{fail('natal_stats_unavailable')}
   }
   const params=new URLSearchParams();
   if(mmdd)params.set('date',mmdd);
   return await get('/api/reports/natal-statistics',params);
  },
  async soldItems({start,end,slug:itemSlug,search,busca}={}){
   if(!start&&!end)fail('missing_period');
   const params=new URLSearchParams();
   if(start)params.set('order[created-start]',day(start));
   if(end)params.set('order[created-end]',day(end));
   if(itemSlug){if(typeof itemSlug!=='string'||!/^[a-z0-9-]{1,60}$/.test(itemSlug))fail('invalid_slug');params.set('item[slug]',itemSlug)}
   const qTerm=search||busca;
   if(qTerm)params.set('buscar',name(qTerm));
   const raw=await get('/api/reports/sold-items',params);
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows)fail('invalid_report_contract');
   return {source:'CRM_DIRECT_SOLD_ITEMS',total_rows:rows.length,
    warning:'Relatório de unidades de itens vendidos por data de criação (orders_items). Para números canônicos de pedidos de Natal (101 em 2026, 142 em 2025, 124 em 2024 até 25/10), use SEMPRE crm_estatisticas_natal.',
    items:rows.slice(0,30).map(r=>({
    item:typeof r?.item==='string'?r.item.slice(0,120):null,
    reference:r?.reference!=null?String(r.reference).slice(0,40):null,
    year:Number.isInteger(r?.year)?r.year:null,
    month:Number.isInteger(r?.month)?r.month:null,
    solds:typeof r?.solds==='number'&&Number.isFinite(r.solds)?r.solds:null
   }))};
  },
  async christmasWithoutParticipants({limit=20}={}){
   const max=Math.min(50,Math.max(1,Number(limit)||20));
   const raw=await get('/api/reports/christmas-orders-without-participants');
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows)fail('invalid_report_contract');
   return {source:'CRM_DIRECT_CHRISTMAS_WITHOUT_PARTICIPANTS',total_orders:rows.length,
    sampled_count:Math.min(rows.length,max),has_more:rows.length>max,
    orders:rows.slice(0,max).map(r=>{
     const u=uuid(r?.order_uuid)?r.order_uuid:null;
     return {
      order_uuid:u,
      crm_order_url:u?'https://evydencia.com/gestao/pedidos/'+u+'/detalhes':null,
      customer_name:typeof r?.customer_name==='string'?r.customer_name.slice(0,100):null,
      customer_phone_masked:maskPhone(r?.customer_whatsapp),
      current_status:typeof r?.current_status==='string'?r.current_status:null,
      participants_count:Number.isInteger(r?.participants)?r.participants:0
     };
    })};
  },
  async christmasCustomers({bought=true,search='',limit=20}={}){
   const max=Math.min(50,Math.max(1,Number(limit)||20));
   const q=search?name(search).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase():'';
   const route=bought?'/api/reports/customers-with-christmas-orders':'/api/reports/customers-without-christmas-orders';
   const raw=await get(route);
   const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
   if(!rows)fail('invalid_report_contract');
   const filtered=q?rows.filter(r=>typeof r?.name==='string'&&r.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)):rows;
   return {source:bought?'CRM_DIRECT_CHRISTMAS_BUYERS':'CRM_DIRECT_CHRISTMAS_NON_BUYERS',
    total_matching:filtered.length,sampled_count:Math.min(filtered.length,max),has_more:filtered.length>max,
    customers:filtered.slice(0,max).map(r=>({
     name:typeof r?.name==='string'?r.name.slice(0,100):null,
     phone_masked:maskPhone(r?.whatsapp)
    }))};
  }
 };
}
