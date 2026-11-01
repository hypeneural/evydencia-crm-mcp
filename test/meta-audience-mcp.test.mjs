// P25.1 Meta Audience MCP test suite: end-to-end gateway tools, OAuth scopes,
// confirmation gate, double CSV validation, and zero PII in text content.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes, createHash} from 'node:crypto';
import {rm, readFile, readdir, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createGateway} from '../src/live-gateway.mjs';
import {GATEWAY_SCOPE, SCOPE_AUDIENCE_EXPORT} from '../src/oauth-gateway.mjs';
import {validateMetaCustomerListCsv} from '../src/meta-audience-csv-validator.mjs';
import {buildMetaAudienceCsv, assertMetaAudienceUploadReady} from '../src/meta-audience-csv.mjs';

const KEY = randomBytes(32).toString('base64');
const REDIR = 'https://chatgpt.com/connector_platform_oauth_redirect';
const INTERNAL_TOK = 'fake-internal-crm-read-token-000001';
const TEST_DIR = resolve(tmpdir(), 'evyd-meta-audience-synthetic-' + process.pid + '-' + Date.now());

let crm, crmUrl;
const R = ['extension:bootstrap', 'extension:customer-read'];
const OPS = {
  'fake-op7-read': {id: 7, ab: R},
  'fake-op7-export': {id: 7, ab: [...R, 'extension:proposal-read']},
  'fake-op99-unauthorized': {id: 99, ab: R},
};

const env1 = data => JSON.stringify({schema_version: '1.0', generated_at: new Date().toISOString(), data});

function buildSyntheticBackendData(count = 110) {
  const records = [];
  // 1. 2026 Buyer (should be excluded)
  records.push({
    source: 'customer',
    source_id: 'customer-buyer-1',
    phone: '+5548999990001',
    email: 'buyer1@example.com',
    name: 'Carlos Comprador',
    bought_2026: true,
    purchase_check_status: 'verified',
    suppressed: false,
    suppression_check_status: 'verified',
    marketing_allowed: true,
    marketing_permission_status: 'verified',
    identity_status: 'verified',
  });
  // 2. Proposal linked to buyer by email (transitive exclusion)
  records.push({
    source: 'proposal_2026',
    source_id: 'proposal-buyer-link',
    phone: '+5548999990002',
    email: 'buyer1@example.com',
    name: 'Contato Vinculado Comprador',
    bought_2026: false,
    purchase_check_status: 'verified',
    suppressed: false,
    suppression_check_status: 'verified',
    marketing_allowed: true,
    marketing_permission_status: 'verified',
    identity_status: 'verified',
  });
  // 3. Suppressed contact (opt-out)
  records.push({
    source: 'customer',
    source_id: 'customer-suppressed-1',
    phone: '+5548999990003',
    email: 'optout@example.com',
    name: 'Silvia Optout',
    bought_2026: false,
    purchase_check_status: 'verified',
    suppressed: true,
    suppression_check_status: 'verified',
    marketing_allowed: true,
    marketing_permission_status: 'verified',
    identity_status: 'verified',
  });
  // 4. Eligible customers + proposals to satisfy >= 100 rows gate
  for (let i = 1; i <= count; i++) {
    const isCustomer = i <= Math.floor(count / 2);
    const subscriber = String(10000000 + i);
    records.push({
      source: isCustomer ? 'customer' : 'proposal_2026',
      source_id: isCustomer ? 'customer-' + i : 'proposal-' + i,
      phone: '+55489' + subscriber,
      email: isCustomer ? 'cliente' + i + '@example.com' : null,
      name: isCustomer ? 'Cliente ' + i : '',
      bought_2026: false,
      purchase_check_status: 'verified',
      suppressed: false,
      suppression_check_status: 'verified',
      marketing_allowed: true,
      marketing_permission_status: 'verified',
      identity_status: 'verified',
    });
  }

  const customerCount = records.filter(r => r.source === 'customer').length;
  const proposalCount = records.filter(r => r.source === 'proposal_2026').length;

  return {
    source: 'CRM_META_AUDIENCE_READ_ONLY',
    snapshot_id: 'snapshot-synthetic-test-2026',
    as_of: '2026-10-29T21:00:00-03:00',
    coverage: {
      snapshot_id: 'snapshot-synthetic-test-2026',
      as_of: '2026-10-29T21:00:00-03:00',
      target_year: 2026,
      purchase_rule: 'ANY_VALID_PURCHASE_2026',
      customers_complete: true,
      proposals_complete: true,
      purchases_2026_complete: true,
      suppression_complete: true,
      marketing_permission_complete: true,
      identity_crosscheck_complete: true,
      source_counts: {
        customers: customerCount,
        proposals: proposalCount,
      },
    },
    records,
  };
}

