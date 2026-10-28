import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectWrapper,
} from '../scripts/antigravity/check-stackctl-reader-readonly.mjs';

test('legacy wrapper with only public RELEASE_DIR fails closed', () => {
  const result = inspectWrapper('docker compose -f compose.yaml up -d catalog');
  assert.equal(result.status, 'BLOCKED_WRAPPER');
  assert.equal(result.changes_performed, false);
});

test('mentions of both release variables are NOT proof of a selective cut', () => {
  const result = inspectWrapper(
    'RELEASE_DIR=/public CATALOG_READER_RELEASE_DIR=/reader docker compose ' +
    '-f compose.private-audit.yaml up --no-deps catalog-reader',
  );
  assert.equal(result.status, 'REVIEW_WRAPPER_MANUAL_PROOF_REQUIRED');
  assert.equal(result.service_only_command_verified, false);
  assert.equal(result.environment_passthrough_verified, false);
});

test('a wrapper without no-deps or private service remains blocked', () => {
  const result = inspectWrapper('RELEASE_DIR CATALOG_READER_RELEASE_DIR docker compose up -d');
  assert.equal(result.status, 'BLOCKED_WRAPPER');
});
