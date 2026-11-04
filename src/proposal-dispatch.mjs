// A normal explicit command owns one durable intent. Reads never become POST retries.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPES=new Set(['full_cadence','initial_whatsapp_only']);
const SCOPE_ERRORS=new Set(['PROPOSAL_INITIAL_ONLY_CONFIRMATION_REQUIRED','PROPOSAL_DELIVERY_SCOPE_CHANGED']);
const data=response=>response?.json&&typeof response.json.data==='object'&&!Array.isArray(response.json.data)?response.json.data:null;
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const result=(resolution,requestId,extra={})=>({scheduled:resolution==='confirmed',
 status:resolution==='confirmed'?'scheduled':resolution,resolution,request_id:requestId??null,
 delivery_scope:'unknown',...extra});
const pending=(id,extra={})=>result('inconclusive',id,{
 message:'O resultado do agendamento está inconclusivo. Consulte esta referência; não repita o envio.',...extra});
const rejected=(id,code,message,extra={})=>result('rejected',id,{error_code:code,message,...extra});
const unavailable=(code,message)=>result('inconclusive',null,{status:'unavailable',error_code:code,message});
const confirmed=(id,d)=>result('confirmed',id,{status:'scheduled',delivery_scope:d.delivery_scope,
 dispatch_uuid:d.dispatch_uuid,scheduled_at:iso(d.scheduled_at),replay:d.replay===true,
 ...(typeof d.activity_url==='string'?{activity_url:d.activity_url}:{}),
 message:d.delivery_scope==='full_cadence'
  ?'Proposta completa agendada. O protocolo confirma o agendamento, não a entrega.'
  :'Somente o WhatsApp inicial foi agendado, sem acompanhamentos. O protocolo não confirma entrega.'});

