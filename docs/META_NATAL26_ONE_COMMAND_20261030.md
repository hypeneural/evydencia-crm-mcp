# Natal 2026 — Meta audience: one-command operator workflow

## Cohort
**NO_VALID_NATAL_2026_PURCHASE** is intentionally separate from legacy
**ANY_VALID_PURCHASE_2026**. Include CRM customers and qualified 2026 proposal dispatches;
exclude people with a valid Natal-2026 commercial order according to the CRM canonical
`NatalValidOrdersQuery::getValidCustomerIds`, and conservatively quarantine unclear
Natal statuses and suppression/identity conflicts. A purchase of a non-Natal product
in 2026 does **not** by itself exclude this cohort.

The existing live MCP preview/export still uses ANY_VALID_PURCHASE_2026. This branch
does not deploy or change those tools. DO NOT present old 2332-row export as this new cohort.

## Execute after code is checked out on authorized VPS
Run from repository checkout as approved account with existing Laravel and MCP
environment (no credential printing, do not commit .env):

```bash
bash scripts/antigravity/run-natal26-meta-audience.sh
```

Required existing environment: `EVYD_CRM_APP_PATH`, `META_PRIVATE_CSV_DIR`,
`EVYD_META_AUDIENCE_LGPD_APPROVED=1` and nonempty
`EVYD_META_AUDIENCE_LGPD_POLICY_REF`. The PHP bridge does read-only MySQL,
no migrations, no Meta access. No sudo, deployment, service restarts, CRM changes.

The command prints a receipt containing CSV basename, totals and SHA-256, not contacts
or directory. Operator retrieves by existing authorized SFTP, validates with:

```bash
node scripts/antigravity/verify-meta-audience-download.mjs --file "<PRIVATE_LOCAL_PATH>" --sha256 "<RECEIPT_SHA256>" --rows "<RECEIPT_ROWS>" --people "<RECEIPT_ELIGIBLE_PEOPLE>" --emails "<RECEIPT_EMAILS>"
```

The exporter uses `wx`, private 0600; generated CSV should be erased after secure
transfer/Meta upload. The background janitor deletes matching files after 1h *only*
in a configured private directory running the gateway. Treat a missing file as expiry
and regenerate, never reuse older CSV. Do not paste real CSV into chat/GitHub.

## Coverage caveat and release gates
- `proposal_dispatches.status=scheduled` proves CRM schedule persistence,
  NOT WhatsApp delivery. Other genuine WhatsApp inquiries may be absent. A future
  cross-channel evidence reconciliation is needed to claim *all* proposal leads.
- `NatalValidOrdersQuery` is the CRM canonical report used here; retain a second
  conservative status/paid cross-check for unsettled orders.
- This code is **not** deployed; it must be validated on the actual checkout with
  its Laravel version and PII-safe logs. **Do not merge PR #23 wholesale to main.**
- Do not upload until hash/count audit PASS and advertising legal basis established.
- Meta matching and upload completion are always distinct from CSV creation.
