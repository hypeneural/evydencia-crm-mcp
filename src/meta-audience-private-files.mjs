// Private Meta Audience CSV retention — only files minted by this feature.
// Never emit filenames, full paths, file contents, phone, email or customer info.
// Used on every export, and suitable for local/operator scheduled janitor.
import {lstat,readdir,unlink} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';

const FILE_RE=/^meta-audience-natal2026-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$/i;
const HOUR_MS=60*60*1000;

export async function purgeExpiredAudienceExports(directory,{nowMs=Date.now(),ttlMs=HOUR_MS}={}){
  if(typeof directory!=='string'||!isAbsolute(directory)
      ||!Number.isFinite(nowMs)||!Number.isSafeInteger(ttlMs)
      ||ttlMs<60_000||ttlMs>24*HOUR_MS){
    throw Error('crm_meta_audience_invalid_retention_policy');
  }
  const root=await lstat(directory);
  if(!root.isDirectory()||root.isSymbolicLink()
      ||(process.platform!=='win32'&&(root.mode&0o077)!==0)){
    throw Error('crm_meta_audience_private_directory_insecure');
  }
  let inspected=0,deleted=0;
  const entries=await readdir(directory,{withFileTypes:true});
  for(const entry of entries){
    if(!FILE_RE.test(entry.name))continue;
    inspected++;
    // Only delete actual regular CSV files, never symlinks/directories.
    const child=join(directory,entry.name);
    const st=await lstat(child).catch(()=>null);
    if(!st||!st.isFile()||st.isSymbolicLink())continue;
    if(nowMs-st.mtimeMs<ttlMs)continue;
    await unlink(child);
    deleted++;
  }
  return {inspected,deleted,contains_personal_data:false};
}
