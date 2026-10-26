# CRM ↔ Gameplay readonly connector (2026-10-26)

Source of truth: CRM for customer/order identity and current status; Gameplay for publication and capability URLs.

Configuration (server-side only): `EVYD_GAMEPLAY_READ_ENABLED=1`, `EVYD_GAMEPLAY_READ_ORIGIN=https://<private-trusted-origin>`, `EVYD_GAMEPLAY_READ_TOKEN=<32+-char-secret>`. Separate from OAuth CRM and Z-API credentials. The Gameplay bearer must not grant publication or uploading.

Two gated MCP tools: `crm_gameplay_links` (exact order ID/UUID or customer name), `crm_gameplay_auditoria` (only current statuses `waiting_product_retrieve` and `order_completed`, Christmas 2026).

Do not infer a gallery from historic URLs or from a demo/fixture page. A published catalog record only establishes `published_unverified`, not the successful Phaser/browser load of every game.

Do not expose Gameplay private endpoint to public browser. EvydFlow may call the same Catalog API from its own server-side FastAPI management bridge, but must not consume the MCP/OAuth protocol or share an operator's Sanctum token.

Preflight: npm ci; npm run check; npm run gateway:test; npm test; npm run validate:local. Verify the deployed MCP gateway catalog and exact Gameplay SHA after manual release. No change to CRM Laravel.
