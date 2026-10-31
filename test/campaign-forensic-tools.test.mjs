import test from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod/v4';
import {registerCampaignForensicTools,CAMPAIGN_FORENSIC_TOOL_NAMES} from '../src/campaign-forensic-tools.mjs';

const activity={
 contract_version:'campaign-audit.v1',contact_id:11,campaign_id:415,
 plan:{source:'captured',stages:[]},progress:{state:'in_progress'},
 channels:[{channel:'voice',provider:'smartvoice',items:1,delivered:0,failed:1}],
 coverage:{plan:'captured'},activity_url:'/gestao/campanhas/atividades/22/detalhes'
};
const create=()=>{
 const registered=new Map(),calls=[];
 const client={
  activity:async(id)=>{calls.push(['activity',id]);return activity;},
  lookup:async(filters)=>({contract_version:'campaign-audit.v1',
   source:'CRM_CANONICAL_READ_ONLY',
   inputs:filters.telefones.map((p,i)=>({index:i,status:'normalized'})),
   rows:[],has_more:false,next_cursor:null,
   coverage:{matching_rows:'page_exhausted',message_delivery:'not_queried'}}),
  search:async(filters)=>({contract_version:'campaign-audit.v1',
   source:'CRM_CANONICAL_READ_ONLY',filters,rows:[
    {contact_id:101,scheduled_id:201,campaign_id:415,contact_status:'done',
     scheduled_status:'completed',activity_url:'/gestao/campanhas/atividades/201/detalhes'}
   ],has_more:false,next_cursor:null,data_quality:{phone_lookup:'not_included'}}),
  health:async()=>({contract_version:'campaign-audit.v1',source:'CRM_PASSIVE_OPERATIONAL_EVIDENCE',
   window_hours:24,provider_accounts:[],coverage:{provider_current_reachability:'not_probed'}}),
  evidence:async(id,opts)=>{
   calls.push(['evidence',id,opts]);
   return {contract_version:'campaign-audit.v1',contact_id:id,kind:opts.kind,
    channel:opts.channel??null,rows:opts.kind==='items'?[
     {id:91,provider:'smartvoice',status:'failed',outbox_status:'failed',
      error_code:'business_attempt_already_registered',provider_message_id:'synthetic-command-91'}
    ]:[{id:100,delivery_item_id:91,attempt_number:1,http_status:409,error_code:'business_attempt_already_registered'}],
    has_more:false,next_cursor:null,coverage:'page_exhausted'};
  }
 };
 const reg=(name,title,description,input,output,handler,annotations,extra)=>
  registered.set(name,{title,description,input,output,handler,annotations,extra});
 registerCampaignForensicTools({reg,client,z,readAnnotations:
  {readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},requiredScope:'crm.read'});
 return {registered,calls};
};

test('registers six explicitly read-only, bounded tools',()=>{
 const r=create();
 assert.deepEqual([...r.registered.keys()],CAMPAIGN_FORENSIC_TOOL_NAMES);
 for(const t of r.registered.values()){
  assert.equal(t.annotations.readOnlyHint,true);
  assert.equal(t.annotations.openWorldHint,false);
  assert.deepEqual(t.extra.requiredScopes,['crm.read']);
 }
});

test('voice diagnostic does not imply audio completed or current provider health',async()=>{
 const {registered,calls}=create();
 const tool=registered.get('crm_campanha_voz_diagnostico');
 const data=await tool.handler({contact_id:11});
 assert.equal(data.provider_health,'not_queried');
 assert.equal(data.audio_completed,'not_verified_from_item_summary');
 assert.equal(data.latest_recorded_voice_attempt.http_status,409);
 assert.equal(data.latest_attempt_matches_latest_item,true);
 assert.match(data.resumo_gestor,/409/);
 assert.match(data.proxima_verificacao,/Conciliar/);
 assert.equal(data.latest_recorded_voice_item.status,'failed');
 assert.deepEqual(calls.map(x=>x[0]),['activity','evidence','evidence']);
 assert.equal(calls[1][2].channel,'voice');
 assert.equal(calls[2][2].channel,'voice');
 assert.equal(tool.output.safeParse(data).success,true);
});

test('activity detail preserves source coverage',async()=>{
 const {registered}=create();
 const t=registered.get('crm_campanha_atividade_detalhe');
 const data=await t.handler({contact_id:11});
 assert.equal(data.progress.state,'in_progress');
 assert.equal(t.output.safeParse(data).success,true);
});

test('operational health is passive and never claims a live connectivity probe',async()=>{
 const {registered}=create();
 const t=registered.get('crm_campanhas_saude_operacional');
 const r=await t.handler({});
 assert.equal(r.coverage.provider_current_reachability,'not_probed');
 assert.equal(t.output.safeParse(r).success,true);
});

test('global search reports recorded status without claiming successful delivery',async()=>{
 const {registered}=create();
 const t=registered.get('crm_campanhas_execucoes_buscar');
 const r=await t.handler({campaign_id:415,limit:20});
 assert.equal(r.rows[0].scheduled_status,'completed');
 assert.equal(r.data_quality.phone_lookup,'not_included');
 assert.equal(r.has_more,false);
 assert.equal(t.output.safeParse(r).success,true);
});

test('phone lookup does not claim delivery and retains input references',async()=>{
 const {registered}=create();
 const t=registered.get('crm_campanhas_telefones_consultar_lote');
 const r=await t.handler({telefones:['48999990001','48999990001'],limit:20});
 assert.equal(r.inputs.length,2);
 assert.equal(r.rows.length,0);
 assert.equal(r.coverage.message_delivery,'not_queried');
 assert.equal(t.output.safeParse(r).success,true);
});
