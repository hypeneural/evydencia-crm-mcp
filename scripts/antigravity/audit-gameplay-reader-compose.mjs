#!/usr/bin/env node
/**
 * Offline, read-only Compose model proof for the Gameplay catalog-reader.
 * NEVER prints the rendered configuration (may include environment secrets).
 * Runs "docker compose config" only, with synthetic paths and credentials.
 * Runtime stackctl compatibility is an INDEPENDENT, mandatory human gate.
 */
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_RELEASE = '/__ctwa_synthetic/public-r0';
const READER_RELEASE = '/__ctwa_synthetic/reader-r1';
const SYNTHETIC_ENV = {
  RELEASE_DIR: PUBLIC_RELEASE,
  CATALOG_READER_RELEASE_DIR: READER_RELEASE,
  CATALOG_READER_UID: '2001',
  CATALOG_READER_GID: '2001',
  CATALOG_READER_HOST_PORT: '4182',
  CATALOG_SERVER_SECRET_HOST_PATH: '/__ctwa_synthetic/server.secret',
  CATALOG_READ_SECRET_HOST_PATH: '/__ctwa_synthetic/reader.secret',
  DATA_DIR: '/__ctwa_synthetic/data',
  MEDIA_DIR: '/__ctwa_synthetic/media',
};

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function mountFor(service, target) {
  return (service?.volumes || []).find(v => v.target === target);
}

function readonlyBind(service, target, source) {
  const v = mountFor(service, target);
  return v?.type === 'bind' && v.source === source && v.read_only === true;
}

export function verifyReaderComposeModel({ baseline, merged }) {
  assert(baseline && merged && baseline.services && merged.services, 'MODEL_MISSING');
  // Stronger than grepping YAML: public services MUST be byte-for-byte equal
  // after Docker Compose normalizes the original and merged service models.
  for (const service of ['catalog', 'gateway']) {
    assert(isDeepStrictEqual(baseline.services[service], merged.services[service]),
      'PUBLIC_SERVICE_DRIFT_' + service.toUpperCase());
  }
  const r = merged.services['catalog-reader'];
  assert(r && !baseline.services['catalog-reader'], 'READER_NOT_ISOLATED');
  assert(r.read_only === true, 'READER_FILESYSTEM_WRITABLE');
  assert(r.init === true, 'READER_INIT_DISABLED');
  assert((r.cap_drop || []).includes('ALL'), 'READER_CAPABILITIES_NOT_DROPPED');
  assert((r.security_opt || []).includes('no-new-privileges:true'), 'READER_PRIVILEGE_ESCALATION');
  assert(Array.isArray(r.profiles) && r.profiles.includes('audit-private'),
    'READER_PROFILE_MISSING');
  assert(r.user === '2001:2001', 'READER_UID_GID_INVALID');
  assert(isDeepStrictEqual(r.command, ['node', 'server/main.js']),
    'READER_COMMAND_INVALID');
  assert(r.environment?.CATALOG_PRIVATE_METADATA_READ_ONLY === '1',
    'READER_READONLY_MODE_DISABLED');
  assert(r.environment?.CATALOG_DATABASE_PATH === '/data/sqlite/catalog.db',
    'READER_SQLITE_TARGET_CHANGED');
  assert(r.environment?.CATALOG_INTERNAL_READ_SECRET_FILE === '/run/catalog-secrets/reader.secret',
    'READER_SECRET_PATH_CHANGED');
  assert(r.environment?.CATALOG_SERVER_SECRET_FILE === '/run/catalog-secrets/server.secret',
    'READER_SERVER_SECRET_PATH_CHANGED');

  const networks = Object.keys(r.networks || {});
  assert(networks.length === 1 && networks[0] === 'backend',
    'READER_NETWORK_NOT_PRIVATE');
  const ports = r.ports || [];
  assert(ports.length === 1 && ports[0].host_ip === '127.0.0.1'
    && String(ports[0].published) === '4182' && ports[0].target === 4180
    && (!ports[0].protocol || ports[0].protocol === 'tcp'),
  'READER_PORT_NOT_LOOPBACK');

  assert(readonlyBind(r, '/app/server', READER_RELEASE + '/server'),
    'READER_SERVER_MOUNT_DRIFT');
  assert(readonlyBind(r, '/app/package.json', READER_RELEASE + '/package.json'),
    'READER_PACKAGE_MOUNT_DRIFT');
  assert(readonlyBind(r, '/var/www/html/web', READER_RELEASE + '/web'),
    'READER_WEB_MOUNT_DRIFT');
  assert(readonlyBind(r, '/data/sqlite', '/srv/runtime/christmas-games/data/sqlite'),
    'READER_SQLITE_MOUNT_DRIFT');
  assert(readonlyBind(r, '/run/catalog-secrets/server.secret',
    SYNTHETIC_ENV.CATALOG_SERVER_SECRET_HOST_PATH), 'READER_SERVER_SECRET_MOUNT_INVALID');
  assert(readonlyBind(r, '/run/catalog-secrets/reader.secret',
    SYNTHETIC_ENV.CATALOG_READ_SECRET_HOST_PATH), 'READER_READ_SECRET_MOUNT_INVALID');
  assert(SYNTHETIC_ENV.CATALOG_SERVER_SECRET_HOST_PATH !==
    SYNTHETIC_ENV.CATALOG_READ_SECRET_HOST_PATH, 'READER_SECRETS_NOT_SEPARATE');
  assert((r.volumes || []).every(v => v.read_only === true),
    'READER_WRITABLE_VOLUME');
  assert((r.volumes || []).length === 7, 'READER_UNEXPECTED_MOUNT');
  assert((r.tmpfs || []).length >= 1, 'READER_TEMP_FS_MISSING');
  assert(!('depends_on' in r), 'READER_DEPENDENCIES_CAN_RECREATE_PUBLIC');

  return {
    status: 'COMPOSE_BOUNDARY_PASS',
    public_services_unchanged: true,
    independent_reader_release: true,
    private_loopback_only: true,
    private_sqlite_mount_readonly: true,
    explicit_reader_command: true,
    media_publication_enabled: false,
    stackctl_compatibility: 'NOT_VERIFIED',
    production_release_hash: 'NOT_VERIFIED',
    backup_restore_proven: false,
    deploy_performed: false,
  };
}

