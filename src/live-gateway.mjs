// LIVE MCP gateway over Streamable HTTP. Each request is authenticated (OAuth bearer),
// authorized per operator and served by a fresh McpServer bound to THAT operator's Sanctum token.
// Direct CRM tools (orders/reports/Natal intelligence on evydencia.com) replace api.evydencia.com.br.
// Logs never carry tokens or raw PII.
import {McpServer,createMcpHandler,requireBearerAuth,getOAuthProtectedResourceMetadataUrl,oauthMetadataResponse,validateHostHeader} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {crmClient,phone,proposalName,proposalProjection} from './core.mjs';
import {legacyReadClient} from './legacy-api-read.mjs';
import {capabilityManifest} from './capabilities.mjs';
import {gatewayConfig,createOAuthServer,operatorVerifier,GATEWAY_SCOPE} from './oauth-gateway.mjs';

const REPO_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const resolveBuildInfo=()=>{
 try{
  const commit=execFileSync('git',['rev-parse','--short','HEAD'],{cwd:REPO_ROOT,encoding:'utf8',timeout:1500}).trim()||'unknown';
  const branch=execFileSync('git',['rev-parse','--abbrev-ref','HEAD'],{cwd:REPO_ROOT,encoding:'utf8',timeout:1500}).trim()||'unknown';
  return {commit,branch};
 }catch{
  return {commit:process.env.EVYD_BUILD_COMMIT||'unknown',branch:process.env.EVYD_BUILD_BRANCH||'unknown'};
 }
};
export const BUILD_INFO=Object.freeze(resolveBuildInfo());

