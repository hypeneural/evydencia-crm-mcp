#!/usr/bin/env node
/**
 * MCP VPS read-only structural probe. No HTTP requests, DB queries, tokens,
 * systemctl modifications or environment dumps. Never treats file/service
 * presence as proof of end-to-end Gameplay/CRM readiness.
 */
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requiredService = 'evydencia-crm-mcp-live.service';

export function probeVpsReadiness({
  crmRoot = '/var/www/evydencia/current',
  mcpRoot = root,
  filePresent = path => {
    try { return existsSync(path) && statSync(path).isFile(); }
    catch { return false; }
  },
  serviceState = service => {
    try {
      return execFileSync('systemctl', ['is-active', service], {
        encoding: 'utf8', timeout: 4000, stdio: ['ignore','pipe','ignore']
      }).trim() === 'active' ? 'active' : 'not_active';
    } catch { return 'unknown_or_inactive'; }
  },
} = {}) {
  const laravel = filePresent(join(crmRoot, 'vendor', 'autoload.php'));
  const forensicBridge = filePresent(join(mcpRoot, 'scripts', 'crm-forensic-bridge.php'));
  const mcpService = serviceState(requiredService);
  return {
    probe_version: 1,
    scope: 'read_only_filesystem_and_systemd',
    mcp_service_state: mcpService,
    crm_autoload_present: laravel,
    forensic_bridge_script_present: forensicBridge,
    local_php_bridge_prerequisites_present: laravel && forensicBridge,
    // Even when files and service exist, operator auth / application-level
    // pagination remains unverified until an approved read-only smoke.
    canonical_search_vps: 'not_verified',
    gameplay_internal_api: 'not_verified',
    caddy_internal_route_acl: 'not_verified',
    sqlite_wal_backup_restore: 'not_verified',
    browser_games_runtime: 'not_verified',
    customer_data_release_authorized: false,
    deploy_performed: false
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).length) {
    console.error('USAGE: node scripts/antigravity/vps-readonly-preflight.mjs');
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify(probeVpsReadiness({
      crmRoot: process.env.EVYD_CRM_APP_PATH || '/var/www/evydencia/current',
    }), null, 2));
  }
}
