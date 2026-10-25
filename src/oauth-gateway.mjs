// LIVE read-only gateway: OAuth 2.1 Authorization Server + Resource Server token verifier.
// Stateless by design: client registrations, authorization codes and tokens are AES-256-GCM
// sealed with sub-keys derived (HKDF) from EVYD_GATEWAY_KEY. Nothing is persisted on disk.
// Operator identity = the operator's OWN Sanctum token, validated against
// GET /api/v1/extension/bootstrap. Wildcard or malformed tokens are refused; standard
// ExtensionAbilities::operator() tokens are accepted unless EVYD_STRICT_READONLY_TOKEN=1.
// Never log upstream tokens, OAuth tokens, codes, phones or names.
import {createCipheriv,createDecipheriv,createHash,createHmac,hkdfSync,randomBytes,timingSafeEqual} from 'node:crypto';
import {OAuthError,OAuthErrorCode} from '@modelcontextprotocol/server';
import {baseURL,crmClient} from './core.mjs';
import {assertOperatorAbilities} from './live-abilities.mjs';

export const GATEWAY_SCOPE='crm.read';
// ChatGPT uses the stable redirect when the AS advertises RFC 9207 `iss`; otherwise a per-connection callback.
const DEFAULT_REDIRECTS='https://chatgpt.com/connector_platform_oauth_redirect,https://chatgpt.com/connector/oauth/*';
// Unauthenticated shared CRM env vars must never bypass per-operator OAuth in this process.
const FORBIDDEN_ENV=['CRM_READ_TOKEN','CRM_TOKEN','CRM_WRITE_TOKEN','EVYDENCIA_LEGACY_TOKEN','ZAPI_TOKEN','ZAPI_INSTANCE','ZAPI_CLIENT_TOKEN'];
const isLocal=h=>['localhost','127.0.0.1','[::1]'].includes(h);
const fail=c=>{throw Error('gateway_config_'+c)};
const int=(v,d,min,max)=>{if(v===undefined||v==='')return d;const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)fail('invalid_number');return n};
const norm=s=>String(s).replace(/#.*$/,'').replace(/\/$/,'');
const safeEq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};

export function gatewayConfig(env){
 if(env.EVYD_MOCK_MODE==='1')fail('mock_mode_forbidden');
 for(const k of FORBIDDEN_ENV)if(env[k])fail('shared_secret_forbidden');
 let pub;try{pub=new URL(env.EVYD_PUBLIC_URL)}catch{fail('public_url')}
 if(pub.username||pub.password||pub.search||pub.hash||!['/',''].includes(pub.pathname))fail('public_url');
 if(pub.protocol!=='https:'&&!(pub.protocol==='http:'&&isLocal(pub.hostname)))fail('public_url_https');
 const crmBaseUrl=baseURL(env.CRM_BASE_URL||'');
 const key=Buffer.from(String(env.EVYD_GATEWAY_KEY||''),'base64');
 if(key.length<32)fail('key_too_short');
 const ops=String(env.EVYD_ALLOWED_OPERATOR_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!ops.length||ops.some(x=>!/^[1-9]\d{0,9}$/.test(x)))fail('operator_allowlist');
 const redirects=String(env.EVYD_OAUTH_REDIRECT_URIS||DEFAULT_REDIRECTS).split(',').map(s=>s.trim()).filter(Boolean);
 for(const r of redirects){let u;try{u=new URL(r.replace(/\*$/,'x'))}catch{fail('redirect_allowlist')}if(u.protocol!=='https:'&&!isLocal(u.hostname))fail('redirect_allowlist')}
 const internalReadToken=typeof env.EVYD_INTERNAL_READ_TOKEN==='string'&&env.EVYD_INTERNAL_READ_TOKEN.trim().length>=12?env.EVYD_INTERNAL_READ_TOKEN.trim():null;
 return Object.freeze({
  issuer:pub.origin,origin:pub.origin,hostname:pub.hostname,resource:pub.origin+'/mcp',crmBaseUrl,key,
  allowedOperators:new Set(ops),redirects,internalReadToken,
  strictReadOnlyToken:env.EVYD_STRICT_READONLY_TOKEN==='1',
  crmTimeoutMs:int(env.CRM_REQUEST_TIMEOUT_MS,6000,100,30000),
  accessTtl:int(env.EVYD_ACCESS_TOKEN_TTL_S,3600,60,86400),
  refreshTtl:int(env.EVYD_REFRESH_TOKEN_TTL_S,2592000,300,7776000),
  operatorCacheMs:int(env.EVYD_OPERATOR_RECHECK_S,300,0,3600)*1000,
  rateMcpPerMin:int(env.EVYD_RATE_MCP_PER_MIN,120,1,10000),
  rateAuthPerMin:int(env.EVYD_RATE_AUTH_PER_MIN,20,1,1000),
  trustProxy:env.EVYD_TRUST_PROXY==='1',
  insecureLocal:pub.protocol==='http:'
 });
}