export const LIVE_TOOL_NAMES=Object.freeze(['crm_capacidades','crm_status','crm_campanha_publica','crm_horarios_publicos','crm_conexao_privada','crm_cliente_resumo','crm_cliente_360']);
export const DIRECT_CRM_TOOL_NAMES=Object.freeze(['crm_estatisticas_natal','crm_pedidos_buscar','crm_pedido_detalhe','crm_relatorio_itens_vendidos','crm_relatorio_natal_sem_participantes','crm_relatorio_clientes_natal']);
export const FORENSIC_CRM_TOOL_NAMES=Object.freeze(['crm_clientes_buscar']);
export const PROPOSAL_CRM_TOOL_NAMES=Object.freeze(['crm_previa_proposta_natal','crm_enviar_proposta_natal']);
const READ={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const WRITE_IDEMPOTENT={readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true};
const SAFE_ERR=/^(crm_[a-z0-9_]+|invalid_[a-z0-9_]+|legacy_read_[a-z0-9_]+|operator_token_revoked|operator_confirmation_required)$/;
const INSTRUCTIONS='EVYDÊNCIA CRM LIVE (v0.9 Forense) — Conectado diretamente ao CRM oficial (evydencia.com). Regras obrigatórias de precisão e auditoria: (1) Natal 2026: para KPIs, pedidos aguardando retirada (operational_stages_2026.waiting_product_retrieve_orders), sem participantes (orders_without_participants_2026), próxima sessão (sessions_schedule_2026.next_session), ensaios realizados em 2021–2026 (realized_sessions_comparison_at_cutoff) e comparativos de vendas até o corte (ytd_comparison_at_cutoff), use SEMPRE crm_estatisticas_natal. (2) Links diretos: sempre cite crm_order_url (https://evydencia.com/gestao/pedidos/$UUID/detalhes) e crm_customer_url (https://evydencia.com/gestao/clientes/$UUID/ler). (3) Auditoria financeira e parcelas: consulte installments[] e payment_summary; diferencie SEMPRE method_name (meio específico registrado na parcela, ex.: "Permuta", "Pix - Pagar.me") de method_category_label (categoria contábil/enum, ex.: "Dinheiro", "Pix"), verifique payment_summary.effective_paid_by_method_reais, payment_needs_review e a linha do tempo cronológica em status_history[]. (4) Produtos e bônus R$ 0: verifique items[].bonus_classification; só afirme regra automática de campanha (campaign_bonus / benefit_key) quando bonus_classification.proven === true; quando origin === "unknown" (proven: false), informe que a origem do item R$ 0 não está rastreada automaticamente. (5) Participantes: informe participants_registration.status_label ("Cadastro pendente" vs "Concluído em..."), diferencie age_at_session (session_reference_date) de age_today (age_reference_date) e, no Cliente 360, verifique participants_cross_order_audit.birth_date_discrepancies sem jamais sugerir sobrescrita automática. (6) Avatar e clientes sem pedidos (leads): verifique avatar.has_avatar (url quando true; initials com url: null quando false — ausência de foto não é erro) e registration_completeness; para localizar clientes com 0 pedidos ou por nome/CPF/e-mail/UUID, use crm_clientes_buscar, crm_cliente_resumo ou crm_cliente_360. (7) Proposta Natal 2026: use crm_previa_proposta_natal / crm_enviar_proposta_natal.';

export function defaultLog(entry){process.stderr.write(JSON.stringify({ts:new Date().toISOString(),...entry})+'\n')}

function manifest(directEnabled=false,operatorFullCrm=false){
 const m=capabilityManifest({mock:false,privateEnabled:true});
 const activeSet=new Set([...LIVE_TOOL_NAMES,...(operatorFullCrm?PROPOSAL_CRM_TOOL_NAMES:[])]);
 return {...m,version:'0.9.0',build_commit:BUILD_INFO.commit,repository_branch:BUILD_INFO.branch,
  mode:operatorFullCrm?'LIVE_OPERATOR_FULL_OAUTH':'LIVE_READ_ONLY_OAUTH',direct_crm_read_enabled:directEnabled,
  forensic_audit_enabled:Boolean(directEnabled&&operatorFullCrm),
  proposal_dispatch_enabled:operatorFullCrm,
  tools:m.tools.map(t=>activeSet.has(t.tool)?{...t,state:'LIVE_ACTIVE'}:{...t,state:t.state==='WRITE_GATED'?'WRITE_GATED':'NOT_AVAILABLE'}),
  ...(directEnabled?{direct_crm_tools:DIRECT_CRM_TOOL_NAMES}:{}),
  ...(directEnabled&&operatorFullCrm?{forensic_crm_tools:FORENSIC_CRM_TOOL_NAMES}:{}),
  ...(operatorFullCrm?{proposal_crm_tools:PROPOSAL_CRM_TOOL_NAMES}:{})};
}

function liveServer(auth,{cfg,fetchFn,operators,log}){
 const ex=auth?.extra||{};
 if(typeof ex.upstream!=='string'||!ex.operatorId)throw Error('gateway_missing_identity');
 const crm=crmClient({baseUrl:cfg.crmBaseUrl,token:ex.upstream,privateEnabled:true,timeoutMs:cfg.crmTimeoutMs,fetchFn,strictEnvelope:true});
 const direct=cfg.internalReadToken?legacyReadClient({baseUrl:cfg.crmBaseUrl,token:cfg.internalReadToken,fetchFn,timeoutMs:cfg.crmTimeoutMs,includeParticipants:cfg.operatorFullCrm}):null;
 const resolvePhone=async({telefone,nome_cliente})=>{
  if(typeof telefone==='string'&&telefone.trim()){
   const t=telefone.trim();
   if(/\d{8,}/.test(t.replace(/\D/g,''))||!direct)return t;
   return await direct.resolvePhoneByName(t);
  }
  if(typeof nome_cliente==='string'&&nome_cliente.trim()&&direct)return await direct.resolvePhoneByName(nome_cliente.trim());
  throw Error('invalid_mobile');
 };
 const enrichOrderWithDirect=async ord=>{
  if(!ord||typeof ord!=='object'||!ord.uuid)return ord;
  const crm_order_url='https://evydencia.com/gestao/pedidos/'+ord.uuid+'/detalhes';
  if(!direct||!cfg.operatorFullCrm)return {...ord,crm_order_url};
  try{
   const det=await direct.detail({uuid:ord.uuid});
   const d=det?.order;
   if(!d)return {...ord,crm_order_url};
   return {
    ...ord,
    order_id:d.order_id??ord.order_id??null,
    crm_order_url,
    created_at_brt:d.created_at_brt??ord.created_at_brt??null,
    session_at:d.session_at??ord.session_date??ord.session_at??null,
    package_name:d.package_name??ord.package_name??null,
    payment_methods:d.payment_methods??[],
    payment_summary:d.payment_summary??null,
    installments:d.installments??[],
    items:d.items??[],
    status_history_count:d.status_history_count??0,
    status_history:d.status_history??[],
    customer_avatar_url:d.customer_avatar_url??null,
    customer_has_avatar:d.customer_has_avatar??false,
    customer_initials:d.customer_initials??null,
    total_reais:d.total_reais??ord.total_amount??null,
    received_reais:d.received_reais??null,
    remaining_reais:d.remaining_reais??ord.balance_pending??null,
    participants_count:d.participant_count??ord.participants_count??0,
    participants_registration:d.participants_registration??null,
    participants:d.participants??[]
   };
  }catch{
   return {...ord,crm_order_url};
  }
 };
 const tryExtensionEligibility=async rawPhone=>{
  if(typeof rawPhone!=='string'||!rawPhone.trim())return null;
  try{return await crm.customer(phone(rawPhone))}catch{return null}
 };
 const callExtensionPost=async(path,body,extraHeaders={})=>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),cfg.crmTimeoutMs);
  try{
   const r=await fetchFn(new URL(cfg.crmBaseUrl+path),{
    method:'POST',redirect:'error',signal:controller.signal,
    headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+ex.upstream,...extraHeaders},
    body:JSON.stringify(body)
   });
   if(r.redirected)throw Error('crm_redirect_forbidden');
   const text=await r.text();
   let json;try{json=JSON.parse(text)}catch{throw Error('crm_invalid_json')}
   if(r.status===401)throw Error('crm_http_401');
   return {status:r.status,ok:r.ok,json};
  }finally{clearTimeout(timeout)}
 };
 const safe=(tool,fn)=>async input=>{
  const t0=performance.now();
  try{
   const result=await fn(input||{});
   log({evt:'tool',tool,ok:true,op:ex.operatorTag,ms:Math.round(performance.now()-t0)});
   return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
  }catch(e){
   let code=SAFE_ERR.test(e?.message||'')?e.message:'crm_unavailable';
   if(code==='crm_http_401'){code='operator_token_revoked';operators.forget(ex.upstream)}
   log({evt:'tool',tool,ok:false,err:code,op:ex.operatorTag,ms:Math.round(performance.now()-t0)});
   return {isError:true,content:[{type:'text',text:JSON.stringify({error:code})}]};
  }
 };
 const m=new McpServer({name:'evydencia-crm-mcp-live',version:'0.9.0'},{instructions:INSTRUCTIONS});
 const reg=(name,title,description,inputSchema,fn,annotations=READ)=>m.registerTool(name,{title,description,inputSchema,annotations},safe(name,fn));
 reg('crm_capacidades','Capacidades disponíveis','Lista o que existe neste conector LIVE, versão/commit implantado (build_commit) e as ferramentas habilitadas.',z.object({}),()=>manifest(Boolean(direct),cfg.operatorFullCrm));
 reg('crm_status','Estado do CRM','Liveness público do CRM.',z.object({}),()=>crm.status());
 reg('crm_campanha_publica','Pacotes públicos','Catálogo público de uma campanha (padrão natal).',z.object({campanha:z.string().max(80).default('natal')}),({campanha})=>crm.campaign(campanha));
 reg('crm_horarios_publicos','Horários públicos','Horários públicos de um pacote, janela máxima de 14 dias (AAAA-MM-DD). Não cria reservas.',z.object({campanha:z.string().max(80).default('natal'),pacote:z.string().max(80),inicio:z.string().max(10),fim:z.string().max(10)}),({campanha,pacote,inicio,fim})=>crm.availability(campanha,pacote,inicio,fim));
 reg('crm_conexao_privada','Identidade do operador','Operador autenticado, fuso do servidor e abilities do token.',z.object({}),()=>crm.bootstrap());
 reg('crm_cliente_resumo','Cliente por telefone, nome, CPF, e-mail ou UUID','Contexto completo do cliente (inclusive leads com 0 pedidos) por telefone (DDD+número), nome_cliente, customer_uuid, email ou documento: dados cadastrais do titular, avatar/iniciais, completude cadastral (registration_completeness), resumo financeiro, pedido atual, link no CRM e elegibilidade Natal 2026.',z.object({
  telefone:z.string().min(8).max(30).optional(),
  nome_cliente:z.string().min(2).max(100).optional(),
  customer_uuid:z.string().min(36).max(36).optional(),
  email:z.string().min(4).max(120).optional(),
  documento:z.string().min(11).max(20).optional()
 }),async input=>{
  if(cfg.operatorFullCrm&&direct){
   try{
    const f360=await direct.customerForensic360({...input,pagina:1,por_pagina:3});
    if(f360?.lookup?.status!=='matched')return f360;
    const ext=await tryExtensionEligibility(f360.customer?.whatsapp||f360.customer?.phone||input?.telefone);
    return {
     source:f360.source,
     lookup:f360.lookup,
     customer:f360.customer,
     kpis:f360.kpis,
     financial_audit_summary:f360.financial_audit_summary,
     participants_cross_order_audit:f360.participants_cross_order_audit,
     current_order:f360.current_order,
     ...(ext?.natal_2026?{natal_2026:ext.natal_2026}:{}),
     ...(ext?.capabilities?{capabilities:ext.capabilities}:{})
    };
   }catch(e){
    if(e?.message!=='legacy_read_http_404')throw e;
   }
  }
  const res=await crm.customer(await resolvePhone(input));
  if(!cfg.operatorFullCrm||!res?.current_order)return res;
  return {...res,current_order:await enrichOrderWithDirect(res.current_order)};
 });
 reg('crm_cliente_360','Cliente 360 Forense (histórico, pagamentos, avatar e auditoria)','Reconstrução 360 completa do cliente (inclusive leads com 0 pedidos) por telefone, nome_cliente, customer_uuid, email ou documento: perfil completo do titular, avatar/iniciais, diagnóstico de cadastro incompleto (registration_completeness), KPIs, resumo financeiro por meio efetivo (financial_audit_summary), auditoria cruzada de divergências históricas de participantes entre pedidos (participants_cross_order_audit) e pedidos completos com parcelas, linha do tempo de status e origem de bônus.',z.object({
  telefone:z.string().min(8).max(30).optional(),
  nome_cliente:z.string().min(2).max(100).optional(),
  customer_uuid:z.string().min(36).max(36).optional(),
  email:z.string().min(4).max(120).optional(),
  documento:z.string().min(11).max(20).optional(),
  pagina:z.number().int().min(1).max(100).default(1),
  por_pagina:z.number().int().min(1).max(20).default(10)
 }),async input=>{
  if(cfg.operatorFullCrm&&direct){
   try{
    const f360=await direct.customerForensic360(input);
    if(f360?.lookup?.status!=='matched')return f360;
    const ext=await tryExtensionEligibility(f360.customer?.whatsapp||f360.customer?.phone||input?.telefone);
    return {
     ...f360,
     ...(ext?.natal_2026?{natal_2026:ext.natal_2026}:{}),
     ...(ext?.capabilities?{capabilities:ext.capabilities}:{})
    };
   }catch(e){
    if(e?.message!=='legacy_read_http_404')throw e;
   }
  }
  const res=await crm.history(await resolvePhone(input),input.pagina);
  if(!cfg.operatorFullCrm)return res;
  const current_order=res?.current_order?await enrichOrderWithDirect(res.current_order):null;
  const orders=Array.isArray(res?.orders)?await Promise.all(res.orders.map(enrichOrderWithDirect)):[];
  return {...res,current_order,orders};
 });
 if(cfg.operatorFullCrm){
  reg('crm_previa_proposta_natal','Prévia da Proposta de Natal 2026','Simula e gera a prévia oficial da proposta de Natal 2026 no CRM para o telefone informado (DDD+número) e nome opcional, validando elegibilidade comercial (Regra de Ouro: bloqueia se já comprou Natal 2026 ou se houver múltiplos cadastros) sem disparar mensagem.',z.object({
   telefone:z.string().min(8).max(30),
   nome:z.string().max(80).optional()
  }),async({telefone,nome})=>{
   const normPhone=phone(telefone);
   const normName=proposalName(nome)??null;
   const {ok,status,json}=await callExtensionPost('/api/v1/extension/proposals/preview',{phone:normPhone,name:normName});
   if(!ok){
    const err=json?.error||{};
    return {ready:false,scheduled:false,http_status:status,error_code:err.code||'PROPOSAL_NOT_ELIGIBLE',message:err.message||'Não foi possível gerar a prévia da proposta.',retryable:Boolean(err.retryable)};
   }
   return {...proposalProjection(json),variant:json?.data?.variant??json?.data?.selection?.variant??null,campaign_id:json?.data?.campaign_id??json?.data?.campaign?.id??null,message_preview:json?.data?.message_preview??json?.data?.message??null,phone_formatted:json?.data?.phone_formatted??null};
  });
  reg('crm_enviar_proposta_natal','Disparar / Agendar Proposta de Natal 2026','Dispara e agenda oficialmente o envio da proposta comercial de Natal 2026 pelo CRM (WhatsApp / cadência oficial) para o telefone informado (DDD+número) e nome opcional. Aplica a Regra de Ouro do CRM (bloqueia automaticamente se o cliente já comprou Natal 2026 ou se o telefone estiver duplicado) e garante idempotência.',z.object({
   telefone:z.string().min(8).max(30),
   nome:z.string().max(80).optional(),
   confirmado_pelo_operador:z.boolean().default(true),
   modo_reenvio:z.enum(['normal','send_again','abort_and_resend']).default('normal'),
   request_id:z.string().uuid().optional()
  }),async({telefone,nome,confirmado_pelo_operador=true,modo_reenvio='normal',request_id})=>{
   if(confirmado_pelo_operador!==true)throw Error('operator_confirmation_required');
   const normPhone=phone(telefone);
   const normName=proposalName(nome)??null;
   const reqId=request_id||randomUUID();
   const {ok,status,json}=await callExtensionPost('/api/v1/extension/proposals/schedule',{
    request_id:reqId,phone:normPhone,name:normName,resend_mode:modo_reenvio
   },{'X-Idempotency-Key':reqId,'X-Request-ID':reqId});
   if(!ok){
    const err=json?.error||{};
    return {scheduled:false,http_status:status,error_code:err.code||'PROPOSAL_DISPATCH_REJECTED',message:err.message||'O CRM recusou o disparo da proposta.',retryable:Boolean(err.retryable),request_id:reqId};
   }
   const d=json?.data||{};
   return {
    scheduled:true,
    status:d.status||d.proposal?.status||'scheduled',
    replay:Boolean(d.replay),
    dispatch_uuid:d.dispatch_uuid||d.proposal?.uuid||null,
    phone_masked:d.phone_masked||null,
    recipient_name:normName,
    variant:d.variant||d.proposal?.variant||null,
    variant_label:d.variant_label||null,
    scheduled_at:d.scheduled_at||d.proposal?.send_after||null,
    resend_mode:d.resend_mode||modo_reenvio,
    request_id:reqId
   };
  },WRITE_IDEMPOTENT);
 }
 if(direct){
  reg('crm_estatisticas_natal','Central de Inteligência — Estatísticas e Operação de Natal','Retorna os dados canônicos oficiais de /gestao/natal/estatisticas e da operação de Natal 2026: (1) KPIs 2026 (101 pedidos válidos, clientes únicos, sessões agendadas, receita contratada/recebida/a receber, pacotes 2026); (2) Estágios operacionais de Natal 2026 (operational_stages_2026: quantos e quais pedidos estão Aguardando Retirada em waiting_product_retrieve_orders, Sessão Agendada, Pagamento Confirmado, Concluídos, com crm_order_url e participantes); (3) Quantos e quem são os clientes/pedidos de Natal 2026 que ainda não enviaram participantes (orders_without_participants_2026); (4) Qual é a próxima sessão de Natal agendada e quando é (sessions_schedule_2026.next_session e upcoming_sessions_next_15); (5) Quantos ensaios de Natal já tínhamos realizado até a mesma data (MM-DD) nos anos anteriores (2021 a 2026, excluindo cancelados/chargeback/estornados) e total realizado no ano vigente (realized_sessions_comparison_at_cutoff); (6) Comparativo de vendas acumuladas até o corte (ytd_comparison_at_cutoff).',z.object({
   data_corte_mm_dd:z.string().max(5).optional()
  }),({data_corte_mm_dd})=>direct.natalStatistics({cutoffMmDd:data_corte_mm_dd}));
  reg('crm_pedidos_buscar','Buscar pedidos ou listar todos os pedidos no CRM','Busca direta e paginada de pedidos no CRM (evydencia.com) ordenados do MAIS RECENTE para o mais antigo (paridade com /gestao/pedidos), retornando pagination.total_matching_orders e total_orders_in_crm (ex.: 5.054+ pedidos). Inclui crm_order_url, avatar/iniciais e perfil do cliente, parcelas individuais (installments[] com method_name vs method_category_label, vencimento, pagamento, transações e recibos), payment_summary, linha do tempo de status (status_history[]), itens detalhados com origem comprovada de bônus (bonus_classification), participants_registration ("Cadastro pendente" vs "Concluído") e participantes (com age_at_session e age_today).',z.object({
   customer_name:z.string().min(2).max(100).optional(),
   customer_whatsapp:z.string().min(8).max(30).optional(),
   customer_uuid:z.string().min(36).max(36).optional(),
   order_uuid:z.string().max(40).optional(),
   order_id:z.number().int().min(1).optional(),
   order_status:z.string().max(40).optional(),
   product_slug:z.string().max(60).optional(),
   payment_method_name:z.string().min(2).max(60).optional(),
   has_open_balance:z.boolean().optional(),
   created_start:z.string().max(10).optional(),
   created_end:z.string().max(10).optional(),
   session_start:z.string().max(10).optional(),
   session_end:z.string().max(10).optional(),
   pagina:z.number().int().min(1).max(500).default(1),
   limite:z.number().int().min(1).max(25).default(10)
  }),input=>{
   const map={'customer_name':'customer.name','customer_whatsapp':'customer.whatsapp','customer_uuid':'customer.uuid','order_uuid':'order.uuid','order_id':'order.id','order_status':'order.status','product_slug':'product.slug','payment_method_name':'payment_method_name','has_open_balance':'has_open_balance','created_start':'order.created-start','created_end':'order.created-end','session_start':'order.session-start','session_end':'order.session-end'};
   const filters={};
   for(const [k,v] of Object.entries(input||{}))if(v!==undefined&&v!==null&&v!==''&&map[k])filters[map[k]]=v;
   return direct.search(filters,{limit:input?.limite,page:input?.pagina});
  });
  reg('crm_pedido_detalhe','Auditoria e detalhe completo de pedido no CRM (por UUID ou ID)','Auditoria completa de um pedido no CRM aceitando uuid OU order_id numérico (ex.: order_id: 4510): retorna crm_order_url, dados do titular e avatar, payment_summary, parcelas individuais (installments[] distinguindo method_name como "Permuta" de method_category_label como "Dinheiro", datas de baixa, transações Pagar.me e recibos bills[]), linha do tempo cronológica de status (status_history[]), produtos/extras com bonus_classification (order_bonus_applications), participants_registration e participantes com idade na sessão e idade hoje.',z.object({
   uuid:z.string().min(36).max(36).optional(),
   order_id:z.number().int().min(1).optional()
  }),({uuid,order_id})=>direct.detail({uuid,order_id}));
  if(cfg.operatorFullCrm){
   reg('crm_clientes_buscar','Buscar clientes e leads (inclusive com zero pedidos) no CRM','Busca paginada diretamente no cadastro geral de clientes (/gestao/clientes) por busca livre (nome, WhatsApp, e-mail ou CPF/CNPJ), nome_cliente, telefone, email, documento ou customer_uuid. Localiza inclusive leads com 0 pedidos (somente_sem_pedidos: true) ou com cadastro incompleto para cartão (somente_cadastro_incompleto: true), retornando avatar/iniciais, dados completos do titular, orders_count, lifecycle_stage e registration_completeness.',z.object({
    busca:z.string().min(2).max(120).optional(),
    nome_cliente:z.string().min(2).max(100).optional(),
    telefone:z.string().min(8).max(30).optional(),
    email:z.string().min(4).max(120).optional(),
    documento:z.string().min(4).max(20).optional(),
    customer_uuid:z.string().min(36).max(36).optional(),
    somente_sem_pedidos:z.boolean().default(false),
    somente_cadastro_incompleto:z.boolean().default(false),
    pagina:z.number().int().min(1).max(500).default(1),
    limite:z.number().int().min(1).max(25).default(10)
   }),input=>direct.searchCustomers({...input,page:input?.pagina,limit:input?.limite}));
  }
  reg('crm_relatorio_itens_vendidos','Relatório de itens vendidos (unidades brutas)','Relatório geral do CRM de unidades de itens vendidos (orders_items) por período de emissão (AAAA-MM-DD). ATENÇÃO: Não use para contagem oficial de pedidos ou ensaios de Natal (para Natal use crm_estatisticas_natal).',z.object({
   inicio:z.string().max(10),
   fim:z.string().max(10),
   slug:z.string().max(60).optional(),
   busca:z.string().max(80).optional()
  }),({inicio,fim,slug:s,busca})=>direct.soldItems({start:inicio,end:fim,slug:s,busca}));
  reg('crm_relatorio_natal_sem_participantes','Pedidos de Natal sem participantes','Lista pedidos de Natal do ano corrente com pagamento/sessão e zero participantes cadastrados, incluindo link direto do pedido no CRM (crm_order_url). Para visão completa (incluindo sessão, pacote e concluídos), consulte também orders_without_participants_2026 em crm_estatisticas_natal.',z.object({limite:z.number().int().min(1).max(50).default(20)}),({limite})=>direct.christmasWithoutParticipants({limit:limite}));
  reg('crm_relatorio_clientes_natal','Clientes com ou sem compra de Natal','Consulta clientes no CRM com ou sem pedido de Natal no ano corrente, com filtro opcional por nome.',z.object({
   comprou_natal:z.boolean().default(true),
   busca_nome:z.string().min(2).max(80).optional(),
   limite:z.number().int().min(1).max(50).default(20)
  }),({comprou_natal,busca_nome,limite})=>direct.christmasCustomers({bought:comprou_natal,search:busca_nome||'',limit:limite}));
 }
 return m;
}

