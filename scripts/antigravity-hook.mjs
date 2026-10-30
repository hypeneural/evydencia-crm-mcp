// Antigravity PreToolUse hook. Recebe JSON por stdin e responde apenas JSON por stdout.
// Defesa adicional ao controle de permissões da IDE, não é uma sandbox.
let raw='';
for await(const chunk of process.stdin){raw+=chunk;if(raw.length>512*1024){console.log(JSON.stringify({decision:'deny',reason:'Hook input excessivo'}));process.exit(0)}}
let input={};try{input=JSON.parse(raw||'{}')}catch{console.log(JSON.stringify({decision:'deny',reason:'Hook input inválido'}));process.exit(0)}
const tool=input.toolCall?.name??'';
const args=input.toolCall?.args??{};
const cmd=String(args.CommandLine??args.command??args.Command??'');
const target=String(args.TargetFile??args.target_file??'').replaceAll('\\','/').toLowerCase();
let decision='allow',reason='';
const emit=()=>console.log(JSON.stringify({decision,...(reason?{reason}:{})}));
if(tool==='run_command'){
 const realProposal=/(?:\/proposals\/schedule|\/proposals\/[^/\s"'\\]+\/abort|\/api\/campaigns\/schedule\/execute)/i;
 const httpCaller=/(?:\bcurl(?:\.exe)?\b|\bwget\b|\binvoke-restmethod\b|\binvoke-webrequest\b|\birm\b|\biwr\b|\bhttpie\b|\bfetch\b|\baxios\b)/i;
 if(realProposal.test(cmd)&&httpCaller.test(cmd)){decision='deny';reason='Bloqueado: chamada HTTP para ação comercial real';}
 else if(/(?:\bgit\s+(?:-c\s+\S+\s+)*push\b|\bnpm\s+publish\b|\bgit\s+reset\s+--hard\b|\bgit\s+clean\b|\brm\s+-rf\b|\bremove-item\b.+\b-recurse\b|\bevyd_private_tools\s*=\s*1\b|\bevy[d]?_mock_mode\s*=\s*0\b)/i.test(cmd)){
  decision='force_ask';reason='Ação sensível exige revisão humana explícita';
 }
}else if(/^(write_to_file|replace_file_content|multi_replace_file_content)$/.test(tool)){
 if(/(^|\/)evydencia-crm\/|(^|\/)\.env$|(^|\/)node_modules\/|(^|\/)package-lock\.json$/.test(target)){
  decision='force_ask';reason='Arquivo sensível: validar escopo e permissão humana';
 }
}
emit();
