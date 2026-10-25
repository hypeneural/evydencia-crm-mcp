// Operator-only legacy API probe. Does not register tools or expose request data in output.
// The legacy integration token can also mutate CRM upstream: NEVER put it in the MOCK tunnel.
import {legacyReadClient} from '../src/legacy-api-read.mjs';
const params=Object.fromEntries(process.argv.slice(2).map(s=>{const m=/^--([a-z-]+)=(.+)$/.exec(s);if(!m)throw Error('invalid_argument');return [m[1],m[2]]}));
if(process.env.EVYD_ALLOW_LEGACY_GET!=='1'||!process.env.CRM_BASE_URL||
 typeof process.env.EVYDENCIA_LEGACY_TOKEN!=='string'||process.env.EVYDENCIA_LEGACY_TOKEN.length<12){
 console.error('LEGACY_READ_BLOCKED explicit_local_optin_and_legacy_token_required');process.exit(2)
}
try{
 const client=legacyReadClient({baseUrl:process.env.CRM_BASE_URL,token:process.env.EVYDENCIA_LEGACY_TOKEN});
 let result;
 if(params.mode==='search'){
  const filters={};
  if(params.name)filters['customer.name']=params.name;
  if(params.status)filters['order.status']=params.status;
  if(params.product)filters['product.slug']=params.product;
  if(params.start)filters['order.created-start']=params.start;
  if(params.end)filters['order.created-end']=params.end;
  result=await client.search(filters);
 }else if(params.mode==='detail'&&params.uuid){result=await client.detail(params.uuid)}
 else throw Error('invalid_mode');
 console.log(JSON.stringify({status:'LEGACY_GET_PASS',mode:params.mode,source:result.source,
  projected_count:result.orders?.length??(result.order?1:0),
  has_more:result.has_more??null,token_exposure:false,
  warning:'GET isolado, sem prova de venda canônica, não conectado ao ChatGPT'}));
}catch(e){
 console.error('LEGACY_READ_BLOCKED '+(/^(legacy_read_|invalid_)/.test(e.message)?e.message:'request_unavailable'));
 process.exitCode=1;
}