export function renderSyntheticModels({ gameplayRoot, run = execFileSync }) {
  assert(typeof gameplayRoot === 'string' && gameplayRoot.length > 0,
    'GAMEPLAY_ROOT_REQUIRED');
  const composeDir = join(resolve(gameplayRoot), 'deploy', 'vps', 'docker');
  const base = 'compose.persistence.yaml';
  const overlay = 'compose.private-audit.yaml';
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SYSTEMROOT: process.env.SYSTEMROOT,
    WINDIR: process.env.WINDIR,
    ...SYNTHETIC_ENV,
  };
  function render(files) {
    const args = ['compose', '--profile', 'audit-private'];
    for (const f of files) args.push('-f', f);
    args.push('config', '--format', 'json');
    let output;
    try {
      output = run('docker', args, {
        cwd: composeDir, env, encoding: 'utf8', timeout: 12000,
        stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 5 * 1024 * 1024,
      });
      return JSON.parse(output);
    } catch {
      throw new Error('DOCKER_COMPOSE_CONFIG_UNAVAILABLE_OR_INVALID');
    }
  }
  return { baseline: render([base]), merged: render([base, overlay]) };
}

function main(args) {
  if (args.length !== 2 || args[0] !== '--gameplay-root' || !args[1]) {
    console.error('USAGE: node scripts/antigravity/audit-gameplay-reader-compose.mjs --gameplay-root PATH');
    return 2;
  }
  try {
    const result = verifyReaderComposeModel(
      renderSyntheticModels({ gameplayRoot: args[1] }));
    console.log(JSON.stringify(result));
    console.log('BLOCKED_WRAPPER: release-only rollout requires separate stackctl verification.');
    return 0; // proves only synthetic Compose, NEVER wrapper/deploy readiness
  } catch (e) {
    console.error('NO_GO_COMPOSE: ' + e.message);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
