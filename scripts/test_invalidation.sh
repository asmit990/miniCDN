#!/usr/bin/env bash

# Test cache invalidation via Redis Pub/Sub across Edge nodes.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_KEY="inv-test-$(date +%s)-$$.txt"
TMP_DIR="$(mktemp -d)"

cleanup() {
  curl --silent -X DELETE "http://localhost:3000/file/$TEST_KEY" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

header_val() {
  local hdr_name="$1"
  local url="$2"
  shift 2
  curl --silent --show-error --dump-header - --output /dev/null "$@" "$url" \
    | tr -d '\r' \
    | awk -F': ' -v target="tolower($hdr_name)" 'tolower($1) == tolower("'"$hdr_name"'") { print $2 }' \
    | tail -n 1
}

wait_for() {
  local url="$1"
  for _ in $(seq 1 30); do
    if curl --silent --fail "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  fail "timed out waiting for $url"
}

echo "=== 1. Checking CDN Services Health ==="
wait_for http://localhost:3000/health
wait_for http://localhost:8080/health
wait_for http://localhost:8081/health
wait_for http://localhost:8082/health
wait_for http://localhost:8083/health

echo "=== 2. Uploading Initial File Content ==="
printf 'initial-content-v1' >"$TMP_DIR/$TEST_KEY"
curl --silent --show-error --fail -X POST http://localhost:3000/upload \
  -F "file=@$TMP_DIR/$TEST_KEY;filename=$TEST_KEY" >/dev/null

echo "=== 3. Priming Caches (MISS -> HIT) ==="
for port in 8081 8082 8083; do
  c1="$(header_val "x-cache" "http://localhost:$port/file/$TEST_KEY")"
  [[ "$c1" == "MISS" ]] || fail "expected MISS on first fetch on port $port, got $c1"
  c2="$(header_val "x-cache" "http://localhost:$port/file/$TEST_KEY")"
  [[ "$c2" == "HIT" ]] || fail "expected HIT on second fetch on port $port, got $c2"
done

echo "=== 4. Updating File to Trigger Pub/Sub Invalidation ==="
printf 'updated-content-v2' >"$TMP_DIR/$TEST_KEY"
curl --silent --show-error --fail -X POST http://localhost:3000/upload \
  -F "file=@$TMP_DIR/$TEST_KEY;filename=$TEST_KEY" >/dev/null
sleep 1 # wait for Redis Pub/Sub invalidation

echo "=== 5. Verifying Purge across All Edge Nodes ==="
for port in 8081 8082 8083; do
  c3="$(header_val "x-cache" "http://localhost:$port/file/$TEST_KEY")"
  [[ "$c3" == "MISS" ]] || fail "expected MISS after invalidation on port $port, got $c3"
  body="$(curl --silent --show-error --fail "http://localhost:$port/file/$TEST_KEY")"
  [[ "$body" == "updated-content-v2" ]] || fail "expected updated body on port $port, got $body"
done

echo "PASS: Cache invalidation successfully propagated to all edge nodes!"
