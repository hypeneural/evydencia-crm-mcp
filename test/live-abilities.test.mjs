import test from 'node:test';import assert from 'node:assert/strict';
import {assertReadOnlyAbilities} from '../src/live-abilities.mjs';
test('bootstrap e consulta cliente exigem abilities mínimas',()=>{
 assert.equal(assertReadOnlyAbilities(['extension:bootstrap']).safe,true);
 assert.equal(assertReadOnlyAbilities(['extension:bootstrap','extension:customer-read'],'customer-360').safe,true);
 assert.throws(()=>assertReadOnlyAbilities(['extension:bootstrap'],'customer-context'),/crm_overprivileged/);
});
test('token de operador com escrita é recusado mesmo para GET',()=>{
 for(const token of [['extension:bootstrap','extension:proposal-write'],['*'],['extension:bootstrap','extension:customer-read','extension:proposal-write']])
  assert.throws(()=>assertReadOnlyAbilities(token),/crm_overprivileged/);
 assert.throws(()=>assertReadOnlyAbilities(['extension:bootstrap','extension:customer-read'],'proposal-preview'),/crm_overprivileged/);
});
