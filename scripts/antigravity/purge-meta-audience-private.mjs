#!/usr/bin/env node
// On-host PRIVATE Meta Audience CSV janitor. Dry-run unless --apply is explicit.
// Does not connect to CRM, Meta, network or other VPS services. No PII logs.
import {purgeExpiredAudienceExports} from '../../src/meta-audience-private-files.mjs';
import {isAbsolute} from 'node:path';

const args=process.argv.slice(2);
const apply=args.length===1&&args[0]==='--apply';
if(args.length>1||(args.length===1&&!apply)){
  console.error('META_AUDIENCE_JANITOR_USAGE: node scripts/antigravity/purge-meta-audience-private.mjs [--apply]');
  process.exitCode=2;
}else{
  const directory=process.env.META_PRIVATE_CSV_DIR;
  if(typeof directory!=='string'||!isAbsolute(directory)){
    console.error('META_AUDIENCE_JANITOR_BLOCKED: absolute private directory not configured');
    process.exitCode=2;
  }else{
    try{
      const result=await purgeExpiredAudienceExports(directory,{dryRun:!apply,ttlMs:60*60*1000});
      console.log(JSON.stringify({
        status:'ok',mode:apply?'apply':'dry_run',inspected:result.inspected,
        expired:result.expired,deleted:result.deleted,
        contains_personal_data:false,
      }));
    }catch{
      console.error('META_AUDIENCE_JANITOR_BLOCKED: directory inaccessible or insecure');
      process.exitCode=1;
    }
  }
}