before(async () => {
  crm = createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const auth = req.headers.authorization || '';
    const tok = auth.replace(/^Bearer /, '');
    const send = (status, body) => {
      res.writeHead(status, {'Content-Type': 'application/json'});
      res.end(body);
    };

    if (u.pathname === '/api/v1/extension/bootstrap') {
      const op = OPS[tok];
      if (!op) return send(401, JSON.stringify({message: 'Unauthenticated.'}));
      return send(200, env1({
        operator: {id: op.id, name: 'Operador Teste'},
        server: {timezone: 'America/Sao_Paulo', api_version: '1.0', minimum_extension_version: '1.0.0'},
        features: {proposals: {enabled: true}, natal_2026: {enabled: true, reference_year: 2026}},
        token: {abilities: op.ab, expires_at: '2099-01-01T00:00:00Z'},
      }));
    }
    send(404, JSON.stringify({error: 'not_found'}));
  });

  await new Promise(r => crm.listen(0, '127.0.0.1', r));
  crmUrl = 'http://127.0.0.1:' + crm.address().port;
});

after(async () => {
  await new Promise(r => crm.close(r));
  await rm(TEST_DIR, {recursive: true, force: true}).catch(() => {});
});

function createTestGateway(overrides = {}, gatewayOpts = {}) {
  const env = {
    EVYD_PUBLIC_URL: 'http://localhost',
    CRM_BASE_URL: crmUrl,
    EVYD_GATEWAY_KEY: KEY,
    EVYD_ALLOWED_OPERATOR_IDS: '7',
    EVYD_AUDIENCE_ALLOWED_OPERATOR_IDS: '7',
    EVYD_ENABLE_OPERATOR_FULL_CRM: '1',
    EVYD_META_AUDIENCE_ENABLED: '1',
    EVYD_AUDIENCE_EXPORT_ENABLED: '1',
    EVYD_INTERNAL_READ_TOKEN: INTERNAL_TOK,
    META_PRIVATE_CSV_DIR: TEST_DIR,
    CRM_REQUEST_TIMEOUT_MS: '400',
    ...overrides,
  };
  return createGateway(env, gatewayOpts);
}

async function authorizeToken(gateway, opToken, requestedScopes = [GATEWAY_SCOPE, SCOPE_AUDIENCE_EXPORT]) {
  const call = (path, init) => gateway.handle(new Request(new URL(path, 'http://localhost'), init), {ip: '10.0.0.1', host: 'localhost'});
  const form = o => ({method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(o).toString()});

  const reg = await call('/register', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({redirect_uris: [REDIR], token_endpoint_auth_method: 'none', client_name: 'ChatGPT'}),
  });
  assert.equal(reg.status, 201);
  const {client_id} = await reg.json();

  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const q = new URLSearchParams({
    response_type: 'code',
    client_id,
    redirect_uri: REDIR,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'st-123',
    resource: 'http://localhost/mcp',
    scope: requestedScopes.join(' '),
  });

  const pg = await call('/authorize?' + q);
  assert.equal(pg.status, 200);
  const txn = /name="txn" value="([^"]+)"/.exec(await pg.text())[1];

  const post = await call('/authorize', form({txn, crm_token: opToken, action: 'approve'}));
  assert.equal(post.status, 302);
  const loc = new URL(post.headers.get('location'));
  const code = loc.searchParams.get('code');

  const t = await call('/token', form({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIR,
    client_id,
    code_verifier: verifier,
    resource: 'http://localhost/mcp',
  }));
  assert.equal(t.status, 200);
  return await t.json();
}

