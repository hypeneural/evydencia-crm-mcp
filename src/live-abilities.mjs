export function assertReadOnlyAbilities(abilities,mode='bootstrap'){
 const approved=new Set(['extension:bootstrap','extension:customer-read','extension:proposal-read']);
 if(!Array.isArray(abilities)||abilities.length===0||abilities.some(x=>!approved.has(x))||
 !abilities.includes('extension:bootstrap')||
 (mode!=='bootstrap'&&!abilities.includes(mode==='proposal-preview'?'extension:proposal-read':'extension:customer-read'))){
  throw Error('crm_overprivileged_or_missing_scope');
 }
 return {safe:true,abilities_count:abilities.length};
}
