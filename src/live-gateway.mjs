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
import {createGameplayReadClient,probeGameplayPrivateAccess} from './gameplay-read-client.mjs';
import {gameplayOrderStatus,gameplayOrderSelectionRequired,registerDistinctGameplayOrderStatus,gameplayAuditEligibleStatuses} from './gameplay-order-status.mjs';
import {lookupGameplayWithCustomerLinks} from './gameplay-links.mjs';
import {MCP_UI_CARD_RESOURCE_URI,MCP_UI_CARD_V1_FALLBACK_URI,OUT_VISUAL_CARD_OBJECT_SCHEMA,UI_CRM_TOOL_NAMES,buildVisualCardPayload,formatVisualCardTextFallback,registerCrmVisualCardUi} from './mcp-ui-cards.mjs';
import {gatewayConfig,createOAuthServer,operatorVerifier,GATEWAY_SCOPE,SCOPE_PROPOSAL_WRITE,SCOPE_PRINT_WRITE,SCOPE_ORDERS_READY_WRITE,SCOPE_ZAPI_SEND,SCOPE_ZAPI_GROUP,supportedGatewayScopes} from './oauth-gateway.mjs';
import {printserverConfig,printserverClient} from './printserver-client.mjs';
import {renderCanonicalCrmLabel} from './crm-label-render.mjs';
import {readyForPickupClient} from './malotes-ready-client.mjs';
import {processMalotes} from './malotes-batch.mjs';
import {createZapiInstanceDiagnostics,ZAPI_DIAG_TOOL_NAME,ZAPI_HIST_TOOL_NAME,ZAPI_INSTANCE_TOOL_NAMES} from './zapi-instance-diagnostics.mjs';
import {createZapiBridge} from './zapi-mcp-client.mjs';
import {ZAPI_GATEWAY_TOOL_NAMES,ZAPI_STATUS_TOOL_NAME,getZapiRequiredScopes} from './zapi-mcp-tools.mjs';

export const GATEWAY_VERSION='0.12.0';
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
export const GAMEPLAY_CRM_TOOL_NAMES=Object.freeze(['crm_gameplay_links','crm_gameplay_auditoria','crm_gameplay_galerias_disponiveis']);
export const FORENSIC_CRM_TOOL_NAMES=Object.freeze(['crm_clientes_buscar']);
export const PRINTSERVER_TOOL_NAMES=Object.freeze(['crm_previa_malotes_retirada','crm_solicitar_impressao_etiqueta','crm_consultar_impressao_etiqueta']);
export const MALOTES_READY_TOOL_NAME='crm_marcar_disponivel_retirada';
export const MALOTES_BATCH_TOOL_NAME='crm_processar_malotes_retirada';
export const PROPOSAL_CRM_TOOL_NAMES=Object.freeze(['crm_previa_proposta_natal','crm_enviar_proposta_natal']);
export {UI_CRM_TOOL_NAMES};
export const ZAPI_MCP_TOOL_NAMES=Object.freeze([ZAPI_STATUS_TOOL_NAME,...ZAPI_GATEWAY_TOOL_NAMES]);
export {ZAPI_INSTANCE_TOOL_NAMES};
const READ={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const WRITE_IDEMPOTENT={readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true};
// A physical print is an externally visible, potentially irreversible action in a private device fleet.
const PRINT_WRITE={readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false};
const SAFE_ERR=/^(gameplay_[a-z0-9_]+|printserver_[a-z0-9_]+|crm_[a-z0-9_]+|invalid_[a-z0-9_]+|legacy_read_[a-z0-9_]+|insufficient_operator_[a-z0-9_]+|operator_token_revoked|operator_confirmation_required|zapi_[a-z0-9_]+|(?:natal|forensic)_bridge_[a-z0-9_]+|natal_stats_unavailable)$/;

function classifyToolError(code){
 if(code==='crm_public_package_or_campaign_not_found'){
  return {
   error_category:'NOT_FOUND',
   hint:'Campanha ou pacote público não encontrado em /api/public/v1/agenda. Consulte crm_campanha_publica primeiro e informe o slug público (ex.: "entao-e-natal", "ho-ho-ho", "boas-festas"), nunca a referência interna ("enatal").'
  };
 }
 if(['crm_customer_not_matched','legacy_read_customer_not_found','legacy_read_order_not_found','legacy_read_http_404','crm_http_404'].includes(code)){
  return {error_category:'NOT_FOUND'};
 }
 if(code==='crm_customer_ambiguous'){
  return {
   error_category:'AMBIGUOUS',
   hint:'Foram encontrados múltiplos clientes homônimos. Solicite telefone, CPF, e-mail ou UUID antes de prosseguir.'
  };
 }
 if(['insufficient_operator_scope','insufficient_operator_write_scope','operator_token_revoked','operator_confirmation_required','legacy_read_missing_operator_context','crm_http_401','crm_http_403'].includes(code)){
  return {error_category:'UNAUTHORIZED'};
 }
 if(code==='printserver_manual_reconciliation_required'){return {error_category:'CONFLICT',hint:'Impressão com resultado incerto: conferir fila LABEL e o histórico antes de repetir.'}}
 if(code==='printserver_invalid_request'){return {error_category:'INVALID_INPUT'}}
 if(code==='printserver_unauthorized'){return {error_category:'UNAUTHORIZED'}}
 if(code==='legacy_read_canonical_pagination_unavailable'){
  return {error_category:'UNAVAILABLE',hint:'A busca completa requer o bridge forense com paginação canônica. Não conclua que não existem pendências: validar EVYD_CRM_APP_PATH e o bridge privado no host MCP.'};
 }
 if(code.endsWith('_timeout')){
  return {error_category:'TIMEOUT'};
 }
 if(['crm_contract_invalid','crm_invalid_json','crm_extension_envelope_invalid','legacy_read_contract_invalid','legacy_read_invalid_json','natal_bridge_invalid_json','forensic_bridge_invalid_json','gameplay_crm_invalid','gameplay_crm_filter_mismatch','gameplay_crm_pagination_invalid','gameplay_contract_invalid','gameplay_url_invalid'].includes(code)){
  return {error_category:'CONTRACT_MISMATCH'};
 }
 return {error_category:'UNAVAILABLE'};
}

const INSTRUCTIONS='EVYDÊNCIA CRM LIVE (v0.12 Forense, Analítico, MCP UI & Z-API) — ROTEAMENTO CRÍTICO: (1) Vendas/recebidos/saldo Natal 2026 simples -> crm_estatisticas_natal(perfil_resposta="kpi_minimal"); NUNCA chame zapi_send_* em consultas de vendas/caixa/CRM. (2) orders.created_at mede criação do pedido (NÃO horário pago nem ROAS de anúncios). (3) Avatar HTTP 200 ("validated") prova asset no servidor, NÃO foto exibida (só onload do card visual confirma image_loaded). Regras completas: (4) Natal 2026 e Histórico 2021–2026: crm_estatisticas_natal(nivel_detalhe="resumo") traz KPIs, metas (R$ 300k base vs R$ 400k ampliada / 500 contratos), corte YTD, invariantes históricos, sessões confirmadas vs passadas aguardando baixa e loaded_sections; use secoes sob demanda (simulador_previsao, financeiro_caixa com reconciliação oi.total vs oi.payment_total e Permuta non_cash_barter vs Stone Débito debit_card, clientes_recompra_campanhas, agenda_demanda, pacotes_produtos_bonus, operacional_listas). (5) Demografia/Bebês/Famílias: use crm_natal_participantes_estatisticas (em ano="todos", a população detalhada é 2026 e o histórico cobre 2024–2026; incluir_lista_participantes=false salvo pedido nominal). (6) Links canônicos: cite crm_order_url (/gestao/pedidos/$UUID/detalhes) e crm_customer_url (/gestao/clientes/$UUID/consultar). (7) Card Visual ChatGPT Web (MCP App): use crm_renderizar_card_visual APENAS quando o operador pedir card/ficha visual de pedido ou cliente 360; demais consultas permanecem em JSON puro rápido. (8) Proposta Natal 2026: gere prévia em crm_previa_proposta_natal e exija confirmado_pelo_operador=true em crm_enviar_proposta_natal. (9) Z-API Diagnóstico/Histórico (leitura): use zapi_instancia_diagnostico (escopo="status_rapido" | "perfil_dispositivo" | "assinatura_configuracoes" | "completo") e zapi_instancia_historico (occurred_at_brt vs poll_detected_at_brt; nunca trate connection_state="unknown" como desconectada). (10) Z-API MCP Oficial: use zapi_status_conexao e zapi_send_*/zapi_group_* somente mediante pedido explícito de WhatsApp, resolvendo nomes no CRM antes, confirmando homônimos e sem reenvio automático em falha ambígua.';

export function defaultLog(entry){process.stderr.write(JSON.stringify({ts:new Date().toISOString(),...entry})+'\n')}

function calcPercentile(sortedNums,q){
 if(!sortedNums.length)return null;
 const idx=Math.min(sortedNums.length-1,Math.max(0,Math.floor(q*sortedNums.length)));
 return +sortedNums[idx].toFixed(2);
}

export function createGatewayPerfTracker(maxSamples=400){
 const samples=[];
 const byTool=new Map();
 let callsTotal=0,errorsTotal=0,cacheHitsTotal=0,cacheMissesTotal=0,singleFlightSharedTotal=0;
 return {
  record({tool,ok,gatewayMs=0,phpMs=null,sqlCount=null,sqlMs=null,cacheHit=null,singleFlightShared=false,responseBytes=0}){
   callsTotal++;
   if(!ok)errorsTotal++;
   if(cacheHit===true)cacheHitsTotal++;
   else if(cacheHit===false)cacheMissesTotal++;
   if(singleFlightShared)singleFlightSharedTotal++;
   const sample={
    gatewayMs:Number(gatewayMs)||0,
    phpMs:typeof phpMs==='number'&&Number.isFinite(phpMs)?phpMs:null,
    sqlCount:typeof sqlCount==='number'&&Number.isFinite(sqlCount)?sqlCount:null,
    sqlMs:typeof sqlMs==='number'&&Number.isFinite(sqlMs)?sqlMs:null,
    responseBytes:Number(responseBytes)||0
   };
   if(samples.length>=maxSamples)samples.shift();
   samples.push(sample);
   if(tool){
    const prev=byTool.get(tool)||{calls:0,errors:0,cache_hits:0,cache_misses:0,last_gateway_ms:null,last_php_ms:null,last_sql_count:null,last_sql_ms:null,last_response_bytes:null};
    prev.calls++;
    if(!ok)prev.errors++;
    if(cacheHit===true)prev.cache_hits++;
    else if(cacheHit===false)prev.cache_misses++;
    prev.last_gateway_ms=+sample.gatewayMs.toFixed(2);
    if(sample.phpMs!==null)prev.last_php_ms=+sample.phpMs.toFixed(2);
    if(sample.sqlCount!==null)prev.last_sql_count=sample.sqlCount;
    if(sample.sqlMs!==null)prev.last_sql_ms=+sample.sqlMs.toFixed(2);
    prev.last_response_bytes=sample.responseBytes;
    byTool.set(tool,prev);
   }
  },
  snapshot(){
   const gw=samples.map(s=>s.gatewayMs).sort((a,b)=>a-b);
   const php=samples.map(s=>s.phpMs).filter(v=>v!==null).sort((a,b)=>a-b);
   const sqlCounts=samples.map(s=>s.sqlCount).filter(v=>v!==null);
   const sqlTimes=samples.map(s=>s.sqlMs).filter(v=>v!==null);
   const bytes=samples.map(s=>s.responseBytes).filter(v=>v>0);
   const cacheDenom=cacheHitsTotal+cacheMissesTotal;
   const avg=arr=>arr.length?+(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2):null;
   return {
    window_samples:samples.length,
    calls_total:callsTotal,
    errors_total:errorsTotal,
    error_rate:callsTotal>0?+(errorsTotal/callsTotal).toFixed(4):0,
    cache_hits_total:cacheHitsTotal,
    cache_misses_total:cacheMissesTotal,
    cache_hit_rate:cacheDenom>0?+(cacheHitsTotal/cacheDenom).toFixed(4):null,
    single_flight_shared_total:singleFlightSharedTotal,
    gateway_ms:{p50:calcPercentile(gw,0.5),p95:calcPercentile(gw,0.95),avg:avg(gw),max:gw.length?+gw.at(-1).toFixed(2):null},
    php_ms:{p50:calcPercentile(php,0.5),p95:calcPercentile(php,0.95),avg:avg(php)},
    sql_count_avg:avg(sqlCounts),
    sql_ms_avg:avg(sqlTimes),
    response_bytes:{avg:bytes.length?Math.round(bytes.reduce((a,b)=>a+b,0)/bytes.length):null,max:bytes.length?Math.max(...bytes):null},
    by_tool:Object.fromEntries(byTool.entries())
   };
  }
 };
}

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
 {tool:'crm_enviar_proposta_natal',capability:'natal_proposal_dispatch',access:'write_idempotent',required_scope:GATEWAY_SCOPE+'+'+SCOPE_PROPOSAL_WRITE,source:'crm_extension_api',supports_filters:false,supports_pagination:false,supports_history:false,when:({full})=>Boolean(full)},
 {tool:'crm_renderizar_card_visual',capability:'mcp_ui_visual_card',access:'read',required_scope:GATEWAY_SCOPE,source:'gateway_mcp_ui_app',supports_filters:true,supports_pagination:false,supports_history:true,when:({direct,full,ui})=>Boolean(direct&&full&&ui)},
 {tool:'crm_previa_malotes_retirada',capability:'printserver_order_preview',access:'read',required_scope:GATEWAY_SCOPE,source:'crm_direct_read_only',supports_filters:true,supports_pagination:false,supports_history:false,when:({direct,full,print})=>Boolean(direct&&full&&print)},
 {tool:MALOTES_READY_TOOL_NAME,capability:'crm_order_ready_write',access:'write_idempotent',required_scope:GATEWAY_SCOPE+'+'+SCOPE_ORDERS_READY_WRITE,source:'crm_extension_sanctum',supports_filters:false,supports_pagination:false,supports_history:false,when:({full,ready})=>Boolean(full&&ready)},
 {tool:MALOTES_BATCH_TOOL_NAME,capability:'malotes_photo_batch_workflow',access:'write_idempotent',required_scope:GATEWAY_SCOPE+'+'+SCOPE_ORDERS_READY_WRITE+'+'+SCOPE_PRINT_WRITE,source:'crm_malotes_saga',supports_filters:false,supports_pagination:false,supports_history:false,when:({full,batch})=>Boolean(full&&batch)},
 {tool:'crm_solicitar_impressao_etiqueta',capability:'printserver_job_dispatch',access:'write_idempotent',required_scope:GATEWAY_SCOPE+'+'+SCOPE_PRINT_WRITE,source:'printserver_broker',supports_filters:false,supports_pagination:false,supports_history:false,when:({direct,full,print})=>Boolean(direct&&full&&print)},
 {tool:'crm_consultar_impressao_etiqueta',capability:'printserver_job_status',access:'read',required_scope:GATEWAY_SCOPE+'+'+SCOPE_PRINT_WRITE,source:'printserver_broker',supports_filters:false,supports_pagination:false,supports_history:false,when:({direct,full,print})=>Boolean(direct&&full&&print)}
]);