export function redirectAllowed(uri,allow){
 if(typeof uri!=='string'||uri.length>512)return false;
 let u;try{u=new URL(uri)}catch{return false}
 if(u.hash||u.username||u.password)return false;
 return allow.some(p=>p.endsWith('*')
  ?uri.startsWith(p.slice(0,-1))&&/^[A-Za-z0-9_-]{1,128}$/.test(uri.slice(p.length-1))
  :uri===p);
}

export function deriveKeys(master){
 const d=info=>Buffer.from(hkdfSync('sha256',master,Buffer.from('evydencia-crm-mcp-gateway'),Buffer.from(info),32));
 return {aead:d('aead-v1'),mac:d('mac-v1'),log:d('log-v1')};
}

// AAD = token type, so a code can never be replayed as an access token and vice versa.
export function createSealer(master){
 const {aead}=deriveKeys(master);
 return {
  seal(type,payload){
   const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',aead,iv);c.setAAD(Buffer.from(type));
   const ct=Buffer.concat([c.update(JSON.stringify(payload),'utf8'),c.final()]);
   return type+'.'+Buffer.concat([iv,ct,c.getAuthTag()]).toString('base64url');
  },
  open(type,token){
   if(typeof token!=='string'||token.length>8192||!token.startsWith(type+'.'))return null;
   try{
    const raw=Buffer.from(token.slice(type.length+1),'base64url');if(raw.length<29)return null;
    const d=createDecipheriv('aes-256-gcm',aead,raw.subarray(0,12));d.setAAD(Buffer.from(type));d.setAuthTag(raw.subarray(raw.length-16));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(12,raw.length-16)),d.final()]).toString('utf8'));
   }catch{return null}
  }
 };
}

// Pseudonymous operator tag for logs (HMAC, not reversible without the gateway key).
export function operatorTagger(master){
 const {log}=deriveKeys(master);
 return id=>id?createHmac('sha256',log).update(String(id)).digest('base64url').slice(0,10):null;
}

// Validates the operator's own Sanctum token: operator abilities, allowlisted operator, not expired.
export function operatorVerifier(cfg,{fetchFn=fetch,now=()=>Date.now()}={}){
 const cache=new Map();
 const h=t=>createHash('sha256').update(t).digest('base64url');
 async function verify(upstream,{fresh=false}={}){
  if(typeof upstream!=='string'||upstream.length<12||upstream.length>512||/\s/.test(upstream))throw Error('upstream_token_invalid');
  const k=h(upstream),hit=cache.get(k);
  if(!fresh&&hit&&hit.until>now())return hit.value;
  cache.delete(k);
  let b;
  try{b=await crmClient({baseUrl:cfg.crmBaseUrl,token:upstream,privateEnabled:true,timeoutMs:cfg.crmTimeoutMs,fetchFn,strictEnvelope:true}).bootstrap()}
  catch(e){
   if(e?.message==='crm_http_401')throw Error('upstream_token_invalid');
   if(e?.message==='crm_http_403')throw Error('upstream_scope_rejected');
   throw Error('crm_unavailable');
  }
  try{assertOperatorAbilities(b.token?.abilities,'customer-context',{strictReadOnly:cfg.strictReadOnlyToken})}catch{throw Error('upstream_scope_rejected')}
  const id=b.operator?.id,op=Number.isSafeInteger(id)?String(id):'';
  if(!cfg.allowedOperators.has(op))throw Error('operator_not_authorized');
  const exp=b.token?.expires_at?Date.parse(b.token.expires_at):NaN;
  if(Number.isFinite(exp)&&exp<=now())throw Error('upstream_token_invalid');
  const value={operatorId:op,upstreamExpiresAt:Number.isFinite(exp)?Math.floor(exp/1000):null};
  if(cfg.operatorCacheMs>0){
   if(cache.size>=1000)cache.delete(cache.keys().next().value);
   cache.set(k,{value,until:now()+cfg.operatorCacheMs});
  }
  return value;
 }
 return {verify,forget:t=>{if(typeof t==='string')cache.delete(h(t))}};
}

