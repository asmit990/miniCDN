#!/usr/bin/env bash

# End-to-end coverage for cache invalidation, gateway failover, and singleflight.
# Run after `docker compose up --build -d` from the repository root.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT_DIR/docker-compose.yml")
EDGE_PORTS=(8081 8082 8083)
TEST_KEY="integration-$(date +%s)-$$.txt"
TMP_DIR="$(mktemp -d)"

cleanup() {
  "${COMPOSE[@]}" up -d edge-mumbai >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

header() {
  local url="$1"
  shift
  curl --silent --show-error --fail --dump-header - --output /dev/null "$@" "$url" \
    | tr -d '\r' \
    | awk -F': ' 'tolower($1) == "x-cache" { print $2 }' \
    | tail -n 1
}

wait_for() {
  local url="$1"
  for _ in $(seq 1 30); do
    if curl --silent --fail "$url" >/dev/null; then return 0; fi
    sleep 1
  done
  fail "timed out waiting for $url"
}

echo "Waiting for the CDN services..."
wait_for http://localhost:3000/health
wait_for http://localhost:8080/health

printf 'version-one' >"$TMP_DIR/$TEST_KEY"
curl --silent --show-error --fail -X POST http://localhost:3000/upload \
  -F "file=@$TMP_DIR/$TEST_KEY;filename=$TEST_KEY" >/dev/null

echo "Checking MISS → HIT and invalidation across every edge..."
for port in "${EDGE_PORTS[@]}"; do
  [[ "$(header "http://localhost:$port/file/$TEST_KEY")" == "MISS" ]] || fail "edge $port should miss initially"
  [[ "$(header "http://localhost:$port/file/$TEST_KEY")" == "HIT" ]] || fail "edge $port should hit after warmup"
done

printf 'version-two' >"$TMP_DIR/$TEST_KEY"
curl --silent --show-error --fail -X POST http://localhost:3000/upload \
  -F "file=@$TMP_DIR/$TEST_KEY;filename=$TEST_KEY" >/dev/null
sleep 1 # allow Redis Pub/Sub delivery to all subscribers

for port in "${EDGE_PORTS[@]}"; do
  [[ "$(header "http://localhost:$port/file/$TEST_KEY")" == "MISS" ]] || fail "edge $port retained stale content after overwrite"
done

echo "Checking gateway failover from Mumbai to London..."
"${COMPOSE[@]}" stop edge-mumbai >/dev/null
served_by="$(curl --silent --show-error --fail --dump-header - --output /dev/null \
  -H 'X-Region: IN' "http://localhost:8080/file/$TEST_KEY" \
  | tr -d '\r' | awk -F': ' 'tolower($1) == "x-edge-region" { print $2 }' | tail -n 1)"
[[ "$served_by" == "GB" ]] || fail "expected GB fallback, got ${served_by:-no edge header}"
"${COMPOSE[@]}" up -d edge-mumbai >/dev/null
wait_for http://localhost:8081/health

echo "Checking singleflight with 50 concurrent requests..."
SINGLEFLIGHT_KEY="singleflight-$TEST_KEY"
printf 'singleflight-body' >"$TMP_DIR/$SINGLEFLIGHT_KEY"
curl --silent --show-error --fail -X POST http://localhost:3000/upload \
  -F "file=@$TMP_DIR/$SINGLEFLIGHT_KEY;filename=$SINGLEFLIGHT_KEY" >/dev/null
curl --silent --show-error --fail -X POST http://localhost:3000/_test/origin-fetches/reset >/dev/null

seq 1 50 | xargs -P 50 -I{} curl --silent --show-error --fail \
  "http://localhost:8082/file/$SINGLEFLIGHT_KEY" --output /dev/null

fetches="$(curl --silent --show-error --fail http://localhost:3000/_test/origin-fetches | \
  sed -E 's/.*"count":([0-9]+).*/\1/')"
[[ "$fetches" == "1" ]] || fail "expected one origin fetch, got $fetches"

echo "PASS: invalidation, failover, and singleflight integration checks succeeded."