export function createProposalDispatcher({journal,actor,preview,schedule,outcome}){
 async function consult(requestId){
  if(typeof requestId!=='string'||!UUID.test(requestId))return unavailable('PROPOSAL_REQUEST_INVALID','Referência inválida.');
  requestId=requestId.toLowerCase();
  let intent=null;
  try{
   if(journal.available)intent=await journal.byRequest({actor,requestId});
   // These refusals came from an authenticated HTTP response before scheduling,
   // not from treating an absent database record as a failed POST.
   if(intent?.outcome?.resolution==='rejected')return rejected(requestId,intent.outcome.error_code,'A solicitação foi recusada antes do agendamento.');
   const response=await outcome(requestId),d=data(response);
   if(!response.ok||!d||d.proposal_request_id!==requestId)return pending(requestId);
   if(d.resolution==='rejected'){
    const code=typeof d.reason==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(d.reason)
     ?d.reason.toUpperCase():'PROPOSAL_REQUEST_REJECTED';
    if(intent)await journal.settle(intent,{resolution:'rejected',error_code:code});
    return rejected(requestId,code,'A solicitação foi recusada antes do agendamento.');
   }
   if(d.resolution!=='confirmed'||d.status!=='scheduled'||!UUID.test(d.dispatch_uuid)
     ||!SCOPES.has(d.delivery_scope)||(intent&&intent.delivery_scope!==d.delivery_scope))return pending(requestId);
   if(intent)await journal.settle(intent,{resolution:'confirmed',dispatch_uuid:d.dispatch_uuid,
    delivery_scope:d.delivery_scope,scheduled_at:iso(d.scheduled_at)});
   return confirmed(requestId,d);
  }catch{return pending(requestId)}
 }

 async function send({phone,name=null,confirmedByOperator=false,allowInitialOnly=false,resendMode='normal',requestId}={}){
  if(confirmedByOperator!==true)return rejected(null,'OPERATOR_CONFIRMATION_REQUIRED','É necessário um pedido explícito do operador para este destinatário.');
  if(resendMode!=='normal')return rejected(null,'PROPOSAL_RESEND_REQUIRES_SEPARATE_FLOW','Reenvios e reativações exigem o fluxo específico.');
  if(typeof allowInitialOnly!=='boolean')return rejected(null,'PROPOSAL_SCOPE_INVALID','Informe a modalidade pretendida.');
  if(requestId!==undefined&&(typeof requestId!=='string'||!UUID.test(requestId)))return unavailable('PROPOSAL_REQUEST_INVALID','Referência inválida.');
  if(!journal.available)return unavailable('PROPOSAL_JOURNAL_UNAVAILABLE','O envio está indisponível até concluir a configuração operacional.');
  const requestedScope=allowInitialOnly?'initial_whatsapp_only':'full_cadence';
  let intent=null;
  try{
   if(requestId&&await journal.byRequest({actor,requestId}))return consult(requestId);
   // Resolve outstanding work before preview, including when recipient/name/scope
   // changed or this gateway process was restarted. No TTL clears uncertainty.
   const previous=await journal.latest({actor,phone});
   if(previous&&previous.outcome?.resolution!=='rejected')return consult(previous.request_id);
   const response=await preview({phone,name}),p=data(response);
   if(!response.ok||!p||!SCOPES.has(p.delivery_scope))return unavailable('PROPOSAL_DELIVERY_SCOPE_UNAVAILABLE','Não foi possível confirmar a modalidade da proposta.');
   if(p.ready!==true)return unavailable('PROPOSAL_FLOW_UNAVAILABLE','A proposta está indisponível para este destinatário. Verifique novamente.');
   if(p.delivery_scope!==requestedScope){
    const code=requestedScope==='full_cadence'?'PROPOSAL_INITIAL_ONLY_CONFIRMATION_REQUIRED':'PROPOSAL_DELIVERY_SCOPE_CHANGED';
    return rejected(null,code,requestedScope==='full_cadence'
     ?'A régua está limitada. Autorize explicitamente somente o WhatsApp inicial para continuar.'
     :'A régua completa voltou a ficar disponível. Faça um novo pedido para enviar a proposta completa.',
     {http_status:409,delivery_scope:p.delivery_scope});
   }
   const fingerprint=journal.fingerprint(actor,{phone,name,delivery_scope:requestedScope,resend_mode:'normal',
    variant:p.selection?.variant??null,campaign_id:p.selection?.campaign_id??p.campaign_id??null,
    message_preview:p.message_preview??null});
   const started=await journal.begin({actor,phone,fingerprint,deliveryScope:requestedScope,requestId});
   intent=started.intent;
   if(!started.created)return intent?consult(intent.request_id):pending(requestId);
   // Both the context and UUID index are durable before this sole POST.
   const sent=await schedule({request_id:intent.request_id,phone,name,resend_mode:'normal',allow_initial_only:allowInitialOnly},
    {'X-Idempotency-Key':intent.request_id,'X-Request-ID':intent.request_id});
   const d=data(sent);
   if(!sent.ok){
    const code=sent.json?.error?.code;
    if(sent.status===409&&SCOPE_ERRORS.has(code)){
     await journal.settle(intent,{resolution:'rejected',error_code:code});
     return rejected(intent.request_id,code,'A modalidade mudou. Verifique a prévia e faça um novo pedido explícito.',{http_status:409});
    }
    return pending(intent.request_id,{http_status:sent.status});
   }
   if(!d||d.status!=='scheduled'||!UUID.test(d.dispatch_uuid)||d.delivery_scope!==requestedScope)return pending(intent.request_id);
   await journal.settle(intent,{resolution:'confirmed',dispatch_uuid:d.dispatch_uuid,
    delivery_scope:d.delivery_scope,scheduled_at:iso(d.scheduled_at)});
   return confirmed(intent.request_id,d);
  }catch{
   return intent?pending(intent.request_id):unavailable('PROPOSAL_JOURNAL_UNAVAILABLE','Não foi possível preparar uma referência segura. Nenhum novo envio deve ser tentado sem verificar o resultado.');
  }
 }
 return {send,consult};
}