function rateLimiter(now){
 const buckets=new Map();
 return (key,limit)=>{
  const t=now(),win=Math.floor(t/60000);
  if(buckets.size>5000)for(const [k,b] of buckets)if(b.win!==win)buckets.delete(k);
  const b=buckets.get(key);
  if(!b||b.win!==win){buckets.set(key,{win,n:1});return true}
  b.n++;return b.n<=limit;
 };
}

export function createGateway(env,{fetchFn=fetch,log=defaultLog,now=()=>Date.now()}={}){
 const cfg=gatewayConfig(env);
 const operators=operatorVerifier(cfg,{fetchFn,now});
 const oauth=createOAuthServer(cfg,{operators,now,log});
 const resourceUrl=new URL(cfg.resource);
 const resourceMetadataUrl=getOAuthProtectedResourceMetadataUrl(resourceUrl);
 const gate=requireBearerAuth({verifier:oauth.verifier,requiredScopes:[GATEWAY_SCOPE],resourceMetadataUrl,expectedResource:resourceUrl});
 const mcp=createMcpHandler(ctx=>liveServer(ctx.authInfo,{cfg,fetchFn,operators,log}),{responseMode:'auto',maxRequestBodySize:65536,onerror:()=>log({evt:'mcp_error'})});
 const allowed=rateLimiter(now);
 const allowedHosts=[cfg.hostname,...(cfg.insecureLocal?['localhost','127.0.0.1']:[])];
 const metaOpts={oauthMetadata:oauth.metadata,resourceServerUrl:resourceUrl,scopesSupported:[GATEWAY_SCOPE],resourceName:'Evydência CRM (somente leitura)',dangerouslyAllowInsecureIssuerUrl:cfg.insecureLocal};
 const plain=(status,body,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...extra}});
 const withPrivateNoStore=res=>{
  try{res.headers.set('Cache-Control','private, no-store');return res}
  catch{const h=new Headers(res.headers);h.set('Cache-Control','private, no-store');return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h})}
 };

 async function route(request,{ip='unknown',host}={}){
  const path=new URL(request.url).pathname;
  if(path==='/healthz')return plain(200,{ok:true,service:'evydencia-crm-mcp-live',version:'0.9.0',build_commit:BUILD_INFO.commit,repository_branch:BUILD_INFO.branch});
  if(!validateHostHeader(host??request.headers.get('host'),allowedHosts).ok)return plain(403,{error:'invalid_host'});
  const meta=oauthMetadataResponse(request,metaOpts);
  if(meta)return meta;
  if(path==='/register'||path==='/authorize'||path==='/token'){
   if(!allowed('auth:'+ip,cfg.rateAuthPerMin))return plain(429,{error:'rate_limited'},{'Retry-After':'60'});
   return oauth.handle(request,path);
  }
  if(path==='/mcp'){
   const auth=await gate(request);
   if(auth instanceof Response)return withPrivateNoStore(auth);
   if(!allowed('op:'+auth.extra.operatorId,cfg.rateMcpPerMin))return plain(429,{error:'rate_limited'},{'Retry-After':'60'},);
   return withPrivateNoStore(await mcp.fetch(request,{authInfo:auth}));
  }
  return plain(404,{error:'not_found'});
 }

 async function handle(request,meta={}){
  const t0=performance.now(),path=new URL(request.url).pathname;
  let res;
  try{res=await route(request,meta)}catch{res=plain(500,{error:'server_error'})}
  // Pathname only: query strings may carry OAuth codes/state.
  log({evt:'http',method:request.method,path:path.slice(0,64),status:res.status,ms:Math.round(performance.now()-t0)});
  return res;
 }
 return {cfg,handle,close:()=>mcp.close()};
}

