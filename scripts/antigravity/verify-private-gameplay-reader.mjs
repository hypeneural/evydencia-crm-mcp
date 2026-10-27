#!/usr/bin/env node
// Safe local-loopback verification of the Gameplay metadata reader.
// No CRM orders, customer tokens, writes, printing, Z-API calls or secret logging.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SYNTHETIC_UUID = '00000000-0000-4000-8000-000000000000';
const MAX_BYTES = 65536;
const STATES = new Set(['not_found', 'not_published', 'partial', 'revoked', 'published_unverified']);
const fail = code => { throw Error(code); };

export function assertLoopbackOrigin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { fail('SIDE_ORIGIN_INVALID'); }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' ||
      parsed.username || parsed.password || parsed.pathname !== '/' ||
      parsed.search || parsed.hash || !parsed.port) fail('SIDE_ORIGIN_NOT_LOOPBACK');
  return parsed.origin;
}

async function boundedJson(response) {
  if (!response.body) fail('SIDE_RESPONSE_EMPTY');
  const limit = Number(response.headers.get('content-length') || 0);
  if (limit > MAX_BYTES) fail('SIDE_RESPONSE_OVERSIZED');
  const bytes = [];
  let total = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BYTES) fail('SIDE_RESPONSE_OVERSIZED');
    bytes.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(bytes).toString('utf8')); }
  catch { fail('SIDE_RESPONSE_INVALID_JSON'); }
}

export async function verifyPrivateReader({
  origin = 'http://127.0.0.1:4182',
  secret,
  fetchFn = fetch
} = {}) {
  const base = assertLoopbackOrigin(origin);
  const checks = [];
  async function probe(name, path, expected, { method = 'GET', authenticated = false, body } = {}) {
    let response;
    try {
      response = await fetchFn(base + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(3000),
        headers: {
          Accept: 'application/json',
          ...(body ? {'Content-Type':'application/json'} : {}),
          ...(authenticated ? {Authorization:'Bearer ' + secret} : {})
        },
        ...(body ? {body: JSON.stringify(body)} : {})
      });
    } catch { fail('SIDE_NETWORK_UNAVAILABLE'); }
    if (response.status !== expected) fail('SIDE_' + name.toUpperCase() + '_HTTP_' + response.status);
    checks.push({name, status:response.status});
    return response;
  }
  const health = await boundedJson(await probe('health', '/healthz', 200));
  if (health?.status !== 'ok') fail('SIDE_HEALTH_INVALID');
  for (const path of ['/', '/demo/fotos', '/s/forensic-synthetic', '/s/forensic-synthetic/fotos']) {
    await probe('public_denied', path, 404);
  }
  await probe('head_denied', '/s/forensic-synthetic', 404, {method:'HEAD'});
  await probe('unauthorized', '/internal/v1/sessions/lookup-batch', 401, {
    method:'POST', body:{crm_order_uuids:[SYNTHETIC_UUID]}
  });
  if (!secret) {
    return {status:'INCOMPLETE_NO_AUTHORIZED_READER_SECRET', pass:false, checks,
      dataset_proven:false, customer_links_verified:false};
  }
  if (typeof secret !== 'string' || secret.length < 32 || /\s/.test(secret))
    fail('SIDE_SECRET_INVALID');
  const result = await boundedJson(await probe('authorized_batch','/internal/v1/sessions/lookup-batch',200,{
    method:'POST',authenticated:true,body:{crm_order_uuids:[SYNTHETIC_UUID]}
  }));
  if (result?.schema_version !== 1 || result?.source !== 'gameplay_catalog' ||
      !Array.isArray(result.results) || result.results.length !== 1 ||
      result.results[0]?.crm_order_uuid !== SYNTHETIC_UUID ||
      !STATES.has(result.results[0]?.state) || result.results[0]?.state !== 'not_found' ||
      result.results[0]?.hub_url !== null || result.results[0]?.gallery_url !== null ||
      result.results[0]?.games_runtime_verified !== false) fail('SIDE_PRIVATE_CONTRACT_INVALID');
  await probe('links_disabled', '/internal/v1/sessions/lookup', 409, {
    method:'POST',authenticated:true,
    body:{crm_order_uuid:SYNTHETIC_UUID,include_links:true}
  });
  return {status:'PASS_PRIVATE_METADATA_CONTRACT',pass:true,checks,
    dataset_proven:false,customer_links_verified:false};
}

export function readApprovedSecret(env = process.env) {
  if (!env.EVYD_SIDE_READER_SECRET_FILE) return undefined;
  try { return readFileSync(env.EVYD_SIDE_READER_SECRET_FILE,'utf8').trim(); }
  catch { fail('SIDE_SECRET_FILE_UNAVAILABLE'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) fail('SIDE_ARGUMENTS_NOT_ACCEPTED');
    const report = await verifyPrivateReader({
      origin:process.env.EVYD_SIDE_READER_ORIGIN ?? 'http://127.0.0.1:4182',
      secret:readApprovedSecret()
    });
    process.stdout.write(JSON.stringify(report) + '\n');
    if (!report.pass) process.exitCode = 2;
  } catch(error) {
    // Only internally-defined codes. No exception objects or URLs in output.
    const code = /^SIDE_[A-Z0-9_]+$/.test(error?.message||'')
      ? error.message : 'SIDE_CHECK_FAILED';
    process.stderr.write(JSON.stringify({status:'FAIL',code}) + '\n');
    process.exitCode = 1;
  }
}
