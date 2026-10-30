#!/usr/bin/env node
/**
 * READ-ONLY: same Node->PHP bridge used by crm_solicitar_impressao_etiqueta.
 * This CLI NEVER calls printserverClient, enqueues a job or changes CRM status.
 * Input on stdin: {"order_uuid":"<uuid>","order_id":123}. No PII in output.
 * Invoke under the same user/environment as the live gateway on the MCP VPS.
 */
import {createHash} from 'node:crypto';
import {renderCanonicalCrmLabel} from '../src/crm-label-render.mjs';

async function run(){
 let input=Buffer.alloc(0);
 for await (const chunk of process.stdin){
  input=Buffer.concat([input,Buffer.from(chunk)]);
  if(input.length>512)throw Error('label_probe_input_too_large');
 }
 let row;
 try{row=JSON.parse(input.toString('utf8'))}catch{throw Error('label_probe_invalid_json')}
 if(!row||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.order_uuid||'')||
    !Number.isSafeInteger(row.order_id)||row.order_id<1)throw Error('label_probe_invalid_input');
 if(process.env.EVYD_CRM_LABEL_RENDER_ENABLED!=='1')throw Error('label_probe_renderer_disabled');
 const result=await renderCanonicalCrmLabel({orderUuid:row.order_uuid,orderId:row.order_id,env:process.env});
 const png=Buffer.from(result.label_png_base64,'base64');
 if(png.length<60 || png.length>3*1024*1024||
    createHash('sha256').update(png).digest('hex')!==result.label_png_sha256){
  throw Error('label_probe_invalid_png');
 }
 return {source:'CRM_LABEL_NODE_READONLY_PROBE',ok:true,render_source:result.label_source,
  png_bytes:png.length,sha256_verified:true,changes_applied:false,
  broker_called:false,job_created:false,printed_physically:false};
}
try{
 const result=await run();
 process.stdout.write(JSON.stringify(result)+'\n');
}catch(error){
 const message=String(error?.message||'');
 const known=/^(crm_label_[a-z_]+|label_probe_[a-z_]+)$/;
 process.stdout.write(JSON.stringify({source:'CRM_LABEL_NODE_READONLY_PROBE',ok:false,
  error_code:known.test(message)?message:'label_probe_unknown_error',
  changes_applied:false,broker_called:false,job_created:false,printed_physically:false})+'\n');
 process.exitCode=1;
}
