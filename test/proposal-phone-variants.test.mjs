import test from 'node:test';
import assert from 'node:assert/strict';
import {proposalPhoneVariants,prepareProposalPhones} from '../src/proposal-phone-variants.mjs';

const modern='48996425287',legacy='4896425287';
test('same mobile with and without 9 normalizes, but keeps provenance',()=>{
  const a=proposalPhoneVariants(modern),b=proposalPhoneVariants(legacy);
  assert.equal(a.canonical_e164,'+5548996425287');
  assert.equal(b.canonical_e164,a.canonical_e164);
  assert.equal(a.input_e164,'+5548996425287');
  assert.equal(b.input_e164,'+554896425287');
  assert.deepEqual(a.variants_e164,['+5548996425287','+554896425287']);
  assert.deepEqual(b.variants_e164,['+554896425287','+5548996425287']);
  assert.equal(a.match_warning,'legacy_variant_not_identity_proof');
});
test('accepts +55, digits, punctuation, unicode hyphens, NBSP and fullwidth digits',()=>{
 const inputs=['+55 (48) 99642-5287','5548996425287','(48)\u00a099642\u20115287','４８９９６４２５２８７'];
 for(const p of inputs)assert.equal(proposalPhoneVariants(p).canonical_e164,'+5548996425287');
});
test('does not invent legacy variant for 9-digit mobile with nonlegacy prefix',()=>{
 const r=proposalPhoneVariants('48912345678');
 assert.deepEqual(r.variants_e164,['+5548912345678']);
});
test('landline is exact-only and not modified',()=>{
 const r=proposalPhoneVariants('48 3220-0440');
 assert.equal(r.status,'landline');assert.deepEqual(r.variants_e164,['+554832200440']);
});
test('different DDDs never collapse by last 8 digits',()=>{
 const r=prepareProposalPhones(['48996425287','47996425287']);
 assert.equal(r.groups.length,2);
});
test('dedupes canonical identities but preserves input order and variants',()=>{
 const r=prepareProposalPhones([modern,legacy,modern]);
 assert.equal(r.groups.length,1);assert.deepEqual(r.groups[0].indices,[0,1,2]);
 assert.equal(r.inputs.length,3);
});
test('rejects non-BR country, invalid DDD, malformed text and injected content',()=>{
 for(const p of ['+1 408 555 1212','00996425287','4296425287x','4899<script>','48;996425287','--48+996425287','48 99642 5287 DROP','+55+48996425287','(00) 99642-5287','12','+5548996425287000']){
  assert.throws(()=>proposalPhoneVariants(p),/invalid_proposal_phone/,p);
 }
});
test('rejects batches outside 1..50; invalid entries are isolated',()=>{
 assert.throws(()=>prepareProposalPhones([]),/invalid_proposal_batch_size/);
 assert.throws(()=>prepareProposalPhones(Array(51).fill(modern)),/invalid_proposal_batch_size/);
 const r=prepareProposalPhones(['unknown',modern]);
 assert.equal(r.inputs[0].status,'invalid_phone');assert.equal(r.inputs[1].status,'valid');
});