function manifest(directEnabled=false,operatorFullCrm=false,zapiContext=null,{uiAppsEnabled=true,printserverEnabled=false,malotesReadyEnabled=false,malotesBatchEnabled=false,perfSnapshot=null,gameplayEnabled=false}={}){
 const flags={direct:Boolean(directEnabled),full:Boolean(operatorFullCrm),ui:Boolean(uiAppsEnabled),print:Boolean(printserverEnabled),ready:Boolean(malotesReadyEnabled),batch:Boolean(malotesBatchEnabled)};
 const tools=LIVE_CATALOG.map(({when,...meta})=>{
  const active=Boolean(when(flags));
  return {...meta,registered:active,state:active?'LIVE_ACTIVE':'NOT_AVAILABLE'};
 });
 if(gameplayEnabled && directEnabled){
  for(const name of GAMEPLAY_CRM_TOOL_NAMES){
   tools.push({tool:name,capability:name==='crm_gameplay_links'?'christmas_gallery_links':name==='crm_gameplay_galerias_disponiveis'?'christmas_gallery_inventory':'christmas_publication_audit',
    access:'read',required_scope:GATEWAY_SCOPE,source:'crm_gameplay_join',supports_filters:true,
    supports_pagination:name!=='crm_gameplay_links',supports_history:false,
    registered:true,state:'LIVE_ACTIVE'});
  }
 }
 if(zapiContext?.diagEnabled){
  tools.push(
   {
    tool:ZAPI_DIAG_TOOL_NAME,
    capability:'zapi_instance_realtime_diagnostics',
    access:'read',
    required_scope:GATEWAY_SCOPE,
    source:'zapi_rest_diagnostics',
    supports_filters:true,
    supports_pagination:false,
    supports_history:false,
    registered:true,
    state:'LIVE_ACTIVE'
   },
   {
    tool:ZAPI_HIST_TOOL_NAME,
    capability:'zapi_instance_connection_history',
    access:'read',
    required_scope:GATEWAY_SCOPE,
    source:'zapi_crm_webhooks_and_poll_log',
    supports_filters:true,
    supports_pagination:true,
    supports_history:true,
    registered:true,
    state:'LIVE_ACTIVE'
   }
  );
 }
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
 const activeTools=tools.filter(t=>t.registered);
 const uiSet=new Set(UI_CRM_TOOL_NAMES);
 // Count only original v0.12 tools; UI, PrintServer and Gameplay are additive.
 const printSet=new Set(PRINTSERVER_TOOL_NAMES);
 const gameplaySet=new Set(GAMEPLAY_CRM_TOOL_NAMES);
 const legacyPreservedCount=activeTools.filter(t=>!uiSet.has(t.tool)&&!printSet.has(t.tool)&&!gameplaySet.has(t.tool)).length;
 const mcpUiActive=Boolean(directEnabled&&operatorFullCrm&&uiAppsEnabled);
 return {
  service:'evydencia-crm-mcp-live',
  version:GATEWAY_VERSION,
  build_commit:BUILD_INFO.commit,
  repository_branch:BUILD_INFO.branch,
  mode:(operatorFullCrm||zapiContext?.enabled||zapiContext?.diagEnabled)?'LIVE_OPERATOR_FULL_OAUTH':'LIVE_READ_ONLY_OAUTH',
  mock_mode:false,
  direct_crm_read_enabled:Boolean(directEnabled),
  gameplay_read_enabled:Boolean(gameplayEnabled&&directEnabled),
  forensic_audit_enabled:Boolean(directEnabled&&operatorFullCrm),
  proposal_dispatch_enabled:Boolean(operatorFullCrm),
  mcp_ui_apps_enabled:mcpUiActive,
  write_requires_explicit_confirmation:true,
  tools_total_catalog:tools.length,
  tools_active_count:activeTools.length,
  legacy_v012_tools_preserved_count:legacyPreservedCount,
  tools,
  ...(directEnabled?{direct_crm_tools:DIRECT_CRM_TOOL_NAMES}:{}),
  ...(gameplayEnabled&&directEnabled?{gameplay_crm_tools:GAMEPLAY_CRM_TOOL_NAMES}:{}),
  ...(directEnabled&&operatorFullCrm?{forensic_crm_tools:FORENSIC_CRM_TOOL_NAMES}:{}),
  ...(operatorFullCrm?{proposal_crm_tools:PROPOSAL_CRM_TOOL_NAMES}:{}),
  ...(mcpUiActive?{ui_crm_tools:UI_CRM_TOOL_NAMES,ui_resource_uri:MCP_UI_CARD_RESOURCE_URI,ui_fallback_resource_uri:MCP_UI_CARD_V1_FALLBACK_URI}:{}),
  ...(zapiContext?.diagEnabled?{
   zapi_diagnostics_enabled:true,
   zapi_diagnostics_configured_for_operator:Boolean(zapiContext.diagConfigured),
   zapi_diagnostics_tools:ZAPI_INSTANCE_TOOL_NAMES
  }:{}),
  ...(zapiContext?.enabled?{
   zapi_mcp_enabled:true,
   zapi_oauth_status:zapiContext.oauthStatus,
   zapi_discovered_tools_count:(zapiContext.tools||[]).length,
   zapi_exposed_tools:[ZAPI_STATUS_TOOL_NAME,...(zapiContext.tools||[]).map(t=>t.gatewayName)]
  }:{}),
  ...(perfSnapshot?{performance_telemetry:perfSnapshot}:{})
 };
}

