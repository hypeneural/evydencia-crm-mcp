#!/usr/bin/env node
// Local-only verification of Meta audience CSV after SFTP download. No PII logs.
// Usage: node scripts/antigravity/verify-meta-audience-download.mjs --file PATH
//   --sha256 DIGEST --rows N --people N --emails N
import {readFile} from 'node:fs/promises';
import {auditLocalMetaCsv} from '../../src/meta-audience-csv-audit.mjs';

const args=process.argv.slice(2);
const opts={};
for(let i=0;i<args.length;i+=2){
 if(!args[i]?.startsWith('--')||args[i+1]===undefined||opts[args[i]]!==undefined){
  throw Error('META_CSV_AUDIT_INVALID_ARGS');
 }
 opts[args[i]]=args[i+1];
}
const expected=['--file','--sha256','--rows','--people','--emails'];
if(Object.keys(opts).length!==expected.length||expected.some(k=>!opts[k])){
 console.error('META_CSV_AUDIT_USAGE: --file PATH --sha256 DIGEST --rows N --people N --emails N');
 process.exitCode=2;
}else{
 try{
  const csv=await readFile(opts['--file'],'utf8');
  const result=auditLocalMetaCsv(csv,{
   sha256:opts['--sha256'],rows:Number(opts['--rows']),
   eligible_people:Number(opts['--people']),
   rows_with_email:Number(opts['--emails'])
  });
  console.log(JSON.stringify(result));
 }catch(e){
  // Never report file path or actual CSV in errors.
  const code=/^META_CSV_[A-Z0-9_]+$/.test(e?.message||'')
   ?e.message:'META_CSV_AUDIT_FAILED';
  console.error(code);
  process.exitCode=1;
 }
}
