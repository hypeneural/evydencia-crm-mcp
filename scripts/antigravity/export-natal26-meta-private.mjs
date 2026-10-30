#!/usr/bin/env node
// Operator-only LOCAL-on-VPS export. No HTTP server, no Meta upload, no writes to CRM.
// Execute as authorized MCP service user with existing EVYD_CRM_APP_PATH and Laravel config.
// Never put PII, private paths or tokens in stdout / repository.
import {execFileSync} from 'node:child_process';
import {mkdir,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {buildMetaAudienceCsv,assertMetaAudienceUploadReady} from '../../src/meta-audience-csv.mjs';
import {validateMetaCustomerListCsv} from '../../src/meta-audience-csv-validator.mjs';
import {persistMetaAudienceCsv} from '../../src/meta-audience-private-write.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const rule='NO_VALID_NATAL_2026_PURCHASE';
const folder=process.env.META_PRIVATE_CSV_DIR;
try {
 if(process.argv.length!==2||!folder||!isAbsolute(folder))throw Error('AUDIENCE_PRIVATE_EXPORT_NOT_CONFIGURED');
 await mkdir(folder,{recursive:true,mode:0o700});
 const [dir,root]=await Promise.all([realpath(folder),realpath(repo)]);
 const r=relative(root,dir),stat=await lstat(dir);
 if((r===''||(!r.startsWith('..')&&!isAbsolute(r)))||!stat.isDirectory()||stat.isSymbolicLink()||(process.platform!=='win32'&&(stat.mode&0o077)!==0))throw Error('AUDIENCE_PRIVATE_EXPORT_NOT_CONFIGURED');
 const input=JSON.stringify({action:'meta.audience.read',year:2026,purchase_rule:rule});
 const response=execFileSync('php',[resolve(repo,'scripts/crm-forensic-bridge.php'),input],{
  env:process.env,encoding:'utf8',maxBuffer:24*1024*1024,timeout:60000,stdio:['ignore','pipe','pipe']
 });
 const raw=JSON.parse(response);
 if(raw.available===false||!Array.isArray(raw.records)||raw.coverage?.purchase_rule!==rule)throw Error('AUDIENCE_SOURCE_INCOMPLETE');
 const built=buildMetaAudienceCsv({records:raw.records,coverage:raw.coverage});
 assertMetaAudienceUploadReady(built);
 const checked=validateMetaCustomerListCsv(built.csv);
 const name='meta-audience-natal2026-'+randomUUID()+'.csv';
 const destination=resolve(dir,name);
 await persistMetaAudienceCsv(destination,built.csv);
 const receipt={status:'PASS',cohort:'natal_2026_nonbuyers',purchase_rule:rule,
  as_of:raw.coverage.as_of,rows:checked.rows,eligible_people:built.counts.eligible_people,
  unique_phones:checked.unique_phones,rows_with_email:checked.rows_with_email,
  sha256:checked.sha256,private_filename:name,counts:built.counts,
  sql_count:raw.audience_query_telemetry?.sql_count??null,
  sql_ms:raw.audience_query_telemetry?.sql_ms??null,
  contains_personal_data:false,meta_uploaded:false};
 console.log(JSON.stringify(receipt,null,2));
} catch(error) {
 const allowed=new Set(['AUDIENCE_PRIVATE_EXPORT_NOT_CONFIGURED','AUDIENCE_SOURCE_INCOMPLETE','META_CSV_NOT_READY_FOR_UPLOAD','EXPORT_BLOCKED_INCOMPLETE_OR_UNVERIFIED_COVERAGE']);
 console.error(allowed.has(error?.message)?error.message:'AUDIENCE_EXPORT_FAILED');
 process.exitCode=1;
}
