#!/usr/bin/env bash
# P25.2 ONLY: local, synthetic and static validation; no deploy, database, Meta or network writes.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "P25.2 LOCAL READ-ONLY VALIDATION"
git rev-parse --show-toplevel
git rev-parse --short HEAD
git status --short
node --check src/meta-audience-csv.mjs
node --check src/meta-audience-csv-validator.mjs
node --check src/meta-audience-private-files.mjs
node --check src/live-gateway.mjs
node --check src/oauth-gateway.mjs
node --check src/legacy-api-read.mjs
node --test test/meta-audience-csv.test.mjs test/meta-audience-mcp.test.mjs test/meta-audience-private-files.test.mjs test/meta-audience-php-contract.test.mjs
php -l scripts/crm-meta-audience-read.php
php -l scripts/crm-meta-audience-preflight-read.php
php -l scripts/crm-forensic-bridge.php
npm run check
npm test
echo "P25.2 LOCAL JS/PHP GATES COMPLETED — MYSQL/LIVE AND DELIVERY STILL NOT PROVEN"
