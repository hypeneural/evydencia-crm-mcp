// MCP #29: small, read-only forensic tools over CRM #469.
// The CRM owns identity, permissions, plan semantics and provider state.
// Never infer delivery from HTTP 2xx or campaign "completed".
export const CAMPAIGN_FORENSIC_TOOL_NAMES=Object.freeze([
 'crm_campanha_atividade_detalhe',
 'crm_campanha_atividade_evidencias',
 'crm_campanha_voz_diagnostico',
 'crm_campanhas_saude_operacional',
 'crm_campanhas_execucoes_buscar'
]);

export function registerCampaignForensicTools({reg,client,z,readAnnotations,requiredScope}){
 const access={requiredScopes:[requiredScope]};
 const OUT_ACTIVITY=z.looseObject({
  contract_version:z.literal('campaign-audit.v1'),
  contact_id:z.number().int().positive(),
  plan:z.looseObject({}),
  progress:z.looseObject({}),
  channels:z.array(z.looseObject({})),
  coverage:z.looseObject({})
 });
 const OUT_EVIDENCE=z.looseObject({
  contract_version:z.literal('campaign-audit.v1'),
  contact_id:z.number().int().positive(),
  kind:z.enum(['items','events','attempts','callbacks','decisions']),
  rows:z.array(z.looseObject({})),
  has_more:z.boolean(),
  next_cursor:z.string().nullable()
 });
 const OUT_VOICE=z.looseObject({
  source:z.literal('CRM_CANONICAL_READ_ONLY'),
  contact_id:z.number().int().positive(),
  provider_health:z.literal('not_queried'),
  latest_recorded_voice_item:z.looseObject({}).nullable(),
  latest_recorded_voice_attempt:z.looseObject({}).nullable(),
  voice_counts:z.array(z.looseObject({})),
  coverage:z.looseObject({})
 });

 const OUT_SEARCH=z.looseObject({
  contract_version:z.literal('campaign-audit.v1'),
  source:z.literal('CRM_CANONICAL_READ_ONLY'),
  filters:z.looseObject({}),
  rows:z.array(z.looseObject({})),
  has_more:z.boolean(),
  next_cursor:z.string().nullable(),
  data_quality:z.looseObject({})
 });
 reg('crm_campanhas_execucoes_buscar','Localizar atividades de campanhas sem informar telefone',
  'Consulta global somente leitura e paginada. Se campaign_id for omitido busca todas as campanhas dentro do período a partir de from_date (padrão 30 dias). Não revela nomes ou números; retorna IDs e links para investigação detalhada. completed é estado registrado e não prova entrega da régua. Leia data_quality e has_more antes de concluir ausência de casos.',
  z.object({
   campaign_id:z.number().int().positive().optional(),
   scheduled_status:z.enum(['scheduled','paused','completed','aborted']).optional(),
   from_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
   limit:z.number().int().min(1).max(50).default(30),
   cursor:z.string().regex(/^[1-9]\d*$/).optional()
  }),OUT_SEARCH,async(filters)=>client.search(filters),readAnnotations,access);

 const OUT_HEALTH=z.looseObject({
  contract_version:z.literal('campaign-audit.v1'),
  source:z.literal('CRM_PASSIVE_OPERATIONAL_EVIDENCE'),
  window_hours:z.literal(24),
  provider_accounts:z.array(z.looseObject({})),
  coverage:z.looseObject({provider_current_reachability:z.literal('not_probed')})
 });
 reg('crm_campanhas_saude_operacional','Últimos sinais de operação Z-API, SMS, e-mail e SmartVoice',
  'Leitura passiva do CRM: por conta de integração traz última tentativa HTTP, último webhook e contagem de erros nas últimas 24h. NÃO testa conectividade ao provedor, não comprova entrega de mensagem nem estado online dos workers. Para ligação individual use crm_campanha_voz_diagnostico.',
  z.object({}),OUT_HEALTH,async()=>client.health(),readAnnotations,access);

 reg('crm_campanha_atividade_detalhe','Auditoria completa de atividade de campanha',
  'Consulta o plano capturado, todas as etapas, o progresso e os totais de entrega por canal de UMA atividade. O identificador é campaign_scheduled_contacts.id, não campaign_scheduleds.id. Não comprova entrega sem callback; para logs completos use crm_campanha_atividade_evidencias. Somente leitura, sem envio, SMS, e-mail ou chamada.',
  z.object({contact_id:z.number().int().positive()}),OUT_ACTIVITY,
  async({contact_id})=>client.activity(contact_id),readAnnotations,access);

 reg('crm_campanha_atividade_evidencias','Evidências e logs de campanha por página',
  'Percorre mensagens, tentativas HTTP, eventos, callbacks ou decisões de UMA atividade, com cursor e filtro opcional de canal. Use kind=items para envios e entrega, attempts para erro HTTP, callbacks para provedor, events para resposta e decisões para política. has_more=true significa dados restantes; ausência de registro não prova ausência de envio. Somente leitura.',
  z.object({contact_id:z.number().int().positive(),
   kind:z.enum(['items','events','attempts','callbacks','decisions']),
   channel:z.enum(['whatsapp','sms','email','voice']).optional(),
   limit:z.number().int().min(1).max(100).default(50),
   cursor:z.string().regex(/^[1-9]\d*$/).optional()}),OUT_EVIDENCE,
  async({contact_id,kind,channel,limit,cursor})=>client.evidence(contact_id,{kind,channel,limit,cursor}),
  readAnnotations,access);

 reg('crm_campanha_voz_diagnostico','Diagnóstico rápido de ligação SmartVoice/VoIP em campanha',
  'Consulta, SEM ligar, o último item de voz registrado e a última tentativa HTTP de uma atividade, mais os contadores do canal. HTTP 409 sugere conflito que precisa ser reconciliado pelo comando SmartVoice; chamada atendida NÃO prova reprodução integral do áudio. Não testa conectividade atual do serviço e não dispara ligação.',
  z.object({contact_id:z.number().int().positive()}),OUT_VOICE,
  async({contact_id})=>{
   const [activity,items,attempts]=await Promise.all([
    client.activity(contact_id),
    client.evidence(contact_id,{kind:'items',channel:'voice',limit:100}),
    client.evidence(contact_id,{kind:'attempts',channel:'voice',limit:100})
   ]);
   const latestItem=items.rows[0]||null,latestAttempt=attempts.rows[0]||null;
   const cleanItem=latestItem?{
    id:latestItem.id,stage_id:latestItem.campaign_stage_id,
    provider:latestItem.provider,status:latestItem.status,
    outbox_status:latestItem.outbox_status,
    provider_status:latestItem.provider_status,
    provider_message_id:latestItem.provider_message_id,
    accepted_at:latestItem.accepted_at,delivered_at:latestItem.delivered_at,
    answered_at:latestItem.answered_at,no_answer_at:latestItem.no_answer_at,
    error_code:latestItem.error_code,failure_category:latestItem.failure_category
   }:null;
   const cleanAttempt=latestAttempt?{
    id:latestAttempt.id,delivery_item_id:latestAttempt.delivery_item_id,
    http_status:latestAttempt.http_status,attempt_number:latestAttempt.attempt_number,
    error_category:latestAttempt.error_category,error_code:latestAttempt.error_code,
    started_at:latestAttempt.started_at,finished_at:latestAttempt.finished_at
   }:null;
   const conflict409=latestAttempt?.http_status===409;
   const humanSummary=!latestItem
    ?'Nenhum item de ligação registrado nesta atividade; confira se há etapa de voz prevista.'
    :conflict409
     ?'Conflito HTTP 409 na última tentativa de voz. Não comprova ligação completada nem autoriza rediscagem.'
     :latestItem.answered_at
      ?'Atendimento registrado; a reprodução integral do áudio ainda exige confirmação independente.'
      :latestItem.status==='failed'
       ?'Há falha registrada na última ligação. Consulte as tentativas e o retorno do SmartVoice.'
       :'Existe atividade de voz registrada; o resultado final ainda precisa ser comprovado.';
   const suggestedAction=conflict409
    ?'Conciliar o identificador do mesmo comando pela leitura SmartVoice antes de qualquer nova ação.'
    :'Consultar os eventos de voz e a etapa correspondente para confirmar o resultado.';
   return {
    resumo_gestor:humanSummary,proxima_verificacao:suggestedAction,
    source:'CRM_CANONICAL_READ_ONLY',contact_id,
    provider_health:'not_queried',
    latest_recorded_voice_item:cleanItem,
    latest_recorded_voice_attempt:cleanAttempt,
    voice_counts:activity.channels.filter(c=>c.channel==='voice'),
    audio_completed:'not_verified_from_item_summary',
    coverage:{plan:activity.coverage.plan,
     voice_items:items.has_more?'partial_more_pages':'page_exhausted',
     voice_attempts:attempts.has_more?'partial_more_pages':'page_exhausted',
     provider_current_health:'not_queried'},
    activity_url:activity.activity_url,
    generated_at:activity.generated_at
   };
  },readAnnotations,access);
}
