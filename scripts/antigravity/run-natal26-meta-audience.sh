#!/usr/bin/env bash
# Single-command operator workflow. Run on VPS only, with existing service credentials
# and approved legal basis; not a deploy, DB mutation, or Meta upload.
set -euo pipefail
cd "$(dirname "$0")/../.."
node --check scripts/antigravity/export-natal26-meta-private.mjs
node --test test/meta-audience-natal26-cohort.test.mjs
php -l scripts/crm-meta-audience-read.php
php -l scripts/crm-meta-audience-purchase-classifier.php
php test/meta-audience-purchase-classifier.php
node scripts/antigravity/export-natal26-meta-private.mjs