test('Meta Audience: discovery and capabilities report preview and export tools', async () => {
  const gw = createTestGateway();
  const tokens = await authorizeToken(gw, 'fake-op7-export');
  assert.ok(tokens.access_token);
  assert.ok(tokens.scope.includes('crm.audience.export'));

  const client = new Client({name: 'test-client', version: '1.0.0'});
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    requestInit: {headers: {Authorization: `Bearer ${tokens.access_token}`}},
    fetch: (url, init) => gw.handle(new Request(url, init), {ip: '10.0.0.1', host: 'localhost'}),
  });
  await client.connect(transport);

  const {tools} = await client.listTools();
  const names = tools.map(t => t.name);
  assert.ok(names.includes('crm_meta_publico_natal_previa'), 'crm_meta_publico_natal_previa must be registered');
  assert.ok(names.includes('crm_meta_publico_natal_exportar'), 'crm_meta_publico_natal_exportar must be registered');

  const cap = await client.callTool({name: 'crm_capacidades', arguments: {}});
  assert.equal(cap.structuredContent.meta_audience_enabled, true);
  assert.equal(cap.structuredContent.oauth_authorization.audience_export_scope_granted, true);
  assert.equal(cap.structuredContent.oauth_authorization.audience_export_tool_enabled, true);

  await client.close();
});

test('Meta Audience: crm.read alone can request preview, but export is blocked with 403', async () => {
  const gw = createTestGateway();
  // Authorize with ONLY crm.read
  const tokens = await authorizeToken(gw, 'fake-op7-read', [GATEWAY_SCOPE]);
  assert.equal(tokens.scope, GATEWAY_SCOPE);
  assert.ok(!tokens.scope.includes('crm.audience.export'));

  const client = new Client({name: 'test-client', version: '1.0.0'});
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    requestInit: {headers: {Authorization: `Bearer ${tokens.access_token}`}},
    fetch: (url, init) => gw.handle(new Request(url, init), {ip: '10.0.0.1', host: 'localhost'}),
  });
  await client.connect(transport);

  // Per-tool SDK scopeChallenge must issue OAuth 403 before handler,
  // allowing the MCP client to perform scope step-up.
  await assert.rejects(async()=>client.callTool({
    name: 'crm_meta_publico_natal_exportar',
    arguments: {confirmado_pelo_operador: true,snapshot_id:'snapshot-invalid-2026'},
  }),err=>/403|insufficient.scope|Audience export scope/i.test(String(err)), 'expected HTTP OAuth scope challenge');

  await client.close();
});

test('Meta Audience: export requires explicit confirmado_pelo_operador: true', async () => {
  const gw = createTestGateway();
  const tokens = await authorizeToken(gw, 'fake-op7-export');

  const client = new Client({name: 'test-client', version: '1.0.0'});
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    requestInit: {headers: {Authorization: `Bearer ${tokens.access_token}`}},
    fetch: (url, init) => gw.handle(new Request(url, init), {ip: '10.0.0.1', host: 'localhost'}),
  });
  await client.connect(transport);

  const res = await client.callTool({
    name: 'crm_meta_publico_natal_exportar',
    arguments: {confirmado_pelo_operador: false, snapshot_id: 'snapshot-dummy-12345678'},
  });
  assert.equal(res.isError, true);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.error, 'operator_confirmation_required');

  await client.close();
});

