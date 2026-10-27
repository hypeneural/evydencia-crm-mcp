#!/usr/bin/env node
// Read-only FILESYSTEM preflight. This does not contact the CRM, run PHP,
// query customers, inspect secrets or prove a working canonical pagination API.
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const localScripts = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function inspectCanonicalBridge({ crmAppPath, scriptsPath = localScripts }) {
  const app = resolve(crmAppPath);
  const scripts = resolve(scriptsPath);
  const autoload = join(app, 'vendor', 'autoload.php');
  const bridge = join(scripts, 'crm-forensic-bridge.php');
  const isRegularFile = p => {
    try { return existsSync(p) && statSync(p).isFile(); } catch { return false; }
  };
  const result = {
    scope: 'filesystem_only',
    canonical_search_verified: false,
    crm_laravel_autoload_present: isRegularFile(autoload),
    forensic_bridge_script_present: isRegularFile(bridge),
    integration_ready_for_live_queries: false,
  };
  result.filesystem_prerequisites_present =
    result.crm_laravel_autoload_present && result.forensic_bridge_script_present;
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(v => !['--json'].includes(v))) {
    console.error('USAGE: node scripts/antigravity/inspect-canonical-bridge.mjs [--json]');
    process.exitCode = 2;
  } else {
    const data = inspectCanonicalBridge({
      crmAppPath: process.env.EVYD_CRM_APP_PATH || '/var/www/evydencia/current',
    });
    console.log(JSON.stringify(data, null, 2));
  }
}
