// Local operator-only diagnostic. Never emits customer details or monetary figures.
import {loadPrivateSnapshot} from '../src/natal-digest-snapshot.mjs';
const parts=process.argv.slice(2);
if(parts.length!==1||!parts[0].startsWith('--file=')||parts[0].length<8){
 console.error('SNAPSHOT_CHECK_BLOCKED usage: npm run snapshot:inspect -- --file=ABSOLUTE_PRIVATE_JSON_PATH');
 process.exitCode=2;
}else{
 try{
  const snap=await loadPrivateSnapshot(parts[0].slice('--file='.length));
  console.log('SNAPSHOT_CHECK_PASS schema='+snap.schema_version+
   ' source='+snap.source+' year='+snap.reference_year+
   ' age_seconds='+snap.freshness_seconds+
   ' finance='+snap.financial_status+
   ' 2025_status='+snap.ytd.prior.data_status+
   ' yoy_confirmed='+snap.ytd.comparison_confirmed+
   ' — privado; NÃO compartilhado com ChatGPT');
 }catch(e){
  console.error('SNAPSHOT_CHECK_BLOCKED '+(String(e.message).startsWith('natal_snapshot_')?e.message:'invalid_private_snapshot'));
  process.exitCode=1;
 }
}
