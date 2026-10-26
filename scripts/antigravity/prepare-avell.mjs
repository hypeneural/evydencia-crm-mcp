#!/usr/bin/env node
/**
 * Avell / Windows 11: SAFE setup for the Gameplay <-> CRM MCP development task.
 * Makes two independent work copies. Never touches running MCP, printer,
 * EvydFlow, services, secrets, registry, production databases or deploy.
 *
 * Usage: node scripts/antigravity/prepare-avell.mjs [--workspace DIR]
 *        [--dry-run] [--refresh] [--run-mcp-tests] [--full-gameplay]
 * Requirements: Node >=22, Git with credentials for hypeneural repositories.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_WORKSPACE = join(
  process.env.LOCALAPPDATA || homedir(), 'Evydencia', 'Antigravity', 'gameplay-mcp-20261026',
);
const TARGETS = Object.freeze([
  {
    key: 'crm-mcp-dev',
    repo: 'hypeneural/evydencia-crm-mcp',
    url: 'https://github.com/hypeneural/evydencia-crm-mcp.git',
    branch: 'feat/gameplay-read-client-20261026',
    sparse: false,
  },
  {
    key: 'gameplay-code',
    repo: 'hypeneural/gameplay',
    url: 'https://github.com/hypeneural/gameplay.git',
    branch: 'feat/gameplay-status-read-api-20261026',
    sparse: true,
  },
]);

function usage() {
  return [
    'Prepara duas COPIAS ISOLADAS para o Antigravity (nao muda a instalacao do Avell).',
    'node scripts/antigravity/prepare-avell.mjs [--workspace DIR]',
    'Opcoes: --dry-run, --refresh, --run-mcp-tests, --full-gameplay, --help',
    'Sem opcoes: clone leve + analise + teste offline rapido do MCP; sem npm ci.',
  ].join('\n');
}
export function parseArgs(argv) {
  const args = { workspace: DEFAULT_WORKSPACE, dryRun: false, refresh: false,
    runMcpTests: false, fullGameplay: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i];
    if (word === '--workspace') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('WORKSPACE_PATH_REQUIRED');
      args.workspace = argv[++i];
    } else if (word === '--dry-run') args.dryRun = true;
    else if (word === '--refresh') args.refresh = true;
    else if (word === '--run-mcp-tests') args.runMcpTests = true;
    else if (word === '--full-gameplay') args.fullGameplay = true;
    else if (word === '--help' || word === '-h') args.help = true;
    else throw Error('UNKNOWN_OPTION:' + word);
  }
  args.workspace = resolve(args.workspace);
  return args;
}
function command(bin, argv, { cwd, timeout = 180000, output = false } = {}) {
  const result = spawnSync(bin, argv, {
    cwd, windowsHide: true, timeout, encoding: 'utf8',
    stdio: output ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error || result.status !== 0) {
    const tail = output ? (result.stderr || '').slice(-500) : '';
    throw Error('COMMAND_FAILED:' + basename(bin) + ' (exit ' + result.status + ') ' + tail);
  }
  return output ? (result.stdout || '').trim() : '';
}
const git = (dir, argv, options = {}) => command('git', ['-C', dir, ...argv], options);
function normalizedRepoUrl(url) {
  return String(url).trim().replace(/\\/g, '/').replace(/\.git$/i, '')
    .replace(/^git@github\.com:/i, 'https://github.com/')
    .replace(/^ssh:\/\/git@github\.com\//i, 'https://github.com/')
    .replace(/\/$/, '').toLowerCase();
}
function within(parent, child) {
  const p = resolve(parent).toLowerCase();
  const c = resolve(child).toLowerCase();
  return c === p || c.startsWith(p + sep.toLowerCase());
}
function assertSafeWorkspace(where) {
  if (within(SCRIPT_ROOT, where)) throw Error('WORKSPACE_MUST_NOT_BE_INSIDE_RUNNING_MCP');
  const parts = where.toLowerCase().split(/[\\/]+/);
  if (parts.some(p => ['printserver', 'print-server', 'evydflow', 'node_modules', 'data', 'queue', 'secrets'].includes(p))) {
    throw Error('WORKSPACE_MUST_NOT_BE_INSIDE_OPERATIONAL_DIRECTORY');
  }
  if (existsSync(where) && !statSync(where).isDirectory()) throw Error('WORKSPACE_NOT_DIRECTORY');
}
function ensureRepo(target, workspace, args) {
  const dir = join(workspace, target.key);
  const expected = normalizedRepoUrl(target.url);
  if (!existsSync(dir)) {
    const clone = ['clone', '--depth', '1', '--filter=blob:none', '--single-branch',
      '--branch', target.branch];
    if (target.sparse && !args.fullGameplay) clone.push('--sparse');
    clone.push(target.url, dir);
    command('git', clone, { timeout: 300000 });
    if (target.sparse && !args.fullGameplay) {
      git(dir, ['sparse-checkout', 'set', '--cone',
        '.agents', '.github/workflows', 'apps/catalog-server', 'apps/play/src',
        'deploy', 'docs/contracts', 'docs/generated', 'docs/integrations', 'docs/ops',
        'tools'], { timeout: 300000 });
    }
  } else {
    if (!existsSync(join(dir, '.git'))) throw Error('TARGET_EXISTS_NOT_GIT:' + target.key);
    const origin = normalizedRepoUrl(git(dir, ['remote', 'get-url', 'origin'], { output: true }));
    if (origin !== expected) throw Error('TARGET_REMOTE_MISMATCH:' + target.key);
    const current = git(dir, ['branch', '--show-current'], { output: true });
    if (current !== target.branch) throw Error('TARGET_BRANCH_MISMATCH:' + target.key);
    const dirty = git(dir, ['status', '--porcelain'], { output: true });
    if (args.refresh) {
      if (dirty) throw Error('TARGET_HAS_LOCAL_EDITS_NO_REFRESH:' + target.key);
      git(dir, ['fetch', '--depth', '1', 'origin', target.branch], { timeout: 300000 });
      git(dir, ['merge', '--ff-only', 'FETCH_HEAD'], { timeout: 120000 });
    }
    if (target.sparse && args.fullGameplay) {
      if (dirty) throw Error('TARGET_HAS_LOCAL_EDITS_NO_SPARSE_EXPAND');
      git(dir, ['sparse-checkout', 'disable'], { timeout: 300000 });
    }
  }
  const origin = normalizedRepoUrl(git(dir, ['remote', 'get-url', 'origin'], { output: true }));
  if (origin !== expected) throw Error('INVALID_CLONE_ORIGIN:' + target.key);
  const sha = git(dir, ['rev-parse', 'HEAD'], { output: true });
  const dirty = git(dir, ['status', '--porcelain'], { output: true });
  return { key: target.key, repo: target.repo, branch: target.branch, commit: sha,
    clean: dirty.length === 0, path: dir };
}
function runQuickTest(repo, args) {
  const file = join(repo.path, 'scripts', 'validate-gameplay-read.mjs');
  if (!existsSync(file)) throw Error('MCP_PREFLIGHT_FILE_MISSING');
  command(process.execPath, [file], { cwd: repo.path, timeout: 60000 });
  if (args.runMcpTests) {
    // These commands run exclusively in the throwaway development checkout.
    command('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
      { cwd: repo.path, timeout: 300000 });
    command('npm', ['test'], { cwd: repo.path, timeout: 240000 });
    command('npm', ['run', 'gateway:test'], { cwd: repo.path, timeout: 180000 });
  }
}
function buildHandoff(data) {
  return [
    '# Handoff Avell: Gameplay + CRM MCP (desenvolvimento isolado)',
    '',
    'NAO MEXER nos servicos do Windows, no print server, no MCP instalado, no CRM Laravel ou no EvydFlow.',
    '',
    '## Workspaces', '',
    ...data.repos.map(r => '- ' + r.repo + ': ' + r.path +
      '\n  branch: ' + r.branch + '\n  SHA: ' + r.commit + '\n  clean: ' + r.clean),
    '',
    '## Proximos passos para o Antigravity', '',
    '1. Leia os AGENTS.md dos dois repositorios e o prompt:',
    '   ' + join(data.workspace, 'crm-mcp-dev', 'docs', 'AVELL_ANTIGRAVITY_RUNBOOK_20261026.md'),
    '2. MCP: node scripts/validate-gameplay-read.mjs, npm ci, npm test, npm run gateway:test.',
    '3. Gameplay exige Node 24 e pnpm 11.19.0. No Avell Node 22, NAO trocar Node global.',
    '   A CI remota da PR #43 e autoridade para suite inteira ate um ambiente Node 24 isolado.',
    '4. Nao rodar deploy, ativar segredos ou dados de clientes; preservar readiness false.',
    '5. Fechar com relatorio de checks, risco real e bloqueios em vez de loop infinito.',
    '',
    '## Referencias GitHub',
    '- https://github.com/hypeneural/gameplay/pull/43',
    '- https://github.com/hypeneural/evydencia-crm-mcp/pull/11',
    '- https://github.com/hypeneural/evydflow/pull/54 (somente compatibilidade)',
    '',
  ].join('\n');
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) { console.log(usage()); return 0; }
  assertSafeWorkspace(args.workspace);
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 22) throw Error('NODE_22_OR_HIGHER_REQUIRED_FOR_MCP');
  console.log('WORKSPACE: ' + args.workspace);
  console.log('MODO: ' + (args.dryRun ? 'DRY_RUN_SEM_ALTERACOES' : 'PREPARAR_COPIAS_SEM_DEPLOY'));
  console.log('NODE: ' + process.version);
  for (const t of TARGETS) console.log('REPO: ' + t.repo + ' @ ' + t.branch +
    ' -> ' + join(args.workspace, t.key));
  if (args.dryRun) return 0;
  command('git', ['--version'], { output: true });
  mkdirSync(args.workspace, { recursive: true });
  const repos = TARGETS.map(target => ensureRepo(target, args.workspace, args));
  runQuickTest(repos[0], args);
  const gameReadinessPath = join(repos[1].path, 'deploy', 'readiness.json');
  const readiness = existsSync(gameReadinessPath)
    ? JSON.parse(readFileSync(gameReadinessPath, 'utf8')) : null;
  const report = {
    schema_version: 1, created_at: new Date().toISOString(),
    workspace: args.workspace, repos, mcp_local_preflight: 'pass',
    mcp_extended_tests: args.runMcpTests ? 'pass' : 'not_requested',
    gameplay_local_tests: 'not_run_use_github_ci_or_isolated_node24',
    gameplay_pilot_ready: readiness?.pilotReady === true,
    gameplay_customer_data_allowed: readiness?.customerDataAllowed === true,
    production_deploy_performed: false, printer_or_live_mcp_changed: false,
  };
  writeFileSync(join(args.workspace, 'antigravity-preflight.json'),
    JSON.stringify(report, null, 2) + '\n', { flag: 'w' });
  writeFileSync(join(args.workspace, 'LEIA_PRIMEIRO.md'), buildHandoff(report), { flag: 'w' });
  console.log('\nPASSO DE PREPARACAO CONCLUIDO (SEM DEPLOY).');
  console.log('LEIA: ' + join(args.workspace, 'LEIA_PRIMEIRO.md'));
  console.log('RESULTADO: ' + join(args.workspace, 'antigravity-preflight.json'));
  if (!report.gameplay_pilot_ready || !report.gameplay_customer_data_allowed) {
    console.log('BLOQUEIO PRESERVADO: piloto Gameplay com dados reais NAO autorizado.');
  }
  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error('AVELL_PREFLIGHT_FAIL: ' + (error?.message || 'unknown'));
    process.exitCode = 1;
  }
}
