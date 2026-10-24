// Modo exclusivamente sintético. Nenhuma requisição HTTP é feita por este módulo.
import { readFile } from 'node:fs/promises';
import { customerProjection, historyProjection, proposalProjection, phone, slug, dates } from './core.mjs';
const MOCK_MATCHED='48999990001';
const MOCK_NOT_FOUND='48999990002';
const MOCK_AMBIGUOUS='48999990003';
const MOCK_PURCHASED='48999990004';
const mark = x => ({mock:true,source:'fixture',...x});
async function fixture(file){return JSON.parse(await readFile(new URL('../fixtures/'+file+'.json',import.meta.url),'utf8'))}
function scenario(input){const n=phone(input);return n===MOCK_MATCHED?'matched':n===MOCK_AMBIGUOUS?'ambiguous':n===MOCK_PURCHASED?'purchased':'not_found'}
export function mockScenarios(){return mark({scenarios:[{phone:MOCK_MATCHED,description:'Cliente fictício, dois pedidos e prévia elegível'},{phone:MOCK_NOT_FOUND,description:'Telefone não encontrado'},{phone:MOCK_AMBIGUOUS,description:'Mais de um cadastro; bloqueia prévia'},{phone:MOCK_PURCHASED,description:'Já comprou Natal 2026; bloqueia prévia'}],warning:'TODOS OS DADOS SÃO FICTÍCIOS. NENHUM ENVIO OU RESERVA É REAL.'})}
export function mockCrmClient(){
 return {
  status:async()=>mark({status:'ok',message:'MCP em modo mock; CRM não consultado'}),
  campaign:async s=>{if(slug(s)!=='natal')throw Error('crm_http_404');const d=(await fixture('campaign')).data;return mark({campaign:{slug:d.slug,name:d.name,period:d.period},products:d.products.map(x=>({slug:x.slug,code:x.code,name:x.name,durationMinutes:x.durationMinutes}))})},
  availability:async(c,p,a,b)=>{dates(a,b);if(slug(c)!=='natal'||!['ho-ho-ho','natal-mini'].includes(slug(p)))throw Error('crm_http_404');const d=(await fixture('availability')).data;return mark({campaign:d.campaign,package:{...d.product,slug:p},days:[{date:a,times:d.slotsByDate[0].slots.map(x=>x.time)}],calendar:{checked:false,hasError:false},pagination:{currentPage:1,totalDays:1,hasNextPage:false},warning:'Horários sintéticos, não representam agenda real'})},
  bootstrap:async()=>mark({operator:{id:0,name:'Operador MOCK'},server:{timezone:'America/Sao_Paulo',api_version:'1.0'},features:{proposals:{enabled:true},natal_2026:{enabled:true,reference_year:2026}},token:{abilities:['extension:bootstrap','extension:customer-read','extension:proposal-read'],expires_at:null}}),
  customer:async p=>{const s=scenario(p);if(s==='ambiguous')return mark(customerProjection({data:{lookup:{status:'ambiguous',match_count:2}}}));if(s==='not_found')return mark(customerProjection({data:{lookup:{status:'not_found',match_count:0}}}));const raw=await fixture('customer-context');if(s==='purchased'){raw.data.natal_2026={purchased:true,mode:'operations'};raw.data.capabilities.proposal_preview={allowed:false,reason:'NATAL_2026_ALREADY_PURCHASED'};raw.data.capabilities.proposal_schedule={allowed:false,reason:'NATAL_2026_ALREADY_PURCHASED'}}return mark(customerProjection(raw))},
  history:async(p,page=1)=>{const s=scenario(p);if(!Number.isInteger(page)||page<1||page>100)throw Error('invalid_page');if(s==='ambiguous'||s==='not_found')return mark(historyProjection({data:{lookup:{status:s,match_count:s==='ambiguous'?2:0}}}));const raw=await fixture('customer-360');if(s==='purchased')raw.data.natal_2026.purchased=true;if(page>1){raw.data.orders=[];raw.data.history.page=page;raw.data.history.has_more=false}return mark(historyProjection(raw))},
  preview:async(p,name)=>{const s=scenario(p);if(s==='ambiguous')throw Error('crm_http_409');if(s==='purchased')throw Error('crm_http_403');const raw=await fixture('proposal-preview');if(s==='not_found'){raw.data.customer={status:'phone_match_none',label:'Não é cliente',first_name:null};raw.data.suggested_name=null;raw.data.selection={variant:'without_name',label:'Sem nome',name_source:'none'};raw.data.message_preview='Prévia FICTÍCIA sem personalização. Nenhuma mensagem será enviada.'}else if(name){if(typeof name!=='string'||name.length>80||/[;\r\n]/.test(name))throw Error('invalid_name');raw.data.suggested_name=name;raw.data.message_preview='Olá, '+name+'! Prévia FICTÍCIA. Nenhuma mensagem será enviada.'}return mark(proposalProjection(raw))}
 };
}
