import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyReaderComposeModel,
} from '../scripts/antigravity/audit-gameplay-reader-compose.mjs';

function fixture() {
  const baseline = { services: {
    catalog: { image: 'node:24-alpine', volumes: [
      { source: '/__ctwa_synthetic/public-r0/server', target: '/app/server' },
    ] },
    gateway: { image: 'nginx:alpine', environment: { READ: 'yes' } },
  }};
  const reader = {
    image: 'node:24-alpine', read_only: true, init: true,
    cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'],
    profiles: ['audit-private'], user: '2001:2001',
    command: ['node', 'server/main.js'],
    environment: {
      CATALOG_PRIVATE_METADATA_READ_ONLY: '1',
      CATALOG_DATABASE_PATH: '/data/sqlite/catalog.db',
      CATALOG_INTERNAL_READ_SECRET_FILE: '/run/catalog-secrets/reader.secret',
      CATALOG_SERVER_SECRET_FILE: '/run/catalog-secrets/server.secret',
    },
    networks: { backend: null },
    ports: [{ host_ip: '127.0.0.1', published: '4182', target: 4180 }],
    volumes: [
      ['/__ctwa_synthetic/reader-r1/server', '/app/server'],
      ['/__ctwa_synthetic/reader-r1/package.json', '/app/package.json'],
      ['/__ctwa_synthetic/reader-r1/web', '/var/www/html/web'],
      ['/srv/secrets/christmas-games/social-preview.json',
       '/srv/secrets/christmas-games/social-preview.json'],
      ['/srv/runtime/christmas-games/data/sqlite', '/data/sqlite'],
      ['/__ctwa_synthetic/server.secret', '/run/catalog-secrets/server.secret'],
      ['/__ctwa_synthetic/reader.secret', '/run/catalog-secrets/reader.secret'],
    ].map(([source, target]) => ({
      type: 'bind', source, target, read_only: true,
    })),
    tmpfs: [{ target: '/tmp' }],
  };
  return { baseline, merged: {
    services: {
      catalog: structuredClone(baseline.services.catalog),
      gateway: structuredClone(baseline.services.gateway),
      'catalog-reader': reader,
    },
  }};
}

test('verified normalized reader model does not imply wrapper or deploy', () => {
  const proof = verifyReaderComposeModel(fixture());
  assert.equal(proof.status, 'COMPOSE_BOUNDARY_PASS');
  assert.equal(proof.stackctl_compatibility, 'NOT_VERIFIED');
  assert.equal(proof.deploy_performed, false);
});

for (const [name, mutate, code] of [
  ['public catalog drift', x => { x.merged.services.catalog.image = 'node:latest'; },
    'PUBLIC_SERVICE_DRIFT_CATALOG'],
  ['gateway drift', x => { x.merged.services.gateway.environment.READ = 'no'; },
    'PUBLIC_SERVICE_DRIFT_GATEWAY'],
  ['reader release mixed with public', x => {
    x.merged.services['catalog-reader'].volumes[0].source =
      '/__ctwa_synthetic/public-r0/server';
  }, 'READER_SERVER_MOUNT_DRIFT'],
  ['reader published publicly', x => {
    x.merged.services['catalog-reader'].ports[0].host_ip = '0.0.0.0';
  }, 'READER_PORT_NOT_LOOPBACK'],
  ['reader sqlite writable', x => {
    x.merged.services['catalog-reader'].volumes[4].read_only = false;
  }, 'READER_SQLITE_MOUNT_DRIFT'],
  ['extra writable mount', x => {
    x.merged.services['catalog-reader'].volumes.push({
      type: 'bind', source: '/tmp', target: '/secret', read_only: false,
    });
  }, 'READER_WRITABLE_VOLUME'],
  ['reader elevated user', x => { x.merged.services['catalog-reader'].user='0:0'; },
    'READER_UID_GID_INVALID'],
  ['reader attached to edge', x => {
    x.merged.services['catalog-reader'].networks.edge = null;
  }, 'READER_NETWORK_NOT_PRIVATE'],
  ['wrong command', x => {
    x.merged.services['catalog-reader'].command=['node', 'app.js'];
  }, 'READER_COMMAND_INVALID'],
  ['dependency can pull public', x => {
    x.merged.services['catalog-reader'].depends_on=['catalog'];
  }, 'READER_DEPENDENCIES_CAN_RECREATE_PUBLIC'],
]) {
  test('blocks ' + name, () => {
    const model = fixture();
    mutate(model);
    assert.throws(() => verifyReaderComposeModel(model), e => e.message === code);
  });
}
