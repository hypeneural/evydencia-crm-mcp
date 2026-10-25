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
// The tunnel daemon needs its runtime credential; the child MCP server does not.
// Remove inherited connector/developer credentials from this child process only.
for(const key of ['CONTROL_PLANE_API_KEY','OPENAI_API_KEY','GITHUB_TOKEN','GH_TOKEN'])delete process.env[key];
await import('../src/server.mjs');
