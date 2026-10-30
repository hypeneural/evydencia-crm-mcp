#!/usr/bin/env bash
# P25.9 — exactly one LOCAL synthetic/static validation pass.
# No CRM writes, no Meta Ads, no GitHub Actions, no deploy, no remote DB calls.
set -euo pipefail
cd "$(dirname "$0")/../.."
printf '%s\n' "META P25.9 local audit only — no real contacts"
printf 'git HEAD: '; git rev-parse HEAD
printf 'working tree: '; git status --porcelain
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'BLOCKED: uncommitted changes; validate a committed reproducible HEAD' >&2
  exit 2
fi
if ! git merge-base --is-ancestor 01aec393f349703cd3179dd7897141a984ccf400 HEAD; then
  echo 'BLOCKED: expected Antigravity handoff commit not in ancestry' >&2
  exit 2
fi
node --version
php -v | head -n 1
node --check src/meta-audience-csv.mjs
node --check src/meta-audience-csv-validator.mjs
node --check src/meta-audience-csv-audit.mjs
node --check src/meta-audience-snapshot.mjs
node --check src/meta-audience-private-write.mjs
node --check src/meta-audience-private-files.mjs
node --check src/meta-audience-janitor.mjs
node --check src/live-gateway.mjs
node --check src/oauth-gateway.mjs
node --check src/legacy-api-read.mjs
node --check scripts/antigravity/purge-meta-audience-private.mjs
node --check scripts/antigravity/meta-audience-release-preflight.mjs
node --check scripts/antigravity/verify-meta-audience-download.mjs
node --test test/meta-audience-csv-audit.test.mjs test/meta-audience-csv.test.mjs test/meta-audience-mcp.test.mjs test/meta-audience-private-files.test.mjs test/meta-audience-janitor.test.mjs test/meta-audience-snapshot.test.mjs test/meta-audience-private-write.test.mjs test/meta-audience-php-contract.test.mjs test/meta-audience-release-preflight.test.mjs
php -l scripts/crm-meta-audience-purchase-classifier.php
php -l scripts/crm-meta-audience-read.php
php -l scripts/crm-meta-audience-preflight-read.php
php -l scripts/crm-forensic-bridge.php
php -l test/meta-audience-purchase-classifier.php
php test/meta-audience-purchase-classifier.php
npm run check
npm test
printf '%s\n' 'P25.9 LOCAL QA PASS — proves synthetic code only; Meta matched size and production logs require separate verification'
