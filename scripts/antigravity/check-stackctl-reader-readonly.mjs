#!/usr/bin/env node
/** Static ONLY review of the live stackctl file; no shell execution. No secrets/logs.
 * Positive matches are INSUFFICIENT to authorize release or service recreation.
 * This deliberately fails closed when the wrapper cannot be proven to keep the
 * public RELEASE_DIR intact or independently update only catalog-reader.
 */
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function inspectWrapper(source) {
  const text = String(source || '');
  // Whole-line comments can mention proposed flags without implementing them.
  // Detecting any literal is NOT proof of a safe branch or permitted command.
  const code = text.replace(/^\\s*#.*$/gm, '');
  const results = {
    has_independent_reader_variable: /\\bCATALOG_READER_RELEASE_DIR\\b/.test(code),
    has_public_release_variable: /\\bRELEASE_DIR\\b/.test(code),
    mentions_private_service: /\\bcatalog-reader\\b/.test(code),
    mentions_no_deps_option: /--no-deps\\b/.test(code),
    mentions_compose: /docker\\s+compose|compose\\.yaml|compose\\.private-audit/.test(code),
    // Existing stack-wide deploys are dangerous when reused for the reader.
    // This is a risk indicator, not a parser for shell flow or an authorization.
    has_stackwide_remove_orphans: /--remove-orphans\\b/.test(code),
    has_restart_only_rollback: /compose[^\\n;]{0,100}\\brestart\\b/.test(code),
  };
  const allMinimumHints = [
    'has_independent_reader_variable', 'has_public_release_variable',
    'mentions_private_service', 'mentions_no_deps_option', 'mentions_compose',
  ].every(key => results[key]);
  return {
    status: allMinimumHints
      ? 'REVIEW_WRAPPER_MANUAL_PROOF_REQUIRED' : 'BLOCKED_WRAPPER',
    checks: results,
    risk_flags: {
      full_stack_update_present: results.has_stackwide_remove_orphans,
      restart_only_rollback_present: results.has_restart_only_rollback,
    },
    // Even a wrapper with matching tokens might target the entire stack.
    // Only an operator-observed dry-run with approved argv can clear this gate.
    service_only_command_verified: false,
    environment_passthrough_verified: false,
    rollback_to_immutable_artifact_verified: false,
    changes_performed: false,
  };
}

function cli(argv) {
  if (argv.length === 1 && argv[0] === '--stdin') {
    try {
      // SSH pipe is consumed in memory; never echo wrapper source or secrets.
      const source = readFileSync(0, 'utf8');
      if (!source || source.length > 128 * 1024) throw new Error('WRAPPER_INPUT_INVALID');
      const result = inspectWrapper(source);
      console.log(JSON.stringify(result));
      return result.status === 'BLOCKED_WRAPPER' ? 2 : 0;
    } catch {
      console.error('BLOCKED_WRAPPER: no safe input; no deploy.');
      return 2;
    }
  }
  if (argv.length !== 2 || argv[0] !== '--path' ||
      !argv[1].startsWith('/') || argv[1].includes('\n')) {
    console.error('USAGE: node scripts/antigravity/check-stackctl-reader-readonly.mjs --stdin OR --path /usr/local/sbin/stackctl');
    return 2;
  }
  try {
    const filename = resolve(argv[1]);
    const info = lstatSync(filename);
    if (info.isSymbolicLink() || !info.isFile() || info.size > 128 * 1024) {
      throw new Error('WRAPPER_FILE_NOT_SAFE');
    }
    const result = inspectWrapper(readFileSync(filename, 'utf8'));
    console.log(JSON.stringify(result));
    // This is not an execution compatibility test. Always block a deploy
    // decision until operator can exhibit real supported read-only dry-run.
    return result.status === 'BLOCKED_WRAPPER' ? 2 : 0;
  } catch {
    console.error('BLOCKED_WRAPPER: cannot safely inspect wrapper; no deploy.');
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = cli(process.argv.slice(2));
}
