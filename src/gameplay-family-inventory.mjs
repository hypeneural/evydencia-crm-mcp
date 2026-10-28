// Pure projection of all Natal CRM orders with an ACTIVE published Gameplay album.
// CRM commercial status is deliberately NOT an authorization rule for this
// authenticated operational inventory. Revoked/partial/no-session are excluded.
export function paginatePublishedFamilies(orders, records, {pagina,por_pagina}) {
 if(!Array.isArray(orders)||!(records instanceof Map)||
    !Number.isSafeInteger(pagina)||pagina<1||
    !Number.isSafeInteger(por_pagina)||por_pagina<1||por_pagina>50)
  throw Error('gameplay_contract_invalid');
 const available=orders.filter(order=>{
  const uuid=String(order?.order_uuid||order?.uuid||'').toLowerCase();
  const row=records.get(uuid);
  if(!row||row.crm_order_uuid!==uuid)throw Error('gameplay_contract_invalid');
  return row.state==='published_unverified';
 }).sort((a,b)=>{
  const diff=Number(b.order_id)-Number(a.order_id);
  return Number.isFinite(diff)&&diff!==0?diff:
    String(a.order_uuid||a.uuid).localeCompare(String(b.order_uuid||b.uuid));
 });
 const start=(pagina-1)*por_pagina;
 return {
  orders:available.slice(start,start+por_pagina),
  total:available.length,
  pagination:{
   page:pagina,per_page:por_pagina,total_matching:available.length,
   has_more:start+por_pagina<available.length
  }
 };
}