test('Meta Audience: end-to-end execution of preview and export with synthetic data (zero PII in text)', async () => {
  const synthetic = buildSyntheticBackendData(105);
  const legacyReader = {
    metaAudienceRead: async () => synthetic,
  };
  const gw = createTestGateway({}, {legacyReader});
  const tokens = await authorizeToken(gw, 'fake-op7-export');

  const client = new Client({name: 'test-client', version: '1.0.0'});
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    requestInit: {headers: {Authorization: `Bearer ${tokens.access_token}`}},
    fetch: (url, init) => gw.handle(new Request(url, init), {ip: '10.0.0.1', host: 'localhost'}),
  });
  await client.connect(transport);

  // 1. Call preview tool
  const previa = await client.callTool({
    name: 'crm_meta_publico_natal_previa',
    arguments: {forcar_atualizacao: false},
  });
  assert.equal(previa.isError, undefined);
  assert.equal(previa.structuredContent.source, 'CRM_META_AUDIENCE_PREVIEW');
  assert.equal(previa.structuredContent.ready_for_export, true);
  assert.equal(previa.structuredContent.counts.export_rows, 105);
  // Verify zero PII in text response
  const previaText = previa.content[0].text;
  assert.ok(!previaText.includes('4899999'), 'previa text must not contain phone numbers');
  assert.ok(!previaText.includes('@example.com'), 'previa text must not contain email addresses');
  assert.ok(!previaText.includes('Comprador'), 'previa text must not contain names');
  assert.match(previaText, /supressoes_exclusivas=\d+, optouts_marketing_total=\d+, sobreposicao_compra_e_optout=\d+/, 'previa text must explain suppression scope and buyer overlap');

  // 2. Call export tool with confirmed operator
  const exp = await client.callTool({
    name: 'crm_meta_publico_natal_exportar',
    arguments: {confirmado_pelo_operador: true, snapshot_id: previa.structuredContent.snapshot_id},
  });
  assert.equal(exp.isError, undefined);
  assert.equal(exp.structuredContent.source, 'CRM_META_AUDIENCE_EXPORT');
  assert.equal(exp.structuredContent.ready, true);
  assert.equal(exp.structuredContent.rows, 105);
  assert.equal(exp.structuredContent.unique_phones, 105);
  assert.equal(typeof exp.structuredContent.sha256, 'string');
  assert.equal(exp.structuredContent.sha256.length, 64);
  assert.equal(exp.structuredContent.delivery_status,'private_gateway_storage_only');
  assert.match(exp.structuredContent.arquivo_id,/^[0-9a-f-]{36}$/i);
  assert.equal(exp.structuredContent.arquivo_privado_path,undefined,
    'server-side filesystem paths must not leak in tool payloads');

  // Verify zero PII in export text response
  const expText = exp.content[0].text;
  assert.ok(!expText.includes('4899999'), 'export text must not contain phone numbers');
  assert.ok(!expText.includes('@example.com'), 'export text must not contain email addresses');
  assert.ok(expText.includes(exp.structuredContent.sha256), 'export text mentions SHA-256');

  // Verify file on disk
  const names=await readdir(TEST_DIR);
  const expected='meta-audience-natal2026-'+exp.structuredContent.arquivo_id+'.csv';
  assert.ok(names.includes(expected),'file is stored in injected private directory');
  const privateFile=resolve(TEST_DIR,expected);
  const info=await stat(privateFile);
  if(process.platform!=='win32')assert.equal(info.mode&0o077,0,'CSV file must be private 0600');
  const savedCsv = await readFile(privateFile, 'utf8');
  const validated = validateMetaCustomerListCsv(savedCsv, {minRows: 100});
  assert.equal(validated.ready, true);
  assert.equal(validated.rows, 105);
  assert.equal(validated.sha256, exp.structuredContent.sha256);

  await client.close();
});

