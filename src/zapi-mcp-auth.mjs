// Independent Z-API OAuth 2.1 manager + AES-256-GCM persistent per-operator store.
// CRM OAuth identifies the Evydência operator; Z-API OAuth authorizes THAT operator's selected WhatsApp instance.
// Never shares Z-API tokens across operators, never keeps tokens solely in volatile memory, and never logs secrets.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {chmodSync,existsSync,mkdirSync,readFileSync,renameSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {
 discoverAuthorizationServerMetadata,
 exchangeAuthorization,
 IssuerMismatchError,
 OAuthError,
 refreshAuthorization,
 registerClient,
 RegistrationRejectedError,
 startAuthorization,
 validateAuthorizationResponseIssuer
} from '@modelcontextprotocol/client';
import {createSealer,deriveKeys,operatorTagger} from './oauth-gateway.mjs';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function aeadEncrypt(key,aad,obj){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);
 c.setAAD(Buffer.from(aad,'utf8'));
 const ct=Buffer.concat([c.update(JSON.stringify(obj),'utf8'),c.final()]);
 return Buffer.concat([iv,ct,c.getAuthTag()]).toString('base64url');
}

function aeadDecrypt(key,aad,blob){
 if(typeof blob!=='string'||blob.length<29)return null;
 try{
  const raw=Buffer.from(blob,'base64url');
  if(raw.length<29)return null;
  const d=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));
  d.setAAD(Buffer.from(aad,'utf8'));
  d.setAuthTag(raw.subarray(raw.length-16));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(12,raw.length-16)),d.final()]).toString('utf8'));
 }catch{
  return null;
 }
}

export function createEncryptedZapiStore(cfg,{now=()=>Date.now()}={}){
 const {zapiStore:storeKey}=deriveKeys(cfg.key);
 const filePath=cfg.zapiStorePath;
 let cachedMtimeMs=-1;
 let state={v:1,clients:{},operators:{},pending:{}};

 function ensureLoaded(){
  if(!filePath||!existsSync(filePath))return;
  try{
   const st=statSync(filePath);
   if(st.mtimeMs===cachedMtimeMs)return;
   const raw=JSON.parse(readFileSync(filePath,'utf8'));
   const opened=aeadDecrypt(storeKey,'zapi-store-file-v1',raw?.envelope);
   if(opened&&typeof opened==='object'&&opened.v===1){
    state={
     v:1,
     clients:opened.clients&&typeof opened.clients==='object'?opened.clients:{},
     operators:opened.operators&&typeof opened.operators==='object'?opened.operators:{},
     pending:opened.pending&&typeof opened.pending==='object'?opened.pending:{}
    };
    cachedMtimeMs=st.mtimeMs;
   }
  }catch{
   // Corrupted file fails closed to empty state without crashing CRM gateway.
  }
 }

 function persist(){
  const sec=Math.floor(now()/1000);
  for(const [jti,blob] of Object.entries(state.pending)){
   const p=aeadDecrypt(storeKey,'zapi-pending-v1:'+jti,blob);
   if(!p||typeof p.exp!=='number'||p.exp<sec)delete state.pending[jti];
  }
  const dir=dirname(filePath);
  mkdirSync(dir,{recursive:true,mode:0o700});
  try{chmodSync(dir,0o700)}catch{}
  const payload=JSON.stringify({v:1,updated_at:sec,envelope:aeadEncrypt(storeKey,'zapi-store-file-v1',state)});
  const tmp=`${filePath}.tmp.${process.pid}.${randomBytes(6).toString('hex')}`;
  writeFileSync(tmp,payload,{encoding:'utf8',mode:0o600});
  try{chmodSync(tmp,0o600)}catch{}
  try{
   renameSync(tmp,filePath);
   try{chmodSync(filePath,0o600)}catch{}
   cachedMtimeMs=statSync(filePath).mtimeMs;
  }catch(e){
   try{unlinkSync(tmp)}catch{}
   throw e;
  }
 }

 return {
  getClient(issuerKey){
   ensureLoaded();
   const blob=state.clients[issuerKey];
   return blob?aeadDecrypt(storeKey,'zapi-client-v1:'+issuerKey,blob):null;
  },
  saveClient(issuerKey,clientInfo){
   ensureLoaded();
   state.clients[issuerKey]=aeadEncrypt(storeKey,'zapi-client-v1:'+issuerKey,clientInfo);
   persist();
  },
  deleteClient(issuerKey){
   ensureLoaded();
   if(state.clients[issuerKey]){delete state.clients[issuerKey];persist()}
  },
  getOperator(operatorId){
   const op=String(operatorId||'');
   if(!op)return null;
   ensureLoaded();
   const blob=state.operators[op];
   return blob?aeadDecrypt(storeKey,'zapi-op-v1:'+op,blob):null;
  },
  saveOperator(operatorId,record){
   const op=String(operatorId||'');
   if(!op)throw Error('invalid_operator_id');
   ensureLoaded();
   state.operators[op]=aeadEncrypt(storeKey,'zapi-op-v1:'+op,record);
   persist();
  },
  deleteOperator(operatorId){
   const op=String(operatorId||'');
   if(!op)return;
   ensureLoaded();
   if(state.operators[op]){delete state.operators[op];persist()}
  },
  savePending(jti,entry){
   ensureLoaded();
   state.pending[jti]=aeadEncrypt(storeKey,'zapi-pending-v1:'+jti,entry);
   persist();
  },
  consumePending(jti){
   if(typeof jti!=='string'||!jti)return null;
   ensureLoaded();
   const blob=state.pending[jti];
   if(!blob)return null;
   delete state.pending[jti];
   persist();
   return aeadDecrypt(storeKey,'zapi-pending-v1:'+jti,blob);
  }
 };
}

