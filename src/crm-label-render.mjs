// Out-of-process adapter for the exact deployed Laravel OrderLabelService image.
// It is not an HTTP endpoint; allowed only behind the authenticated MCP print tool.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT=resolve(dirname(fileURLToPath(import.meta.url)),'../scripts/crm-label-render-bridge.php');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STDOUT=4*1024*1024+4096;
const err=code=>new Error('crm_label_'+code);
const hash=b=>createHash('sha256').update(b).digest('hex');
export function validateCanonicalLabel(raw,{orderUuid,orderId}={}){
 if(!raw||raw.error)throw err(raw?.error?.replace(/^crm_label_/,'')||'invalid_render');
 if(!UUID.test(orderUuid||'')||!Number.isSafeInteger(orderId)||orderId<1)throw err('invalid_order');
 if(raw.order_uuid!==orderUuid||raw.order_id!==orderId||
   raw.width_mm!==100||raw.height_mm!==40||
   !Number.isSafeInteger(raw.width_px)||!Number.isSafeInteger(raw.height_px)||
   Math.abs(raw.width_px/raw.height_px-2.5)>.035||
   typeof raw.png_base64!=='string'||raw.png_base64.length>4*1024*1024||
   typeof raw.png_sha256!=='string'||!/^[0-9a-f]{64}$/.test(raw.png_sha256))throw err('invalid_render_contract');
 const png=Buffer.from(raw.png_base64,'base64');
 if(png.length<60||png.length>3*1024*1024||png.toString('base64')!==raw.png_base64||
  png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||hash(png)!==raw.png_sha256)throw err('invalid_png');
 return Object.freeze({label_source:'crm_canonical',label_png_base64:raw.png_base64,label_png_sha256:raw.png_sha256});
}
export async function renderCanonicalCrmLabel({orderUuid,orderId,env=process.env,spawnFn=spawn,timeoutMs=12000}={}){
 if(env.EVYD_CRM_LABEL_RENDER_ENABLED!=='1')throw err('disabled');
 if(!UUID.test(orderUuid||'')||!Number.isSafeInteger(orderId)||orderId<1)throw err('invalid_order');
 const crmPath=env.EVYD_CRM_APP_PATH||'/var/www/evydencia/current';
 if(!existsSync(resolve(crmPath,'vendor/autoload.php'))||!existsSync(SCRIPT))throw err('bridge_unavailable');
 return await new Promise((done,reject)=>{
  let stdout='',size=0,closed=false;
  const child=spawnFn('php',[SCRIPT],{
   cwd:crmPath,env:{...env,EVYD_CRM_APP_PATH:crmPath},stdio:['pipe','pipe','ignore'],
   windowsHide:true
  });
  const finish=(e,result)=>{if(closed)return;closed=true;clearTimeout(timer);if(e)reject(e);else done(result)};
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(err('timeout'))},Math.min(20000,Math.max(1000,timeoutMs)));
  child.on('error',()=>finish(err('bridge_unavailable')));
  child.stdout.on('data',chunk=>{
   size+=chunk.length;
   if(size>MAX_STDOUT){child.kill('SIGKILL');finish(err('too_large'));return}
   stdout+=chunk.toString('utf8');
  });
  child.on('close',code=>{
   if(closed)return;
   if(code!==0){
    try{
     const parsed=JSON.parse(stdout);
     if(parsed?.error && typeof parsed.error==='string'){
      finish(err(parsed.error.replace(/^crm_label_/,'')));
      return;
     }
    }catch{}
    finish(err('render_unavailable'));
    return;
   }
   try{finish(null,validateCanonicalLabel(JSON.parse(stdout),{orderUuid,orderId}))}
   catch{finish(err('invalid_render_contract'))}
  });
  child.stdin.end(JSON.stringify({order_uuid:orderUuid}));
 });
}
