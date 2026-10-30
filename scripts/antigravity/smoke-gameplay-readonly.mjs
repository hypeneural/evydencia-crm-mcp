#!/usr/bin/env node
// Optional private-network REAL status smoke for a pre-approved synthetic/pilot
// order UUID. NEVER sends WhatsApp, publishes files, or obtains capability URLs.
// Requires already supplied read-only environment on an authorized host.
import {gameplayReadConfig,createGameplayReadClient} from '../../src/gameplay-read-client.mjs';

const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function smokeReadOnly({env=process.env,fetchFn=fetch}={}){
 if(env.EVYD_GAMEPLAY_SMOKE_AUTHORIZED!=='1')
  throw Error('SMOKE_NOT_AUTHORIZED');
 const uuid=env.EVYD_GAMEPLAY_SMOKE_ORDER_UUID;
 if(typeof uuid!=='string'||!uuidRe.test(uuid))
  throw Error('SMOKE_UUID_MISSING_OR_INVALID');
 const cfg=gameplayReadConfig(env);
 if(!cfg)throw Error('GAMEPLAY_READ_DISABLED');
 // Never request public capability URLs, even for a valid pilot.
 const res=await createGameplayReadClient(cfg,{fetchFn}).lookup([uuid]);
 const row=res.results[0];
 if(!row||row.crm_order_uuid!==uuid.toLowerCase())
  throw Error('GAMEPLAY_RESPONSE_IDENTITY_MISMATCH');
 return {
  scope:'authorized_private_readonly_single_order',
  game_catalog_verified:true,
  crm_authorization_verified:false,
  family_urls_requested:false,
  state:row.state,
  published_photo_count:row.state==='published_unverified'?row.photo_count:0,
  active_manifest_photo_count:row.photo_count,
  preparing_photo_count:row.preparation?.state==='staged'?row.preparation.photo_count:null,
  published_variants_ready:row.ready_blobs,
  preparing_variants_ready:row.preparation?.state==='staged'?row.preparation.ready_blobs:null,
  browser_games_verified:false,
 };
}
if(process.argv[1]&&process.argv[1].endsWith('smoke-gameplay-readonly.mjs')){
 if(process.argv.length!==2){console.error('USAGE: node scripts/antigravity/smoke-gameplay-readonly.mjs');process.exitCode=2;}
 else try{console.log(JSON.stringify(await smokeReadOnly(),null,2));}
 catch(error){
  // Never log host, token, UUID, customer data or potentially sensitive errors.
  const code=error?.message;
  console.error(['SMOKE_NOT_AUTHORIZED','SMOKE_UUID_MISSING_OR_INVALID',
   'GAMEPLAY_READ_DISABLED','GAMEPLAY_RESPONSE_IDENTITY_MISMATCH'].includes(code)
    ?code:'GAMEPLAY_READ_SMOKE_UNAVAILABLE');
  process.exitCode=1;
 }
}
