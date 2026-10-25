// O manifest é declarativo; não concede permissões nem cria endpoints.
const defs=[
 {tool:'crm_status',capability:'saude_crm',live:'LIVE_PUBLIC',source:'/health/live'},
 {tool:'crm_campanha_publica',capability:'pacotes_natal',live:'LIVE_PUBLIC',source:'/api/public/v1/agenda/campaigns/{slug}'},
 {tool:'crm_horarios_publicos',capability:'disponibilidade_publica',live:'LIVE_PUBLIC',source:'/api/public/v1/agenda/campaigns/{slug}/availability'},
 {tool:'crm_conexao_privada',capability:'operador',live:'LIVE_EXTENSION',source:'/api/v1/extension/bootstrap'},
 {tool:'crm_cliente_resumo',capability:'consulta_cliente_por_telefone',live:'LIVE_EXTENSION',source:'/api/v1/extension/customer-context'},
 {tool:'crm_cliente_360',capability:'historico_cliente',live:'LIVE_EXTENSION',source:'/api/v1/extension/customer-360'},
 {tool:'crm_previa_proposta_natal',capability:'previa_proposta',live:'LIVE_EXTENSION',source:'/api/v1/extension/proposals/preview'},
 {tool:'crm_natal_resumo',capability:'estatisticas_natal',live:'MOCK_ONLY',source:'fixture',production_gap:'API read-only Sanctum de estatísticas ainda não existe'},
 {tool:'crm_agenda_hoje',capability:'agenda_privada',live:'MOCK_ONLY',source:'fixture',production_gap:'API read-only Sanctum para agenda operacional ainda não existe'},
 {tool:'crm_buscar_cliente_nome',capability:'buscar_cliente_por_nome',live:'MOCK_ONLY',source:'fixture',production_gap:'API read-only Sanctum de busca por nome ainda não existe'},
 {tool:'crm_simular_agendamento_proposta_natal',capability:'treino_confirmacao_proposta',live:'MOCK_ONLY',source:'fixture',production_gap:'Simulação não implementa journal de envio'},
 {tool:'crm_agendar_proposta_natal',capability:'envio_real',live:'WRITE_GATED',source:'/api/v1/extension/proposals/schedule',production_gap:'Exige OAuth, confirmação humana e journal durável'}
];
export function capabilityManifest({mock=false,privateEnabled=false}={}){
 return {mode:mock?'MOCK_DEVELOPMENT':'LIVE_RESTRICTED',mock,source:mock?'fixture':'manifest',tools:defs.map(({tool,capability,live,source,production_gap})=>{
 let state=mock&&(live==='LIVE_PUBLIC'||live==='LIVE_EXTENSION'||live==='MOCK_ONLY')?'MOCK_ACTIVE':live;
 if(!mock&&live==='LIVE_EXTENSION'&&!privateEnabled)state='BLOCKED_AUTH';
 return {tool,capability,state,source,...(production_gap?{production_gap}:{})};
 }),warnings:mock?['TODOS OS DADOS DE CLIENTES, AGENDA E NATAL SÃO FICTÍCIOS. NENHUMA MENSAGEM É ENVIADA.']:['Apenas ferramentas registradas estão disponíveis. Ferramentas MOCK_ONLY e WRITE_GATED não são invocáveis em produção.']};
}
