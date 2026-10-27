import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
test('single canonical local validator, with no duplicate alternative runner',()=>{
 assert.equal(pkg.scripts['agent:validate:local'],'node scripts/validate-agent-local.mjs');
 assert.equal(pkg.scripts['malotes:preflight:read'],pkg.scripts['agent:validate:local']);
 assert.equal(pkg.scripts['malotes:preflight:print'],pkg.scripts['agent:validate:local']);
 assert.ok(existsSync(resolve(root,'scripts/validate-agent-local.mjs')));
 assert.equal(existsSync(resolve(root,'scripts/agent-validate-local.mjs')),false,
  'Alternate runner is duplicate; preserve offline canonical runner');
});
test('local validator is synthetic and does not load project credentials',()=>{
 const src=readFileSync(resolve(root,'scripts/validate-agent-local.mjs'),'utf8');
 assert.match(src,/spawnSync/);
 assert.match(src,/shell:false/);
 assert.match(src,/NODE_ENV='test'/);
 assert.doesNotMatch(src,/\b(?:ssh|systemctl|Invoke-RestMethod|execSync)\s*\(/);
});
