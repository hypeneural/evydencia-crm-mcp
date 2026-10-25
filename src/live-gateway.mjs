// LIVE MCP gateway over Streamable HTTP. Each request is authenticated (OAuth bearer),
// authorized per operator and served by a fresh McpServer bound to THAT operator's Sanctum token
// (and optional per-operator Z-API MCP OAuth session).
// Direct CRM tools (orders/reports/Natal intelligence on evydencia.com) replace api.evydencia.com.br.
// Logs never carry tokens or raw PII.
import {McpServer,createMcpHandler,fromJsonSchema,requireBearerAuth,getOAuthProtectedResourceMetadataUrl,oauthMetadataResponse,validateHostHeader} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {crmClient,phone,proposalName,proposalProjection} from './core.mjs';
import {legacyReadClient} from './legacy-api-read.mjs';
import {gatewayConfig,createOAuthServer,operatorVerifier,GATEWAY_SCOPE} from './oauth-gateway.mjs';
import {createZapiBridge} from './zapi-mcp-client.mjs';
import {ZAPI_GATEWAY_TOOL_NAMES,ZAPI_STATUS_TOOL_NAME} from './zapi-mcp-tools.mjs';

export const GATEWAY_VERSION='0.11.0';
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
export const DIRECT_CRM_TOOL_NAMES=Object.freeze(['crm_estatisticas_natal','crm_natal_participantes_estatisticas','crm_pedidos_buscar','crm_pedido_detalhe','crm_relatorio_itens_vendidos','crm_relatorio_natal_sem_participantes','crm_relatorio_clientes_natal']);
export const FORENSIC_CRM_TOOL_NAMES=Object.freeze(['crm_clientes_buscar']);
export const PROPOSAL_CRM_TOOL_NAMES=Object.freeze(['crm_previa_proposta_natal','crm_enviar_proposta_natal']);
export const ZAPI_MCP_TOOL_NAMES=Object.freeze([ZAPI_STATUS_TOOL_NAME,...ZAPI_GATEWAY_TOOL_NAMES]);
const READ={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const WRITE_IDEMPOTENT={readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true};
const SAFE_ERR=/^(crm_[a-z0-9_]+|invalid_[a-z0-9_]+|legacy_read_[a-z0-9_]+|operator_token_revoked|operator_confirmation_required|zapi_[a-z0-9_]+)$/;

const INSTRUCTIONS='EVYDÊNCIA CRM LIVE (v0.11 Forense, Analítico & Z-API MCP) — Conectado diretamente ao CRM oficial (evydencia.com) e, quando autorizado por operador, ao MCP oficial da Z-API (mcp.z-api.io). Regras obrigatórias de precisão, economia de contexto e auditoria: (1) Natal 2026 e Histórico 2021–2026: use crm_estatisticas_natal. Por padrão (nivel_detalhe="resumo"), ela retorna o cockpit enxuto com KPIs 2026, metas (goal_cockpit: R$ 300 mil base pacotes vs R$ 400 mil ampliada / 500 contratos), comparativo acumulado até o corte (ytd_comparison_at_cutoff), conciliação histórica (historical_reconciliation_invariants), separação estrita entre sessões confirmadas/realizadas (confirmed_realized_sessions) e sessões passadas aguardando baixa (past_scheduled_pending_confirmation), próxima sessão (sessions_schedule_2026.next_session) e recompra 2025->2026. Solicite secoes sob demanda conforme a pergunta: simulador_previsao, financeiro_caixa, clientes_recompra_campanhas, agenda_demanda, pacotes_produtos_bonus ou operacional_listas (paginada). (2) Demografia, Bebês, Filhos, Parentesco e Qualidade Cadastral de Participantes: use SEMPRE crm_natal_participantes_estatisticas (população reconciliada de crianças, bebês <3 anos e subfaixas em meses, adultos, pets e sem data de nascimento; famílias com 0/1/2/3+ filhos; pacote x idade infantil; comparativo 2024–2026; anomalias cadastrais). Só ative incluir_lista_participantes=true se o usuário pedir listagem nominal. (3) Links canônicos: cite crm_order_url (https://evydencia.com/gestao/pedidos/$UUID/detalhes) e crm_customer_url (https://evydencia.com/gestao/clientes/$UUID/consultar). (4) Auditoria financeira: consulte installments[] e payment_summary; diferencie method_name (ex.: "Permuta", "Pix - Pagar.me") de method_category_label (ex.: "Dinheiro", "Pix"), use montantes canônicos em *_cents / *_reais e verifique status_history[]. (5) Produtos, bônus R$ 0, agenda e personalização: verifique items[].bonus_classification (proven===true vs origin==="unknown"), schedule_details (Google Calendar e histórico de remarcações) e personalization (quando available===false, declare indisponível em vez de assumir zero). (6) Participantes e bloqueio de edição: informe participants_registration (status_label, customer_access_label, edit_lock_reason, temporary_access_label, kinship_age_anomalies), diferencie age_at_session de age_today e verifique participants_cross_order_audit no Cliente 360 sem sugerir sobrescrita automática. (7) Avatar validado e leads: verifique avatar.has_avatar, avatar.asset_accessible e avatar.asset_check_status (validated | unavailable | restricted | not_checked; ausência de foto usa initials com url: null e não é erro); para clientes com 0 pedidos use crm_clientes_buscar, crm_cliente_resumo ou crm_cliente_360. (8) Proposta Natal 2026: gere prévia com crm_previa_proposta_natal e exija confirmação explícita do operador (confirmado_pelo_operador: true) antes de crm_enviar_proposta_natal. (9) WhatsApp Oficial Z-API MCP: use zapi_status_conexao para verificar estado OAuth/conectividade ou obter o link seguro de vinculação da instância Z-API do operador; use zapi_send_text, zapi_send_image, zapi_send_video e zapi_group_* para mensagens e grupos na instância Z-API vinculada. Se o usuário informar apenas o nome do cliente, consulte primeiro o CRM (crm_clientes_buscar ou crm_cliente_resumo) para resolver o telefone real sem inventar número; havendo homônimos ou ambiguidade, confirme antes de enviar. Resposta aceita indica submissão à Z-API (não entrega final); nunca reenvie automaticamente após timeout ou falha ambígua.';

export function defaultLog(entry){process.stderr.write(JSON.stringify({ts:new Date().toISOString(),...entry})+'\n')}

const LIVE_CATALOG=Object.freeze([
 {tool:'crm_capacidades',capability:'capability_inventory',access:'read',required_scope:GATEWAY_SCOPE,source:'gateway_local',supports_filters:false,supports_pagination:false,supports_history:false,when:()=>true},
 {tool:'crm_status',capability:'crm_liveness',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_public_api',supports_filters:false,supports_pagination:false,supports_history:false,when:()=>true},
 {tool:'crm_campanha_publica',capability:'public_campaign_catalog',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_public_api',supports_filters:true,supports_pagination:false,supports_history:false,when:()=>true},
 {tool:'crm_horarios_publicos',capability:'public_package_availability',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_public_api',supports_filters:true,supports_pagination:false,supports_history:false,when:()=>true},
 {tool:'crm_conexao_privada',capability:'operator_bootstrap',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_extension_api',supports_filters:false,supports_pagination:false,supports_history:false,when:()=>true},
 {tool:'crm_cliente_resumo',capability:'customer_context_summary',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_direct_forensic_or_extension',supports_filters:true,supports_pagination:false,supports_history:true,when:()=>true},
 {tool:'crm_cliente_360',capability:'customer_360_forensic',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_direct_forensic_or_extension',supports_filters:true,supports_pagination:true,supports_history:true,when:()=>true},
 {tool:'crm_estatisticas_natal',capability:'natal_analytics_and_operations',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_direct_natal_bridge',supports_filters:true,supports_pagination:true,supports_history:true,when:({direct})=>direct},
 {tool:'crm_natal_participantes_estatisticas',capability:'natal_participants_demographics',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_direct_natal_bridge',supports_filters:true,supports_pagination:true,supports_history:true,when:({direct})=>direct},
 {tool:'crm_pedidos_buscar',capability:'orders_search_paginated',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_direct_forensic_bridge',supports_filters:true,supports_pagination:true,supports_history:true,when:({direct})=>direct},
 {tool:'crm_pedido_detalhe',capability:'order_forensic_detail',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_direct_forensic_bridge',supports_filters:true,supports_pagination:false,supports_history:true,when:({direct})=>direct},
 {tool:'crm_relatorio_itens_vendidos',capability:'sold_items_report',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_direct_legacy_api',supports_filters:true,supports_pagination:false,supports_history:true,when:({direct})=>direct},
 {tool:'crm_relatorio_natal_sem_participantes',capability:'natal_orders_without_participants',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_direct_legacy_api',supports_filters:false,supports_pagination:true,supports_history:false,when:({direct})=>direct},
 {tool:'crm_relatorio_clientes_natal',capability:'natal_customers_segmentation',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_direct_legacy_api',supports_filters:true,supports_pagination:true,supports_history:false,when:({direct})=>direct},
 {tool:'crm_clientes_buscar',capability:'customers_and_leads_search',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_direct_forensic_bridge',supports_filters:true,supports_pagination:true,supports_history:false,when:({direct,full})=>Boolean(direct&&full)},
 {tool:'crm_previa_proposta_natal',capability:'natal_proposal_preview',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_extension_api',supports_filters:true,supports_pagination:false,supports_history:false,when:({full})=>Boolean(full)},
 {tool:'crm_enviar_proposta_natal',capability:'natal_proposal_dispatch',access:'write_idempotent',required_scope:GATEWAY_SCOPE,source:'crm_extension_api',supports_filters:false,supports_pagination:false,supports_history:false,when:({full})=>Boolean(full)}
]);

function manifest(directEnabled=false,operatorFullCrm=false,zapiContext=null){
 const flags={direct:Boolean(directEnabled),full:Boolean(operatorFullCrm)};
 const tools=LIVE_CATALOG.map(({when,...meta})=>{
  const active=Boolean(when(flags));
  return {...meta,registered:active,state:active?'LIVE_ACTIVE':'NOT_AVAILABLE'};
 });
 if(zapiContext?.enabled){
  tools.push({
   tool:ZAPI_STATUS_TOOL_NAME,
   capability:'zapi_mcp_oauth_and_status',
   access:'read',
   required_scope:GATEWAY_SCOPE,
   source:'gateway_zapi_oauth',
   supports_filters:false,
   supports_pagination:false,
   supports_history:false,
   registered:true,
   state:'LIVE_ACTIVE'
  });
  for(const zt of zapiContext.tools||[]){
   tools.push({
    tool:zt.gatewayName,
    capability:zt.capability,
    access:zt.access,
    required_scope:GATEWAY_SCOPE+'+zapi.oauth',
    source:'zapi_official_mcp',
    supports_filters:false,
    supports_pagination:false,
    supports_history:false,
    registered:true,
    state:'LIVE_ACTIVE'
   });
  }
 }
 return {
  service:'evydencia-crm-mcp-live',
  version:GATEWAY_VERSION,
  build_commit:BUILD_INFO.commit,
  repository_branch:BUILD_INFO.branch,
  mode:(operatorFullCrm||zapiContext?.enabled)?'LIVE_OPERATOR_FULL_OAUTH':'LIVE_READ_ONLY_OAUTH',
  mock_mode:false,
  direct_crm_read_enabled:Boolean(directEnabled),
  forensic_audit_enabled:Boolean(directEnabled&&operatorFullCrm),
  proposal_dispatch_enabled:Boolean(operatorFullCrm),
  write_requires_explicit_confirmation:true,
  tools_total_catalog:tools.length,
  tools_active_count:tools.filter(t=>t.registered).length,
  tools,
  ...(directEnabled?{direct_crm_tools:DIRECT_CRM_TOOL_NAMES}:{}),
  ...(directEnabled&&operatorFullCrm?{forensic_crm_tools:FORENSIC_CRM_TOOL_NAMES}:{}),
  ...(operatorFullCrm?{proposal_crm_tools:PROPOSAL_CRM_TOOL_NAMES}:{}),
  ...(zapiContext?.enabled?{
   zapi_mcp_enabled:true,
   zapi_oauth_status:zapiContext.oauthStatus,
   zapi_discovered_tools_count:(zapiContext.tools||[]).length,
   zapi_exposed_tools:[ZAPI_STATUS_TOOL_NAME,...(zapiContext.tools||[]).map(t=>t.gatewayName)]
  }:{})
 };
}

function summarizeToolResult(tool,res){
 if(!res||typeof res!=='object')return `OK [${tool}]: resposta concluída em structuredContent.`;
 switch(tool){
  case 'crm_capacidades':
   return `OK [crm_capacidades]: versao=${res.version}, commit=${res.build_commit}, modo=${res.mode}, ativas=${res.tools_active_count}/${res.tools_total_catalog}.`;
  case 'crm_status':
   return `OK [crm_status]: status=${res.status||'ok'}.`;
  case 'crm_campanha_publica':
   return `OK [crm_campanha_publica]: pacotes=${Array.isArray(res.packages)?res.packages.length:0}.`;
  case 'crm_horarios_publicos':
   return `OK [crm_horarios_publicos]: slots=${Array.isArray(res.slots)?res.slots.length:(Array.isArray(res.days)?res.days.length:0)}.`;
  case 'crm_conexao_privada':
   return `OK [crm_conexao_privada]: operador autenticado, fuso=${res.server?.timezone||'America/Sao_Paulo'}.`;
  case 'crm_cliente_resumo':
   return `OK [crm_cliente_resumo]: status=${res.lookup?.status||'matched'}, pedido_atual=${res.current_order?'sim':'nao'}. Consulte structuredContent.`;
  case 'crm_cliente_360':
   return `OK [crm_cliente_360]: status=${res.lookup?.status||'matched'}, pedidos_retornados=${Array.isArray(res.orders)?res.orders.length:0}. Consulte structuredContent.`;
  case 'crm_estatisticas_natal':
   return `OK [crm_estatisticas_natal]: corte=${res.cutoff_mmdd||'atual'}, nivel=${res.detail_level||'resumo'}, pedidos_validos_2026=${res.kpis_2026?.valid_orders??'n/d'}, sessoes_confirmadas_2026=${res.kpis_2026?.confirmed_realized_sessions??res.kpis_2026?.confirmed_realized_sessions_to_date??res.kpis_2026?.realized_sessions_to_date??'n/d'}. Consulte structuredContent.`;
  case 'crm_natal_participantes_estatisticas':
   return `OK [crm_natal_participantes_estatisticas]: escopo=${res.year_scope||'2026'}, total_participantes=${res.population_reconciliation?.total_participants_count??'n/d'}, reconciliado=${Boolean(res.population_reconciliation?.reconciled)}. Consulte structuredContent.`;
  case 'crm_pedidos_buscar':
   return `OK [crm_pedidos_buscar]: retornados=${Array.isArray(res.orders)?res.orders.length:0}, total_correspondente=${res.pagination?.total_matching_orders??'n/d'}. Consulte structuredContent.`;
  case 'crm_pedido_detalhe':
   return `OK [crm_pedido_detalhe]: order_id=${res.order?.order_id??'n/d'}, parcelas=${Array.isArray(res.order?.installments)?res.order.installments.length:0}, eventos_status=${res.order?.status_history_count??0}. Consulte structuredContent.`;
  case 'crm_clientes_buscar':
   return `OK [crm_clientes_buscar]: retornados=${Array.isArray(res.customers)?res.customers.length:0}, total=${res.pagination?.total_matching_customers??'n/d'}. Consulte structuredContent.`;
  case 'crm_previa_proposta_natal':
   return `OK [crm_previa_proposta_natal]: elegivel=${Boolean(res.ready)}. Consulte structuredContent.`;
  case 'crm_enviar_proposta_natal':
   return `OK [crm_enviar_proposta_natal]: agendado=${Boolean(res.scheduled)}. Consulte structuredContent.`;
  case ZAPI_STATUS_TOOL_NAME:
   return `OK [${ZAPI_STATUS_TOOL_NAME}]: oauth_status=${res.oauth_status||'n/d'}, ferramentas=${res.discovered_tools_count??0}, whatsapp=${res.whatsapp_connection?.status||'n/d'}. Consulte structuredContent.`;
  default:
   return `OK [${tool}]: consulta concluída. Consulte structuredContent.`;
 }
}

const OUT_CAPACIDADES=z.looseObject({
 service:z.string(),
 version:z.string(),
 build_commit:z.string(),
 repository_branch:z.string(),
 mode:z.string(),
 mock_mode:z.boolean(),
 direct_crm_read_enabled:z.boolean(),
 forensic_audit_enabled:z.boolean(),
 proposal_dispatch_enabled:z.boolean(),
 write_requires_explicit_confirmation:z.boolean(),
 tools_total_catalog:z.number().int(),
 tools_active_count:z.number().int(),
 tools:z.array(z.looseObject({
  tool:z.string(),
  capability:z.string(),
  state:z.string(),
  registered:z.boolean(),
  access:z.string(),
  required_scope:z.string(),
  source:z.string(),
  supports_filters:z.boolean(),
  supports_pagination:z.boolean(),
  supports_history:z.boolean()
 }))
});
// PHP json_encode emits lists (and empty associative arrays) as JSON arrays: nested analytic blocks accept object OR array.
const FLEX=z.union([z.looseObject({}),z.array(z.unknown())]).nullish();
const OUT_GENERIC=z.looseObject({source:z.string().nullish()});
const OUT_CUSTOMER=z.looseObject({
 source:z.string().nullish(),
 lookup:z.looseObject({status:z.string().nullish(),match_count:z.number().nullish()}).nullish(),
 customer:z.looseObject({uuid:z.string().nullish(),crm_customer_url:z.string().nullish()}).nullish(),
 kpis:FLEX,
 financial_audit_summary:FLEX,
 participants_cross_order_audit:FLEX,
 current_order:FLEX,
 orders:z.array(z.looseObject({})).nullish()
});
const OUT_ORDER_DETAIL=z.looseObject({
 source:z.string().nullish(),
 detail_level:z.string().nullish(),
 order:z.looseObject({
  order_id:z.number().nullish(),
  uuid:z.string().nullish(),
  crm_order_url:z.string().nullish(),
  crm_customer_url:z.string().nullish(),
  total_cents:z.number().nullish(),
  total_reais:z.number().nullish(),
  received_cents:z.number().nullish(),
  received_reais:z.number().nullish(),
  remaining_cents:z.number().nullish(),
  remaining_reais:z.number().nullish(),
  payment_summary:FLEX,
  installments:z.array(z.looseObject({})).nullish(),
  items:z.array(z.looseObject({})).nullish(),
  status_history:z.array(z.looseObject({})).nullish(),
  schedule_details:FLEX,
  personalization:FLEX,
  participants_registration:FLEX
 }).nullish()
});
const OUT_ORDERS_SEARCH=z.looseObject({
 source:z.string().nullish(),
 detail_level:z.string().nullish(),
 pagination:z.looseObject({
  page:z.number().nullish(),
  per_page:z.number().nullish(),
  returned_count:z.number().nullish(),
  total_matching_orders:z.number().nullish(),
  has_more:z.boolean().nullish()
 }).nullish(),
 orders:z.array(z.looseObject({}))
});
const OUT_CUSTOMERS_SEARCH=z.looseObject({
 source:z.string().nullish(),
 pagination:z.looseObject({
  page:z.number().nullish(),
  per_page:z.number().nullish(),
  returned_count:z.number().nullish(),
  total_matching_customers:z.number().nullish(),
  has_more:z.boolean().nullish()
 }).nullish(),
 customers:z.array(z.looseObject({}))
});
const OUT_NATAL_STATS=z.looseObject({
 source:z.string().nullish(),
 reference_year:z.number().nullish(),
 cutoff_mmdd:z.string().nullish(),
 detail_level:z.string().nullish(),
 sections_loaded:z.array(z.string()).nullish(),
 kpis_2026:z.looseObject({
  valid_orders:z.number().nullish(),
  unique_customers:z.number().nullish(),
  scheduled_sessions:z.number().nullish(),
  confirmed_realized_sessions:z.number().nullish(),
  past_scheduled_sessions:z.number().nullish(),
  past_scheduled_pending_confirmation:z.number().nullish(),
  contracted_revenue_cents:z.number().nullish(),
  contracted_revenue_reais:z.number().nullish(),
  received_revenue_cents:z.number().nullish(),
  received_revenue_reais:z.number().nullish(),
  open_receivable_cents:z.number().nullish(),
  open_receivable_reais:z.number().nullish(),
  confirmed_realized_sessions_to_date:z.number().nullish(),
  past_scheduled_sessions_to_date:z.number().nullish(),
  paid_revenue_cents:z.number().nullish(),
  paid_revenue_reais:z.number().nullish(),
  balance_due_cents:z.number().nullish(),
  balance_due_reais:z.number().nullish(),
  waiting_product_retrieve_orders:z.number().nullish(),
  active_orders_without_participants:z.number().nullish()
 }).nullish(),
 goal_cockpit_2026:FLEX,
 ytd_comparison_at_cutoff:FLEX,
 realized_sessions_comparison_at_cutoff:FLEX,
 annual_evolution_full_season:FLEX,
 packages_matrix_by_year:FLEX,
 historical_reconciliation_invariants:FLEX,
 sections:FLEX
});
const OUT_NATAL_PARTICIPANTS=z.looseObject({
 source:z.string().nullish(),
 year_scope:z.string().nullish(),
 population_reconciliation:z.looseObject({
  valid_natal_orders_count:z.number().nullish(),
  sessions_with_participants_count:z.number().nullish(),
  valid_orders_without_participants_count:z.number().nullish(),
  total_participants_count:z.number().nullish(),
  children_0_17_count:z.number().nullish(),
  adults_18_plus_count:z.number().nullish(),
  pets_count:z.number().nullish(),
  humans_without_birth_date_count:z.number().nullish(),
  reconciled:z.boolean().nullish()
 }).nullish(),
 age_distribution:FLEX,
 kinship_distribution:z.array(z.looseObject({})).nullish(),
 family_children_composition:FLEX,
 packages_by_child_age_profile:z.array(z.looseObject({})).nullish(),
 historical_2024_2026:FLEX,
 data_quality_anomalies:FLEX
});
const OUT_PROPOSAL_PREVIEW=z.looseObject({
 ready:z.boolean(),
 variant:z.string().nullish(),
 campaign_id:z.number().nullish(),
 message_preview:z.string().nullish(),
 error_code:z.string().nullish(),
 message:z.string().nullish()
});
const OUT_PROPOSAL_DISPATCH=z.looseObject({
 scheduled:z.boolean(),
 status:z.string().nullish(),
 replay:z.boolean().nullish(),
 dispatch_uuid:z.string().nullish(),
 request_id:z.string().nullish(),
 error_code:z.string().nullish(),
 message:z.string().nullish()
});
const OUT_ZAPI_STATUS=z.looseObject({
 service:z.string(),
 upstream_mcp_endpoint:z.string(),
 operator_isolated:z.boolean(),
 oauth_status:z.enum(['authorized','authorization_required','expired','revoked','unavailable']),
 discovered_tools_count:z.number().int(),
 whatsapp_connection:z.looseObject({
  verifiable:z.boolean(),
  status:z.string(),
  detail:z.string()
 }),
 authorization_url:z.string().nullish(),
 guidance:z.string().nullish()
});

// Exported for contract tests against real (PHP-encoded) CRM payload shapes.
export const OUTPUT_SCHEMAS=Object.freeze({OUT_CAPACIDADES,OUT_GENERIC,OUT_CUSTOMER,OUT_ORDER_DETAIL,OUT_ORDERS_SEARCH,OUT_CUSTOMERS_SEARCH,OUT_NATAL_STATS,OUT_NATAL_PARTICIPANTS,OUT_PROPOSAL_PREVIEW,OUT_PROPOSAL_DISPATCH,OUT_ZAPI_STATUS});

async function liveServer(auth,{cfg,fetchFn,operators,log,zapi}){
 const ex=auth?.extra||{};
 if(typeof ex.upstream!=='string'||!ex.operatorId)throw Error('gateway_missing_identity');
 const crm=crmClient({baseUrl:cfg.crmBaseUrl,token:ex.upstream,privateEnabled:true,timeoutMs:cfg.crmTimeoutMs,fetchFn,strictEnvelope:true});
 const direct=cfg.internalReadToken?legacyReadClient({baseUrl:cfg.crmBaseUrl,token:cfg.internalReadToken,fetchFn,timeoutMs:cfg.crmTimeoutMs,includeParticipants:cfg.operatorFullCrm}):null;
 const zapiTools=zapi?await zapi.ensureOperatorTools(ex.operatorId):[];
 const zapiOauthStatus=zapi?zapi.auth.getOperatorState(ex.operatorId).oauth_status:null;
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
    crm_customer_url:d.crm_customer_url??null,
    created_at_brt:d.created_at_brt??ord.created_at_brt??null,
    session_at:d.session_at??ord.session_date??ord.session_at??null,
    package_name:d.package_name??ord.package_name??null,
    payment_methods:d.payment_methods??[],
    payment_summary:d.payment_summary??null,
    installments:d.installments??[],
    items:d.items??[],
    status_history_count:d.status_history_count??0,
    status_history:d.status_history??[],
    schedule_details:d.schedule_details??null,
    personalization:d.personalization??null,
    customer_avatar_url:d.customer_avatar_url??null,
    customer_has_avatar:d.customer_has_avatar??false,
    customer_avatar_accessible:d.customer_avatar_accessible??null,
    customer_avatar_check_status:d.customer_avatar_check_status??'not_checked',
    customer_initials:d.customer_initials??null,
    total_cents:d.total_cents??null,
    total_reais:d.total_reais??ord.total_amount??null,
    received_cents:d.received_cents??null,
    received_reais:d.received_reais??null,
    remaining_cents:d.remaining_cents??null,
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
 const safe=(tool,fn)=>async(input,ctx)=>{
  const t0=performance.now();
  try{
   const result=await fn(input||{},ctx);
   log({evt:'tool',tool,ok:true,op:ex.operatorTag,ms:Math.round(performance.now()-t0)});
   return {content:[{type:'text',text:summarizeToolResult(tool,result)}],structuredContent:result};
  }catch(e){
   let code=SAFE_ERR.test(e?.message||'')?e.message:'crm_unavailable';
   if(code==='crm_http_401'){code='operator_token_revoked';operators.forget(ex.upstream)}
   log({evt:'tool',tool,ok:false,err:code,op:ex.operatorTag,ms:Math.round(performance.now()-t0)});
   return {isError:true,content:[{type:'text',text:JSON.stringify({error:code})}]};
  }
 };
 const m=new McpServer({name:'evydencia-crm-mcp-live',version:GATEWAY_VERSION},{instructions:INSTRUCTIONS});
 const registeredNames=new Set();
 const reg=(name,title,description,inputSchema,outputSchema,fn,annotations=READ)=>{
  if(registeredNames.has(name))return;
  registeredNames.add(name);
  m.registerTool(name,{title,description,inputSchema,outputSchema,annotations},safe(name,fn));
 };

 reg('crm_capacidades','Capacidades disponíveis','Lista o inventário fiel deste conector LIVE, versão/commit implantado (build_commit), escopos e ferramentas habilitadas na sessão atual.',z.object({}),OUT_CAPACIDADES,()=>manifest(Boolean(direct),cfg.operatorFullCrm,zapi?{enabled:true,oauthStatus:zapi.auth.getOperatorState(ex.operatorId).oauth_status,tools:zapiTools}:null));
 reg('crm_status','Estado do CRM','Liveness público do CRM.',z.object({}),OUT_GENERIC,()=>crm.status());
 reg('crm_campanha_publica','Pacotes públicos','Catálogo público de uma campanha (padrão natal).',z.object({campanha:z.string().max(80).default('natal')}),OUT_GENERIC,({campanha})=>crm.campaign(campanha));
 reg('crm_horarios_publicos','Horários públicos','Horários públicos de um pacote, janela máxima de 14 dias (AAAA-MM-DD). Não cria reservas.',z.object({campanha:z.string().max(80).default('natal'),pacote:z.string().max(80),inicio:z.string().max(10),fim:z.string().max(10)}),OUT_GENERIC,({campanha,pacote,inicio,fim})=>crm.availability(campanha,pacote,inicio,fim));
 reg('crm_conexao_privada','Identidade do operador','Operador autenticado, fuso do servidor e abilities do token.',z.object({}),OUT_GENERIC,()=>crm.bootstrap());
 reg('crm_cliente_resumo','Cliente por telefone, nome, CPF, e-mail ou UUID','Contexto completo do cliente (inclusive leads com 0 pedidos) por telefone (DDD+número), nome_cliente, customer_uuid, email ou documento: dados cadastrais do titular, avatar validado/iniciais, completude cadastral (registration_completeness), resumo financeiro em centavos e reais, pedido atual, link canônico (/gestao/clientes/$UUID/consultar) e elegibilidade Natal 2026.',z.object({
  telefone:z.string().min(8).max(30).optional(),
  nome_cliente:z.string().min(2).max(100).optional(),
  customer_uuid:z.string().min(36).max(36).optional(),
  email:z.string().min(4).max(120).optional(),
  documento:z.string().min(11).max(20).optional()
 }),OUT_CUSTOMER,async input=>{
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
 reg('crm_cliente_360','Cliente 360 Forense (histórico, pagamentos, avatar e auditoria)','Reconstrução 360 completa do cliente (inclusive leads com 0 pedidos) por telefone, nome_cliente, customer_uuid, email ou documento: perfil completo do titular, avatar verificado via HTTP/WebP ou iniciais, diagnóstico de cadastro incompleto (registration_completeness), KPIs, resumo financeiro por meio efetivo (financial_audit_summary), auditoria cruzada de divergências históricas de participantes entre pedidos (participants_cross_order_audit) e pedidos completos com parcelas, linha do tempo de status, agenda Google Calendar, personalização e origem de bônus.',z.object({
  telefone:z.string().min(8).max(30).optional(),
  nome_cliente:z.string().min(2).max(100).optional(),
  customer_uuid:z.string().min(36).max(36).optional(),
  email:z.string().min(4).max(120).optional(),
  documento:z.string().min(11).max(20).optional(),
  pagina:z.number().int().min(1).max(100).default(1),
  por_pagina:z.number().int().min(1).max(20).default(10)
 }),OUT_CUSTOMER,async input=>{
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
  }),OUT_PROPOSAL_PREVIEW,async({telefone,nome})=>{
   const normPhone=phone(telefone);
   const normName=proposalName(nome)??null;
   const {ok,status,json}=await callExtensionPost('/api/v1/extension/proposals/preview',{phone:normPhone,name:normName});
   if(!ok){
    const err=json?.error||{};
    return {ready:false,scheduled:false,http_status:status,error_code:err.code||'PROPOSAL_NOT_ELIGIBLE',message:err.message||'Não foi possível gerar a prévia da proposta.',retryable:Boolean(err.retryable)};
   }
   return {...proposalProjection(json),variant:json?.data?.variant??json?.data?.selection?.variant??null,campaign_id:json?.data?.campaign_id??json?.data?.campaign?.id??null,message_preview:json?.data?.message_preview??json?.data?.message??null,phone_formatted:json?.data?.phone_formatted??null};
  });
  reg('crm_enviar_proposta_natal','Disparar / Agendar Proposta de Natal 2026','Dispara e agenda oficialmente o envio da proposta comercial de Natal 2026 pelo CRM (WhatsApp / cadência oficial) para o telefone informado (DDD+número) e nome opcional. EXIGE confirmado_pelo_operador=true explícito (sem confirmação falha fechada antes de chamar o CRM), aplica a Regra de Ouro e garante idempotência.',z.object({
   telefone:z.string().min(8).max(30),
   nome:z.string().max(80).optional(),
   confirmado_pelo_operador:z.boolean(),
   modo_reenvio:z.enum(['normal','send_again','abort_and_resend']).default('normal'),
   request_id:z.string().uuid().optional()
  }),OUT_PROPOSAL_DISPATCH,async({telefone,nome,confirmado_pelo_operador,modo_reenvio='normal',request_id})=>{
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
  reg('crm_estatisticas_natal','Central de Inteligência — Estatísticas e Operação de Natal','Retorna os dados canônicos oficiais de /gestao/natal/estatisticas (2021–2026) de forma proporcional à pergunta. Por padrão (nivel_detalhe="resumo"), traz cockpit executivo enxuto: KPIs 2026 (pedidos válidos, clientes únicos, receita contratada/recebida/aberta em centavos e reais), metas (R$ 300k base vs R$ 400k ampliada / 500 contratos), estágios operacionais (Aguardando Retirada, sem participantes, próxima sessão), sessões confirmadas/realizadas vs horário passado e comparativo histórico YTD + fechamento anual (com invariantes de conciliação 2022 e 2024). Use secoes para aprofundar sob demanda: simulador_previsao, financeiro_caixa (aging, meios efetivos, conciliação Pagar.me/Stone/Moderninha), clientes_recompra_campanhas (recompra safra 2025->2026, fiéis 2+ anos, cidades, canais, cupons, melhor dia/horário de venda), agenda_demanda (heatmap, ocupação, antecedência), pacotes_produtos_bonus (reajustes, elasticidade, extras comprados vs bônus) ou operacional_listas (paginada). Para perfil demográfico de crianças/bebês/famílias, use crm_natal_participantes_estatisticas.',z.object({
   data_corte_mm_dd:z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).optional(),
   secoes:z.array(z.enum(['resumo','historico','simulador_previsao','financeiro_caixa','clientes_recompra_campanhas','agenda_demanda','pacotes_produtos_bonus','operacional_listas'])).max(8).optional(),
   nivel_detalhe:z.enum(['resumo','padrao','completo']).default('resumo'),
   ano:z.number().int().min(2021).max(2026).optional(),
   pagina:z.number().int().min(1).max(50).default(1),
   limite:z.number().int().min(1).max(50).default(15)
  }),OUT_NATAL_STATS,({data_corte_mm_dd,secoes,nivel_detalhe,ano,pagina,limite})=>direct.natalStatistics({
   cutoffMmDd:data_corte_mm_dd,
   secoes,
   nivelDetalhe:nivel_detalhe,
   ano,
   pagina,
   limite
  }));
  reg('crm_natal_participantes_estatisticas','Inteligência Demográfica e Familiar — Participantes de Natal','Retorna a inteligência demográfica, etária e familiar oficial dos participantes de Natal no CRM: reconciliação exata da população (crianças 0–17, adultos 18+, pets e humanos sem data de nascimento), subfaixas de bebês e crianças (0-6m, 6-12m, 1-3a, <3 anos, <=3 anos, 3-5a, 5-10a, 11-17a), parentesco (Filho(a), Mãe, Pai, avós, Pet), composição familiar (0, 1, 2, 3+ filhos e famílias com 2+ filhos), cruzamento pacote x idade infantil/bebês, histórico comparativo 2024–2026, repetição familiar e anomalias de qualidade cadastral (ex.: parentesco adulto com idade infantil, datas divergentes entre pedidos da mesma família e registros sem data de nascimento). Mantenha incluir_lista_participantes=false salvo pedido explícito de lista nominal.',z.object({
   ano:z.enum(['2026','2025','2024','todos']).default('2026'),
   secoes:z.array(z.enum(['resumo','faixas_etarias','parentesco','familias_filhos','pacotes_cruzamentos','historico_recompra','qualidade_cadastro'])).max(7).optional(),
   incluir_anomalias:z.boolean().default(true),
   incluir_lista_participantes:z.boolean().default(false),
   pagina:z.number().int().min(1).max(50).default(1),
   limite:z.number().int().min(1).max(50).default(20)
  }),OUT_NATAL_PARTICIPANTS,({ano,secoes,incluir_anomalias,incluir_lista_participantes,pagina,limite})=>direct.natalParticipantsStatistics({
   ano,
   secoes,
   incluirAnomalias:incluir_anomalias,
   incluirListaParticipantes:incluir_lista_participantes,
   pagina,
   limite
  }));
  reg('crm_pedidos_buscar','Buscar pedidos ou listar pedidos paginados no CRM','Busca direta e paginada de pedidos no CRM (evydencia.com) ordenados do MAIS RECENTE para o mais antigo (paridade com /gestao/pedidos), retornando pagination.total_matching_orders. Inclui crm_order_url, crm_customer_url (/consultar), avatar/iniciais e perfil do cliente, parcelas individuais (installments[] com method_name vs method_category_label, vencimento, pagamento, transações e recibos), payment_summary em centavos e reais, linha do tempo de status (status_history[]), itens detalhados com bonus_classification, participants_registration (status, bloqueio de edição e anomalias) e participantes.',z.object({
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
   nivel_detalhe:z.enum(['resumo','padrao','forense']).default('padrao'),
   pagina:z.number().int().min(1).max(500).default(1),
   limite:z.number().int().min(1).max(25).default(10)
  }),OUT_ORDERS_SEARCH,input=>{
   const map={'customer_name':'customer.name','customer_whatsapp':'customer.whatsapp','customer_uuid':'customer.uuid','order_uuid':'order.uuid','order_id':'order.id','order_status':'order.status','product_slug':'product.slug','payment_method_name':'payment_method_name','has_open_balance':'has_open_balance','created_start':'order.created-start','created_end':'order.created-end','session_start':'order.session-start','session_end':'order.session-end'};
   const filters={};
   for(const [k,v] of Object.entries(input||{}))if(v!==undefined&&v!==null&&v!==''&&map[k])filters[map[k]]=v;
   return direct.search(filters,{limit:input?.limite,page:input?.pagina,detailLevel:input?.nivel_detalhe});
  });
  reg('crm_pedido_detalhe','Auditoria e detalhe completo de pedido no CRM (por UUID ou ID)','Auditoria completa de um pedido no CRM aceitando uuid OU order_id numérico (ex.: order_id: 4510): retorna crm_order_url, crm_customer_url (/consultar), dados do titular e avatar verificado via HTTP/WebP (asset_accessible, asset_check_status), payment_summary em centavos e reais, parcelas individuais (installments[] distinguindo method_name como "Permuta" de method_category_label como "Dinheiro", transações e recibos bills[]), linha do tempo de status (status_history[]), schedule_details (Google Calendar e histórico de agendamentos), personalization (observações, personalização infantil, bolo e santa_audio explícito), produtos/extras com bonus_classification, participants_registration (incluindo motivo de bloqueio de edição e anomalias) e participantes completos.',z.object({
   uuid:z.string().min(36).max(36).optional(),
   order_id:z.number().int().min(1).optional(),
   nivel_detalhe:z.enum(['resumo','padrao','forense']).default('forense')
  }),OUT_ORDER_DETAIL,({uuid,order_id,nivel_detalhe})=>direct.detail({uuid,order_id,detailLevel:nivel_detalhe}));
  if(cfg.operatorFullCrm){
   reg('crm_clientes_buscar','Buscar clientes e leads (inclusive com zero pedidos) no CRM','Busca paginada diretamente no cadastro geral de clientes (/gestao/clientes) por busca livre (nome, WhatsApp, e-mail ou CPF/CNPJ), nome_cliente, telefone, email, documento ou customer_uuid. Localiza inclusive leads com 0 pedidos (somente_sem_pedidos: true) ou com cadastro incompleto para cartão (somente_cadastro_incompleto: true), retornando avatar/iniciais (com verificação HTTP opcional em verificar_avatar_http=true), dados completos do titular, link canônico (/consultar), orders_count, lifecycle_stage e registration_completeness.',z.object({
    busca:z.string().min(2).max(120).optional(),
    nome_cliente:z.string().min(2).max(100).optional(),
    telefone:z.string().min(8).max(30).optional(),
    email:z.string().min(4).max(120).optional(),
    documento:z.string().min(4).max(20).optional(),
    customer_uuid:z.string().min(36).max(36).optional(),
    somente_sem_pedidos:z.boolean().default(false),
    somente_cadastro_incompleto:z.boolean().default(false),
    verificar_avatar_http:z.boolean().default(false),
    pagina:z.number().int().min(1).max(500).default(1),
    limite:z.number().int().min(1).max(25).default(10)
   }),OUT_CUSTOMERS_SEARCH,input=>direct.searchCustomers({...input,page:input?.pagina,limit:input?.limite}));
  }
  reg('crm_relatorio_itens_vendidos','Relatório de itens vendidos (unidades brutas)','Relatório geral do CRM de unidades de itens vendidos (orders_items) por período de emissão (AAAA-MM-DD). ATENÇÃO: Não use para contagem oficial de pedidos ou ensaios de Natal (para Natal use crm_estatisticas_natal).',z.object({
   inicio:z.string().max(10),
   fim:z.string().max(10),
   slug:z.string().max(60).optional(),
   busca:z.string().max(80).optional()
  }),OUT_GENERIC,({inicio,fim,slug:s,busca})=>direct.soldItems({start:inicio,end:fim,slug:s,busca}));
  reg('crm_relatorio_natal_sem_participantes','Pedidos de Natal sem participantes','Lista pedidos de Natal do ano corrente com pagamento/sessão e zero participantes cadastrados, incluindo link direto do pedido no CRM (crm_order_url). Para visão completa (incluindo sessão, pacote e concluídos), consulte também orders_without_participants_2026 em crm_estatisticas_natal.',z.object({limite:z.number().int().min(1).max(50).default(20)}),OUT_GENERIC,({limite})=>direct.christmasWithoutParticipants({limit:limite}));
  reg('crm_relatorio_clientes_natal','Clientes com ou sem compra de Natal','Consulta clientes no CRM com ou sem pedido de Natal no ano corrente, com filtro opcional por nome.',z.object({
   comprou_natal:z.boolean().default(true),
   busca_nome:z.string().min(2).max(80).optional(),
   limite:z.number().int().min(1).max(50).default(20)
  }),OUT_GENERIC,({comprou_natal,busca_nome,limite})=>direct.christmasCustomers({bought:comprou_natal,search:busca_nome||'',limit:limite}));
 }
 if(zapi){
  reg(
   ZAPI_STATUS_TOOL_NAME,
   'Estado da Autorização OAuth e Instância Z-API MCP',
   'Consulta o estado da autorização OAuth do operador na Z-API (authorized, authorization_required, expired, revoked, unavailable), lista as ferramentas oficiais Z-API descobertas na instância vinculada, verifica conectividade do WhatsApp quando disponível e gera o link seguro (authorization_url) para vincular, reautorizar ou desvincular a instância pelo navegador.',
   z.object({
    atualizar_ferramentas:z.boolean().default(false),
    incluir_link_gestao:z.boolean().default(false)
   }),
   OUT_ZAPI_STATUS,
   ({atualizar_ferramentas,incluir_link_gestao},ctx)=>zapi.getConnectionStatus(ex.operatorId,{
    refreshTools:Boolean(atualizar_ferramentas),
    includeManageLink:Boolean(incluir_link_gestao),
    signal:ctx?.mcpReq?.signal
   })
  );
  for(const zt of zapiTools){
   if(registeredNames.has(zt.gatewayName))continue;
   registeredNames.add(zt.gatewayName);
   m.registerTool(
    zt.gatewayName,
    {
     title:zt.title,
     description:zt.description,
     inputSchema:fromJsonSchema(zt.inputSchema),
     ...(zt.outputSchema?{outputSchema:fromJsonSchema(zt.outputSchema)}:{}),
     annotations:zt.annotations
    },
    (args,ctx)=>zapi.callTool(ex.operatorId,zt,args,{signal:ctx?.mcpReq?.signal})
   );
  }
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
 let mcp;
 const zapi=cfg.zapiEnabled?createZapiBridge(cfg,{
  operators,
  fetchFn,
  now,
  log,
  reservedToolNames:[...LIVE_TOOL_NAMES,...DIRECT_CRM_TOOL_NAMES,...FORENSIC_CRM_TOOL_NAMES,...PROPOSAL_CRM_TOOL_NAMES],
  gatewayVersion:GATEWAY_VERSION,
  onToolsUpdated:()=>mcp?.notify?.toolsChanged?.()
 }):null;
 const resourceUrl=new URL(cfg.resource);
 const resourceMetadataUrl=getOAuthProtectedResourceMetadataUrl(resourceUrl);
 const gate=requireBearerAuth({verifier:oauth.verifier,requiredScopes:[GATEWAY_SCOPE],resourceMetadataUrl,expectedResource:resourceUrl});
 mcp=createMcpHandler(ctx=>liveServer(ctx.authInfo,{cfg,fetchFn,operators,log,zapi}),{responseMode:'auto',maxRequestBodySize:65536,onerror:()=>log({evt:'mcp_error'})});
 const allowed=rateLimiter(now);
 const allowedHosts=[cfg.hostname,...(cfg.insecureLocal?['localhost','127.0.0.1']:[])];
 const metaOpts={oauthMetadata:oauth.metadata,resourceServerUrl:resourceUrl,scopesSupported:[GATEWAY_SCOPE],resourceName:'Evydência CRM (operador autenticado)',dangerouslyAllowInsecureIssuerUrl:cfg.insecureLocal};
 const plain=(status,body,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...extra}});
 const withPrivateNoStore=res=>{
  try{res.headers.set('Cache-Control','private, no-store');return res}
  catch{const h=new Headers(res.headers);h.set('Cache-Control','private, no-store');return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h})}
 };

 async function route(request,{ip='unknown',host}={}){
  const path=new URL(request.url).pathname;
  if(path==='/healthz')return plain(200,{ok:true,service:'evydencia-crm-mcp-live',version:GATEWAY_VERSION,build_commit:BUILD_INFO.commit,repository_branch:BUILD_INFO.branch,zapi_mcp_enabled:Boolean(zapi)});
  if(!validateHostHeader(host??request.headers.get('host'),allowedHosts).ok)return plain(403,{error:'invalid_host'});
  const meta=oauthMetadataResponse(request,metaOpts);
  if(meta)return meta;
  if(path==='/register'||path==='/authorize'||path==='/token'){
   if(!allowed('auth:'+ip,cfg.rateAuthPerMin))return plain(429,{error:'rate_limited'},{'Retry-After':'60'});
   return oauth.handle(request,path);
  }
  if(zapi&&(path==='/zapi/connect'||path==='/zapi/oauth/callback'||path==='/zapi/disconnect')){
   if(!allowed('zapi-auth:'+ip,cfg.rateAuthPerMin))return plain(429,{error:'rate_limited'},{'Retry-After':'60'});
   return zapi.handleHttp(request,path);
  }
  if(path==='/mcp'){
   const auth=await gate(request);
   if(auth instanceof Response)return withPrivateNoStore(auth);
   if(!allowed('op:'+auth.extra.operatorId,cfg.rateMcpPerMin))return plain(429,{error:'rate_limited'},{'Retry-After':'60'});
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
 return {cfg,zapi,handle,close:async()=>{await Promise.allSettled([mcp.close(),zapi?.close()])}};
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
