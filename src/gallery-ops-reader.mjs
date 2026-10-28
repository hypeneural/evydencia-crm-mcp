// Separate, read-only, loopback-only service for the Gallery Ops BFF.
// Does not expose a new ChatGPT MCP tool or alter PrintServer, Z-API, or the existing gateway.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UUID_OF_SCHEMA = 1;
const path = '/internal/v1/gallery-ops/valid-orders';
const script = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/crm-natal-bridge.php');
function equal(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function send(response, code, data) {
  response.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(JSON.stringify(data));
}
export async function runPhpGalleryOrders(payload, {
  spawnFn = spawn, php = 'php', scriptPath = script, timeoutMs = 20000,
} = {}) {
  const subprocess = spawnFn(php, [scriptPath, '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
  return await new Promise((resolvePromise, reject) => {
    let stdout = '', stderrBytes = 0, finished = false;
    const finish = (error, data) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise(data);
    };
    const timer = setTimeout(() => { subprocess.kill('SIGKILL'); finish(new Error('php_timeout')); }, timeoutMs);
    subprocess.stdout.on('data', chunk => {
      stdout += String(chunk);
      if (Buffer.byteLength(stdout) > 256000) { subprocess.kill('SIGKILL'); finish(new Error('php_stdout_limit')); }
    });
    subprocess.stderr.on('data', chunk => {
      stderrBytes += chunk.length; // Never log PHP errors, names or secrets.
      if (stderrBytes > 8192) subprocess.kill('SIGKILL');
    });
    subprocess.on('error', err => finish(err));
    subprocess.on('close', code => {
      if (code !== 0) return finish(new Error('php_failed'));
      try {
        const data = JSON.parse(stdout);
        if (data?.schema_version !== UUID_OF_SCHEMA || data?.source !== 'crm_canonical_valid_natal_orders'
            || !Array.isArray(data.items) || !Number.isSafeInteger(data.total_valid)) throw Error();
        finish(null, data);
      } catch { finish(new Error('php_contract_invalid')); }
    });
    subprocess.stdin.on('error', () => {}); // Failure is reported through close/error.
    subprocess.stdin.end(JSON.stringify({ mode: 'gallery.ops.valid_orders', ...payload }));
  });
}
function inputValid(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (Object.keys(data).some(key => !['as_of', 'after_id', 'limit'].includes(key))) return false;
  if (data.as_of !== undefined && (typeof data.as_of !== 'string'
      || !/^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(data.as_of))) return false;
  if (data.after_id !== undefined && (!Number.isSafeInteger(data.after_id) || data.after_id < 0)) return false;
  if (data.limit !== undefined && (!Number.isSafeInteger(data.limit) || data.limit < 1 || data.limit > 200)) return false;
  return true;
}
export function createGalleryOpsReader({ secret, queryOrders = runPhpGalleryOrders } = {}) {
  if (typeof secret !== 'string' || secret.length < 32 || /[\r\n]/.test(secret)) {
    throw new Error('GALLERY_OPS_READER_SECRET_REQUIRED');
  }
  return createServer(async (request, response) => {
    if ((request.url || '').split('?')[0] !== path) return send(response, 404, { error: 'NOT_FOUND' });
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    const offered = request.headers.authorization;
    if (typeof offered !== 'string' || !offered.startsWith('Bearer ')
        || !equal(offered.slice(7), secret)) return send(response, 401, { error: 'UNAUTHORIZED' });
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return send(response, 415, { error: 'CONTENT_TYPE_INVALID' });
    }
    let raw = '', bytes = 0;
    try {
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 1024) return send(response, 413, { error: 'BODY_TOO_LARGE' });
        raw += chunk.toString('utf8');
      }
      const input = JSON.parse(raw);
      if (!inputValid(input)) return send(response, 422, { error: 'INVALID_INPUT' });
      const data = await queryOrders(input);
      if (!data || data.schema_version !== 1 || !Array.isArray(data.items)
          || !Number.isSafeInteger(data.total_valid)) throw Error('INVALID_BRIDGE_RESULT');
      return send(response, 200, data);
    } catch {
      // No PII, secrets, PHP stack traces or database exceptions in HTTP errors.
      return send(response, 503, { error: 'CANONICAL_READER_UNAVAILABLE' });
    }
  });
}
