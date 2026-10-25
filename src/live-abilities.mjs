const STRICT_READ_ABILITIES=new Set(['extension:bootstrap','extension:customer-read','extension:proposal-read']);
const OPERATOR_ABILITIES=new Set([
 'extension:bootstrap','extension:customer-read','extension:proposal-read',
 'extension:proposal-write','extension:participant-write','extension:gallery-read','extension:statistics-read'
]);
export function assertReadOnlyAbilities(abilities,mode='bootstrap'){
 if(!Array.isArray(abilities)||abilities.length===0||abilities.some(x=>!STRICT_READ_ABILITIES.has(x))||
 !abilities.includes('extension:bootstrap')||
 (mode!=='bootstrap'&&!abilities.includes(mode==='proposal-preview'?'extension:proposal-read':'extension:customer-read'))){
  throw Error('crm_overprivileged_or_missing_scope');
 }
 return {safe:true,abilities_count:abilities.length};
}
export function assertOperatorAbilities(abilities,mode='bootstrap',{strictReadOnly=false}={}){
 if(strictReadOnly)return assertReadOnlyAbilities(abilities,mode);
 if(!Array.isArray(abilities)||abilities.length===0||abilities.some(x=>!OPERATOR_ABILITIES.has(x))||
 !abilities.includes('extension:bootstrap')||
 (mode!=='bootstrap'&&!abilities.includes(mode==='proposal-preview'?'extension:proposal-read':'extension:customer-read'))){
  throw Error('crm_overprivileged_or_missing_scope');
 }
 return {
  safe:true,
  abilities_count:abilities.length,
  has_write_abilities:abilities.some(x=>x.endsWith('-write'))
 };
}