const MSG={
 upstream_token_invalid:'Token do CRM inválido, expirado ou revogado.',
 upstream_scope_rejected:'Token recusado: precisa de extension:bootstrap e extension:customer-read válidos.',
 operator_not_authorized:'Operador não autorizado para o conector ChatGPT.',
 crm_unavailable:'CRM indisponível no momento. Tente novamente.'
};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createOAuthServer(cfg,{operators,now=()=>Date.now(),log=()=>{}}){
 const seal=createSealer(cfg.key),{mac}=deriveKeys(cfg.key),tag=operatorTagger(cfg.key);
 const usedCodes=new Map();
 const sec=()=>Math.floor(now()/1000);
 const json=(status,body,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Pragma':'no-cache',...extra}});
 const oauthErr=(status,error,extra)=>json(status,{error},extra);
 const clientSecret=cid=>createHmac('sha256',mac).update('client-secret:'+cid).digest('base64url');
 const readText=async(req,max)=>{const t=await req.text();if(t.length>max)throw Error('too_large');return t};
 const redirect=(ru,params)=>{
  const u=new URL(ru);for(const [k,v] of Object.entries(params))if(v)u.searchParams.set(k,v);
  return new Response(null,{status:302,headers:{Location:u.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 };
 const metadata=Object.freeze({
  issuer:cfg.issuer,authorization_endpoint:cfg.origin+'/authorize',token_endpoint:cfg.origin+'/token',registration_endpoint:cfg.origin+'/register',
  response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],
  token_endpoint_auth_methods_supported:['none','client_secret_post','client_secret_basic'],scopes_supported:[GATEWAY_SCOPE],
  authorization_response_iss_parameter_supported:true
 });
 const htmlHeaders=extraCsp=>({'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${extraCsp}; frame-ancestors 'none'; base-uri 'none'`});

 function page({txn,ru,error,status=200}){
  const u=new URL(ru);
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evydência CRM — autorizar ChatGPT</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1b1b1b}input,button{font:inherit;padding:.6rem;width:100%;box-sizing:border-box;margin:.4rem 0}.e{color:#a40000}.n{font-size:.9rem;color:#555}</style></head><body><h1>Conectar ChatGPT ao Evydência CRM</h1><p>Acesso <strong>somente leitura</strong> no conector: cliente por telefone, Cliente 360, pedidos e dados públicos. Nenhum envio, agendamento ou alteração é executado pelo MCP.</p><p class="n">Retorno para: ${esc(u.host)}</p>${error?`<p class="e" role="alert">${esc(error)}</p>`:''}<form method="post" action="/authorize" autocomplete="off"><input type="hidden" name="txn" value="${esc(txn)}"><label for="t">Seu token pessoal do CRM (Sanctum)</label><input id="t" name="crm_token" type="password" required minlength="12" maxlength="512" autocomplete="off"><button name="action" value="approve" type="submit">Autorizar leitura</button><button name="action" value="deny" type="submit" formnovalidate>Cancelar</button></form><p class="n">O token Sanctum permanece cifrado no gateway e não é exposto ao ChatGPT.</p></body></html>`;
  // form-action must also allow the post-submit redirect origin (Chromium enforces CSP on redirects).
  return new Response(html,{status,headers:htmlHeaders(' '+u.origin)});
 }
 const errorPage=(status,msg)=>new Response(`<!doctype html><meta charset="utf-8"><title>Erro</title><p>${esc(msg)}</p>`,{status,headers:htmlHeaders('')});

 async function register(req){
  let body;try{body=JSON.parse(await readText(req,16384))}catch{return oauthErr(400,'invalid_client_metadata')}
  if(!body||typeof body!=='object'||Array.isArray(body))return oauthErr(400,'invalid_client_metadata');
  const ru=body.redirect_uris;
  if(!Array.isArray(ru)||ru.length<1||ru.length>5||!ru.every(u=>redirectAllowed(u,cfg.redirects)))return oauthErr(400,'invalid_redirect_uri');
  const m=body.token_endpoint_auth_method??'none';
  if(!['none','client_secret_post','client_secret_basic'].includes(m))return oauthErr(400,'invalid_client_metadata');
  if(body.grant_types!==undefined&&(!Array.isArray(body.grant_types)||body.grant_types.some(g=>!['authorization_code','refresh_token'].includes(g))))return oauthErr(400,'invalid_client_metadata');
  if(body.response_types!==undefined&&(!Array.isArray(body.response_types)||body.response_types.some(r=>r!=='code')))return oauthErr(400,'invalid_client_metadata');
  const name=typeof body.client_name==='string'?body.client_name.replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,60):'';
  const iat=sec(),client_id=seal.seal('evc',{ru,m,n:name,iat});
  log({evt:'client_registered',method:m});
  return json(201,{client_id,client_id_issued_at:iat,redirect_uris:ru,token_endpoint_auth_method:m,grant_types:['authorization_code','refresh_token'],response_types:['code'],
   ...(name?{client_name:name}:{}),...(m==='none'?{}:{client_secret:clientSecret(client_id),client_secret_expires_at:0})});
 }

 function authorizeGet(params){
  const cid=params.get('client_id'),client=seal.open('evc',cid),ru=params.get('redirect_uri');
  if(!client||!Array.isArray(client.ru))return errorPage(400,'Cliente OAuth desconhecido.');
  if(!ru||!client.ru.includes(ru)||!redirectAllowed(ru,cfg.redirects))return errorPage(400,'redirect_uri não registrado.');
  const state=params.get('state')||'';
  if(state.length>512)return errorPage(400,'state inválido.');
  if(params.get('response_type')!=='code')return redirect(ru,{error:'unsupported_response_type',state,iss:cfg.issuer});
  const cc=params.get('code_challenge')||'';
  if(params.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(cc))return redirect(ru,{error:'invalid_request',state,iss:cfg.issuer});
  const res=params.get('resource');
  if(res&&norm(res)!==norm(cfg.resource))return redirect(ru,{error:'invalid_target',state,iss:cfg.issuer});
  // Unknown requested scopes are ignored; only crm.read is ever granted (RFC 6749 §3.3).
  const txn=seal.seal('evt',{cid,ru,st:state,cc,exp:sec()+600});
  return page({txn,ru});
 }

 async function authorizePost(req){
  let f;try{f=new URLSearchParams(await readText(req,8192))}catch{return errorPage(400,'Requisição inválida.')}
  const txn=f.get('txn'),t=seal.open('evt',txn);
  if(!t||typeof t.exp!=='number'||t.exp<sec())return errorPage(400,'Autorização expirada. Reinicie a conexão no ChatGPT.');
  if(f.get('action')==='deny')return redirect(t.ru,{error:'access_denied',state:t.st,iss:cfg.issuer});
  const up=(f.get('crm_token')||'').trim();
  let v;
  try{v=await operators.verify(up,{fresh:true})}
  catch(e){
   const reason=MSG[e?.message]?e.message:'crm_unavailable';
   log({evt:'authorize_denied',reason});
   return page({txn,ru:t.ru,error:MSG[reason],status:reason==='crm_unavailable'?503:403});
  }
  const code=seal.seal('evk',{cid:t.cid,ru:t.ru,cc:t.cc,op:v.operatorId,up,uexp:v.upstreamExpiresAt,exp:sec()+60,jti:randomBytes(12).toString('base64url')});
  log({evt:'authorize_granted',op:tag(v.operatorId)});
  return redirect(t.ru,{code,state:t.st,iss:cfg.issuer});
 }

 function authClient(req,f){
  let cid=f.get('client_id'),secret=f.get('client_secret');
  const h=req.headers.get('authorization');
  if(h&&/^Basic\s+/i.test(h)){
   try{const [a,b='']=Buffer.from(h.replace(/^Basic\s+/i,''),'base64').toString('utf8').split(':');cid=decodeURIComponent(a);secret=decodeURIComponent(b)}catch{return null}
  }
  const client=seal.open('evc',cid);
  if(!client)return null;
  if(client.m!=='none'&&!safeEq(secret||'',clientSecret(cid)))return null;
  return {cid,client};
 }

 function issue({cid,op,up,uexp}){
  const t=sec(),cap=Number.isInteger(uexp)?uexp:Infinity;
  const aexp=Math.min(t+cfg.accessTtl,cap),rexp=Math.min(t+cfg.refreshTtl,cap);
  if(aexp<=t)return oauthErr(400,'invalid_grant');
  const access_token=seal.seal('eva',{cid,op,up,sc:GATEWAY_SCOPE,aud:cfg.resource,iat:t,exp:aexp});
  const refresh_token=seal.seal('evr',{cid,op,up,uexp,exp:rexp});
  log({evt:'token_issued',op:tag(op)});
  return json(200,{access_token,token_type:'Bearer',expires_in:aexp-t,refresh_token,scope:GATEWAY_SCOPE});
 }

 async function token(req){
  if(!/^application\/x-www-form-urlencoded\b/i.test(req.headers.get('content-type')||''))return oauthErr(400,'invalid_request');
  let f;try{f=new URLSearchParams(await readText(req,16384))}catch{return oauthErr(400,'invalid_request')}
  const c=authClient(req,f);
  if(!c)return oauthErr(401,'invalid_client',{'WWW-Authenticate':'Basic realm="evydencia-crm-mcp"'});
  const res=f.get('resource');
  if(res&&norm(res)!==norm(cfg.resource))return oauthErr(400,'invalid_target');
  const gt=f.get('grant_type');
  if(gt==='authorization_code'){
   const raw=f.get('code'),k=seal.open('evk',raw);
   if(!k||k.exp<sec()||k.cid!==c.cid||k.ru!==f.get('redirect_uri'))return oauthErr(400,'invalid_grant');
   const ver=f.get('code_verifier')||'';
   if(!/^[A-Za-z0-9._~-]{43,128}$/.test(ver)||!safeEq(createHash('sha256').update(ver).digest('base64url'),k.cc))return oauthErr(400,'invalid_grant');
   for(const [j,e] of usedCodes)if(e<sec())usedCodes.delete(j);
   if(usedCodes.has(k.jti))return oauthErr(400,'invalid_grant');
   usedCodes.set(k.jti,k.exp);
   return issue({cid:c.cid,op:k.op,up:k.up,uexp:k.uexp});
  }
  if(gt==='refresh_token'){
   const r=seal.open('evr',f.get('refresh_token'));
   if(!r||r.exp<sec()||r.cid!==c.cid)return oauthErr(400,'invalid_grant');
   // Re-validate upstream on every refresh: catches revocation and allowlist removal.
   let v;try{v=await operators.verify(r.up,{fresh:true})}catch(e){
    if(e?.message==='crm_unavailable')return oauthErr(503,'temporarily_unavailable');
    log({evt:'refresh_denied',reason:MSG[e?.message]?e.message:'invalid'});return oauthErr(400,'invalid_grant');
   }
   if(v.operatorId!==r.op)return oauthErr(400,'invalid_grant');
   return issue({cid:c.cid,op:r.op,up:r.up,uexp:v.upstreamExpiresAt});
  }
  return oauthErr(400,'unsupported_grant_type');
 }

 // RFC 9068-style validation for our sealed opaque token; consumed by the SDK bearer gate.
 const verifier={
  async verifyAccessToken(tok){
   const a=seal.open('eva',tok);
   if(!a||typeof a.exp!=='number'||typeof a.op!=='string')throw new OAuthError(OAuthErrorCode.InvalidToken,'invalid_token');
   if(a.exp<=sec())throw new OAuthError(OAuthErrorCode.InvalidToken,'token_expired');
   if(!cfg.allowedOperators.has(a.op))throw new OAuthError(OAuthErrorCode.InsufficientScope,'operator_not_authorized');
   let degraded=false;
   try{const v=await operators.verify(a.up);if(v.operatorId!==a.op)throw Error('upstream_token_invalid')}
   catch(e){
    if(e?.message==='upstream_token_invalid')throw new OAuthError(OAuthErrorCode.InvalidToken,'upstream_revoked');
    if(e?.message==='crm_unavailable')degraded=true; // CRM down: CRM calls fail closed anyway.
    else throw new OAuthError(OAuthErrorCode.InsufficientScope,e?.message==='operator_not_authorized'?'operator_not_authorized':'upstream_scope_rejected');
   }
   return {token:tok,clientId:a.cid,scopes:[a.sc],expiresAt:a.exp,resource:new URL(a.aud),extra:{operatorId:a.op,operatorTag:tag(a.op),upstream:a.up,degraded}};
  }
 };

 async function handle(req,path){
  if(path==='/register'&&req.method==='POST')return register(req);
  if(path==='/authorize'&&req.method==='GET')return authorizeGet(new URL(req.url).searchParams);
  if(path==='/authorize'&&req.method==='POST')return authorizePost(req);
  if(path==='/token'&&req.method==='POST')return token(req);
  return new Response(null,{status:405,headers:{Allow:path==='/authorize'?'GET, POST':'POST'}});
 }
 return {metadata,verifier,handle};
}
