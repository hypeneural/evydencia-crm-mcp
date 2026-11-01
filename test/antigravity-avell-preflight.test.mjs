import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {main,parseArgs,resolveCommand} from '../scripts/antigravity/prepare-avell.mjs';

test('CLI flags parse and default to safe no-deploy profile',()=>{
 const args=parseArgs([]);
 assert.equal(args.runMcpTests,false);
 assert.equal(args.fullGameplay,false);
 assert.equal(args.refresh,false);
 assert.equal(args.dryRun,false);
 assert.ok(args.workspace.toLowerCase().includes('antigravity'));
});
test('dry-run creates no directory and does not call Git',()=>{
 const target=join(tmpdir(),'avell-should-not-be-created-20261026');
 assert.equal(existsSync(target),false);
 assert.equal(main(['--dry-run','--workspace',target]),0);
 assert.equal(existsSync(target),false);
});
test('rejects workspace inside the MCP checkout and operational directories',()=>{
 const src=resolve(fileURLToPath(new URL('..',import.meta.url)));
 assert.throws(()=>main(['--dry-run','--workspace',join(src,'accidental-clone')]),/WORKSPACE_MUST_NOT_BE_INSIDE_RUNNING_MCP/);
 assert.throws(()=>main(['--dry-run','--workspace',join(tmpdir(),'printserver','tmp')]),/WORKSPACE_MUST_NOT_BE_INSIDE_OPERATIONAL_DIRECTORY/);
 assert.throws(()=>main(['--dry-run','--workspace',join(tmpdir(),'evydflow','tmp')]),/WORKSPACE_MUST_NOT_BE_INSIDE_OPERATIONAL_DIRECTORY/);
});
test('unknown flags and missing --workspace argument fail closed',()=>{
 assert.throws(()=>parseArgs(['--wipe']),/UNKNOWN_OPTION/);
 assert.throws(()=>parseArgs(['--workspace']),/WORKSPACE_PATH_REQUIRED/);
});
test('script is executable under Node without loading NPM packages',()=>{
 const script=fileURLToPath(new URL('../scripts/antigravity/prepare-avell.mjs',import.meta.url));
 const run=spawnSync(process.execPath,[script,'--help'],{encoding:'utf8',timeout:10000});
 assert.equal(run.status,0,run.stderr);
 assert.match(run.stdout,/COPIAS ISOLADAS/);
});

test('Windows npm.cmd invokes cmd.exe only with allowlisted constant commands',()=>{
 const ci=resolveCommand('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],'win32');
 assert.equal(ci.bin,'cmd.exe');
 assert.deepEqual(ci.argv,['/d','/s','/c','npm ci --ignore-scripts --no-audit --no-fund']);
 assert.equal(resolveCommand('npm',['test'],'win32').bin,'cmd.exe');
 assert.equal(resolveCommand('npm',['run','gateway:test'],'win32').bin,'cmd.exe');
 assert.throws(()=>resolveCommand('npm',['run','deploy'],'win32'),/UNSAFE_NPM_ARGUMENTS/);
 assert.deepEqual(resolveCommand('npm',['test'],'linux'),{bin:'npm',argv:['test']});
});
