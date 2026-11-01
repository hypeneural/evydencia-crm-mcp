// Apenas leitura. A forma legacy é uma ALTERNATIVA telefônica, não prova de identidade.
const VALID_DDDS=new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
const SEP=/[\s\u200B-\u200D\u2060\uFEFF()\u2010-\u2015\u2212\uFE63\uFF0D.\-]/gu;

export function proposalPhoneVariants(input){
  if(typeof input!=='string'||!input.trim()||input.length>80)throw Error('invalid_proposal_phone');
  const clean=input.replace(/[０-９]/gu,c=>'0123456789'['０１２３４５６７８９'.indexOf(c)]).trim().replace(SEP,'');
  if(!/^\+?[0-9]+$/.test(clean)||clean.indexOf('+',1)!==-1)throw Error('invalid_proposal_phone');
  if(clean.startsWith('+')&&!clean.startsWith('+55'))throw Error('invalid_proposal_phone');
  let digits=clean.replace(/^\+/,'');
  if(digits.startsWith('55')&&[12,13].includes(digits.length))digits=digits.slice(2);
  if(![10,11].includes(digits.length))throw Error('invalid_proposal_phone');
  const ddd=digits.slice(0,2),subscriber=digits.slice(2);
  if(!VALID_DDDS.has(ddd))throw Error('invalid_proposal_phone');
  const modern=/^9[0-9]{8}$/.test(subscriber);
  const mobileLegacy=/^[6-9][0-9]{7}$/.test(subscriber);
  const landline=/^[2-5][0-9]{7}$/.test(subscriber);
  if(!modern&&!mobileLegacy&&!landline)throw Error('invalid_proposal_phone');
  const canonical=mobileLegacy?ddd+'9'+subscriber:digits;
  // Só retirar o 9 se o número de 8 dígitos ainda tem prefixo móvel válido.
  const alternate=modern&&/^[6-9][0-9]{7}$/.test(subscriber.slice(1))
    ?ddd+subscriber.slice(1):mobileLegacy?digits:null;
  const source='+55'+digits,normalized='+55'+canonical;
  const candidates=[source,...(source!==normalized?[normalized]:[]),
    ...(alternate&&'+55'+alternate!==source&&'+55'+alternate!==normalized?['+55'+alternate]:[])];
  return {status:landline?'landline':mobileLegacy?'legacy_mobile':'mobile',
    input_e164:source,canonical_e164:normalized,variants_e164:candidates,
    match_warning:candidates.length>1?'legacy_variant_not_identity_proof':null};
}

export function prepareProposalPhones(phones,{max=50}={}){
  if(!Array.isArray(phones)||phones.length<1||phones.length>max)throw Error('invalid_proposal_batch_size');
  const unique=new Map(),inputs=[];
  for(let index=0;index<phones.length;index++){
    let parsed;
    try{parsed=proposalPhoneVariants(phones[index]);}
    catch{inputs.push({index,status:'invalid_phone',phone_masked:String(phones[index]??'').replace(/\D/g,'').slice(-4).padStart(4,'*')});continue;}
    if(!unique.has(parsed.canonical_e164))unique.set(parsed.canonical_e164,{...parsed,indices:[]});
    unique.get(parsed.canonical_e164).indices.push(index);
    inputs.push({index,status:'valid',canonical_e164:parsed.canonical_e164,match_type:parsed.status});
  }
  return {inputs,groups:[...unique.values()]};
}