test('Meta Audience: domain exclusions, upload gate and independent CSV validator', async () => {
  const synthetic = buildSyntheticBackendData(105);
  const result = buildMetaAudienceCsv({records: synthetic.records, coverage: synthetic.coverage});

  // Verify domain exclusions:
  // 1. 2026 Buyer is excluded
  assert.equal(result.counts.excluded_2026_buyer, 1);
  // 2. Suppressed contact is excluded
  assert.equal(result.counts.excluded_suppressed, 1);
  // 3. Exactly 105 eligible contacts exported
  assert.equal(result.counts.export_rows, 105);

  // Upload ready gate
  const ready = assertMetaAudienceUploadReady(result, {minRows: 100});
  assert.equal(ready.ready, true);
  assert.equal(ready.rows, 105);

  // Independent strict validator check
  const validated = validateMetaCustomerListCsv(result.csv, {minRows: 100});
  assert.equal(validated.ready, true);
  assert.equal(validated.rows, 105);
  assert.equal(validated.unique_phones, 105);
  assert.equal(validated.sha256, result.sha256);

  // Assert CSV structure:
  const lines = result.csv.split('\r\n').filter(Boolean);
  assert.equal(lines[0], 'email,phone,fn,ln,country');
  // Confirm buyer phone and suppressed phone are completely absent
  assert.ok(!result.csv.includes('5548999990001'), 'buyer phone must NOT be in CSV');
  assert.ok(!result.csv.includes('5548999990002'), 'buyer-linked proposal phone must NOT be in CSV');
  assert.ok(!result.csv.includes('5548999990003'), 'opt-out phone must NOT be in CSV');
  // Confirm no plus sign in any phone in the CSV and all country 'br'
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    assert.ok(/^55\d{10,11}$/.test(cols[1]), `phone in line ${i} must be digits only with 55`);
    assert.ok(!cols[1].includes('+'), 'phone must not have +');
    assert.equal(cols[4], 'br', 'country must be br');
  }
});


test('Meta Audience: preview snapshot is mandatory, never silently rebuilt', async()=>{
 const legacyReader={metaAudienceRead:async()=>buildSyntheticBackendData(105)};
 const gw=createTestGateway({}, {legacyReader});
 const tokens=await authorizeToken(gw,'fake-op7-export');
 const client=new Client({name:'test-client',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(new URL('http://localhost/mcp'),{
  requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}},
  fetch:(url,init)=>gw.handle(new Request(url,init),{ip:'10.0.0.1',host:'localhost'}),
 });
 await client.connect(transport);
 const missing=await client.callTool({name:'crm_meta_publico_natal_exportar',
  arguments:{confirmado_pelo_operador:true,snapshot_id:'snapshot-does-not-exist-2026'}});
 assert.equal(missing.isError,true);
 assert.equal(JSON.parse(missing.content[0].text).error,'crm_meta_audience_snapshot_missing_or_expired');
 await client.close();
});
test('Meta Audience: audience allowlist missing fails closed, even with global CRM access', async()=>{
 const gw=createTestGateway({EVYD_AUDIENCE_ALLOWED_OPERATOR_IDS:''});
 const tok=await authorizeToken(gw,'fake-op7-export');
 assert.ok(!tok.scope.includes('crm.audience.export'));
});
test('Meta Audience: preview blocks legal policy missing without echoing PII', async()=>{
 const legacyReader={metaAudienceRead:async()=>({
  source:'CRM_META_AUDIENCE_READ_ONLY',available:false,reason:'legal_basis_not_verified',
  customer_phone:'DO_NOT_LEAK_5548999999999',
 })};
 const gw=createTestGateway({}, {legacyReader});
 const tokens=await authorizeToken(gw,'fake-op7-export');
 const client=new Client({name:'test-client',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(new URL('http://localhost/mcp'),{
  requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}},
  fetch:(url,init)=>gw.handle(new Request(url,init),{ip:'10.0.0.1',host:'localhost'}),
 });
 await client.connect(transport);
 const r=await client.callTool({name:'crm_meta_publico_natal_previa',arguments:{}});
 assert.equal(r.isError,true);
 assert.equal(JSON.parse(r.content[0].text).error,'crm_meta_audience_legal_basis_not_verified');
 assert.doesNotMatch(JSON.stringify(r),/5548999999999/);
 await client.close();
});


test('Meta Audience: buyers added after preview invalidate old CSV and require new review', async()=>{
 let calls=0;
 const legacyReader={metaAudienceRead:async()=>{
  const snapshot=buildSyntheticBackendData(105);
  calls++;
  if(calls>1) snapshot.records[3].bought_2026=true;
  return snapshot;
 }};
 const gw=createTestGateway({}, {legacyReader});
 const tokens=await authorizeToken(gw,'fake-op7-export');
 const client=new Client({name:'test-client',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(new URL('http://localhost/mcp'),{
  requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}},
  fetch:(url,init)=>gw.handle(new Request(url,init),{ip:'10.0.0.1',host:'localhost'}),
 });
 await client.connect(transport);
 const preview=await client.callTool({name:'crm_meta_publico_natal_previa',arguments:{}});
 assert.equal(preview.isError,undefined);
 const exp=await client.callTool({name:'crm_meta_publico_natal_exportar',
  arguments:{confirmado_pelo_operador:true,snapshot_id:preview.structuredContent.snapshot_id}});
 assert.equal(exp.isError,true);
 assert.equal(JSON.parse(exp.content[0].text).error,'crm_meta_audience_snapshot_changed_review_again');
 await client.close();
});


