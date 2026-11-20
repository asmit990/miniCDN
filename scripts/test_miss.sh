#!/usr/bin/env bash

# Test Cache MISS behavior, 404 handling, and origin fetch latency.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_KEY="miss-test-$(date +%s)-$$.txt"
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

echo "=== 1. Checking 404 for Non-Existent Key ==="
status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://localhost:8080/file/non-existent-$TEST_KEY")"
[[ "$status" == "404" ]] || fail "expected 404 for non-existent file, got $status"

echo "=== 2. Uploading Asset ==="
printf 'cache-miss-verified' >"$TMP_DIR/$TEST_KEY"
curl --silent --show-error --fail -X POST http://localhost:3000/upload \
  -F "file=@$TMP_DIR/$TEST_KEY;filename=$TEST_KEY" >/dev/null

echo "=== 3. Checking Initial Cache MISS ==="
cache_hdr="$(header_val "x-cache" "http://localhost:8080/file/$TEST_KEY")"
[[ "$cache_hdr" == "MISS" ]] || fail "expected MISS header on first fetch, got $cache_hdr"

echo "PASS: Cache MISS and 404 error handling verified successfully!"
