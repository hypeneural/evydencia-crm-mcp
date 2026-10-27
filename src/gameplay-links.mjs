// Operator-only projection of published customer destinations.
// /s/:token is BOTH the main experience and games hub; /fotos is its gallery.
// The token is a capability, not a publicly enumerable customer ID.
export function projectGameplayLinks(record){
 if(!record || typeof record!=='object')throw Error('gameplay_contract_invalid');
 const main=record.hub_url??null;
 const gallery=record.gallery_url??null;
 if(Boolean(main)!==Boolean(gallery) || (main&&gallery!==main+'/fotos'))
  throw Error('gameplay_contract_invalid');
 if(record.state!=='published_unverified' && (main||gallery))
  throw Error('gameplay_contract_invalid');
 return {
  main_url:main,
  games_url:main,
  gallery_url:gallery,
  customer_links_status:main?'available':'not_available',
  links_browser_verified:false
 };
}

// The metadata-only reader intentionally responds 409 to include_links=true.
// Retry without URLs for operator status, never invent URLs on error.
// Keep 409 visible in the result until publication/links are enabled.
export async function lookupGameplayWithCustomerLinks(client,uuid){
 try{
  const answer=await client.lookup([uuid],{includeLinks:true});
  const record=answer.results[0];
  return {record,links:projectGameplayLinks(record)};
 }catch(error){
  if(error?.message!=='gameplay_http_409')throw error;
  const answer=await client.lookup([uuid],{includeLinks:false});
  const record=answer.results[0];
  const links=projectGameplayLinks(record);
  return {record,links:{
   ...links,
   customer_links_status:'blocked_by_private_reader'
  }};
 }
}
