// Pure integrity contract for the operator-approved Meta Audience preview.
// Never retain the generated CSV (PII) in the five-minute snapshot cache.
// Export always reads a FRESH CRM source before writing its private file.
const META_SCHEMA='evyd-meta-audience-export-v3';
const SOURCE_KEYS=['customers','proposals'];

export function metadataOnlyMetaAudienceSnapshot(result){
 if(!result||result.schema!==META_SCHEMA||typeof result.sha256!=='string'
    ||!/^[a-f0-9]{64}$/.test(result.sha256)
    ||typeof result.snapshot_id!=='string'
    ||!result.counts||typeof result.counts!=='object'
    ||typeof result.csv!=='string'){
  throw Error('crm_meta_audience_invalid_preview_snapshot');
 }
 const counts={};
 for(const [key,value] of Object.entries(result.counts)){
  if(!/^[a-z][a-z0-9_]{0,80}$/.test(key)
      ||!Number.isSafeInteger(value)||value<0){
   throw Error('crm_meta_audience_invalid_preview_snapshot');
  }
  counts[key]=value;
 }
 // Only the values required by previewPayload and snapshot comparison.
 // No CSV, raw records, names, email, phone, or user IDs.
 return Object.freeze({
  schema:META_SCHEMA,
  snapshot_id:result.snapshot_id,
  as_of:result.as_of,
  purchase_rule:result.purchase_rule,
  sha256:result.sha256,
  counts:Object.freeze(counts)
 });
}

export function metaAudienceSnapshotUnchanged(preview,live,{
 previewSourceCounts,
 liveSourceCounts
}={}){
 if(!preview||!live||preview.schema!==META_SCHEMA||live.schema!==META_SCHEMA
    ||preview.sha256!==live.sha256
    ||preview.purchase_rule!==live.purchase_rule)return false;
 const old=preview.counts,newCounts=live.counts;
 if(!old||!newCounts)return false;
 const keys=Object.keys(old).sort();
 if(keys.length!==Object.keys(newCounts).length
    ||keys.some(k=>!Object.hasOwn(newCounts,k)||old[k]!==newCounts[k]))return false;
 if(!previewSourceCounts||!liveSourceCounts)return false;
 return SOURCE_KEYS.every(k=>Number.isSafeInteger(previewSourceCounts[k])
     &&Number.isSafeInteger(liveSourceCounts[k])
     &&previewSourceCounts[k]===liveSourceCounts[k]);
}
