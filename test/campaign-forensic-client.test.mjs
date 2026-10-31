import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignForensicClient} from '../src/campaign-forensic-client.mjs';

const date='2026-10-31T14:00:00Z';
const envelope=data=>Response.json({schema_version:'1.0',generated_at:date,data});
const activityData={
 contract_version:'campaign-audit.v1',source:'CRM_CANONICAL_READ_ONLY',
 contact_id:101,scheduled_id:201,campaign_id:415,
 plan:{source:'captured',stage_count:24,stages:[]},
 progress:{state:'in_progress',verified_complete:false},
 channels:[{channel:'voice',provider:'smartvoice',delivered:0,failed:1}],
 coverage:{plan:'captured',event_history:'not_queried'},activity_url:'/gestao/campanhas/atividades/201/detalhes'
};
const evidenceData=(kind,channel=null)=>({
 contract_version:'campaign-audit.v1',contact_id:101,kind,channel,
 rows:[{id:123,status:'provider_accepted'}],has_more:true,next_cursor:'123',
 coverage:'partial_more_pages'
});
const base='https://crm.example.test';
const token='synthetic-operator-bearer';
const client=fetchFn=>createCampaignForensicClient({baseUrl:base,token,fetchFn,timeoutMs:500});

test('activity is GET only, token scoped, and returns canonical plan',async()=>{
 const seen=[];
 const c=client(async(url,options)=>{
  seen.push({url:String(url),method:options.method,authorization:options.headers.Authorization,redirect:options.redirect});
  return envelope(activityData);
 });
 const a=await c.activity(101);
 assert.equal(a.plan.stage_count,24);
 assert.equal(a.progress.verified_complete,false);
 assert.equal(a.coverage.event_history,'not_queried');
 assert.deepEqual(seen,[{url:base+'/api/v1/extension/campaign-audit/activities/101',
  method:'GET',authorization:'Bearer '+token,redirect:'error'}]);
});

test('evidence cursor uses query only, with channel and no loss of has_more',async()=>{
 const seen=[];
 const c=client(async(url,options)=>{
  seen.push({url:new URL(url).searchParams,method:options.method});
  return envelope(evidenceData('items','voice'));
 });
 const a=await c.evidence(101,{kind:'items',channel:'voice',limit:10,cursor:'456'});
 assert.equal(a.rows.length,1);
 assert.equal(a.has_more,true);
 assert.equal(a.next_cursor,'123');
 assert.equal(seen[0].url.get('kind'),'items');
 assert.equal(seen[0].url.get('channel'),'voice');
 assert.equal(seen[0].url.get('cursor'),'456');
 assert.equal(seen[0].method,'GET');
});

test('rejects malformed IDs, unsafe filters and decision channel before any HTTP',async()=>{
 let requests=0;
 const c=client(async()=>{requests++;return envelope(activityData)});
 for(const id of [0,-1,1.1,Number.MAX_SAFE_INTEGER+1]){
  await assert.rejects(c.activity(id),/invalid_contact_id/);
 }
 await assert.rejects(c.evidence(101,{kind:'items',cursor:'1 OR 1=1'}),/invalid_filters/);
 await assert.rejects(c.evidence(101,{kind:'decisions',channel:'voice'}),/invalid_filters/);
 await assert.rejects(c.evidence(101,{kind:'items',limit:101}),/invalid_filters/);
 assert.equal(requests,0);
});

test('rejects forbidden and unavailable upstream without claiming no send',async()=>{
 for(const [status,expected] of [[403,'forbidden'],[503,'disabled_or_unavailable'],[429,'rate_limited']]){
  const c=client(async()=>Response.json({error:'synthetic'},{status}));
  await assert.rejects(c.activity(101),new RegExp(expected));
 }
});

test('rejects contract drift, oversized responses, and evidence without cursor',async()=>{
 const drift=client(async()=>envelope({...activityData,contract_version:'wrong'}));
 await assert.rejects(drift.activity(101),/contract_invalid/);
 const oversized=client(async()=>new Response('{}',{headers:{
  'Content-Type':'application/json','Content-Length':String(900000)
 }}));
 await assert.rejects(oversized.activity(101),/response_too_large/);
 const incomplete=client(async()=>envelope({...evidenceData('events'),next_cursor:null}));
 await assert.rejects(incomplete.evidence(101,{kind:'events'}),/contract_invalid/);
});

test('activity outside returned contact ID is rejected',async()=>{
 const c=client(async()=>envelope({...activityData,contact_id:999}));
 await assert.rejects(c.activity(101),/contract_invalid/);
});

test('global search is GET-only, cursor bounded and pages retain incompleteness',async()=>{
 let seen=null;
 const fx={contract_version:'campaign-audit.v1',source:'CRM_CANONICAL_READ_ONLY',
  filters:{campaign_id:415,limit:10},rows:[{contact_id:88,scheduled_id:99}],
  has_more:true,next_cursor:'88',data_quality:{phone_lookup:'not_included'}};
 const reader=client(async(url,opts)=>{seen={url:String(url),method:opts.method};return envelope(fx)});
 const data=await reader.search({campaign_id:415,from_date:'2026-10-01',limit:10,cursor:'99'});
 assert.equal(data.has_more,true);
 assert.equal(data.next_cursor,'88');
 assert.equal(seen.method,'GET');
 assert.match(seen.url,/campaign_id=415/);
 assert.match(seen.url,/from_date=2026-10-01/);
 await assert.rejects(reader.search({campaign_id:415,from_date:'2026-02-30'}),/invalid_filters/);
 await assert.rejects(reader.search({campaign_id:415,cursor:'5 OR 5=5'}),/invalid_filters/);
});

test('batch phone lookup uses only fixed read-only POST and rejects oversize inputs',async()=>{
 const seen=[];
 const reader=client(async(url,opts)=>{
  seen.push({url:String(url),method:opts.method,body:JSON.parse(opts.body)});
  return envelope({contract_version:'campaign-audit.v1',source:'CRM_CANONICAL_READ_ONLY',
   inputs:[{index:0,status:'normalized'}],rows:[],
   has_more:false,next_cursor:null,coverage:{matching_rows:'page_exhausted'}});
 });
 const data=await reader.lookup({telefones:['48999990001'],campaign_id:415,limit:10});
 assert.equal(data.coverage.matching_rows,'page_exhausted');
 assert.equal(seen.length,1);
 assert.equal(seen[0].method,'POST');
 assert.equal(new URL(seen[0].url).pathname,'/api/v1/extension/campaign-audit/lookup');
 assert.deepEqual(seen[0].body.telefones,['48999990001']);
 await assert.rejects(reader.lookup({telefones:Array(51).fill('48999990001')}),/invalid_filters/);
 assert.equal(seen.length,1);
});
