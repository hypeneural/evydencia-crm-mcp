// One-time import from PRIVATE legacy aggregate calendar -> sanitized PRIVATE snapshot.
// This CLI is NOT the MCP server, makes no network requests and never prints data.
import {open,realpath,stat,chmod,unlink} from 'node:fs/promises';
import {resolve,isAbsolute,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLegacyHistoryFile} from '../src/legacy-historical.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const inside=(a,b)=>{const r=relative(a,b);return r===''||(!r.startsWith('..')&&!isAbsolute(r))};
const options={};
for(const arg of process.argv.slice(2)){
 const m=/^--(source|output|cutoff|sha256)=(.+)$/.exec(arg);
 if(!m||Object.hasOwn(options,m[1])){console.error('HISTORY_IMPORT_BLOCKED invalid_options');process.exit(2)}
 options[m[1]]=m[2];
}
if(!options.source||!options.output||!options.cutoff||!isAbsolute(options.source)||
   !isAbsolute(options.output)||!options.output.toLowerCase().endsWith('.json')){
 console.error('HISTORY_IMPORT_BLOCKED use --source=ABSOLUTE_JSON --output=ABSOLUTE_PRIVATE_JSON --cutoff=MM-DD');
 process.exit(2);
}
try{
 const sourceFile=await realpath(options.source);
 const out=resolve(options.output),parent=await realpath(dirname(out));
 const dstStat=await stat(parent);
 if(!dstStat.isDirectory()||inside(ROOT,out)||inside(dirname(sourceFile),out)||sourceFile===out)
  throw Error('unsafe_output_path');
 if(process.platform!=='win32'&&(dstStat.mode&0o077)!==0)throw Error('private_directory_permissions');
 const result=await readLegacyHistoryFile(sourceFile,{cutoff:options.cutoff});
 if(options.sha256 && options.sha256.toLowerCase()!==result.source_sha256)throw Error('hash_mismatch');
 const encoded=JSON.stringify(result,null,2)+'\n';
 if(Buffer.byteLength(encoded)>32768)throw Error('snapshot_oversize');
 let handle;
 try{
  handle=await open(out,'wx',0o600); // refuse accidental rewrite of frozen snapshot
  await handle.writeFile(encoded,'utf8');
  await handle.sync();
 }catch(e){
  if(handle){await handle.close();handle=null;await unlink(out).catch(()=>{})}
  throw e;
 }finally{if(handle)await handle.close()}
 if(process.platform!=='win32'){
  await chmod(out,0o600);
  const f=await stat(out);
  if((f.mode&0o077)!==0)throw Error('private_file_permissions');
 }
 console.log('HISTORY_IMPORT_PASS years=2021-2025 cutoff='+result.cutoff_mm_dd+
  ' archive_sha256='+result.source_sha256+
  ' canonical_comparison_allowed=false; private aggregate only');
}catch(e){
 // No private paths, numbers or raw error contents in console.
 console.error('HISTORY_IMPORT_BLOCKED invalid_archive_or_private_output; review locally without copying raw data');
 process.exitCode=1;
}
