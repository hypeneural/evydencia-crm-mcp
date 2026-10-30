// Read-only localhost diagnostics for OpenAI Secure MCP Tunnel.
// No remote API, tunnel ID, runtime key, GitHub token or user data required.
export const MOCK_TOOL_NAMES=Object.freeze([
  'crm_agenda_hoje','crm_buscar_cliente_nome','crm_campanha_publica','crm_capacidades',
  'crm_cliente_360','crm_cliente_resumo','crm_conexao_privada','crm_filtros_pedidos_mock',
  'crm_horarios_publicos','crm_mock_scenarios','crm_natal_indicadores_mock','crm_natal_resumo',
  'crm_pedido_detalhe_mock','crm_pedidos_filtrar_mock','crm_previa_proposta_natal',
  'crm_simular_agendamento_proposta_natal','crm_status'
]);
export function evaluateTunnel(health,mcp){
 const errors=[];
 if(health?.live!==true)errors.push('not_live');
 if(health?.ready!==true)errors.push('not_ready');
 const control=health?.components?.['control-plane'];
 if(control&&control.status!=='ok')errors.push('control_plane_not_ok');
 if(mcp?.status!=='ok'||mcp?.state!=='discovered')errors.push('discovery_not_ready');
 const tools=mcp?.details?.tools_list;
 if(!tools||tools.complete!==true||tools.partial===true)errors.push('tools_list_incomplete');
 const names=tools?.tool_names;
 if(!Array.isArray(names))errors.push('tool_names_unavailable');
 else{
  const actual=new Set(names), expected=new Set(MOCK_TOOL_NAMES);
  if(actual.size!==names.length)errors.push('duplicate_tools');
  for(const name of expected)if(!actual.has(name))errors.push('missing_tool:'+name);
  for(const name of actual)if(!expected.has(name))errors.push('unexpected_tool:'+name);
  if(actual.has('crm_agendar_proposta_natal'))errors.push('write_tool_exposed');
 }
 return {ok:errors.length===0,errors,count:Array.isArray(names)?names.length:0,expected:MOCK_TOOL_NAMES.length};
}
