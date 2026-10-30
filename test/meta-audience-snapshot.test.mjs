import test from 'node:test';
import assert from 'node:assert/strict';
import {
 metadataOnlyMetaAudienceSnapshot,
 metaAudienceSnapshotUnchanged
} from '../src/meta-audience-snapshot.mjs';

const result=()=>({
 schema:'evyd-meta-audience-export-v3',
 snapshot_id:'snapshot-test-20261030',
 as_of:'2026-10-30T11:00:00-03:00',
 purchase_rule:'ANY_VALID_PURCHASE_2026',
 sha256:'a'.repeat(64),
 csv:'email,phone,fn,ln,country\r\nprivate@example.com,5548999999999,private,person,br\r\n',
 counts:{
  input:112,customer_records:100,proposal_records:12,
  excluded_2026_buyer:3,excluded_suppressed:1,
  identity_groups_with_suppression:2,eligible_people:105,export_rows:105
 },
 contains_personal_data:true
});
const sourceCounts={customers:100,proposals:12};

test('P25.9 preview caches only aggregate metadata, never raw CSV or emails',()=>{
 const safe=metadataOnlyMetaAudienceSnapshot(result());
 assert.equal(safe.snapshot_id,'snapshot-test-20261030');
 assert.equal(safe.sha256,'a'.repeat(64));
 assert.equal(safe.counts.export_rows,105);
 assert.equal('csv' in safe,false);
 assert.equal('records' in safe,false);
 assert.ok(!JSON.stringify(safe).includes('private@example.com'));
 assert.equal(Object.isFrozen(safe),true);
 assert.equal(Object.isFrozen(safe.counts),true);
 assert.throws(()=>{safe.counts.export_rows=2},TypeError);
});

test('P25.9 unchanged CSV and identical aggregate counts remain exportable',()=>{
 const safe=metadataOnlyMetaAudienceSnapshot(result());
 const fresh=result();
 fresh.counts={export_rows:105,...fresh.counts};
 assert.equal(metaAudienceSnapshotUnchanged(safe,fresh,{
  previewSourceCounts:sourceCounts,liveSourceCounts:{...sourceCounts}
 }),true);
});

test('P25.9 identical CSV hash but changed exclusion count requires new preview',()=>{
 const safe=metadataOnlyMetaAudienceSnapshot(result());
 const fresh=result();
 fresh.counts.identity_groups_with_suppression+=1;
 assert.equal(safe.sha256,fresh.sha256);
 assert.equal(metaAudienceSnapshotUnchanged(safe,fresh,{
  previewSourceCounts:sourceCounts,liveSourceCounts:sourceCounts
 }),false);
});

test('P25.9 identical CSV hash with newly paid customer groups requires new preview',()=>{
 const safe=metadataOnlyMetaAudienceSnapshot(result());
 const fresh=result();
 fresh.counts.excluded_2026_buyer+=1;
 assert.equal(metaAudienceSnapshotUnchanged(safe,fresh,{
  previewSourceCounts:sourceCounts,liveSourceCounts:sourceCounts
 }),false);
});

test('P25.9 missing or changed source coverage requires new preview even with same CSV',()=>{
 const safe=metadataOnlyMetaAudienceSnapshot(result());
 assert.equal(metaAudienceSnapshotUnchanged(safe,result(),{
  previewSourceCounts:sourceCounts,liveSourceCounts:{customers:100,proposals:13}
 }),false);
 assert.equal(metaAudienceSnapshotUnchanged(safe,result(),{
  previewSourceCounts:sourceCounts,liveSourceCounts:null
 }),false);
});

test('P25.9 preview contract refuses untrusted keys or count values',()=>{
 const src=result();
 src.counts.export_rows=-1;
 assert.throws(()=>metadataOnlyMetaAudienceSnapshot(src),/invalid_preview_snapshot/);
 const src2=result();
 src2.counts.contact_email='private@example.com';
 assert.throws(()=>metadataOnlyMetaAudienceSnapshot(src2),/invalid_preview_snapshot/);
});

test('P25.9 source-code contract keeps CSV out of gateway cache',async()=>{
 const {readFile}=await import('node:fs/promises');
 const code=await readFile(new URL('../src/live-gateway.mjs',import.meta.url),'utf8');
 assert.match(code,/result:metadataOnlyMetaAudienceSnapshot\(result\)/);
 assert.match(code,/metaAudienceSnapshotUnchanged\(result,freshResult,/);
 assert.match(code,/PRIVATE_AUDIENCE_EXPORT,\{requiredScopes:/);
 assert.doesNotMatch(code,/const item=\{operatorKey,result,coverage:raw\.coverage/);
});
