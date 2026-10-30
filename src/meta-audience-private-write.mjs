// Private CSV write contract: create-only, 0600, fsync and remove partial files.
// No server paths, contact fields or source errors are returned to the MCP tool.
// Does NOT connect to CRM, Meta, network or other services.
import {open,unlink} from 'node:fs/promises';
import {isAbsolute} from 'node:path';

export async function persistMetaAudienceCsv(filePath,csv,{
 openFile=open,
 removeFile=unlink
}={}){
 if(typeof filePath!=='string'||!isAbsolute(filePath)
    ||typeof csv!=='string'||!csv.startsWith('email,phone,fn,ln,country\r\n')){
  throw Error('crm_meta_audience_private_write_invalid_args');
 }
 let fd,created=false;
 try{
  // wx = exclusive create (no clobber); mode 0600 = private.
  fd=await openFile(filePath,'wx',0o600);
  created=true;
  await fd.writeFile(csv,{encoding:'utf8'});
  // CSV is small; flush before returning its checksum and file ID.
  if(typeof fd.sync==='function')await fd.sync();
  await fd.close();
  fd=null;
 }catch{
  if(fd)try{await fd.close()}catch{}
  // IMPORTANT: never unlink an existing file if exclusive open failed.
  // An interrupted write MUST NOT leave a partial audience for SFTP pickup.
  if(created)try{await removeFile(filePath)}catch{}
  throw Error('crm_meta_audience_private_write_failed');
 }
}
