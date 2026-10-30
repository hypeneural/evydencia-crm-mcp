#!/bin/sh
set -eu
if [ "${EVYD_MOCK_MODE:-}" != "1" ] || [ "${EVYD_PRIVATE_TOOLS:-}" != "0" ]; then
  echo "MCP_MOCK_BOOT_BLOCKED: unsafe runtime mode" >&2
  exit 1
fi
if [ -z "${TUNNEL_ID:-}" ] || [ -z "${CONTROL_PLANE_API_KEY:-}" ]; then
  echo "MCP_MOCK_BOOT_BLOCKED: tunnel credentials absent" >&2
  exit 1
fi
cd /app
node scripts/check-mock-env.mjs --file=/app/.env --require
if ! command -v tunnel-client >/dev/null 2>&1; then
  echo "MCP_MOCK_BOOT_BLOCKED: verified tunnel-client binary not mounted" >&2
  exit 1
fi
exec tunnel-client run --profile local-stdio