// node:http bridge (the @modelcontextprotocol/node adapter is not a dependency).
export function nodeListener(gateway){
 const {cfg}=gateway;
 return async(req,res)=>{
  try{
   if(typeof req.url!=='string'||!req.url.startsWith('/')){res.writeHead(400).end();return}
   const headers=new Headers();
   for(let i=0;i<req.rawHeaders.length;i+=2)headers.append(req.rawHeaders[i],req.rawHeaders[i+1]);
   const hasBody=!['GET','HEAD'].includes(req.method);
   const ac=new AbortController();res.on('close',()=>{if(!res.writableFinished)ac.abort()});
   const request=new Request(cfg.origin+req.url,{method:req.method,headers,signal:ac.signal,...(hasBody?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const fwd=cfg.trustProxy?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():'';
   const response=await gateway.handle(request,{ip:fwd||req.socket.remoteAddress||'unknown',host:req.headers.host});
   const out={};response.headers.forEach((v,k)=>{out[k]=v});
   res.writeHead(response.status,out);
   if(!response.body){res.end();return}
   const reader=response.body.getReader();
   try{for(;;){const {done,value}=await reader.read();if(done)break;if(!res.write(value))await new Promise(r=>res.once('drain',r))}}
   finally{reader.releaseLock();res.end()}
  }catch{if(!res.headersSent)res.writeHead(500);res.end()}
 };
}
