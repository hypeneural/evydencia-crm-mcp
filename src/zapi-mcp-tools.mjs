// Official Z-API MCP tool mapping, allowlist guard, JSON Schema validation and media/redaction safety.
// Preserves official upstream JSON Schemas via fromJsonSchema without manually rebuilding REST endpoints.
// Unrecognized future upstream tools are never silently exposed.
import {fromJsonSchema} from '@modelcontextprotocol/server';

export const ZAPI_STATUS_TOOL_NAME='zapi_status_conexao';

const WRITE_MESSAGE={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true};
const WRITE_GROUP={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true};
const WRITE_GROUP_DESTRUCTIVE={readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true};
const READ_GROUP={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};

export const ZAPI_OFFICIAL_SPECS=Object.freeze([
 {
  gatewayName:'zapi_send_text',
  capability:'whatsapp_send_text',
  access:'write_external',
  aliases:['send_text','send_message','send_text_message'],
  title:'Enviar mensagem de texto no WhatsApp (Z-API)',
  description:'Use quando o operador pedir explicitamente o envio imediato de uma mensagem de texto avulsa no WhatsApp pela instância Z-API vinculada. NÃO use quando a pergunta for consulta de vendas, caixa, pedidos, clientes ou diagnóstico, nem para disparar proposta comercial oficial de Natal 2026 (use crm_previa_proposta_natal / crm_enviar_proposta_natal). Quando o usuário informar nome sem telefone, consulte antes o CRM (crm_clientes_buscar ou crm_cliente_resumo) sem inventar número; se houver homônimos ou qualquer ambiguidade, pare e confirme antes do envio. Resposta aceita significa submissão ao provedor (não entrega/leitura); em timeout ou falha ambígua, nunca reenvie automaticamente.',
  annotations:WRITE_MESSAGE,
  mediaKind:null
 },
 {
  gatewayName:'zapi_send_image',
  capability:'whatsapp_send_image',
  access:'write_external',
  aliases:['send_image','send_photo','send_image_message'],
  title:'Enviar imagem por URL HTTPS no WhatsApp (Z-API)',
  description:'Use quando o operador pedir explicitamente o envio de imagem por URL HTTPS pública acessível no WhatsApp (com legenda opcional). NÃO use com Base64 inline, URLs privadas/localhost ou sem destinatário confirmado. Se apenas o nome for informado, resolva o telefone antes no CRM e confirme em caso de homônimos.',
  annotations:WRITE_MESSAGE,
  mediaKind:'image'
 },
 {
  gatewayName:'zapi_send_video',
  capability:'whatsapp_send_video',
  access:'write_external',
  aliases:['send_video','send_video_message'],
  title:'Enviar vídeo por URL HTTPS no WhatsApp (Z-API)',
  description:'Use quando o operador pedir explicitamente o envio de vídeo por URL HTTPS pública acessível no WhatsApp (com legenda opcional). NÃO use com Base64 inline, URLs privadas/localhost ou sem destinatário confirmado. Se apenas o nome for informado, resolva o telefone antes no CRM e confirme em caso de homônimos.',
  annotations:WRITE_MESSAGE,
  mediaKind:'video'
 },
 {
  gatewayName:'zapi_group_create',
  capability:'whatsapp_group_create',
  access:'write_external',
  aliases:['group_create','create_group'],
  title:'Criar grupo no WhatsApp (Z-API)',
  description:'Cria um grupo no WhatsApp na instância Z-API vinculada ao operador com o nome e os participantes informados.',
  annotations:WRITE_GROUP,
  mediaKind:null
 },
 {
  gatewayName:'zapi_group_add_participant',
  capability:'whatsapp_group_add_participant',
  access:'write_external',
  aliases:['group_add_participant','group_add_participants','add_participant','add_group_participant'],
  title:'Adicionar participante(s) a grupo WhatsApp (Z-API)',
  description:'Adiciona participante(s) a um grupo existente do WhatsApp na instância Z-API vinculada ao operador.',
  annotations:WRITE_GROUP,
  mediaKind:null
 },
 {
  gatewayName:'zapi_group_remove_participant',
  capability:'whatsapp_group_remove_participant',
  access:'write_external',
  aliases:['group_remove_participant','group_remove_participants','remove_participant','remove_group_participant'],
  title:'Remover participante(s) de grupo WhatsApp (Z-API)',
  description:'Remove participante(s) de um grupo do WhatsApp na instância Z-API vinculada ao operador.',
  annotations:WRITE_GROUP_DESTRUCTIVE,
  mediaKind:null
 },
 {
  gatewayName:'zapi_group_add_admin',
  capability:'whatsapp_group_add_admin',
  access:'write_external',
  aliases:['group_add_admin','group_add_admins','add_admin','promote_group_participant','group_promote_admin'],
  title:'Promover administrador em grupo WhatsApp (Z-API)',
  description:'Concede permissão de administrador a participante(s) de um grupo do WhatsApp na instância Z-API vinculada ao operador.',
  annotations:WRITE_GROUP,
  mediaKind:null
 },
 {
  gatewayName:'zapi_group_remove_admin',
  capability:'whatsapp_group_remove_admin',
  access:'write_external',
  aliases:['group_remove_admin','group_remove_admins','remove_admin','demote_group_participant','group_demote_admin'],
  title:'Remover administrador em grupo WhatsApp (Z-API)',
  description:'Remove permissão de administrador de participante(s) de um grupo do WhatsApp na instância Z-API vinculada ao operador.',
  annotations:WRITE_GROUP_DESTRUCTIVE,
  mediaKind:null
 },
 {
  gatewayName:'zapi_group_metadata',
  capability:'whatsapp_group_metadata',
  access:'read',
  aliases:['group_metadata','get_group_metadata','group_info'],
  title:'Consultar metadados e participantes de grupo WhatsApp (Z-API)',
  description:'Consulta metadados, administradores e participantes de um grupo do WhatsApp pela instância Z-API vinculada ao operador.',
  annotations:READ_GROUP,
  mediaKind:null
 }
]);

