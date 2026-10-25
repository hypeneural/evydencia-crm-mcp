// The only default entrypoint for local ChatGPT/Inspector MOCK.
// stdout is RESERVED for MCP JSON-RPC frames. Never console.log here.
import {readFile} from 'node:fs/promises';
import {inspectMockEnvText,inspectMockEnvironment} from '../src/mock-safety.mjs';
let raw;
try{raw=await readFile('.env','utf8')}catch{console.error('MOCK_START_BLOCKED: local .env missing');process.exit(1)}
const file=inspectMockEnvText(raw);
if(!file.ok){console.error('MOCK_START_BLOCKED: unsafe .env ('+[...new Set(file.issues)].join(',')+')');process.exit(1)}
const active=inspectMockEnvironment(process.env);
if(!active.ok){console.error('MOCK_START_BLOCKED: unsafe inherited environment ('+active.issues.join(',')+')');process.exit(1)}
await import('../src/server.mjs');