function summarizeToolResult(tool,res){
 if(!res||typeof res!=='object')return `OK [${tool}]: resposta concluída em structuredContent.`;
 switch(tool){
  case 'crm_capacidades':
   return `OK [crm_capacidades]: versao=${res.version}, commit=${res.build_commit}, modo=${res.mode}, ativas=${res.tools_active_count}/${res.tools_total_catalog} (legado_v012_preservadas=${res.legacy_v012_tools_preserved_count??res.tools_active_count}).`;
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
   return `OK [crm_estatisticas_natal]: perfil=${res.response_profile||'default'}, corte=${res.cutoff_mmdd||'atual'}, nivel=${res.detail_level||'resumo'}, pedidos_validos_2026=${res.kpis_2026?.valid_orders??'n/d'}, sessoes_confirmadas_2026=${res.kpis_2026?.confirmed_realized_sessions??res.kpis_2026?.confirmed_realized_sessions_to_date??res.kpis_2026?.realized_sessions_to_date??'n/d'}. Consulte structuredContent.`;
  case 'crm_natal_participantes_estatisticas':
   return `OK [crm_natal_participantes_estatisticas]: escopo=${res.year_scope||'2026'}, pop_primaria=${res.primary_population_year??res.year_scope??'2026'}, total_participantes=${res.population_reconciliation?.total_participants_count??'n/d'}, reconciliado=${Boolean(res.population_reconciliation?.reconciled)}. Consulte structuredContent.`;
  case 'crm_gameplay_links':
   return `OK [crm_gameplay_links]: pedidos=${res.total??0}, escolha_id=${Boolean(res.selection_required)}. Consulte structuredContent para status do CRM, fotos publicadas/preparadas e links individuais autorizados.`;
  case 'crm_gameplay_galerias_disponiveis':
   return `OK [crm_gameplay_galerias_disponiveis]: publicadas=${res.total_disponiveis??0}, retornadas=${res.orders?.length??0}, links_disponiveis=${res.orders?.filter(o=>o.operational?.customer_links_status==='available').length??0}. Consulte structuredContent. Nenhum envio realizado.`;
  case 'crm_gameplay_auditoria':
   return `OK [crm_gameplay_auditoria]: pedidos_elegiveis=${res.counts?.total??'n/d'}, pendentes=${res.counts?.pending_publication??'n/d'}, fotos_publicadas=${res.counts?.published_photo_count??'n/d'}, fotos_em_preparacao=${res.counts?.preparing_photo_count??'n/d'}. Jogos no navegador NAO verificados. Consulte structuredContent.`;
  case 'crm_pedidos_buscar':
   return `OK [crm_pedidos_buscar]: retornados=${Array.isArray(res.orders)?res.orders.length:0}, total_correspondente=${res.pagination?.total_matching_orders??'n/d'}. Consulte structuredContent.`;
  case 'crm_pedido_detalhe':
   return `OK [crm_pedido_detalhe]: order_id=${res.order?.order_id??'n/d'}, parcelas=${Array.isArray(res.order?.installments)?res.order.installments.length:0}, eventos_status=${res.order?.status_history_count??0}. Consulte structuredContent.`;
  case 'crm_clientes_buscar':
   return `OK [crm_clientes_buscar]: retornados=${Array.isArray(res.customers)?res.customers.length:0}, total=${res.pagination?.total_matching_customers??'n/d'}. Consulte structuredContent.`;
  case 'crm_renderizar_card_visual':
   return formatVisualCardTextFallback(res);
  case 'crm_previa_proposta_natal':
   return `OK [crm_previa_proposta_natal]: elegivel=${Boolean(res.ready)}. Consulte structuredContent.`;
  case 'crm_enviar_proposta_natal':
   return `OK [crm_enviar_proposta_natal]: agendado=${Boolean(res.scheduled)}. Consulte structuredContent.`;
  case ZAPI_STATUS_TOOL_NAME:
   return `OK [${ZAPI_STATUS_TOOL_NAME}]: oauth_status=${res.oauth_status||'n/d'}, ferramentas=${res.discovered_tools_count??0}, whatsapp=${res.whatsapp_connection?.status||'n/d'}. Consulte structuredContent.`;
  case ZAPI_DIAG_TOOL_NAME:
   return `OK [${ZAPI_DIAG_TOOL_NAME}]: configurado=${Boolean(res.configured)}, estado=${res.instance?.connection_state||'NOT_CONFIGURED'}, telefone=${res.instance?.phone||'n/d'}, alertas=${Array.isArray(res.warnings)?res.warnings.length:0}. Consulte structuredContent.`;
  case ZAPI_HIST_TOOL_NAME:
   return `OK [${ZAPI_HIST_TOOL_NAME}]: webhooks_disponivel=${Boolean(res.webhook_history?.available)}, eventos_webhook=${res.webhook_history?.returned_count??0}, observacoes_gateway=${res.gateway_poll_observations?.returned_count??0}. Consulte structuredContent.`;
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
 mcp_ui_apps_enabled:z.boolean().nullish(),
 write_requires_explicit_confirmation:z.boolean(),
 tools_total_catalog:z.number().int(),
 tools_active_count:z.number().int(),
 legacy_v012_tools_preserved_count:z.number().int().nullish(),
 oauth_authorization:z.looseObject({
  operator_id:z.string(),
  granted_scopes:z.array(z.string()),
  print_scope_granted:z.boolean(),
  print_tool_enabled:z.boolean()
 }).nullish(),
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
 })),
 performance_telemetry:z.looseObject({}).nullish(),
 gameplay_private_probe:z.looseObject({
  checked:z.literal(true),reachable:z.boolean(),
  status:z.enum(['not_configured','private_contract_ok',
   'gameplay_http_401','gameplay_http_403','gameplay_http_404',
   'gameplay_http_408','gameplay_http_429','gameplay_http_500',
   'gameplay_http_502','gameplay_http_503','gameplay_http_504',
   'gameplay_unavailable']),
  dataset_proven:z.literal(false)
 }).optional()
});
// PHP json_encode emits lists (and empty associative arrays) as JSON arrays: nested analytic blocks accept object OR array.
const FLEX=z.union([z.looseObject({}),z.array(z.unknown())]).nullish();
const OUT_BRIDGE_TELEMETRY=z.looseObject({
 php_ms:z.number().nullish(),
 sql_count:z.number().nullish(),
 sql_ms:z.number().nullish(),
 cache_hit:z.boolean().nullish(),
 single_flight_shared:z.boolean().nullish(),
 response_bytes:z.number().nullish()
}).nullish();
const OUT_GENERIC=z.looseObject({source:z.string().nullish()});
const OUT_CUSTOMER=z.looseObject({
 source:z.string().nullish(),
 lookup:z.looseObject({status:z.string().nullish(),match_count:z.number().nullish()}).nullish(),
 customer:z.looseObject({uuid:z.string().nullish(),crm_customer_url:z.string().nullish()}).nullish(),
 kpis:FLEX,
 financial_audit_summary:FLEX,
 participants_cross_order_audit:FLEX,
 current_order:FLEX,
 orders:z.array(z.looseObject({})).nullish(),
 bridge_telemetry:OUT_BRIDGE_TELEMETRY
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
 }).nullish(),
 bridge_telemetry:OUT_BRIDGE_TELEMETRY
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
 orders:z.array(z.looseObject({})),
 bridge_telemetry:OUT_BRIDGE_TELEMETRY
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
 customers:z.array(z.looseObject({})),
 bridge_telemetry:OUT_BRIDGE_TELEMETRY
});
const OUT_NATAL_STATS=z.looseObject({
 source:z.string().nullish(),
 reference_year:z.number().nullish(),
 cutoff_mmdd:z.string().nullish(),
 detail_level:z.string().nullish(),
 response_profile:z.string().nullish(),
 data_status:z.string().nullish(),
 integrity_checks:z.looseObject({contracted_equals_paid_plus_balance:z.boolean().nullish()}).nullish(),
 warnings:z.array(z.string()).nullish(),
 loaded_sections:z.array(z.string()).nullish(),
 sections_loaded:z.array(z.string()).nullish(),
 kpis_2026:z.looseObject({
  valid_orders:z.number().nullish(),
  unique_customers:z.number().nullish(),
  scheduled_sessions:z.number().nullish(),
  unscheduled_sessions:z.number().nullish(),
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
 sections:FLEX,
 bridge_telemetry:OUT_BRIDGE_TELEMETRY
});
const OUT_NATAL_PARTICIPANTS=z.looseObject({
 source:z.string().nullish(),
 year_scope:z.string().nullish(),
 requested_year_scope:z.string().nullish(),
 primary_population_year:z.number().nullish(),
 historical_comparison_years:z.array(z.number()).nullish(),
 scope_semantics:z.string().nullish(),
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
 data_quality_anomalies:FLEX,
 bridge_telemetry:OUT_BRIDGE_TELEMETRY
});
const OUT_VISUAL_CARD=OUT_VISUAL_CARD_OBJECT_SCHEMA;
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
const OUT_GAMEPLAY_STATE=z.enum(['not_found','not_published','partial','revoked','published_unverified']);
const OUT_GAMEPLAY_RECORD=z.looseObject({
 crm_order_uuid:z.string().uuid(),state:OUT_GAMEPLAY_STATE,
 photo_count:z.number().int().nonnegative(),expected_blobs:z.number().int().nonnegative(),
 ready_blobs:z.number().int().nonnegative(),
 preparation:z.looseObject({
  state:z.enum(['none','staged','invalid']),revision_id:z.string().uuid().nullable(),
  photo_count:z.number().int().nonnegative().nullable(),
  expected_blobs:z.number().int().nonnegative(),ready_blobs:z.number().int().nonnegative()
 }).optional(),
 hub_url:z.string().url().nullable(),gallery_url:z.string().url().nullable(),
 games_runtime_verified:z.literal(false)
});
const OUT_GAMEPLAY_OPERATIONAL=z.looseObject({
 crm_order_uuid:z.string().uuid(),crm_status_key:z.string().nullish(),
 crm_status_id:z.number().int().nullish(),publication_required_by_crm:z.boolean(),
 digital_experience_status:z.enum([
  'no_gameplay_session','access_revoked','publication_incomplete',
  'album_not_published','album_published_runtime_unverified',
  'album_in_preparation','preparation_invalid'
 ]),
 publication_pending:z.boolean(),
 customer_links_status:z.enum(['available','not_available','unavailable_http_409']),
 main_url:z.string().url().nullable(),games_url:z.string().url().nullable(),
 gallery_url:z.string().url().nullable(),links_browser_verified:z.literal(false).optional(),
 link_delivery_status:z.literal('not_verified'),
 link_sent_confirmed:z.null(),link_opened_confirmed:z.null(),
 delivery_receipt_verified:z.literal(false),
 published_photo_count:z.number().int().nonnegative().nullable(),
 active_revision_manifest_photo_count:z.number().int().nonnegative().nullable(),
 preparing_photo_count:z.number().int().nonnegative().nullable(),
 published_variants_ready:z.number().int().nonnegative().nullable(),
 preparing_variants_ready:z.number().int().nonnegative().nullable(),
 individual_games_verified:z.literal(false),browser_runtime_verified:z.literal(false)
});
const OUT_GAMEPLAY_ORDER=z.looseObject({
 order_id:z.number().int().nullish(),crm_order_uuid:z.string().uuid().optional(),
 crm_order_url:z.string().url().nullish(),customer_name:z.string().nullish(),
 package_name:z.string().nullish(),status_id:z.number().int().nullish(),
 status_key:z.string().nullish(),expected_now:z.boolean().optional(),
 operational:OUT_GAMEPLAY_OPERATIONAL.optional(),gameplay:OUT_GAMEPLAY_RECORD.nullish()
});
const OUT_GAMEPLAY_LINKS=z.looseObject({
 source:z.literal('crm_gameplay_join'),total:z.number().int().nonnegative(),
 selection_required:z.boolean().optional(),orders:z.array(OUT_GAMEPLAY_ORDER)
});
const OUT_GAMEPLAY_AVAILABLE=z.looseObject({
 source:z.literal('crm_gameplay_join'),year:z.literal(2026),
 population:z.literal('all_2026_natal_crm_orders_including_cancelled'),
 total_crm_orders:z.number().int().nonnegative(),
 total_disponiveis:z.number().int().nonnegative(),
 pagination:z.looseObject({
  page:z.number().int().positive(),per_page:z.number().int().positive(),
  total_matching:z.number().int().nonnegative(),has_more:z.boolean()
 }),
 orders:z.array(OUT_GAMEPLAY_ORDER)
});
const OUT_GAMEPLAY_AUDIT=z.looseObject({
 source:z.literal('crm_gameplay_join'),year:z.literal(2026),
 statuses:z.array(z.enum(['waiting_product_retrieve','order_completed'])),
 counts:z.looseObject({total:z.number().int().nonnegative(),
  pending_publication:z.number().int().nonnegative(),
  published_without_browser_proof:z.number().int().nonnegative(),
  published_photo_count:z.number().int().nonnegative().optional(),
  preparing_photo_count:z.number().int().nonnegative().optional(),
  orders_in_preparation:z.number().int().nonnegative().optional(),
  orders_without_gameplay_session:z.number().int().nonnegative().optional(),
  orders_with_delivery_unverified:z.number().int().nonnegative().optional(),
  published_orders_delivery_unverified:z.number().int().nonnegative().optional()}),
 pagination:z.looseObject({page:z.number().int(),per_page:z.number().int(),
  total_matching:z.number().int(),has_more:z.boolean()}),
 orders:z.array(OUT_GAMEPLAY_ORDER)
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

const OUT_ZAPI_DIAGNOSTICO=z.looseObject({
 source:z.string(),
 configured:z.boolean(),
 checked_at:z.string(),
 timezone:z.string(),
 instance:z.looseObject({
  id:z.string(),
  connection_state:z.enum(['connected','disconnected','unknown']),
  connected:z.boolean().nullable(),
  smartphone_connected:z.boolean().nullable(),
  phone:z.string().nullable()
 }).nullable(),
 webhooks:z.looseObject({}).nullable(),
 diagnostics:z.looseObject({
  api_reachable:z.boolean().nullable(),
  credentials_valid:z.boolean().nullable(),
  partial_failure:z.boolean()
 }),
 warnings:z.array(z.looseObject({code:z.string(),message:z.string()}))
});
const OUT_ZAPI_HISTORICO=z.looseObject({
 source:z.string(),
 configured:z.boolean(),
 checked_at:z.string(),
 timezone:z.string(),
 instance:z.looseObject({id:z.string()}).nullable(),
 webhook_history:z.looseObject({
  available:z.boolean(),
  events:z.array(z.looseObject({}))
 }),
 gateway_poll_observations:z.looseObject({
  available:z.boolean(),
  events:z.array(z.looseObject({}))
 }),
 limitations:z.string()
});

// Exported for contract tests against real (PHP-encoded) CRM payload shapes.
export const OUTPUT_SCHEMAS=Object.freeze({OUT_CAPACIDADES,OUT_GENERIC,OUT_GAMEPLAY_LINKS,OUT_GAMEPLAY_AUDIT,OUT_GAMEPLAY_AVAILABLE,OUT_CUSTOMER,OUT_ORDER_DETAIL,OUT_ORDERS_SEARCH,OUT_CUSTOMERS_SEARCH,OUT_NATAL_STATS,OUT_NATAL_PARTICIPANTS,OUT_VISUAL_CARD,OUT_PROPOSAL_PREVIEW,OUT_PROPOSAL_DISPATCH,OUT_ZAPI_STATUS,OUT_ZAPI_DIAGNOSTICO,OUT_ZAPI_HISTORICO});

async function liveServer(auth,{cfg,fetchFn,operators,log,zapi,zapiDiag,perf,printCfg,labelRenderer,labelRenderEnabled,labelRenderEnv}){
 const ex=auth?.extra||{};
 if(typeof ex.upstream!=='string'||!ex.operatorId)throw Error('gateway_missing_identity');
 const grantedScopes=new Set(Array.isArray(auth?.scopes)&&auth.scopes.length?auth.scopes:[GATEWAY_SCOPE]);
 const crm=crmClient({baseUrl:cfg.crmBaseUrl,token:ex.upstream,privateEnabled:true,timeoutMs:cfg.crmTimeoutMs,fetchFn,strictEnvelope:true});
 const direct=cfg.internalReadToken?legacyReadClient({
  baseUrl:cfg.crmBaseUrl,
  token:cfg.internalReadToken,
  fetchFn,
  timeoutMs:cfg.crmTimeoutMs,
  includeParticipants:cfg.operatorFullCrm,
  operatorContext:{
   requireOperator:true,
   operatorId:ex.operatorId,
   authScope:[...grantedScopes].sort().join(' '),
   upstreamGrantHash:ex.upstreamGrantHash||'',
   cacheSecret:ex.cacheSecret||null
  }
 }):null;
 const zapiTools=zapi?await zapi.ensureOperatorTools(ex.operatorId):[];
 // Optional Gameplay configuration is captured by gatewayConfig(env) and
 // never implicitly loaded from another process-global environment.
 let gameplay=null;
 if(direct&&cfg.operatorFullCrm){
  if(cfg.gameplayReadConfigError)log({evt:'gameplay_config_invalid',op:ex.operatorTag});
  else if(cfg.gameplayReadSettings)
   gameplay=createGameplayReadClient(cfg.gameplayReadSettings,{fetchFn});
 }
 const resolvePhone=async({telefone,nome_cliente},{allowLookupMiss=false}={})=>{
  const handleLookup=r=>{
   if(typeof r==='string')return {status:'matched',phone:r};
   if(r?.status==='matched'&&r.phone)return r;
   if(allowLookupMiss&&(r?.status==='ambiguous'||r?.status==='not_found'))return r;
   throw Error(r?.status==='ambiguous'?'crm_customer_ambiguous':'legacy_read_customer_not_found');
  };
  if(typeof telefone==='string'&&telefone.trim()){
   const t=telefone.trim();
   if(/\d{8,}/.test(t.replace(/\D/g,''))||!direct)return {status:'matched',phone:t};
   return handleLookup(await direct.resolvePhoneByName(t));
  }
  if(typeof nome_cliente==='string'&&nome_cliente.trim()&&direct){
   return handleLookup(await direct.resolvePhoneByName(nome_cliente.trim()));
  }
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
   const gwMs=+(performance.now()-t0).toFixed(2);
   const bt=result&&typeof result==='object'?result.bridge_telemetry:null;
   const respBytes=typeof bt?.response_bytes==='number'?bt.response_bytes:Buffer.byteLength(JSON.stringify(result??null),'utf8');
   perf?.record({
    tool,
    ok:true,
    gatewayMs:gwMs,
    phpMs:bt?.php_ms??null,
    sqlCount:bt?.sql_count??null,
    sqlMs:bt?.sql_ms??null,
    cacheHit:typeof bt?.cache_hit==='boolean'?bt.cache_hit:null,
    singleFlightShared:Boolean(bt?.single_flight_shared),
    responseBytes:respBytes
   });
   log({
    evt:'tool',
    tool,
    ok:true,
    op:ex.operatorTag,
    ms:Math.round(gwMs),
    gateway_ms:gwMs,
    ...(typeof bt?.php_ms==='number'?{php_ms:bt.php_ms,sql_count:bt.sql_count??null,sql_ms:bt.sql_ms??null}:{}),
    ...(typeof bt?.cache_hit==='boolean'?{cache_hit:bt.cache_hit}:{}),
    response_bytes:respBytes
   });
   return {content:[{type:'text',text:summarizeToolResult(tool,result)}],structuredContent:result};
  }catch(e){
   const gwMs=+(performance.now()-t0).toFixed(2);
   let code=SAFE_ERR.test(e?.message||'')?e.message:'crm_unavailable';
   if(code==='crm_http_401'){code='operator_token_revoked';operators.forget(ex.upstream)}
   const errMeta=classifyToolError(code);
   perf?.record({tool,ok:false,gatewayMs:gwMs,responseBytes:0});
   log({evt:'tool',tool,ok:false,err:code,err_cat:errMeta.error_category,op:ex.operatorTag,ms:Math.round(gwMs),gateway_ms:gwMs});
   return {isError:true,content:[{type:'text',text:JSON.stringify({error:code,error_category:errMeta.error_category,...(errMeta.hint?{hint:errMeta.hint}:{})})}]};
  }
 };
 const m=new McpServer({name:'evydencia-crm-mcp-live',version:GATEWAY_VERSION},{instructions:INSTRUCTIONS});
 const registeredNames=new Set();
 const reg=(name,title,description,inputSchema,outputSchema,fn,annotations=READ,extraConfig=null)=>{
  if(registeredNames.has(name))return;
  registeredNames.add(name);
  const {requiredScopes=[GATEWAY_SCOPE],_meta:extraMeta,...restExtra}=extraConfig||{};
  const mergedMeta={...(extraMeta||{}),securitySchemes:[{type:'oauth2',scopes:[...requiredScopes]}]};
  m.registerTool(name,{title,description,inputSchema,outputSchema,annotations,...restExtra,_meta:mergedMeta},safe(name,fn));
 };

 reg('crm_capacidades','Capacidades disponíveis e Telemetria','Use quando precisar consultar o inventário fiel deste conector LIVE, versão/commit implantado (build_commit), ferramentas habilitadas (29 originais + card visual opcional) e métricas reais de latência/cache/SQL (performance_telemetry).',z.object({verificar_gameplay:z.boolean().default(false)}),OUT_CAPACIDADES,async({verificar_gameplay})=>({...manifest(Boolean(direct),cfg.operatorFullCrm,(zapi||zapiDiag)?{
  enabled:Boolean(zapi),
  oauthStatus:zapi?zapi.auth.getOperatorState(ex.operatorId).oauth_status:null,
  tools:zapiTools,
  diagEnabled:Boolean(zapiDiag),
  diagConfigured:Boolean(zapiDiag&&zapiDiag.listForOperator(ex.operatorId).length>0)
 }:null,{uiAppsEnabled:cfg.uiAppsEnabled,printserverEnabled:Boolean(printCfg.enabled&&ex.canPrint),malotesReadyEnabled:Boolean(cfg.malotesReadyEnabled&&ex.canReady),malotesBatchEnabled:Boolean(cfg.malotesBatchEnabled&&ex.canReady&&ex.canPrint&&printCfg.enabled&&labelRenderEnabled),perfSnapshot:perf?.snapshot()??null,gameplayEnabled:Boolean(gameplay)}),
  // Report EFFECTIVE token scopes, not scopes_supported advertised by OAuth metadata.
  // No access tokens, gateway secrets or upstream abilities in this response.
  oauth_authorization:{
   operator_id:String(ex.operatorId),
   granted_scopes:[...grantedScopes].sort(),
   print_scope_granted:grantedScopes.has(SCOPE_PRINT_WRITE),
   orders_write_scope_granted:grantedScopes.has(SCOPE_ORDERS_READY_WRITE),
   print_tool_enabled:Boolean(printCfg.enabled&&ex.canPrint&&grantedScopes.has(SCOPE_PRINT_WRITE))
  },
  ...(verificar_gameplay?{gameplay_private_probe:await probeGameplayPrivateAccess(gameplay)}:{})
 }));
 if(gameplay){
  const eligibleStatus=new Set(['waiting_product_retrieve','order_completed']);
  const findOrders=async(filter,{canonicalPaginationRequired=true}={})=>{
   const orders=[],seen=new Set();
   let expectedTotal=null;
   for(let page=1;page<=80;page++){
    const result=await direct.search(filter,{
     page,limit:25,detailLevel:'resumo',canonicalPaginationRequired
    });
    if(!Array.isArray(result?.orders))throw Error('gameplay_crm_invalid');
    const p=result.pagination;
    if(canonicalPaginationRequired){
     if(!Number.isSafeInteger(p?.total_matching_orders)||p.total_matching_orders<0||
        p.page!==page||p.returned_count!==result.orders.length)
       throw Error('gameplay_crm_pagination_invalid');
     if(expectedTotal===null)expectedTotal=p.total_matching_orders;
     else if(expectedTotal!==p.total_matching_orders)
       throw Error('gameplay_crm_pagination_invalid');
    }
    for(const o of result.orders){
     const uuid=String(o.order_uuid||o.uuid||'').toLowerCase();
     if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid))
       throw Error('gameplay_crm_invalid');
     if(seen.has(uuid))continue;
     seen.add(uuid);orders.push(o);
    }
    if(typeof result.pagination?.has_more!=='boolean')throw Error('gameplay_crm_pagination_invalid');
    if(!result.pagination.has_more){
     if(canonicalPaginationRequired&&seen.size!==expectedTotal)
      throw Error('gameplay_crm_pagination_invalid');
     break;
    }
    if(page===80)throw Error('gameplay_crm_pagination_limit');
   }
   return orders;
  };
  const natalFilter={'order.created-start':'2026-01-01','order.created-end':'2026-12-31','product.slug':'natal'};
  reg('crm_gameplay_links','Galeria e jogos de Natal 2026 por nome ou pedido',
   'Consulta somente leitura por order_id, UUID ou nome no CRM Natal 2026. Relaciona pedido ao Gameplay por UUID e mostra status atual CRM, fotos publicadas, fotos em preparação e situação do álbum. O estado envio do link permanece not_verified até existir comprovante do CRM/Z-API; publicação não prova envio nem jogos executados. Busca por nome apenas lista candidatos; consulte por ID ou UUID explícito para obter URLs autorizadas. Não envia WhatsApp.',
   z.object({order_id:z.number().int().positive().optional(),order_uuid:z.string().uuid().optional(),
    nome_cliente:z.string().min(2).max(100).optional()}),OUT_GAMEPLAY_LINKS,async({order_id,order_uuid,nome_cliente})=>{
     if([order_id,order_uuid,nome_cliente].filter(x=>x!==undefined).length!==1)throw Error('gameplay_locator_invalid');
     const f={...natalFilter,...(order_id?{'order.id':order_id}:{}),
      ...(order_uuid?{'order.uuid':order_uuid}:{}),
      ...(nome_cliente?{'customer.name':nome_cliente}:{})};
     // Exact order ID / UUID can still use the legacy HTTP path because the
     // returned identity is verified below. Broad name searches must use
     // canonical server-side pagination to prevent incomplete candidate lists.
     const orders=await findOrders(f,{canonicalPaginationRequired:Boolean(nome_cliente)});
     // A broken CRM filter must never return links for another order.
     if(order_id!==undefined&&orders.some(o=>Number(o.order_id)!==order_id))
      throw Error('gameplay_crm_filter_mismatch');
     if(order_uuid!==undefined&&orders.some(o=>
       String(o.order_uuid||o.uuid).toLowerCase()!==order_uuid.toLowerCase()))
      throw Error('gameplay_crm_filter_mismatch');
     if(!orders.length)return {source:'crm_gameplay_join',orders:[],total:0};
     // Never retrieve capability links for a broad name search.
     if(gameplayOrderSelectionRequired({nome_cliente,orders_count:orders.length}))return {source:'crm_gameplay_join',selection_required:true,
      total:orders.length,orders:orders.slice(0,20).map(o=>({
       order_id:o.order_id,crm_order_uuid:o.order_uuid||o.uuid,
       customer_name:o.customer_name,package_name:o.package_name,
       status_id:o.status_id,status_key:o.status_key,
       crm_order_url:o.crm_order_url}))};
     const snapshots=await Promise.all(orders.map(async o=>{
       const uuid=String(o.order_uuid||o.uuid).toLowerCase();
       const {record:gameplayResult,links}=await lookupGameplayWithCustomerLinks(gameplay,uuid);
       const operational=gameplayOrderStatus(o,gameplayResult);
       return {order_id:o.order_id,crm_order_uuid:uuid,
        crm_order_url:o.crm_order_url,customer_name:o.customer_name,
        package_name:o.package_name,status_id:o.status_id,
        status_key:o.status_key,expected_now:operational.publication_required_by_crm,
        operational:{...operational,...links},gameplay:gameplayResult};
     }));
     return {source:'crm_gameplay_join',total:orders.length,
      orders:snapshots};
   });

  reg('crm_gameplay_galerias_disponiveis','Todas as famílias com galerias Gameplay disponíveis',
   'Lista TODAS as famílias com álbuns publicados no Gameplay, inclusive pedidos CRM cancelados/abortados. Tabela paginada com ID, nome, pacote, fotos, link do hub de jogos e galeria quando realmente autorizados. Consulta de operador autenticado; sem envio WhatsApp nem impressão. O status published_unverified não é prova de jogo no navegador. Se links estiverem bloqueados, mostra indisponibilidade 409 sem inventar endereços.',
   z.object({pagina:z.number().int().min(1).max(100).default(1),
    por_pagina:z.number().int().min(1).max(50).default(25),
    incluir_links:z.boolean().default(true)}),OUT_GAMEPLAY_AVAILABLE,
   async({pagina,por_pagina,incluir_links})=>{
    // Scope: all CRM Natal 2026 orders, irrespective of current sale status.
    const orders=await findOrders(natalFilter);
    const map=new Map();
    for(let i=0;i<orders.length;i+=50){
     const result=await gameplay.lookup(orders.slice(i,i+50).map(o=>o.order_uuid||o.uuid));
     for(const row of result.results){
      if(map.has(row.crm_order_uuid))throw Error('gameplay_contract_invalid');
      map.set(row.crm_order_uuid,row);
     }
    }
    const published=orders.filter(o=>{
     const uuid=String(o.order_uuid||o.uuid).toLowerCase();
     const row=map.get(uuid);
     if(!row)throw Error('gameplay_contract_invalid');
     return row.state==='published_unverified';
    }).sort((a,b)=>Number(b.order_id)-Number(a.order_id));
    const start=(pagina-1)*por_pagina,chosen=published.slice(start,start+por_pagina);
    const entries=[];
    // Bound concurrent capability requests, never issue tokens in a batch
    // metadata endpoint. OAuth operator access is checked by the gateway.
    for(let i=0;i<chosen.length;i+=5){
     const chunk=await Promise.all(chosen.slice(i,i+5).map(async o=>{
      const uuid=String(o.order_uuid||o.uuid).toLowerCase();
      const baseline=map.get(uuid);
      const lookup=incluir_links
       ?await lookupGameplayWithCustomerLinks(gameplay,uuid)
       :{record:baseline,links:{main_url:null,games_url:null,gallery_url:null,
          customer_links_status:'not_requested',links_browser_verified:false}};
      if(lookup.record.state!=='published_unverified'||
         lookup.record.active_revision_id!==baseline.active_revision_id)
       throw Error('gameplay_contract_invalid');
      const operational=gameplayOrderStatus(o,lookup.record);
      return {order_id:o.order_id,crm_order_uuid:uuid,
       crm_order_url:o.crm_order_url,customer_name:o.customer_name,
       package_name:o.package_name,status_id:o.status_id,
       status_key:o.status_key,expected_now:operational.publication_required_by_crm,
       operational:{...operational,...lookup.links},gameplay:lookup.record};
     }));
     entries.push(...chunk);
    }
    return {source:'crm_gameplay_join',year:2026,
     population:'all_2026_natal_crm_orders_including_cancelled',
     total_crm_orders:orders.length,total_disponiveis:published.length,
     pagination:{page:pagina,per_page:por_pagina,total_matching:published.length,
      has_more:start+por_pagina<published.length},orders:entries};
   });
  reg('crm_gameplay_auditoria','Pendências de galeria e jogos Natal 2026',
   'Cruza Natal 2026 e Gameplay por UUID. Com status_atual=todos (padrão) audita status 10 e 12; use waiting_product_retrieve ou order_completed para um deles. Conta sessões, publicações e fotos publicadas/em preparação. ENVIO: sem recibo CRM por pedido o estado é not_verified, NÃO not_sent. Para incluir publicados use incluir_publicados=true. Não prova runtime Phaser nem devolve URLs capability em lote.',
   z.object({pagina:z.number().int().min(1).max(100).default(1),
    limite:z.number().int().min(1).max(50).default(20),
    incluir_publicados:z.boolean().default(false),
    status_atual:z.enum(['todos','waiting_product_retrieve','order_completed']).default('todos')
   }),OUT_GAMEPLAY_AUDIT,async({pagina,limite,incluir_publicados,status_atual})=>{
     const orders=[],seen=new Set();
     const auditStatuses=gameplayAuditEligibleStatuses(status_atual);
     for(const status of auditStatuses){
       const found=await findOrders({...natalFilter,'order.status':status});
       for(const o of found){
        // The filter must not silently turn an ineligible order into a missing-link alert.
        if(o.status_key!==status)throw Error('gameplay_crm_invalid');
        const id=String(o.order_uuid||o.uuid).toLowerCase();
        // A UUID appearing in both status scans indicates concurrent CRM
        // status drift; never silently deduplicate and report a partial audit.
        registerDistinctGameplayOrderStatus(id,seen);
        orders.push(o);
       }
     }
     const map=new Map();
     for(let i=0;i<orders.length;i+=50){
       const result=await gameplay.lookup(orders.slice(i,i+50).map(o=>o.order_uuid||o.uuid));
       for(const row of result.results)map.set(row.crm_order_uuid,row);
     }
     const entries=orders.map(o=>{
      const uuid=String(o.order_uuid||o.uuid).toLowerCase();
      const snapshot=map.get(uuid);
      if(!snapshot)throw Error('gameplay_contract_invalid');
      return {order_id:o.order_id,crm_order_uuid:uuid,
       crm_order_url:o.crm_order_url,customer_name:o.customer_name,
       package_name:o.package_name,status_id:o.status_id,
       status_key:o.status_key,operational:gameplayOrderStatus(o,snapshot),gameplay:snapshot};
     });
     const counts={total:entries.length};
     for(const e of entries){const state=e.gameplay?.state||'not_verified';counts[state]=(counts[state]||0)+1}
     counts.pending_publication=['not_found','not_published','partial','revoked']
       .reduce((sum,state)=>sum+(counts[state]||0),0);
     counts.published_without_browser_proof=counts.published_unverified||0;
     counts.published_photo_count=entries.reduce((n,e)=>n+(e.operational.published_photo_count||0),0);
     counts.preparing_photo_count=entries.reduce((n,e)=>n+(e.operational.preparing_photo_count||0),0);
     counts.orders_in_preparation=entries.filter(e=>e.operational.digital_experience_status==='album_in_preparation').length;
     counts.orders_without_gameplay_session=counts.not_found||0;
     // Publication and customer delivery are independent state machines.
     // Until a canonical CRM provider receipt can be joined to this order,
     // *all* orders have an unknown delivery state, not a proven unsent state.
     counts.orders_with_delivery_unverified=entries.length;
     counts.published_orders_delivery_unverified=counts.published_unverified||0;
     const selected=incluir_publicados?entries:
       entries.filter(e=>e.gameplay?.state!=='published_unverified');
     const start=(pagina-1)*limite;
     return {source:'crm_gameplay_join',year:2026,statuses:auditStatuses,counts,
      pagination:{page:pagina,per_page:limite,total_matching:selected.length,
       has_more:start+limite<selected.length},
      orders:selected.slice(start,start+limite)};
   });
 }
 reg('crm_status','Estado do CRM','Use quando precisar verificar rapidamente o liveness público do servidor CRM (evydencia.com). NÃO use para diagnóstico de WhatsApp/Z-API.',z.object({}),OUT_GENERIC,()=>crm.status());
 reg('crm_campanha_publica','Pacotes públicos','Use quando precisar consultar o catálogo público de pacotes e preços de uma campanha (padrão "natal"). NÃO use para relatórios de vendas ou estatísticas internas.',z.object({campanha:z.string().max(80).default('natal')}),OUT_GENERIC,({campanha})=>crm.campaign(campanha));
 reg('crm_horarios_publicos','Horários públicos','Use quando precisar verificar disponibilidade pública de horários de um pacote em janela de até 14 dias (AAAA-MM-DD). ATENÇÃO DE SLUG: informe o slug público da campanha/pacote retornado por crm_campanha_publica (ex.: "entao-e-natal", "ho-ho-ho", "boas-festas"), NUNCA a referência interna de produto ("enatal"). NÃO cria reservas.',z.object({campanha:z.string().max(80).default('natal'),pacote:z.string().max(80),inicio:z.string().max(10),fim:z.string().max(10)}),OUT_GENERIC,async({campanha,pacote,inicio,fim})=>{
  try{return await crm.availability(campanha,pacote,inicio,fim)}
  catch(e){if(e?.message==='crm_http_404')throw Error('crm_public_package_or_campaign_not_found');throw e}
 });
 reg('crm_conexao_privada','Identidade do operador','Use quando precisar validar a identidade do operador autenticado no CRM, fuso do servidor e abilities do token Sanctum.',z.object({}),OUT_GENERIC,()=>crm.bootstrap());
 reg('crm_cliente_resumo','Cliente por telefone, nome, CPF, e-mail ou UUID (Resumo Rápido)','Use quando precisar localizar rapidamente um cliente ou lead (inclusive com 0 pedidos) por telefone, nome_cliente, customer_uuid, email ou documento: retorna titular, avatar validado/iniciais (render_contract), completude cadastral, resumo financeiro em centavos e reais, pedido atual, link canônico (/gestao/clientes/$UUID/consultar) e elegibilidade Natal 2026. Em homônimos, retorna lookup.status="ambiguous" com candidates para confirmação sem escolher arbitrariamente. NÃO use quando precisar de todos os pedidos históricos paginados (use crm_cliente_360).',z.object({
  telefone:z.string().min(8).max(30).optional(),
  nome_cliente:z.string().min(2).max(100).optional(),
  customer_uuid:z.string().min(36).max(36).optional(),
  email:z.string().min(4).max(120).optional(),
  documento:z.string().min(11).max(20).optional()
 }),OUT_CUSTOMER,async input=>{
  if(cfg.operatorFullCrm&&direct){
   try{
    const f360=await direct.customerForensic360({...input,pagina:1,por_pagina:3,includeCrossOrderAudit:false});
    if(f360?.lookup?.status!=='matched')return f360;
    const ext=await tryExtensionEligibility(f360.customer?.whatsapp||f360.customer?.phone||input?.telefone);
    const natal2026=ext?.natal_2026||f360.natal_2026||null;
    return {
     source:f360.source,
     lookup:f360.lookup,
     customer:f360.customer,
     kpis:f360.kpis,
     financial_audit_summary:f360.financial_audit_summary,
     participants_cross_order_audit:f360.participants_cross_order_audit,
     current_order:f360.current_order,
     ...(natal2026?{natal_2026:natal2026}:{}),
     ...(ext?.capabilities?{capabilities:ext.capabilities}:{}),
     ...(f360.bridge_telemetry?{bridge_telemetry:f360.bridge_telemetry}:{})
    };
   }catch(e){
    if(e?.message!=='legacy_read_http_404')throw e;
   }
  }
  const resolved=await resolvePhone(input,{allowLookupMiss:true});
  if(resolved.status!=='matched'){
   return {lookup:{status:resolved.status,match_count:resolved.match_count??0,...(resolved.candidates?{candidates:resolved.candidates}:{})},customer:null,orders:[]};
  }
  const res=await crm.customer(resolved.phone);
  if(!cfg.operatorFullCrm||!res?.current_order)return res;
  return {...res,current_order:await enrichOrderWithDirect(res.current_order)};
 });
 reg('crm_cliente_360','Cliente 360 Forense (histórico completo, pagamentos, avatar e auditoria)','Use quando precisar da reconstrução 360 completa do cliente (inclusive leads com 0 pedidos): perfil do titular, avatar verificado via HTTP/WebP com contrato explícito (render_contract: HTTP 200 != foto renderizada), completude cadastral (registration_completeness), KPIs canônicos lifetime em centavos, resumo financeiro por meio efetivo, auditoria cruzada de divergências de participantes entre pedidos (participants_cross_order_audit) e histórico paginado de pedidos com parcelas, status_history, agenda e bônus. Em homônimos, retorna lookup.status="ambiguous" sem escolher arbitrariamente. NÃO abre widget visual pesado por padrão (para card visual use crm_renderizar_card_visual).',z.object({
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
    const natal2026=ext?.natal_2026||f360.natal_2026||null;
    return {
     ...f360,
     ...(natal2026?{natal_2026:natal2026}:{}),
     ...(ext?.capabilities?{capabilities:ext.capabilities}:{})
    };
   }catch(e){
    if(e?.message!=='legacy_read_http_404')throw e;
   }
  }
  const resolved=await resolvePhone(input,{allowLookupMiss:true});
  if(resolved.status!=='matched'){
   return {lookup:{status:resolved.status,match_count:resolved.match_count??0,...(resolved.candidates?{candidates:resolved.candidates}:{})},customer:null,orders:[]};
  }
  const res=await crm.history(resolved.phone,input.pagina);
  if(!cfg.operatorFullCrm)return res;
  const current_order=res?.current_order?await enrichOrderWithDirect(res.current_order):null;
  const orders=Array.isArray(res?.orders)?await Promise.all(res.orders.map(enrichOrderWithDirect)):[];
  return {...res,current_order,orders};
 });
 if(cfg.operatorFullCrm){
  reg('crm_previa_proposta_natal','Prévia da Proposta de Natal 2026','Use quando precisar simular e validar elegibilidade comercial (Regra de Ouro) da proposta oficial de Natal 2026 para um telefone (DDD+número) sem enviar mensagem.',z.object({
   telefone:z.string().min(8).max(30),
   nome:z.string().max(80).optional()
  }),OUT_PROPOSAL_PREVIEW,async({telefone,nome})=>{
   if(!ex.canReadProposal)throw Error('insufficient_operator_scope');
   const normPhone=phone(telefone);
   const normName=proposalName(nome)??null;
   const {ok,status,json}=await callExtensionPost('/api/v1/extension/proposals/preview',{phone:normPhone,name:normName});
   if(!ok){
    const err=json?.error||{};
    return {ready:false,scheduled:false,http_status:status,error_code:err.code||'PROPOSAL_NOT_ELIGIBLE',message:err.message||'Não foi possível gerar a prévia da proposta.',retryable:Boolean(err.retryable)};
   }
   return {...proposalProjection(json),variant:json?.data?.variant??json?.data?.selection?.variant??null,campaign_id:json?.data?.campaign_id??json?.data?.campaign?.id??null,message_preview:json?.data?.message_preview??json?.data?.message??null,phone_formatted:json?.data?.phone_formatted??null};
  });
  reg('crm_enviar_proposta_natal','Disparar / Agendar Proposta de Natal 2026','Use quando o operador autorizar explicitamente o disparo oficial da proposta comercial de Natal 2026 pelo CRM. EXIGE confirmado_pelo_operador=true explícito (sem confirmação falha fechada antes de chamar o CRM), escopo crm.proposal.write + ability extension:proposal-write, aplica a Regra de Ouro e garante idempotência. NÃO use sem prévia e confirmação explícita.',z.object({
   telefone:z.string().min(8).max(30),
   nome:z.string().max(80).optional(),
   confirmado_pelo_operador:z.boolean(),
   modo_reenvio:z.enum(['normal','send_again','abort_and_resend']).default('normal'),
   request_id:z.string().uuid().optional()
  }),OUT_PROPOSAL_DISPATCH,async({telefone,nome,confirmado_pelo_operador,modo_reenvio='normal',request_id})=>{
   if(!grantedScopes.has(SCOPE_PROPOSAL_WRITE)||!ex.canWriteProposal)throw Error('insufficient_operator_write_scope');
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
  },WRITE_IDEMPOTENT,{requiredScopes:[GATEWAY_SCOPE,SCOPE_PROPOSAL_WRITE]});
 }
 if(direct){
  reg('crm_estatisticas_natal','Central de Inteligência — Estatísticas e Operação de Natal','Use quando precisar dos dados canônicos oficiais de /gestao/natal/estatisticas (2021–2026). ROTA RÁPIDA RECOMENDADA: para perguntas diretas de vendas, pedidos válidos, contratado, recebido, saldo ou metas atuais de Natal 2026, passe SEMPRE perfil_resposta="kpi_minimal" (<5 KB, retorno imediato com integrity_checks e metas R$ 300k base vs R$ 400k ampliada). Para visão executiva multi-ano use perfil_resposta="default" e nivel_detalhe="resumo". Use secoes sob demanda: simulador_previsao, financeiro_caixa (reconciliação explícita oi.total vs oi.payment_total da diferença de R$ 1.230,00, Permuta non_cash_barter vs Stone Débito debit_card), clientes_recompra_campanhas (recompra 2025->2026, cidades, canais, cupons e dia/hora de orders.created_at — NÃO representa ROAS nem horário pago), agenda_demanda, pacotes_produtos_bonus ou operacional_listas. NÃO use para demografia/idades de crianças/bebês (use crm_natal_participantes_estatisticas).',z.object({
   data_corte_mm_dd:z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).optional(),
   secoes:z.array(z.enum(['resumo','historico','simulador_previsao','financeiro_caixa','clientes_recompra_campanhas','agenda_demanda','pacotes_produtos_bonus','operacional_listas'])).max(8).optional(),
   nivel_detalhe:z.enum(['resumo','padrao','completo']).default('resumo'),
   perfil_resposta:z.enum(['default','kpi_minimal']).default('default'),
   ano:z.number().int().min(2021).max(2026).optional(),
   pagina:z.number().int().min(1).max(50).default(1),
   limite:z.number().int().min(1).max(50).default(15)
  }),OUT_NATAL_STATS,({data_corte_mm_dd,secoes,nivel_detalhe,perfil_resposta,ano,pagina,limite})=>direct.natalStatistics({
   cutoffMmDd:data_corte_mm_dd,
   secoes,
   nivelDetalhe:nivel_detalhe,
   perfilResposta:perfil_resposta,
   ano,
   pagina,
   limite
  }));
  reg('crm_natal_participantes_estatisticas','Inteligência Demográfica e Familiar — Participantes de Natal','Use quando a pergunta envolver perfil demográfico, crianças, bebês, idades, parentesco, tamanho de famílias, pets ou qualidade cadastral dos participantes de Natal: reconciliação exata da população (crianças 0–17, adultos 18+, pets e humanos sem data de nascimento), subfaixas de bebês (0-6m, 6-12m, 1-3a, <3 anos, <=3 anos), composição familiar (0, 1, 2, 3+ filhos), pacote x idade infantil, comparativo 2024–2026 e anomalias cadastrais. ATENÇÃO DE ESCOPO: quando ano="todos", population_reconciliation detalha a safra primária 2026 (primary_population_year=2026) e historical_2024_2026 compara 2024–2026. Mantenha incluir_lista_participantes=false salvo pedido explícito de listagem nominal.',z.object({
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
  reg('crm_pedidos_buscar','Buscar pedidos ou listar pedidos paginados no CRM','Use quando precisar listar ou filtrar pedidos no CRM (evydencia.com) ordenados do MAIS RECENTE para o mais antigo (paridade com /gestao/pedidos), por cliente, status, pacote, meio de pagamento, saldo em aberto ou período. NÃO use para KPIs agregados de Natal (use crm_estatisticas_natal).',z.object({
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
  reg('crm_pedido_detalhe','Auditoria e detalhe completo de pedido no CRM (por UUID ou ID)','Use quando precisar auditar um pedido específico no CRM por uuid OU order_id numérico (ex.: order_id: 4510): retorna links canônicos, titular e avatar verificado (render_contract), payment_summary, parcelas individuais (installments[] distinguindo Permuta de Dinheiro e Stone Débito), recibos bills[], status_history[], schedule_details, personalization, bonus_classification e participants_registration.',z.object({
   uuid:z.string().min(36).max(36).optional(),
   order_id:z.number().int().min(1).optional(),
   nivel_detalhe:z.enum(['resumo','padrao','forense']).default('forense')
  }),OUT_ORDER_DETAIL,({uuid,order_id,nivel_detalhe})=>direct.detail({uuid,order_id,detailLevel:nivel_detalhe}));
  if(printCfg.enabled&&cfg.operatorFullCrm&&ex.canPrint){
   const printer=printserverClient(printCfg,{fetchFn});
   reg('crm_previa_malotes_retirada','Prévia de malotes por IDs (somente leitura)',
    'Conferir um lote de IDs numéricos extraídos de fotos; não altera status, não envia WhatsApp e não imprime. Só indica possibilidade de impressão após status 10, sem substituir validações financeiras do CRM.',
    z.object({order_ids:z.array(z.number().int().min(1)).min(1).max(20)}),OUT_GENERIC,
    async({order_ids})=>{
     const unique=[...new Set(order_ids)];
     // Photos frequently arrive in batches of 5–20; prevent 20 concurrent PHP
     // Laravel bootstraps / database probes while retaining the user's order.
     const rows=new Array(unique.length);
     let cursor=0;
     await Promise.all(Array.from({length:Math.min(4,unique.length)},async()=>{
      while(cursor<unique.length){
       const index=cursor++,order_id=unique[index];
       try{
        const r=await direct.detail({order_id,detailLevel:'resumo'});
        const o=r?.order;
        rows[index]=(!o||o.order_id!==order_id)
         ? {order_id,state:'not_found',print_eligible:false}
         : {
          order_id,state:'found',order_uuid:o.order_uuid??null,customer_name:o.customer_name??null,
          status_key:o.status_key??null,status_label:o.status_label??null,
          status_event_id:o.status_event_id??null,
          remaining_cents:o.remaining_cents??null,
          print_eligible:o.status_key==='waiting_product_retrieve'&&o.remaining_cents===0,
          crm_order_url:o.crm_order_url??null
         };
       }catch{rows[index]={order_id,state:'not_found_or_unavailable',print_eligible:false}}
      }
     }));
     return {source:'CRM_READ_ONLY',orders:rows,changes_applied:false,automatic_pickup_status_write_available:false};
    });
   reg('crm_solicitar_impressao_etiqueta','Imprimir etiqueta de pedido já disponível',
    'Ação física: enfileira UMA impressão térmica 100x40 mm, potencialmente irreversível. Exige confirmação expressa do operador, status 10, saldo zero e escopo print.jobs.write; deduplicada pelo pedido. NÃO altera status CRM nem envia WhatsApp. Um resultado spooled não comprova impressão física; não repetir se o estado for incerto.',
    z.object({order_id:z.number().int().min(1),confirmado_pelo_operador:z.boolean(),request_id:z.string().uuid().optional()}),
    OUT_GENERIC,async({order_id,confirmado_pelo_operador,request_id})=>{
     if(!grantedScopes.has(SCOPE_PRINT_WRITE)||!ex.canPrint)throw Error('insufficient_operator_write_scope');
     if(confirmado_pelo_operador!==true)throw Error('operator_confirmation_required');
     const r=await direct.detail({order_id,detailLevel:'resumo',fresh:true});
     const o=r?.order;
     if(!o||o.order_id!==order_id)throw Error('printserver_order_not_found');
     if(o.status_key!=='waiting_product_retrieve')throw Error('printserver_status_not_ready');
     if(o.remaining_cents!==0)throw Error('printserver_financial_not_verified');
     if(typeof o.customer_name!=='string'||o.customer_name.trim().length<2)throw Error('printserver_invalid_customer');
     // Render the exact configured CRM image (background, product/global overrides,
     // QR and dynamic fields) after the authorization/status/finance guard.
     // Fail closed if enabled and Laravel cannot render; NEVER silently print plain text.
     const artwork=labelRenderEnabled
      ? await labelRenderer({orderUuid:o.order_uuid,orderId:order_id,env:labelRenderEnv})
      : {};
     const result=await printer.enqueue({
      request_id:request_id||randomUUID(),operator_id:ex.operatorId,
      order_id,status_key:'waiting_product_retrieve',
      confirmed_by_operator:true,purpose:'arrival',
      customer_name:o.customer_name,
      package_name:o.package_name||'Pedido de fotos',
      ...artwork
     });
     return {source:'PRINTSERVER',printed_physically:false,crm_status_updated:false,
      whatsapp_sent:false,job_id:result?.job?.job_id??null,
      print_state:result?.job?.state??'unknown',render_source:result?.job?.render_source??null,replay:Boolean(result?.replay),
      order_id,crm_order_url:o.crm_order_url??null};
    },PRINT_WRITE,{requiredScopes:[GATEWAY_SCOPE,SCOPE_PRINT_WRITE]});
   reg('crm_consultar_impressao_etiqueta','Consultar estado do trabalho de impressão',
    'Consulta fila remota. spooled significa entregue ao executável/spooler do Windows, não etiqueta fisicamente impressa.',
    z.object({order_id:z.number().int().min(1),job_id:z.string().uuid()}),OUT_GENERIC,
    async({order_id,job_id})=>{
     if(!grantedScopes.has(SCOPE_PRINT_WRITE)||!ex.canPrint)throw Error('insufficient_operator_write_scope');
     // Synthetic homologation job exists only in the broker, never in CRM.
     // Do not bypass CRM validation for any real customer order.
     const syntheticTest=(order_id===999999);
     if(!syntheticTest){
      const r=await direct.detail({order_id,detailLevel:'resumo'});
      if(r?.order?.order_id!==order_id)throw Error('printserver_order_not_found');
     }
     const result=await printer.status(job_id);
     if(result?.job?.order_id!==order_id)throw Error('printserver_order_mismatch');
     return {source:'PRINTSERVER',order_id,job_id,print_state:result.job.state,
      synthetic_test:syntheticTest,printed_physically:false};
    },READ,{requiredScopes:[GATEWAY_SCOPE,SCOPE_PRINT_WRITE]});
  }
  if(cfg.malotesReadyEnabled&&cfg.operatorFullCrm&&ex.canReady){
   reg(MALOTES_READY_TOOL_NAME,'Marcar pedido disponível para retirada (status 10)',
    'AÇÃO COMERCIAL: marca SOMENTE o pedido informado como status 10 no CRM, após confirmação humana expressa. Não imprime. Eventos e aviso WhatsApp pertencem ao observer CRM, entrega de mensagens NÃO é comprovada por esta resposta. Exige snapshot status_event_id da prévia; conflito deve ser reconsultado antes de nova tentativa.',
    z.object({order_id:z.number().int().min(1),expected_status_event_id:z.number().int().min(1),
      confirmado_pelo_operador:z.literal(true),request_id:z.string().uuid().optional()}),
    OUT_GENERIC,async({order_id,expected_status_event_id,confirmado_pelo_operador,request_id})=>{
     if(!grantedScopes.has(SCOPE_ORDERS_READY_WRITE)||!ex.canReady)throw Error('insufficient_operator_write_scope');
     if(confirmado_pelo_operador!==true)throw Error('operator_confirmation_required');
     const detail=await direct.detail({order_id,detailLevel:'resumo',fresh:true});
     if(detail?.order?.order_id!==order_id)throw Error('crm_malotes_order_not_found');
     if(detail.order.status_event_id!==expected_status_event_id)throw Error('crm_malotes_conflict_refresh_required');
     if(detail.order.status_key==='waiting_product_retrieve')
      return {source:'CRM_EXTENSION_CANONICAL',order_id,state:'already_ready',replay:true,changes_applied:false,printed_physically:false,notification_delivery_verified:false};
     if(![ 'session_schedule','session_schedule_confirmed','selection_schedule_confirmed'].includes(detail.order.status_key))
      throw Error('crm_malotes_status_not_eligible');
     if(detail.order.remaining_cents!==0)throw Error('crm_malotes_financial_not_verified');
     const change=readyForPickupClient({baseUrl:cfg.crmBaseUrl,operatorToken:ex.upstream,fetchFn,timeoutMs:cfg.crmTimeoutMs});
     return await change({order_id,expected_status_event_id,operator_id:ex.operatorId,
      request_id:request_id||randomUUID(),confirmed_by_operator:true});
    },PRINT_WRITE,{requiredScopes:[GATEWAY_SCOPE,SCOPE_ORDERS_READY_WRITE]});
  }
  if(cfg.malotesBatchEnabled&&cfg.malotesReadyEnabled&&cfg.operatorFullCrm&&
      printCfg.enabled&&labelRenderEnabled&&ex.canReady&&ex.canPrint){
   reg(MALOTES_BATCH_TOOL_NAME,'Processar malotes por fotos: só baixa, só etiqueta ou ambos',
    'AÇÃO EM LOTE (até 20 pedidos): primeiro confira cada pedido com crm_previa_malotes_retirada. Exige confirmação humana de TODOS os IDs e snapshot status_event_id. Para cada pedido, status10 via CRM antes da etiqueta canônica com QR. Falhas são por pedido, SEM retries automáticos. queued/spooled NÃO provam impressão física nem WhatsApp entregue.',
    z.object({modo:z.enum(['so_baixa','so_imprime','baixa_e_imprime']),
      pedidos:z.array(z.object({order_id:z.number().int().min(1),
       expected_status_event_id:z.number().int().min(1)})).min(1).max(20),
      confirmado_pelo_operador:z.literal(true)}),
    OUT_GENERIC,async({modo,pedidos,confirmado_pelo_operador})=>{
     if(confirmado_pelo_operador!==true)throw Error('operator_confirmation_required');
     if(!grantedScopes.has(SCOPE_ORDERS_READY_WRITE)||!grantedScopes.has(SCOPE_PRINT_WRITE))
      throw Error('insufficient_operator_write_scope');
     const change=readyForPickupClient({baseUrl:cfg.crmBaseUrl,operatorToken:ex.upstream,fetchFn,timeoutMs:cfg.crmTimeoutMs});
     const printer=printserverClient(printCfg,{fetchFn});
     return await processMalotes({modo,pedidos,
      load:async(order_id)=>(await direct.detail({order_id,detailLevel:'resumo',fresh:true}))?.order,
      markReady:({order_id,expected_status_event_id})=>change({
       order_id,expected_status_event_id,operator_id:ex.operatorId,
       request_id:randomUUID(),confirmed_by_operator:true}),
      printLabel:async({order_id,order:o})=>{
       const artwork=await labelRenderer({orderUuid:o.order_uuid,orderId:order_id,env:labelRenderEnv});
       const result=await printer.enqueue({
        request_id:randomUUID(),operator_id:ex.operatorId,
        order_id,status_key:'waiting_product_retrieve',
        confirmed_by_operator:true,purpose:'arrival',
        customer_name:o.customer_name,package_name:o.package_name||'Pedido de fotos',
        ...artwork
       });
       return {state:result?.job?.state||'unknown',job_id:result?.job?.job_id??null};
      }
     });
    },PRINT_WRITE,{requiredScopes:[GATEWAY_SCOPE,SCOPE_ORDERS_READY_WRITE,SCOPE_PRINT_WRITE]});
  }
  if(cfg.operatorFullCrm){
   reg('crm_clientes_buscar','Buscar clientes e leads (inclusive com zero pedidos) no CRM','Use quando precisar buscar clientes ou leads (inclusive com 0 pedidos em somente_sem_pedidos=true ou cadastro incompleto em somente_cadastro_incompleto=true) diretamente em /gestao/clientes por busca livre, nome, telefone, e-mail, documento ou UUID.',z.object({
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
   if(cfg.uiAppsEnabled){
    registerCrmVisualCardUi(m);
    reg(
     'crm_renderizar_card_visual',
     'Renderizar Card Visual no ChatGPT Web (Pedido ou Cliente 360)',
     'Use quando o operador pedir explicitamente um card visual, ficha visual ou visualização interativa de um Pedido (tipo="pedido" com order_id ou order_uuid) ou Cliente 360 (tipo="cliente_360" com customer_uuid, telefone, nome_cliente, documento ou email) no ChatGPT Web. NÃO use para consultas analíticas, financeiras agregadas ou listagens rápidas (mantenha as demais ferramentas em JSON puro). Renderiza avatar com 4 estados honestos (url_validated_pending_widget_load, image_loaded no onload, image_blocked_or_error no onerror, initials_fallback), sem PII desnecessária de menores e com fallback textual completo.',
     z.object({
      tipo:z.enum(['pedido','cliente_360']),
      order_id:z.number().int().min(1).optional(),
      order_uuid:z.string().min(36).max(36).optional(),
      customer_uuid:z.string().min(36).max(36).optional(),
      telefone:z.string().min(8).max(30).optional(),
      nome_cliente:z.string().min(2).max(100).optional(),
      documento:z.string().min(11).max(20).optional(),
      email:z.string().min(4).max(120).optional()
     }),
     OUT_VISUAL_CARD,
     async input=>{
      if(input.tipo==='pedido'){
       if(!input.order_uuid&&!input.order_id)throw Error('invalid_uuid');
       const det=await direct.detail({uuid:input.order_uuid,order_id:input.order_id,detailLevel:'padrao',includeCalendarSync:true});
       const card=buildVisualCardPayload({tipo:'pedido',detailResult:det});
       return {...card,...(det?.bridge_telemetry?{bridge_telemetry:det.bridge_telemetry}:{})};
      }
      if(!input.customer_uuid&&!input.telefone&&!input.nome_cliente&&!input.documento&&!input.email){
       throw Error('invalid_customer_locator');
      }
      const f360=await direct.customerForensic360({...input,pagina:1,por_pagina:5,includeCrossOrderAudit:false});
      if(f360?.lookup?.status==='ambiguous')throw Error('crm_customer_ambiguous');
      if(f360?.lookup?.status!=='matched')throw Error('crm_customer_not_matched');
      let enrichedF360=f360;
      if(!f360.natal_2026||typeof f360.natal_2026.purchased!=='boolean'){
       const ext=await tryExtensionEligibility(f360.customer?.whatsapp||f360.customer?.phone||input?.telefone);
       if(ext?.natal_2026)enrichedF360={...f360,natal_2026:ext.natal_2026};
      }
      const card=buildVisualCardPayload({tipo:'cliente_360',customerResult:enrichedF360});
      return {...card,...(f360?.bridge_telemetry?{bridge_telemetry:f360.bridge_telemetry}:{})};
     },
     READ,
     {_meta:{ui:{resourceUri:MCP_UI_CARD_RESOURCE_URI}}}
    );
   }
  }
  reg('crm_relatorio_itens_vendidos','Relatório de itens vendidos (unidades brutas)','Use somente quando precisar de unidades brutas de itens emitidos (orders_items) por período (AAAA-MM-DD). NÃO use para contagem oficial de pedidos ou ensaios de Natal (use crm_estatisticas_natal).',z.object({
   inicio:z.string().max(10),
   fim:z.string().max(10),
   slug:z.string().max(60).optional(),
   busca:z.string().max(80).optional()
  }),OUT_GENERIC,({inicio,fim,slug:s,busca})=>direct.soldItems({start:inicio,end:fim,slug:s,busca}));
  reg('crm_relatorio_natal_sem_participantes','Pedidos de Natal sem participantes','Use quando precisar listar rapidamente pedidos de Natal do ano corrente com zero participantes cadastrados e link direto (crm_order_url).',z.object({limite:z.number().int().min(1).max(50).default(20)}),OUT_GENERIC,({limite})=>direct.christmasWithoutParticipants({limit:limite}));
  reg('crm_relatorio_clientes_natal','Clientes com ou sem compra de Natal','Use quando precisar consultar clientes com ou sem compra de Natal no ano corrente, com filtro opcional por nome.',z.object({
   comprou_natal:z.boolean().default(true),
   busca_nome:z.string().min(2).max(80).optional(),
   limite:z.number().int().min(1).max(50).default(20)
  }),OUT_GENERIC,({comprou_natal,busca_nome,limite})=>direct.christmasCustomers({bought:comprou_natal,search:busca_nome||'',limit:limite}));
 }
 if(zapiDiag){
  reg(
   ZAPI_DIAG_TOOL_NAME,
   'Diagnóstico em Tempo Real da Instância WhatsApp Z-API',
   'Use quando precisar verificar em tempo real a instância WhatsApp autorizada na Z-API (somente leitura GET em https://api.z-api.io): conexão (/status), número conectado, nome/foto de perfil e aparelho (/device), vencimento da assinatura, pagamento, webhooks sanitizados e configurações (/me). Para "A Z-API está conectada/online?", use escopo="status_rapido" (1 GET). Para número/perfil/aparelho, use escopo="perfil_dispositivo". Para assinatura/webhooks/configurações, use escopo="assinatura_configuracoes" com nivel_detalhe="completo". NÃO aceita URL ou token arbitrário e NÃO envia mensagens.',
   z.object({
    instancia:z.string().max(120).optional(),
    nivel_detalhe:z.enum(['resumo','completo']).default('resumo'),
    escopo:z.enum(['completo','status_rapido','perfil_dispositivo','assinatura_configuracoes']).default('completo'),
    atualizar:z.boolean().default(false)
   }),
   OUT_ZAPI_DIAGNOSTICO,
   ({instancia,nivel_detalhe,escopo,atualizar},ctx)=>zapiDiag.diagnose(ex.operatorId,{
    instancia,
    nivel_detalhe,
    escopo,
    atualizar:Boolean(atualizar),
    signal:ctx?.mcpReq?.signal
   })
  );
  reg(
   ZAPI_HIST_TOOL_NAME,
   'Histórico de Conexão e Desconexão da Instância Z-API',
   'Use quando precisar consultar última conexão, última desconexão, motivo da queda (disconnect_reason) e linha do tempo cronológica da instância Z-API a partir dos webhooks reais do CRM (occurred_at_brt vs webhook_received_at_brt) e observações deduplicadas de sondagem (poll_detected_at_brt). NÃO envia mensagens.',
   z.object({
    instancia:z.string().max(120).optional(),
    limite:z.number().int().min(1).max(50).default(20)
   }),
   OUT_ZAPI_HISTORICO,
   ({instancia,limite})=>zapiDiag.history(ex.operatorId,{
    instancia,
    limite,
    readWebhookHistory:(direct&&cfg.operatorFullCrm)?opts=>direct.zapiConnectionHistory(opts):null
   })
  );
 }
 if(zapi){
  reg(
   ZAPI_STATUS_TOOL_NAME,
   'Estado da Autorização OAuth e Instância Z-API MCP',
   'Use quando precisar verificar o estado da autorização OAuth do operador no MCP oficial da Z-API, listar as 9 ferramentas oficiais descobertas ou gerar o link seguro (authorization_url) de vínculo/reautorização. NÃO use para diagnóstico técnico detalhado de aparelho/assinatura/webhooks (use zapi_instancia_diagnostico).',
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
   const zScopes=Array.isArray(zt.requiredScopes)&&zt.requiredScopes.length?zt.requiredScopes:getZapiRequiredScopes(zt.gatewayName);
   m.registerTool(
    zt.gatewayName,
    {
     title:zt.title,
     description:zt.description,
     inputSchema:fromJsonSchema(zt.inputSchema),
     ...(zt.outputSchema?{outputSchema:fromJsonSchema(zt.outputSchema)}:{}),
     annotations:zt.annotations,
     _meta:{securitySchemes:[{type:'oauth2',scopes:[...zScopes]}]}
    },
    async(args,ctx)=>{
     const t0=performance.now();
     if(zScopes.some(s=>!grantedScopes.has(s))){
      const gwMs=+(performance.now()-t0).toFixed(2);
      perf?.record({tool:zt.gatewayName,ok:false,gatewayMs:gwMs,responseBytes:0});
      log({evt:'tool',tool:zt.gatewayName,ok:false,err:'insufficient_operator_write_scope',err_cat:'UNAUTHORIZED',op:ex.operatorTag,ms:Math.round(gwMs),gateway_ms:gwMs});
      return {isError:true,content:[{type:'text',text:JSON.stringify({error:'insufficient_operator_write_scope',error_category:'UNAUTHORIZED'})}]};
     }
     const res=await zapi.callTool(ex.operatorId,zt,args,{signal:ctx?.mcpReq?.signal});
     const gwMs=+(performance.now()-t0).toFixed(2);
     perf?.record({tool:zt.gatewayName,ok:!res?.isError,gatewayMs:gwMs,responseBytes:Buffer.byteLength(JSON.stringify(res??null),'utf8')});
     return res;
    }
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

export function createGateway(env,{fetchFn=fetch,log=defaultLog,now=()=>Date.now(),labelRenderer=renderCanonicalCrmLabel}={}){
 const cfg=gatewayConfig(env);
 const printCfg=printserverConfig(env);
 const perf=createGatewayPerfTracker();
 const operators=operatorVerifier(cfg,{fetchFn,now});
 const oauth=createOAuthServer(cfg,{operators,now,log});
 let mcp,zapi=null;
 const zapiDiag=cfg.zapiDiagEnabled?createZapiInstanceDiagnostics(cfg,{
  fetchFn,
  now,
  log,
  getMcpOauthState:op=>{
   if(!zapi)return null;
   const st=zapi.auth.getOperatorState(op);
   return {oauth_status:st.oauth_status,discovered_tools_count:Array.isArray(st.record?.discovered_tools)?st.record.discovered_tools.length:0};
  }
 }):null;
 zapi=cfg.zapiEnabled?createZapiBridge(cfg,{
  operators,
  fetchFn,
  now,
  log,
  diagnostics:zapiDiag,
  reservedToolNames:[...LIVE_TOOL_NAMES,...DIRECT_CRM_TOOL_NAMES,...FORENSIC_CRM_TOOL_NAMES,...PROPOSAL_CRM_TOOL_NAMES,...UI_CRM_TOOL_NAMES,...PRINTSERVER_TOOL_NAMES,...ZAPI_INSTANCE_TOOL_NAMES],
  gatewayVersion:GATEWAY_VERSION,
  onToolsUpdated:()=>mcp?.notify?.toolsChanged?.()
 }):null;
 const resourceUrl=new URL(cfg.resource);
 const resourceMetadataUrl=getOAuthProtectedResourceMetadataUrl(resourceUrl);
 const gate=requireBearerAuth({verifier:oauth.verifier,requiredScopes:[GATEWAY_SCOPE],resourceMetadataUrl,expectedResource:resourceUrl});
 mcp=createMcpHandler(ctx=>liveServer(ctx.authInfo,{cfg,fetchFn,operators,log,zapi,zapiDiag,perf,printCfg,labelRenderer,labelRenderEnabled:env.EVYD_CRM_LABEL_RENDER_ENABLED==='1',labelRenderEnv:env}),{responseMode:'auto',maxRequestBodySize:65536,onerror:()=>log({evt:'mcp_error'})});
 const allowed=rateLimiter(now);
 const allowedHosts=[cfg.hostname,...(cfg.insecureLocal?['localhost','127.0.0.1']:[])];
 const metaOpts={oauthMetadata:oauth.metadata,resourceServerUrl:resourceUrl,scopesSupported:supportedGatewayScopes(cfg),resourceName:'Evydência CRM (operador autenticado)',dangerouslyAllowInsecureIssuerUrl:cfg.insecureLocal};
 const plain=(status,body,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...extra}});
 const withPrivateNoStore=res=>{
  try{res.headers.set('Cache-Control','private, no-store');return res}
  catch{const h=new Headers(res.headers);h.set('Cache-Control','private, no-store');return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h})}
 };

 async function route(request,{ip='unknown',host}={}){
  const path=new URL(request.url).pathname;
  if(path==='/healthz'){
   const snap=perf.snapshot();
   return plain(200,{
    ok:true,
    service:'evydencia-crm-mcp-live',
    version:GATEWAY_VERSION,
    build_commit:BUILD_INFO.commit,
    repository_branch:BUILD_INFO.branch,
    zapi_mcp_enabled:Boolean(zapi),
    zapi_diagnostics_enabled:Boolean(zapiDiag),
    mcp_ui_apps_enabled:Boolean(cfg.internalReadToken&&cfg.operatorFullCrm&&cfg.uiAppsEnabled),
    printserver_enabled:Boolean(printCfg.enabled),
    telemetry_summary:{
     calls_total:snap.calls_total,
     error_rate:snap.error_rate,
     cache_hit_rate:snap.cache_hit_rate,
     gateway_p50_ms:snap.gateway_ms.p50,
     gateway_p95_ms:snap.gateway_ms.p95
    }
   });
  }
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
 return {cfg,zapi,perf,handle,close:async()=>{await Promise.allSettled([mcp.close(),zapi?.close()])}};
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
