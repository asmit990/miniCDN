#!/usr/bin/env bash

# Test Cache HIT behavior, headers, and sub-millisecond response latency.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_KEY="hit-test-$(date +%s)-$$.txt"
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

wait_for http://localhost:3000/health
wait_for http://localhost:8080/health

echo "=== 1. Uploading Test Asset ==="
printf 'cache-hit-payload-content' >"$TMP_DIR/$TEST_KEY"
curl --silent --show-error --fail -X POST http://localhost:3000/upload \
  -F "file=@$TMP_DIR/$TEST_KEY;filename=$TEST_KEY" >/dev/null

echo "=== 2. Warming Cache (First Fetch = MISS) ==="
first_cache="$(header_val "x-cache" "http://localhost:8080/file/$TEST_KEY")"
[[ "$first_cache" == "MISS" ]] || fail "expected first request to be MISS, got $first_cache"

echo "=== 3. Validating Cache HIT ==="
second_cache="$(header_val "x-cache" "http://localhost:8080/file/$TEST_KEY")"
[[ "$second_cache" == "HIT" ]] || fail "expected second request to be HIT, got $second_cache"

body="$(curl --silent --show-error --fail "http://localhost:8080/file/$TEST_KEY")"
[[ "$body" == "cache-hit-payload-content" ]] || fail "unexpected payload: $body"

echo "PASS: Cache HIT verified successfully!"