export function createZapiAuthManager(cfg,{operators,fetchFn=fetch,now=()=>Date.now(),log=()=>{},onAuthorizedDiscover=async()=>null,onDisconnected=async()=>{}}={}){
 const store=createEncryptedZapiStore(cfg,{now});
 const seal=createSealer(cfg.key),tag=operatorTagger(cfg.key);
 const refreshLocks=new Map();
 const redirectUri=cfg.origin+'/zapi/oauth/callback';
 const clientKey=cfg.zapiIssuer+'|'+redirectUri;
 const sec=()=>Math.floor(now()/1000);

 const zapiOrigin=new URL(cfg.zapiIssuer).origin;
 const htmlHeaders=(extraFormOrigins='')=>({
  'Content-Type':'text/html; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${extraFormOrigins}; frame-ancestors 'none'; base-uri 'none'`
 });

 const readForm=async(req,max=8192)=>{
  const t=await req.text();
  if(t.length>max)throw Error('too_large');
  return new URLSearchParams(t);
 };

 function mintConnectUrl(operatorId){
  const op=String(operatorId||'');
  if(!cfg.allowedOperators.has(op))throw Error('operator_not_authorized');
  const iat=sec();
  const ticket=seal.seal('zlk',{op,iat,exp:iat+900});
  return `${cfg.origin}/zapi/connect?ticket=${encodeURIComponent(ticket)}`;
 }

 function getOperatorState(operatorId){
  const op=String(operatorId||'');
  if(!cfg.allowedOperators.has(op))return {oauth_status:'authorization_required',record:null};
  const rec=store.getOperator(op);
  if(!rec||typeof rec!=='object')return {oauth_status:'authorization_required',record:null};
  if(rec.status==='revoked')return {oauth_status:'revoked',record:rec};
  if(rec.status==='expired')return {oauth_status:'expired',record:rec};
  if(rec.status==='authorized'&&rec.tokens?.access_token){
   const exp=rec.tokens.expires_at;
   if(typeof exp==='number'&&exp<=sec()&&!rec.tokens.refresh_token){
    const next={...rec,status:'expired',tokens:null,updated_at:sec()};
    store.saveOperator(op,next);
    return {oauth_status:'expired',record:next};
   }
   return {oauth_status:'authorized',record:rec};
  }
  return {oauth_status:'authorization_required',record:rec};
 }

 async function discoverMetadata(){
  let meta;
  try{
   meta=await discoverAuthorizationServerMetadata(cfg.zapiIssuer,{fetchFn});
  }catch(e){
   if(IssuerMismatchError.isInstance(e))throw Error('zapi_oauth_issuer_mismatch');
   throw Error('zapi_oauth_unavailable');
  }
  if(!meta||meta.issuer!==cfg.zapiIssuer)throw Error('zapi_oauth_unavailable');
  return meta;
 }

 async function ensureClientRegistration(metadata){
  const cached=store.getClient(clientKey);
  if(cached?.client_id&&cached?.issuer===metadata.issuer)return cached;
  let registered;
  try{
   registered=await registerClient(cfg.zapiIssuer,{
    metadata,
    clientMetadata:{
     client_name:'Evydência CRM MCP Live',
     redirect_uris:[redirectUri],
     grant_types:['authorization_code','refresh_token'],
     response_types:['code'],
     token_endpoint_auth_method:'none'
    },
    fetchFn
   });
  }catch(e){
   if(RegistrationRejectedError.isInstance(e))throw Error('zapi_oauth_registration_rejected');
   throw Error('zapi_oauth_unavailable');
  }
  const stored={...registered,issuer:metadata.issuer,registered_at:sec()};
  store.saveClient(clientKey,stored);
  log({evt:'zapi_client_registered',issuer:metadata.issuer});
  return stored;
 }

 async function doRefresh(op,forceRefresh){
  const rec=store.getOperator(op);
  if(!rec||!rec.tokens){
   const st=rec?.status==='revoked'?'revoked':(rec?.status==='expired'?'expired':'authorization_required');
   throw Error('zapi_'+st);
  }
  const {tokens}=rec;
  const margin=tokens.refresh_token?30:0;
  const freshEnough=!forceRefresh&&tokens.access_token&&(!tokens.expires_at||tokens.expires_at>sec()+margin);
  if(freshEnough)return tokens.access_token;

  if(!tokens.refresh_token){
   const nextStatus=forceRefresh?'revoked':'expired';
   store.saveOperator(op,{...rec,status:nextStatus,tokens:null,updated_at:sec()});
   log({evt:'zapi_token_'+nextStatus,op:tag(op)});
   throw Error('zapi_'+nextStatus);
  }

  const metadata=await discoverMetadata();
  const clientInformation=await ensureClientRegistration(metadata);
  let refreshed;
  try{
   refreshed=await refreshAuthorization(cfg.zapiIssuer,{
    metadata,
    clientInformation,
    refreshToken:tokens.refresh_token,
    fetchFn
   });
  }catch(e){
   if(e instanceof OAuthError){
    const errCode=String(e.errorCode||e.message||'').toLowerCase();
    const desc=String(e.errorDescription||'').toLowerCase();
    if(errCode==='invalid_client'){
     store.deleteClient(clientKey);
    }
    const isRevoked=forceRefresh||desc.includes('revok')||errCode==='access_denied'||errCode==='unauthorized_client';
    const nextStatus=isRevoked?'revoked':'expired';
    store.saveOperator(op,{...rec,status:nextStatus,tokens:null,updated_at:sec()});
    log({evt:'zapi_refresh_'+nextStatus,op:tag(op)});
    throw Error('zapi_'+nextStatus);
   }
   log({evt:'zapi_refresh_unavailable',op:tag(op)});
   throw Error('zapi_oauth_unavailable');
  }

  const nowSec=sec();
  const expiresIn=Number(refreshed.expires_in);
  const nextTokens={
   access_token:refreshed.access_token,
   refresh_token:refreshed.refresh_token||tokens.refresh_token,
   token_type:refreshed.token_type||'Bearer',
   scope:refreshed.scope??tokens.scope??null,
   expires_at:Number.isFinite(expiresIn)&&expiresIn>0?nowSec+Math.floor(expiresIn):null,
   issuer:metadata.issuer
  };
  store.saveOperator(op,{...rec,status:'authorized',tokens:nextTokens,updated_at:nowSec});
  log({evt:'zapi_token_refreshed',op:tag(op)});
  return nextTokens.access_token;
 }

 async function ensureValidAccessToken(operatorId,{forceRefresh=false}={}){
  const op=String(operatorId||'');
  if(!cfg.allowedOperators.has(op))throw Error('operator_not_authorized');
  const lockKey=op;
  if(refreshLocks.has(lockKey))return refreshLocks.get(lockKey);
  const p=doRefresh(op,forceRefresh).finally(()=>refreshLocks.delete(lockKey));
  refreshLocks.set(lockKey,p);
  return p;
 }

 function markRevoked(operatorId){
  const op=String(operatorId||'');
  const rec=store.getOperator(op)||{};
  store.saveOperator(op,{
   ...rec,
   status:'revoked',
   tokens:null,
   updated_at:sec()
  });
  log({evt:'zapi_marked_revoked',op:tag(op)});
 }

 function saveDiscoverySnapshot(operatorId,snapshot){
  const op=String(operatorId||'');
  const rec=store.getOperator(op);
  if(!rec)return;
  store.saveOperator(op,{
   ...rec,
   discovered_tools:snapshot.discovered_tools||[],
   unexposed_tools:snapshot.unexposed_tools||[],
   official_status_tool:snapshot.official_status_tool||null,
   server_info:snapshot.server_info||rec.server_info||null,
   protocol_version:snapshot.protocol_version||rec.protocol_version||null,
   last_verified_at:sec(),
   updated_at:sec()
  });
 }

 async function disconnectOperator(operatorId){
  const op=String(operatorId||'');
  store.deleteOperator(op);
  await onDisconnected(op);
  log({evt:'zapi_disconnected',op:tag(op)});
 }

 function renderConnectPage({op,error,status=200}){
  const extraOrigins=` ${zapiOrigin} https://app.z-api.io`;
  if(!op){
   const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evydência CRM — Vincular Z-API MCP</title><style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#1b1b1b}input,button{font:inherit;padding:.65rem;width:100%;box-sizing:border-box;margin:.4rem 0}.e{color:#a40000;background:#fff2f2;padding:.6rem;border-radius:6px}.n{font-size:.9rem;color:#555}</style></head><body><h1>Vincular instância Z-API ao Operador</h1><p>Confirme sua identidade de operador do Evydência CRM para iniciar a autorização OAuth oficial na Z-API e selecionar a instância WhatsApp.</p>${error?`<p class="e" role="alert">${esc(error)}</p>`:''}<form method="post" action="/zapi/connect" autocomplete="off"><label for="t">Seu token pessoal do CRM (Sanctum)</label><input id="t" name="crm_token" type="password" required minlength="12" maxlength="512" autocomplete="off"><button type="submit">Continuar para autorização oficial Z-API</button></form><p class="n">Ou solicite o link direto assinado pela ferramenta <code>zapi_status_conexao</code> dentro do ChatGPT.</p></body></html>`;
   return new Response(html,{status,headers:htmlHeaders(extraOrigins)});
  }
  const st=getOperatorState(op);
  const formTxn=seal.seal('zfm',{op,iat:sec(),exp:sec()+900});
  const count=Array.isArray(st.record?.discovered_tools)?st.record.discovered_tools.length:0;
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evydência CRM — Z-API MCP</title><style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#1b1b1b}button{font:inherit;padding:.65rem;width:100%;box-sizing:border-box;margin:.45rem 0;cursor:pointer}.p{background:#0b57d0;color:#fff;border:0;border-radius:6px}.d{background:#fff;color:#a40000;border:1px solid #a40000;border-radius:6px}.box{background:#f6f8fa;padding:.8rem 1rem;border-radius:6px;margin:1rem 0}.e{color:#a40000;background:#fff2f2;padding:.6rem;border-radius:6px}.n{font-size:.9rem;color:#555}</style></head><body><h1>Integração Oficial Z-API MCP</h1><div class="box"><p><strong>Operador CRM autenticado:</strong> #${esc(op)}</p><p><strong>Estado OAuth Z-API:</strong> <code>${esc(st.oauth_status)}</code>${count?` (${count} ferramentas homologadas)`:''}</p></div>${error?`<p class="e" role="alert">${esc(error)}</p>`:''}<p>Ao continuar, você será redirecionado ao servidor oficial da Z-API para escolher explicitamente <strong>uma única instância WhatsApp</strong> vinculada somente à sua conta de operador.</p><form method="post" action="/zapi/connect"><input type="hidden" name="form_txn" value="${esc(formTxn)}"><button class="p" type="submit">${st.oauth_status==='authorized'?'Reautorizar ou trocar instância na Z-API':'Autorizar instância na Z-API'}</button></form>${st.record?`<form method="post" action="/zapi/disconnect"><input type="hidden" name="form_txn" value="${esc(formTxn)}"><button class="d" type="submit">Desvincular instância Z-API deste operador</button></form>`:''}<p class="n">Os tokens da Z-API ficam cifrados (AES-256-GCM) em armazenamento persistente privado e nunca são compartilhados entre operadores nem expostos ao ChatGPT.</p></body></html>`;
  return new Response(html,{status,headers:htmlHeaders(extraOrigins)});
 }

 const renderResultPage=(status,title,bodyHtml)=>new Response(
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#1b1b1b}.ok{background:#edf7ed;border:1px solid #2e7d32;padding:1rem;border-radius:6px}.err{background:#fff2f2;border:1px solid #a40000;padding:1rem;border-radius:6px}code{background:#f0f0f0;padding:.1rem .3rem;border-radius:4px}</style></head><body><h1>${esc(title)}</h1>${bodyHtml}</body></html>`,
  {status,headers:htmlHeaders('')}
 );

 async function handleConnectGet(req){
  const ticket=new URL(req.url).searchParams.get('ticket');
  if(!ticket)return renderConnectPage({op:null});
  const t=seal.open('zlk',ticket);
  if(!t||typeof t.exp!=='number'||t.exp<sec()||!cfg.allowedOperators.has(String(t.op))){
   return renderConnectPage({op:null,error:'Link de vinculação expirado ou inválido. Gere um novo link no ChatGPT via zapi_status_conexao ou autentique-se abaixo.',status:400});
  }
  return renderConnectPage({op:String(t.op)});
 }

 async function handleConnectPost(req){
  let f;try{f=await readForm(req)}catch{return renderResultPage(400,'Requisição inválida','<div class="err"><p>Formulário inválido.</p></div>')}
  let op='';
  const ftxn=f.get('form_txn');
  if(ftxn){
   const opened=seal.open('zfm',ftxn);
   if(!opened||typeof opened.exp!=='number'||opened.exp<sec()||!cfg.allowedOperators.has(String(opened.op))){
    return renderConnectPage({op:null,error:'Sessão de formulário expirada. Solicite novo link ou confirme seu token Sanctum.',status:400});
   }
   op=String(opened.op);
  }else{
   const crmTok=(f.get('crm_token')||'').trim();
   try{
    const v=await operators.verify(crmTok,{fresh:true});
    op=v.operatorId;
   }catch{
    return renderConnectPage({op:null,error:'Token Sanctum do CRM inválido ou operador não autorizado.',status:403});
   }
  }

  let metadata,clientInformation;
  try{
   metadata=await discoverMetadata();
   clientInformation=await ensureClientRegistration(metadata);
  }catch(e){
   log({evt:'zapi_connect_discovery_failed',op:tag(op),reason:e?.message||'error'});
   return renderConnectPage({op,error:'Servidor OAuth oficial da Z-API indisponível ou incompatível no momento. Tente novamente.',status:503});
  }

  const nowSec=sec();
  const jti=randomBytes(16).toString('base64url');
  const stateParam=seal.seal('zst',{op,jti,iss:metadata.issuer,exp:nowSec+600});
  const {authorizationUrl,codeVerifier}=await startAuthorization(cfg.zapiIssuer,{
   metadata,
   clientInformation,
   redirectUrl:redirectUri,
   state:stateParam
  });
  store.savePending(jti,{op,cv:codeVerifier,iss:metadata.issuer,exp:nowSec+600});
  log({evt:'zapi_oauth_started',op:tag(op)});
  return new Response(null,{
   status:302,
   headers:{
    Location:authorizationUrl.toString(),
    'Cache-Control':'no-store',
    'Referrer-Policy':'no-referrer'
   }
  });
 }

 async function handleCallbackGet(req){
  const params=new URL(req.url).searchParams;
  const rawState=params.get('state')||'';
  const st=seal.open('zst',rawState);
  if(!st||typeof st.exp!=='number'||st.exp<sec()||!cfg.allowedOperators.has(String(st.op))){
   return renderResultPage(400,'Autorização Z-API inválida ou expirada','<div class="err"><p>O estado da autorização expirou ou já foi utilizado. Inicie novamente pelo conector.</p></div>');
  }
  const pending=store.consumePending(st.jti);
  if(!pending||pending.op!==st.op||pending.exp<sec()){
   return renderResultPage(400,'Autorização Z-API já processada','<div class="err"><p>Este código de autorização já foi utilizado ou expirou.</p></div>');
  }

  let metadata;
  try{
   metadata=await discoverMetadata();
   validateAuthorizationResponseIssuer({
    iss:params.get('iss')??undefined,
    expectedIssuer:pending.iss,
    issParameterSupported:Boolean(metadata.authorization_response_iss_parameter_supported)
   });
  }catch(e){
   const isMixup=IssuerMismatchError.isInstance(e)||e?.message==='zapi_oauth_issuer_mismatch';
   log({evt:'zapi_oauth_callback_failed',op:tag(st.op),reason:isMixup?'issuer_mismatch':'discovery_failed'});
   return renderResultPage(isMixup?400:503,'Falha de validação OAuth Z-API','<div class="err"><p>Não foi possível validar o emissor OAuth da Z-API.</p></div>');
  }

  if(params.get('error')){
   log({evt:'zapi_oauth_denied',op:tag(st.op)});
   return renderResultPage(403,'Autorização Z-API não concluída','<div class="err"><p>A autorização na Z-API foi cancelada ou recusada pelo provedor.</p></div>');
  }

  const code=params.get('code')||'';
  if(!code||code.length>2048){
   return renderResultPage(400,'Código OAuth ausente','<div class="err"><p>O retorno da Z-API não incluiu um código de autorização válido.</p></div>');
  }

  let clientInformation;
  try{clientInformation=await ensureClientRegistration(metadata)}
  catch{return renderResultPage(503,'Falha no registro OAuth Z-API','<div class="err"><p>Serviço OAuth Z-API temporariamente indisponível.</p></div>')}

  let exchanged;
  try{
   exchanged=await exchangeAuthorization(cfg.zapiIssuer,{
    metadata,
    clientInformation,
    authorizationCode:code,
    iss:params.get('iss')??undefined,
    codeVerifier:pending.cv,
    redirectUri,
    fetchFn
   });
  }catch(e){
   if(e instanceof OAuthError&&e.errorCode==='invalid_client')store.deleteClient(clientKey);
   log({evt:'zapi_oauth_exchange_failed',op:tag(st.op)});
   return renderResultPage(400,'Falha ao concluir vínculo Z-API','<div class="err"><p>A troca do código OAuth com a Z-API falhou ou expirou. Gere um novo link e tente novamente.</p></div>');
  }

  const nowSec=sec();
  const expiresIn=Number(exchanged.expires_in);
  const prev=store.getOperator(st.op)||{};
  store.saveOperator(st.op,{
   ...prev,
   status:'authorized',
   tokens:{
    access_token:exchanged.access_token,
    refresh_token:exchanged.refresh_token||null,
    token_type:exchanged.token_type||'Bearer',
    scope:exchanged.scope??null,
    expires_at:Number.isFinite(expiresIn)&&expiresIn>0?nowSec+Math.floor(expiresIn):null,
    issuer:metadata.issuer
   },
   authorized_at:nowSec,
   updated_at:nowSec
  });
  log({evt:'zapi_oauth_authorized',op:tag(st.op)});

  let discoveredCount=0;
  let discoveryNote='';
  try{
   const snap=await onAuthorizedDiscover(st.op);
   discoveredCount=Array.isArray(snap?.discovered_tools)?snap.discovered_tools.length:0;
  }catch{
   discoveryNote='<p>A descoberta automática das ferramentas será concluída na próxima chamada do ChatGPT.</p>';
  }

  return renderResultPage(
   200,
   'Instância Z-API vinculada com sucesso',
   `<div class="ok"><p>A instância selecionada na Z-API foi vinculada com segurança ao <strong>Operador #${esc(st.op)}</strong>.</p><p><strong>Ferramentas oficiais Z-API descobertas:</strong> ${discoveredCount}</p>${discoveryNote}<p>Volte ao <strong>ChatGPT Web</strong> (e, se necessário, clique em <em>Atualizar ferramentas</em> nas configurações do conector <strong>Evydência CRM Live</strong>) para utilizar o envio de mensagens e grupos.</p></div>`
  );
 }

 async function handleDisconnectPost(req){
  let f;try{f=await readForm(req)}catch{return renderResultPage(400,'Requisição inválida','<div class="err"><p>Formulário inválido.</p></div>')}
  const opened=seal.open('zfm',f.get('form_txn'));
  if(!opened||typeof opened.exp!=='number'||opened.exp<sec()||!cfg.allowedOperators.has(String(opened.op))){
   return renderResultPage(400,'Sessão expirada','<div class="err"><p>Sessão expirada. Abra um novo link de gestão.</p></div>');
  }
  await disconnectOperator(String(opened.op));
  return renderResultPage(200,'Instância Z-API desvinculada',`<div class="ok"><p>Os tokens da Z-API do <strong>Operador #${esc(opened.op)}</strong> foram removidos com sucesso.</p></div>`);
 }

 async function handleHttp(req,path){
  if(path==='/zapi/connect'&&req.method==='GET')return handleConnectGet(req);
  if(path==='/zapi/connect'&&req.method==='POST')return handleConnectPost(req);
  if(path==='/zapi/oauth/callback'&&req.method==='GET')return handleCallbackGet(req);
  if(path==='/zapi/disconnect'&&req.method==='POST')return handleDisconnectPost(req);
  const allow=path==='/zapi/connect'?'GET, POST':(path==='/zapi/oauth/callback'?'GET':'POST');
  return new Response(null,{status:405,headers:{Allow:allow,'Cache-Control':'no-store'}});
 }

 return {
  mintConnectUrl,
  getOperatorState,
  ensureValidAccessToken,
  markRevoked,
  saveDiscoverySnapshot,
  disconnectOperator,
  handleHttp
 };
}
