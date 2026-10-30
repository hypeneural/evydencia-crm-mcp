// Synthetic golden prompt catalog contract only; does not execute LIVE tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const golden=JSON.parse(readFileSync(new URL('../docs/GOLDEN_PROMPTS_CHATGPT_20261025.json',import.meta.url),'utf8'));

test('routing golden set covers historical, finances, demographics, avatars, capabilities and Z-API',()=>{
 assert.equal(golden.schema_version,'1.0');
 const ids=new Set(golden.cases.map(c=>c.id));
 assert.equal(ids.size,golden.cases.length,'duplicate prompt id');
 for(const id of ['sales-today','current-compare','top-weeks','children-3','families-2','baby-packages','repeat-buyers','buy-timing','open-balance','order-avatar','visual-card-order','visual-card-customer','demographics-all-years','cross-order','capabilities','zapi-online','zapi-oauth-status','proposal-preview-not-zapi','no-unprompted-send','ambiguous-write','unrelated-weather']){
  assert.ok(ids.has(id),'missing '+id);
 }
 for(const c of golden.cases){
  assert.ok(typeof c.prompt==='string' && c.prompt.length>8);
  assert.equal(c.should_send_external_message,false,'the evaluation suite MUST NEVER send');
  if(c.classification==='negative')assert.equal(c.expected_tool,null);
  else assert.ok(c.expected_tool && typeof c.expected_tool==='string');
  assert.ok(!/token|cpf\s*\d{11}|password/i.test(JSON.stringify(c.expected_args)));
 }
});

test('financial prompts select CRM and cannot mutate WhatsApp',()=>{
 const current=golden.cases.find(c=>c.id==='sales-today');
 assert.deepEqual(current.expected_args,{perfil_resposta:'kpi_minimal'});
 const negatives=golden.cases.filter(c=>c.classification==='read_only');
 assert.ok(negatives.length>=3);
 assert.ok(negatives.every(c=>!String(c.expected_tool).startsWith('zapi_send_')));
});
