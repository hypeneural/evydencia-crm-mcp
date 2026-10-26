import test from 'node:test';
import assert from 'node:assert/strict';
import { probeVpsReadiness } from '../scripts/antigravity/vps-readonly-preflight.mjs';

test('VPS preflight cannot assert live CRM or Gameplay from filesystem presence',()=>{
 const probed=[];
 const result=probeVpsReadiness({
  crmRoot:'/synthetic-crm',mcpRoot:'/synthetic-mcp',
  filePresent:path=>{probed.push(path);return true;},
  serviceState:name=>{assert.equal(name,'evydencia-crm-mcp-live.service');return 'active';}
 });
 assert.equal(probed.length,2);
 assert.equal(result.local_php_bridge_prerequisites_present,true);
 assert.equal(result.mcp_service_state,'active');
 assert.equal(result.canonical_search_vps,'not_verified');
 assert.equal(result.gameplay_internal_api,'not_verified');
 assert.equal(result.caddy_internal_route_acl,'not_verified');
 assert.equal(result.browser_games_runtime,'not_verified');
 assert.equal(result.customer_data_release_authorized,false);
 assert.equal(result.deploy_performed,false);
});
test('VPS preflight preserves missing prerequisite state',()=>{
 const result=probeVpsReadiness({
  filePresent:()=>false,serviceState:()=> 'unknown_or_inactive'
 });
 assert.equal(result.local_php_bridge_prerequisites_present,false);
 assert.equal(result.canonical_search_vps,'not_verified');
 assert.equal(result.mcp_service_state,'unknown_or_inactive');
});
