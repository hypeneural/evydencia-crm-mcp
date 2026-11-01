// Periodic, process-local retention for private Meta Audience CSVs.
// Independent from exports and rearmed after process restarts. Files are
// selected exclusively by purgeExpiredAudienceExports, never by globbing.
// No CRM/database/network calls; no filenames, paths or personal data logged.
import {isAbsolute} from 'node:path';
import {purgeExpiredAudienceExports} from './meta-audience-private-files.mjs';

export const META_AUDIENCE_JANITOR_INTERVAL_MS=15*60*1000;
export const META_AUDIENCE_CSV_TTL_MS=60*60*1000;

export function startMetaAudienceJanitor(directory,{
 intervalMs=META_AUDIENCE_JANITOR_INTERVAL_MS,
 ttlMs=META_AUDIENCE_CSV_TTL_MS,
 purge=purgeExpiredAudienceExports,
 onError=()=>{},
 onResult=()=>{},
 setIntervalFn=setInterval,
 clearIntervalFn=clearInterval,
 startOnBoot=true,
}={}){
 if(typeof directory!=='string'||!isAbsolute(directory)
    ||!Number.isSafeInteger(intervalMs)||intervalMs<1000||intervalMs>24*60*60*1000
    ||!Number.isSafeInteger(ttlMs)||ttlMs<60_000||ttlMs>24*60*60*1000){
  throw Error('crm_meta_audience_invalid_retention_policy');
 }
 let stopped=false,running=false;
 const sweep=async()=>{
  if(stopped||running)return {status:stopped?'stopped':'busy'};
  running=true;
  try{
   const result=await purge(directory,{ttlMs,dryRun:false});
   // Aggregate count only, no PII and no file identifiers.
   onResult({inspected:result.inspected,expired:result.expired,deleted:result.deleted});
   return {status:'ok',deleted:result.deleted};
  }catch{
   // Never serialize errors from the filesystem: they may contain private paths.
   onError('crm_meta_audience_retention_sweep_failed');
   return {status:'error'};
  }finally{
   running=false;
  }
 };
 const timer=setIntervalFn(()=>{void sweep()},intervalMs);
 timer?.unref?.(); // Never keep the process alive just for maintenance.
 if(startOnBoot)void sweep();
 return {
  sweep,
  stop(){
   if(stopped)return;
   stopped=true;
   clearIntervalFn(timer);
  }
 };
}
