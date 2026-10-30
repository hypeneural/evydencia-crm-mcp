import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const script=resolve('scripts/antigravity/meta-audience-release-preflight.mjs');
function run(overrides={}){
 const env={...process.env,EVYD_META_AUDIENCE_ENABLED:'0',
  EVYD_AUDIENCE_EXPORT_ENABLED:'0',EVYD_META_AUDIENCE_LGPD_APPROVED:'0',
  EVYD_META_AUDIENCE_LGPD_POLICY_REF:'',
  EVYD_AUDIENCE_ALLOWED_OPERATOR_IDS:'',EVYD_AUDIENCE_ALLOWED_OPERATORS:'',
  META_PRIVATE_CSV_DIR:'',EVYD_INTERNAL_READ_TOKEN:'',...overrides};
 const p=spawnSync(process.execPath,[script],{cwd:process.cwd(),env,encoding:'utf8',timeout:5000});
 return {...p,parsed:JSON.parse(p.stdout)};
}
test('Meta Audience rollout default remains disabled and prints no secrets',()=>{
 const r=run();
 assert.equal(r.status,0);
 assert.equal(r.parsed.status,'FEATURE_DISABLED');
 assert.equal(r.parsed.checks.master_enabled,false);
 assert.equal(r.parsed.chatgpt_download_available,false);
 assert.doesNotMatch(r.stdout,/META_PRIVATE_CSV_DIR|EVYD_INTERNAL_READ_TOKEN|EVYD_GATEWAY_KEY/);
});
test('Meta Audience export switch alone is blocked until master is enabled',()=>{
 const r=run({EVYD_AUDIENCE_EXPORT_ENABLED:'1'});
 assert.equal(r.status,2);
 assert.equal(r.parsed.status,'BLOCKED_CONFIG');
 assert.ok(r.parsed.blockers.includes('master_switch_off'));
});
test('Meta Audience export with no attested legal policy fails closed',()=>{
 const r=run({EVYD_META_AUDIENCE_ENABLED:'1',EVYD_AUDIENCE_EXPORT_ENABLED:'1',
  EVYD_AUDIENCE_ALLOWED_OPERATOR_IDS:'7',EVYD_INTERNAL_READ_TOKEN:'synthetic-only-abc123'});
 assert.equal(r.status,2);
 assert.ok(r.parsed.blockers.includes('documented_legal_policy_unapproved'));
 assert.ok(r.parsed.blockers.includes('private_export_directory_not_ready'));
 assert.equal(r.parsed.live_data_validated,false);
});
