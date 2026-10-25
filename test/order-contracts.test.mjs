import test from 'node:test';
import assert from 'node:assert/strict';
import {buscarPedidosMock,detalhePedidoMock,natalForenseMock,orderFilterContract} from '../src/mock-orders.mjs';
import {historyProjection} from '../src/core.mjs';
import {readFile} from 'node:fs/promises';
test('catalogo de filtros distingue manager, integracao e API Extension',()=>{
 const d=orderFilterContract();assert.equal(d.mock,true);assert.equal(d.is_live,false);
 assert.ok(d.types.manager_order_list.includes('financial'));
 assert.ok(d.types.integration_search.includes('order.selection-start'));
 assert.deepEqual(d.types.extension_customer360,['phone','page','per_page']);
 assert.equal(Object.keys(d.statuses).length,13);
});
test('mock de pedidos aplica filtros canonicos, sem contaminar estatisticas agregadas',async()=>{
 const r=await buscarPedidosMock({product_slug:'natal',status:['payment_confirmed'],financial:'open'});
 assert.equal(r.mock,true);assert.equal(r.real_dispatch,false);assert.equal(r.total_matches,1);
 assert.equal(r.orders[0].id,'5001');assert.equal(r.orders[0].balance_cents,25000);
 assert.equal(r.fixture_total,10);assert.match(r.warning,/AMOSTRA/);
 assert.ok(!JSON.stringify(r).includes('cpf'));assert.ok(!JSON.stringify(r).includes('whatsapp'));
});
test('filtros por data da sessao, participantes e cliente sao deterministas',async()=>{
 const a=await buscarPedidosMock({data_tipo:'sessao',data_inicio:'2026-10-24',data_fim:'2026-10-24',participants:'with'});
 assert.equal(a.total_matches,3);assert.ok(a.orders.every(x=>x.session_date.startsWith('2026-10-24')));
 const b=await buscarPedidosMock({busca:'Marina'});assert.equal(b.total_matches,2);
 const c=await buscarPedidosMock({financial:'open'});assert.equal(c.total_matches,3);
});
test('cancelado, estornado e financeiro desconhecido permanecem distintos',async()=>{
 const r=await buscarPedidosMock({status:['order_aborted','payment_refunded','selection_schedule']});
 assert.equal(r.total_matches,3);
 assert.ok(r.orders.some(x=>x.payment_status==='cancelled'));
 assert.ok(r.orders.some(x=>x.payment_status==='refunded'));
 assert.ok(r.orders.some(x=>x.balance_cents===null&&x.payment_status==='unknown'));
});
test('invalidos nao ampliam a pesquisa',async()=>{
 await assert.rejects(()=>buscarPedidosMock({status:['estado_inventado']}),/invalid_status/);
 await assert.rejects(()=>buscarPedidosMock({status:'payment_confirmed'}),/invalid_status/);
 await assert.rejects(()=>buscarPedidosMock({data_inicio:'2026-10-30',data_fim:'2026-10-01'}),/invalid_date_range/);
 await assert.rejects(()=>buscarPedidosMock({limit:500}),/invalid_pagination/);
 await assert.rejects(()=>buscarPedidosMock({financial:'unknown'}),/invalid_financial/);
});
test('detalhe por ID ou UUID preserva centavos e oculta PII de participantes',async()=>{
 const byID=await detalhePedidoMock('5001');
 const byUUID=await detalhePedidoMock('11111111-aaaa-4111-8111-000000000101');
 assert.deepEqual(byID,byUUID);
 assert.equal(byID.order.financial.total_cents,45000);
 assert.equal(byID.order.financial.balance_pending_cents,25000);
 assert.equal(byID.order.participants_count,2);
 assert.equal(byID.real_dispatch,false);assert.ok(!JSON.stringify(byID).includes('birth'));
 await assert.rejects(()=>detalhePedidoMock('5000'),/mock_order_not_found/);
 await assert.rejects(()=>detalhePedidoMock('../'),/invalid_order_id/);
});
test('indicadores Natal respeitam fonte ficticia, BR01 e distincao financeira',async()=>{
 const fin=await natalForenseMock('financeiro');assert.equal(fin.is_live,false);
 assert.equal(fin.provenance.source,'STATIC_FIXTURE_TEST');
 assert.equal(fin.data.contracted_cents,fin.data.paid_cents+fin.data.balance_due_cents);
 const agenda=await natalForenseMock('agenda');assert.equal(agenda.data.scheduled_sessions+agenda.data.unscheduled_sessions,137);
 const pacotes=await natalForenseMock('pacotes');assert.equal(pacotes.data.packages.reduce((n,x)=>n+x.sessions,0),137);
 await assert.rejects(()=>natalForenseMock('inventado'),/invalid_module/);
});
test('projecao live Customer360 expõe apenas chaves verificadas, sem participantes',async()=>{
 const raw=JSON.parse(await readFile(new URL('../fixtures/customer-360.json',import.meta.url),'utf8'));
 const r=historyProjection(raw);
 assert.equal(r.orders[0].campaign_key,'natal_2026');
 assert.equal(r.orders[0].status,'session_schedule');
 assert.equal(r.natal_2026.loyalty_level,'LOYAL_CHRISTMAS');
 assert.equal(r.current_order.status.stage,'scheduled');
 assert.equal(r.orders[0].participants_count,1);
 for(const p of ['PARTICIPANTE-FICTICIO-NAO-EXIBIR','2018-01-01','whatsapp_e164','relationship'])assert.ok(!JSON.stringify(r).includes(p));
});
