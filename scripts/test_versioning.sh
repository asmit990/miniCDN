#!/usr/bin/env bash

# End-to-end integration test for CDN versioning across Gateway, Edge, and Origin.
# Run after `docker compose up --build -d` from repository root.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_KEY="ver-test-$(date +%s)-$$.txt"
TMP_DIR="$(mktemp -d)"

cleanup() {
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

echo "=== 1. Verifying CDN services health ==="
wait_for http://localhost:3000/health
wait_for http://localhost:8080/health
wait_for http://localhost:8081/health

echo "=== 2. Uploading Version 1 ==="
printf 'payload-version-1' >"$TMP_DIR/$TEST_KEY"
v1_res="$(curl --silent --show-error --fail -X POST http://localhost:3000/upload \
  -F "file=@$TMP_DIR/$TEST_KEY;filename=$TEST_KEY")"
echo "V1 Upload: $v1_res"

echo "=== 3. Uploading Version 2 ==="
printf 'payload-version-2' >"$TMP_DIR/$TEST_KEY"
v2_res="$(curl --silent --show-error --fail -X POST http://localhost:3000/upload \
  -F "file=@$TMP_DIR/$TEST_KEY;filename=$TEST_KEY")"
echo "V2 Upload: $v2_res"

echo "=== 4. Checking Origin Version List ==="
versions_json="$(curl --silent --show-error --fail "http://localhost:3000/admin/versions/$TEST_KEY")"
echo "Versions: $versions_json"
[[ "$versions_json" =~ "\"count\":2" ]] || fail "expected count: 2 in versions response"

echo "=== 5. Gateway Latest Fetch (Unversioned) ==="
body_latest="$(curl --silent --show-error --fail "http://localhost:8080/file/$TEST_KEY")"
[[ "$body_latest" == "payload-version-2" ]] || fail "expected latest body 'payload-version-2', got '$body_latest'"
hit_latest="$(header_val "x-cache" "http://localhost:8080/file/$TEST_KEY")"
[[ "$hit_latest" == "HIT" ]] || fail "expected X-Cache: HIT on second request, got '$hit_latest'"

echo "=== 6. Gateway Version 1 Fetch (?v=1) ==="
body_v1="$(curl --silent --show-error --fail "http://localhost:8080/file/$TEST_KEY?v=1")"
[[ "$body_v1" == "payload-version-1" ]] || fail "expected v1 body 'payload-version-1', got '$body_v1'"
cc_v1="$(header_val "cache-control" "http://localhost:8080/file/$TEST_KEY?v=1")"
[[ "$cc_v1" =~ "immutable" ]] || fail "expected Cache-Control to include 'immutable', got '$cc_v1'"
hit_v1="$(header_val "x-cache" "http://localhost:8080/file/$TEST_KEY?v=1")"
[[ "$hit_v1" == "HIT" ]] || fail "expected X-Cache: HIT on second ?v=1 request, got '$hit_v1'"

echo "=== 7. Gateway Version 2 Fetch (?v=2) ==="
body_v2="$(curl --silent --show-error --fail "http://localhost:8080/file/$TEST_KEY?v=2")"
[[ "$body_v2" == "payload-version-2" ]] || fail "expected v2 body 'payload-version-2', got '$body_v2'"
hit_v2="$(header_val "x-cache" "http://localhost:8080/file/$TEST_KEY?v=2")"
[[ "$hit_v2" == "HIT" ]] || fail "expected X-Cache: HIT on second ?v=2 request, got '$hit_v2'"

echo "=== 8. Upload Version 3 & Verify Invalidation Isolation ==="
printf 'payload-version-3' >"$TMP_DIR/$TEST_KEY"
curl --silent --show-error --fail -X POST http://localhost:3000/upload \
  -F "file=@$TMP_DIR/$TEST_KEY;filename=$TEST_KEY" >/dev/null
sleep 1 # allow Redis Pub/Sub invalidation to propagate

# Latest must miss and fetch new content
latest_cache="$(header_val "x-cache" "http://localhost:8080/file/$TEST_KEY")"
[[ "$latest_cache" == "MISS" ]] || fail "expected latest X-Cache: MISS after upload, got '$latest_cache'"
body_v3="$(curl --silent --show-error --fail "http://localhost:8080/file/$TEST_KEY")"
[[ "$body_v3" == "payload-version-3" ]] || fail "expected latest body 'payload-version-3', got '$body_v3'"

# Versioned ?v=1 must STILL be cached as HIT because versioned assets are immutable
v1_cache_after="$(header_val "x-cache" "http://localhost:8080/file/$TEST_KEY?v=1")"
[[ "$v1_cache_after" == "HIT" ]] || fail "expected ?v=1 to remain cached (HIT), got '$v1_cache_after'"

echo "=== 9. Full File Deletion & Cache Flush ==="
curl --silent --show-error --fail -X DELETE "http://localhost:3000/file/$TEST_KEY" >/dev/null
sleep 1 # allow DELETE broadcast

# Subsequent request should return 404
status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://localhost:8080/file/$TEST_KEY")"
[[ "$status" == "404" ]] || fail "expected 404 after file deletion, got $status"

echo "PASS: End-to-end versioning, caching, invalidation, and cleanup verified successfully!"
