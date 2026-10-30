import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectCanonicalBridge } from '../scripts/antigravity/inspect-canonical-bridge.mjs';

test('read-only probe distinguishes missing Laravel on Avell from actual live verification',()=>{
 const dir=mkdtempSync(join(tmpdir(),'evyd-canonical-test-'));
 try{
  const app=join(dir,'crm');
  const scripts=join(dir,'scripts');
  mkdirSync(app);mkdirSync(scripts);
  let r=inspectCanonicalBridge({crmAppPath:app,scriptsPath:scripts});
  assert.equal(r.filesystem_prerequisites_present,false);
  assert.equal(r.canonical_search_verified,false);
  mkdirSync(join(app,'vendor'));
  writeFileSync(join(app,'vendor','autoload.php'),'<?php // synthetic test');
  writeFileSync(join(scripts,'crm-forensic-bridge.php'),'<?php // synthetic test');
  r=inspectCanonicalBridge({crmAppPath:app,scriptsPath:scripts});
  assert.equal(r.filesystem_prerequisites_present,true);
  assert.equal(r.canonical_search_verified,false);
  assert.equal(r.integration_ready_for_live_queries,false);
 } finally { rmSync(dir,{recursive:true,force:true}); }
});