export const ZAPI_GATEWAY_TOOL_NAMES=Object.freeze(ZAPI_OFFICIAL_SPECS.map(s=>s.gatewayName));

const SPEC_BY_ALIAS=new Map();
for(const spec of ZAPI_OFFICIAL_SPECS){
 for(const alias of spec.aliases)SPEC_BY_ALIAS.set(alias,spec);
}

export function canonicalizeUpstreamToolName(name){
 if(typeof name!=='string')return '';
 // Insert underscore before camelCase boundaries, strip optional zapi prefix, normalize separators.
 return name.trim()
  .replace(/([a-z0-9])([A-Z])/g,'$1_$2')
  .toLowerCase()
  .replace(/^z[-_]?api[-_]+/,'')
  .replace(/[^a-z0-9]+/g,'_')
  .replace(/^_+|_+$/g,'');
}

export function compileCompatibleObjectSchema(rawSchema){
 if(!rawSchema||typeof rawSchema!=='object'||Array.isArray(rawSchema))return null;
 if(rawSchema.type!==undefined&&rawSchema.type!=='object')return null;
 const normalized=rawSchema.type==='object'?structuredClone(rawSchema):{type:'object',...structuredClone(rawSchema)};
 try{
  const wrapped=fromJsonSchema(normalized);
  // Trigger eager AJV compilation so broken regexes or unsupported $schema dialects fail closed now.
  wrapped['~standard'].validate({});
  return {jsonSchema:normalized,wrapped};
 }catch{
  return null;
 }
}

