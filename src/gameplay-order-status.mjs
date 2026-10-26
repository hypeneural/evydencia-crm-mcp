// Pure CRM ↔ Gameplay status projection. No IO, tokens or mutations.
// A public Gameplay catalog session uses a common photo album for the game hub;
// publication metadata cannot establish that each Phaser game ran in a browser.
const DUE_STATUS = new Set(['waiting_product_retrieve', 'order_completed']);
const PHASES = Object.freeze({
 not_found: 'no_gameplay_session',
 revoked: 'access_revoked',
 partial: 'publication_incomplete',
 not_published: 'album_not_published',
 published_unverified: 'album_published_runtime_unverified',
});
const count = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
export function gameplayOrderStatus(order, gameplay) {
 if (!order || !gameplay || !Object.hasOwn(PHASES,gameplay.state))
  throw Error('gameplay_status_contract_invalid');
 const required = DUE_STATUS.has(order.status_key);
 const prep=gameplay.preparation;
 const inPreparation=prep?.state==='staged'||prep?.state==='invalid';
 const phase=gameplay.state==='not_published'&&prep?.state==='staged'
  ? 'album_in_preparation'
  : gameplay.state==='not_published'&&prep?.state==='invalid'
    ? 'preparation_invalid'
    : PHASES[gameplay.state];
 const manifestCount=count(gameplay.photo_count);
 const publishedCount=gameplay.state==='published_unverified'?manifestCount:0;
 const preparedCount=prep?.state==='staged' ? count(prep.photo_count) : null;
 return {
  crm_order_uuid:String(order.order_uuid||order.uuid).toLowerCase(),
  crm_status_key:order.status_key,
  crm_status_id:Number.isSafeInteger(order.status_id)?order.status_id:null,
  publication_required_by_crm:required,
  digital_experience_status:phase,
  publication_pending:required && gameplay.state!=='published_unverified',
  published_photo_count:publishedCount,
  active_revision_manifest_photo_count:manifestCount,
  preparing_photo_count:preparedCount,
  published_variants_ready:count(gameplay.ready_blobs),
  preparing_variants_ready:inPreparation?count(prep.ready_blobs):null,
  // No per-game render receipt exists in the 2026 Gameplay schema.
  individual_games_verified:false,
  browser_runtime_verified:false,
 };
}