test('Meta Audience: gestor preview reuses 45s snapshot unless explicitly forced',async()=>{
 let reads=0;
 const legacyReader={metaAudienceRead:async()=>{
  reads++;
  const snapshot=buildSyntheticBackendData(105);
  snapshot.snapshot_id='snapshot-fresh-'+reads+'-2026';
  snapshot.coverage.snapshot_id=snapshot.snapshot_id;
  return snapshot;
 }};
 const gw=createTestGateway({}, {legacyReader});
 const tokens=await authorizeToken(gw,'fake-op7-export');
 const client=new Client({name:'test-client',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(new URL('http://localhost/mcp'),{
  requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}},
  fetch:(url,init)=>gw.handle(new Request(url,init),{ip:'10.0.0.1',host:'localhost'}),
 });
 await client.connect(transport);
 const p1=await client.callTool({name:'crm_meta_publico_natal_previa',arguments:{forcar_atualizacao:false}});
 const p2=await client.callTool({name:'crm_meta_publico_natal_previa',arguments:{forcar_atualizacao:false}});
 assert.equal(reads,1,'second non-forced preview must reuse the recent snapshot');
 assert.equal(p1.structuredContent.snapshot_id,p2.structuredContent.snapshot_id);
 const p3=await client.callTool({name:'crm_meta_publico_natal_previa',arguments:{forcar_atualizacao:true}});
 assert.equal(reads,2,'forced preview must refresh from CRM');
 assert.notEqual(p1.structuredContent.snapshot_id,p3.structuredContent.snapshot_id);
 await client.close();
});


test('Meta Audience: export flag by itself never enables master feature in shared gateway',()=>{
 const gw=createTestGateway({EVYD_META_AUDIENCE_ENABLED:'0',EVYD_AUDIENCE_EXPORT_ENABLED:'1'});
 assert.equal(gw.cfg.metaAudienceEnabled,false);
 assert.equal(gw.cfg.audienceExportEnabled,false);
});


test('Meta Audience: export fails closed if CSV directory is inside the Git checkout', async()=>{
 const inside=resolve(process.cwd(),'.test-meta-inside-repo-'+Date.now());
 const legacyReader={metaAudienceRead:async()=>buildSyntheticBackendData(105)};
 const gw=createTestGateway({META_PRIVATE_CSV_DIR:inside},{legacyReader});
 const tokens=await authorizeToken(gw,'fake-op7-export');
 const client=new Client({name:'test-client',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(new URL('http://localhost/mcp'),{
  requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}},
  fetch:(url,init)=>gw.handle(new Request(url,init),{ip:'10.0.0.1',host:'localhost'}),
 });
 try{
  await client.connect(transport);
  const preview=await client.callTool({name:'crm_meta_publico_natal_previa',arguments:{}});
  assert.equal(preview.isError,undefined);
  const exp=await client.callTool({name:'crm_meta_publico_natal_exportar',
   arguments:{confirmado_pelo_operador:true,snapshot_id:preview.structuredContent.snapshot_id}});
  assert.equal(exp.isError,true);
  const text=exp.content[0].text;
  assert.match(text,/crm_meta_audience_private_directory_inside_checkout/);
  assert.doesNotMatch(text,/@example\.com|55489999/);
  const entries=await readdir(inside);
  assert.equal(entries.filter(name=>name.endsWith('.csv')).length,0);
 }finally{
  await client.close().catch(()=>{});
  await rm(inside,{recursive:true,force:true});
 }
});
