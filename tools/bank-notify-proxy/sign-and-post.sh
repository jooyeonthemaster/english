#!/usr/bin/env bash
# Sign a bank-notify payload with BANK_NOTIFY_RELAY_SECRET and POST it directly
# to SMOAT (bypasses the Cloudflare proxy). Useful for end-to-end verification.
#
# Usage:
#   BANK_NOTIFY_RELAY_SECRET=xxxx \
#   TARGET_URL=https://smoat.co.kr/api/credits/top-ups/bank-notify \
#   ./sign-and-post.sh '{"amount":19837,"depositorName":"홍길동","externalId":"test-1"}'
set -euo pipefail

SECRET="${BANK_NOTIFY_RELAY_SECRET:?set BANK_NOTIFY_RELAY_SECRET}"
URL="${TARGET_URL:-http://localhost:3000/api/credits/top-ups/bank-notify}"
BODY="${1:?pass JSON body as first arg}"

SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.*= //')

curl -sS -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-bank-notify-signature: sha256=$SIG" \
  -d "$BODY"
echo
