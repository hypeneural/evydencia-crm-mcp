import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {capabilityManifest} from '../src/capabilities.mjs';
import {natalResumo,agendaHoje,buscarClienteNome,simularAgendamento} from '../src/mock-business.mjs';
import {readFile} from 'node:fs/promises';
test('manifest nao promete live para capacidades futuras',()=>{
 const v=capabilityManifest({mock:false,privateEnabled:false});
 assert.equal(v.tools.find(x=>x.tool==='crm_natal_resumo').state,'MOCK_ONLY');
 assert.equal(v.tools.find(x=>x.tool==='crm_agendar_proposta_natal').state,'WRITE_GATED');
 assert.equal(v.tools.find(x=>x.tool==='crm_cliente_360').state,'BLOCKED_AUTH');
 const demo=capabilityManifest({mock:true});
 assert.equal(demo.tools.find(x=>x.tool==='crm_natal_resumo').state,'MOCK_ACTIVE');
});
test('resumo ficticio em centavos e nao receita real',async()=>{
 const r=await natalResumo();assert.equal(r.mock,true);assert.equal(r.source,'fixture');assert.equal(r.sales.sessions_sold,137);assert.equal(r.sales.gross_cents,12845000);assert.equal(r.real_dispatch,false);
});
test('agenda nunca diz que data sem fixture nao tem reservas reais',async()=>{
 const a=await agendaHoje('2026-10-24');assert.equal(a.total,6);assert.equal(a.available,true);
 const b=await agendaHoje('2026-10-25');assert.equal(b.available,false);assert.match(b.warning,/não significa/i);
 await assert.rejects(()=>agendaHoje('../'),/invalid_date/);
});
test('busca por nome explicita ambiguidade e nao expoe contatos',async()=>{
 const one=await buscarClienteNome('Marina');assert.equal(one.status,'matched');assert.equal(one.customers[0].natal_2026_purchased,true);
 const multi=await buscarClienteNome('Mari');assert.equal(multi.status,'ambiguous');
 assert.ok(!JSON.stringify(one).includes('48999990011'));
 await assert.rejects(()=>buscarClienteNome('M'),/invalid_name/);
});
test('simulacao requer referencia e autorizacao, sem escrita real',async()=>{
 const args={telefone:'48999990001',preview_ref:'demo-preview-0001'};
 await assert.rejects(()=>simularAgendamento({...args,confirmacao_usuario:false}),/confirmation_required/);
 await assert.rejects(()=>simularAgendamento({...args,preview_ref:'inventada',confirmacao_usuario:true}),/invalid_preview_ref/);
 await assert.rejects(()=>simularAgendamento({...args,telefone:'48999990004',confirmacao_usuario:true}),/invalid_fixture_phone/);
 const r=await simularAgendamento({...args,confirmacao_usuario:true});
 assert.equal(r.mock,true);assert.equal(r.scheduled,false);assert.equal(r.real_dispatch,false);assert.equal(r.delivery_status,'NOT_SENT');
});
test('hook de seguranca Antigravity interrompe chamadas reais e pede confirmacao no push',()=>{
 function hook(tool,args){
  const r=spawnSync(process.execPath,['scripts/antigravity-hook.mjs'],{input:JSON.stringify({toolCall:{name:tool,args}}),encoding:'utf8',timeout:5000});
  assert.equal(r.status,0,r.stderr);
  return JSON.parse(r.stdout);
 }
 assert.equal(hook('run_command',{CommandLine:'curl -X POST https://crm.example/api/v1/extension/proposals/schedule'}).decision,'deny');
 assert.equal(hook('run_command',{CommandLine:'git push origin main'}).decision,'force_ask');
 assert.equal(hook('run_command',{CommandLine:'npm test'}).decision,'allow');
 assert.equal(hook('write_to_file',{TargetFile:'C:\\repo\\evydencia-crm\\.env'}).decision,'force_ask');
});
test('antigravity modular security rule has required frontmatter',async()=>{
 const rule=await readFile(new URL('../.agents/rules/security.md',import.meta.url),'utf8');
 assert.match(rule,/^---\r?\ntrigger:\s*always_on/m);
 const hooks=JSON.parse(await readFile(new URL('../.agents/hooks.json',import.meta.url),'utf8'));
 assert.ok(Object.values(hooks).some(v=>v.PreToolUse));
});