export function classifyDiscoveredTools(rawTools,reservedNames=new Set()){
 const approved=[];
 const skipped=[];
 const seenGateway=new Set(reservedNames);
 let officialStatusTool=null;

 for(const t of Array.isArray(rawTools)?rawTools:[]){
  const upstreamName=typeof t?.name==='string'?t.name.trim():'';
  if(!upstreamName||upstreamName.length>128){
   skipped.push({upstream_name:upstreamName||'invalid',reason:'invalid_tool_name'});
   continue;
  }
  const canon=canonicalizeUpstreamToolName(upstreamName);
  const spec=SPEC_BY_ALIAS.get(canon);
  if(!spec){
   if((canon==='status'||canon==='instance_status'||canon==='connection_status')&&t?.annotations?.readOnlyHint===true){
    const sc=compileCompatibleObjectSchema(t.inputSchema||{type:'object',properties:{}});
    if(sc&&!officialStatusTool)officialStatusTool={upstreamName,inputSchema:sc.jsonSchema};
   }
   skipped.push({upstream_name:upstreamName,reason:'unapproved_tool'});
   continue;
  }
  if(seenGateway.has(spec.gatewayName)){
   skipped.push({upstream_name:upstreamName,gateway_name:spec.gatewayName,reason:'duplicate_or_collision'});
   continue;
  }
  const compiledIn=compileCompatibleObjectSchema(t.inputSchema);
  if(!compiledIn){
   skipped.push({upstream_name:upstreamName,gateway_name:spec.gatewayName,reason:'incompatible_input_schema'});
   continue;
  }
  let outputJsonSchema=null;
  if(t.outputSchema!==undefined){
   const compiledOut=compileCompatibleObjectSchema(t.outputSchema);
   if(compiledOut)outputJsonSchema=compiledOut.jsonSchema;
  }
  seenGateway.add(spec.gatewayName);
  const upstreamDesc=typeof t.description==='string'&&t.description.trim()?` [Z-API oficial ${upstreamName}: ${t.description.trim().slice(0,360)}]`:` [Z-API oficial: ${upstreamName}]`;
  const mergedAnnotations={
   ...spec.annotations,
   ...(typeof t?.annotations?.idempotentHint==='boolean'?{idempotentHint:t.annotations.idempotentHint}:{})
  };
  approved.push({
   gatewayName:spec.gatewayName,
   upstreamName,
   capability:spec.capability,
   access:spec.access,
   title:spec.title,
   description:spec.description+upstreamDesc,
   inputSchema:compiledIn.jsonSchema,
   outputSchema:outputJsonSchema,
   annotations:mergedAnnotations,
   mediaKind:spec.mediaKind
  });
 }
 return {approved,skipped,officialStatusTool};
}

const MEDIA_KEYS=new Set(['image','video','url','imageurl','videourl','media','mediaurl','file','fileurl','link']);
const PRIVATE_HOST_RE=/^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[::1\]|.*\.localhost|.*\.internal)$/i;

export function validateZapiMediaArgs(toolEntry,args){
 if(!toolEntry?.mediaKind||!args||typeof args!=='object')return;
 let checkedUrlCount=0;
 for(const [k,v] of Object.entries(args)){
  if(typeof v!=='string')continue;
  const trimmed=v.trim();
  const isMediaKey=MEDIA_KEYS.has(k.toLowerCase());
  if(/^data:/i.test(trimmed)||(isMediaKey&&trimmed.length>4096&&!/^https?:\/\//i.test(trimmed))){
   throw Error('zapi_media_inline_base64_not_supported');
  }
  if(!isMediaKey)continue;
  let u;try{u=new URL(trimmed)}catch{throw Error('zapi_media_invalid_url')}
  if(u.protocol!=='https:')throw Error('zapi_media_https_required');
  if(u.username||u.password||PRIVATE_HOST_RE.test(u.hostname))throw Error('zapi_media_host_forbidden');
  if(trimmed.length>2048)throw Error('zapi_media_url_too_long');
  checkedUrlCount++;
 }
 if(checkedUrlCount===0){
  // Also prevent huge base64 hidden under arbitrary string fields.
  for(const v of Object.values(args)){
   if(typeof v==='string'&&v.length>16384)throw Error('zapi_payload_field_too_large');
  }
 }
}

export function redactSensitiveText(input){
 if(typeof input!=='string'||!input)return '';
 return input
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [REDACTED]')
  .replace(/([?&](?:token|access_token|refresh_token|client_secret|sig|signature|x-amz-signature|x-amz-credential|x-amz-security-token|key)=)[^&\s"']+/gi,'$1[REDACTED]')
  .replace(/(\/instances\/[^/\s]+\/token\/)[^/\s]+/gi,'$1[REDACTED]');
}

export function maskDispatchId(raw){
 if(typeof raw!=='string'&&typeof raw!=='number')return null;
 const s=String(raw).trim();
 if(!s)return null;
 if(s.length<=6)return '***'+s.slice(-2);
 return s.slice(0,3)+'***'+s.slice(-4);
}

export function canonicalJson(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
 const keys=Object.keys(value).sort();
 return '{'+keys.map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';
}
