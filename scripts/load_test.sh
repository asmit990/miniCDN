#!/usr/bin/env bash
# ==============================================================================
# Mini-CDN k6 Performance & Load Testing Suite
# ==============================================================================
# Usage:
#   ./scripts/load_test.sh           # Run standard benchmark (~22s)
#   ./scripts/load_test.sh --quick   # Run quick smoke benchmark (~8s)
#   ./scripts/load_test.sh --stress  # Run high-concurrency stress test (~45s)
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_DIR="$ROOT_DIR/scripts"
COMPOSE=(docker compose -f "$ROOT_DIR/docker-compose.yml")

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
ORIGIN_URL="${ORIGIN_URL:-http://localhost:3000}"
MUMBAI_URL="${MUMBAI_URL:-http://localhost:8081}"
LONDON_URL="${LONDON_URL:-http://localhost:8082}"
NYC_URL="${NYC_URL:-http://localhost:8083}"

COLOR_RESET="\033[0m"
COLOR_BOLD="\033[1m"
COLOR_CYAN="\033[36m"
COLOR_GREEN="\033[32m"
COLOR_YELLOW="\033[33m"
COLOR_RED="\033[31m"

banner() {
  echo -e "${COLOR_CYAN}${COLOR_BOLD}"
  echo "╔══════════════════════════════════════════════════════════════════════════════╗"
  echo "║                  MINI-CDN — K6 PERFORMANCE LOAD TEST                         ║"
  echo "╚══════════════════════════════════════════════════════════════════════════════╝"
  echo -e "${COLOR_RESET}"
}

check_dependencies() {
  if ! command -v k6 &>/dev/null; then
    echo -e "${COLOR_RED}ERROR: k6 is not installed.${COLOR_RESET}" >&2
    echo "Install k6 via Homebrew: brew install k6" >&2
    exit 1
  fi

  if ! command -v curl &>/dev/null; then
    echo -e "${COLOR_RED}ERROR: curl is required.${COLOR_RESET}" >&2
    exit 1
  fi
}

wait_for() {
  local name="$1"
  local url="$2"
  for _ in $(seq 1 20); do
    if curl --silent --fail "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo -e "${COLOR_RED}ERROR: Service $name ($url) did not become healthy in time.${COLOR_RESET}" >&2
  exit 1
}

ensure_services() {
  echo -e "${COLOR_BOLD}1. Checking CDN Services Health...${COLOR_RESET}"
  
  if ! curl --silent --fail "$GATEWAY_URL/health" >/dev/null 2>&1; then
    echo -e "${COLOR_YELLOW}Services not running. Attempting to start with docker compose...${COLOR_RESET}"
    "${COMPOSE[@]}" up -d
  fi

  wait_for "Origin Server" "$ORIGIN_URL/health"
  wait_for "API Gateway" "$GATEWAY_URL/health"
  wait_for "Edge Mumbai" "$MUMBAI_URL/health"
  wait_for "Edge London" "$LONDON_URL/health"
  wait_for "Edge NYC" "$NYC_URL/health"

  echo -e "${COLOR_GREEN}✓ All CDN nodes are healthy and responding.${COLOR_RESET}\n"
}

get_metric() {
  local edge_url="$1"
  local metric_name="$2"
  curl --silent "$edge_url/metrics" 2>/dev/null \
    | awk -v m="$metric_name" '$1 == m { print $2 }' \
    | tail -n 1
}

print_edge_metrics() {
  echo -e "\n${COLOR_BOLD}3. Edge Observability Metrics (Scraped from /metrics)${COLOR_RESET}"
  echo "─────────────────────────────────────────────────────────────────────────────"
  printf "%-14s | %-12s | %-12s | %-12s | %-12s\n" "Edge Node" "Hits" "Misses" "Hit Ratio" "Cache Size"
  echo "─────────────────────────────────────────────────────────────────────────────"

  local edges=("Mumbai (:8081)|$MUMBAI_URL" "London (:8082)|$LONDON_URL" "NYC (:8083)|$NYC_URL")

  for item in "${edges[@]}"; do
    local name="${item%%|*}"
    local url="${item##*|}"

    local hits="$(get_metric "$url" "cdn_cache_hits_total")"
    local misses="$(get_metric "$url" "cdn_cache_misses_total")"
    local rate="$(get_metric "$url" "cdn_cache_hit_rate")"
    local size="$(get_metric "$url" "cdn_cache_size_bytes")"

    hits="${hits:-0}"
    misses="${misses:-0}"
    if [[ -n "$rate" && "$rate" != "0" ]]; then
      rate_pct="$(awk -v r="$rate" 'BEGIN { printf "%.1f%%", r * 100 }')"
    else
      rate_pct="0.0%"
    fi
    
    if [[ -n "$size" && "$size" -gt 0 ]]; then
      size_fmt="$(awk -v s="$size" 'BEGIN { printf "%.2f KB", s / 1024 }')"
    else
      size_fmt="0 KB"
    fi

    printf "%-14s | %-12s | %-12s | %-12s | %-12s\n" "$name" "$hits" "$misses" "$rate_pct" "$size_fmt"
  done
  echo "─────────────────────────────────────────────────────────────────────────────"
}

run_k6() {
  local mode="${1:-standard}"
  local k6_script="$SCRIPT_DIR/k6_load_test.js"

  echo -e "${COLOR_BOLD}2. Launching k6 Load Test (Mode: $mode)...${COLOR_RESET}"

  if [[ "$mode" == "--quick" ]]; then
    k6 run \
      -e GATEWAY_URL="$GATEWAY_URL" \
      -e ORIGIN_URL="$ORIGIN_URL" \
      -e MUMBAI_URL="$MUMBAI_URL" \
      -e LONDON_URL="$LONDON_URL" \
      -e NYC_URL="$NYC_URL" \
      -e QUICK="true" \
      "$k6_script"
  elif [[ "$mode" == "--stress" ]]; then
    k6 run \
      -e GATEWAY_URL="$GATEWAY_URL" \
      -e ORIGIN_URL="$ORIGIN_URL" \
      -e MUMBAI_URL="$MUMBAI_URL" \
      -e LONDON_URL="$LONDON_URL" \
      -e NYC_URL="$NYC_URL" \
      --vus 80 \
      "$k6_script"
  else
    k6 run \
      -e GATEWAY_URL="$GATEWAY_URL" \
      -e ORIGIN_URL="$ORIGIN_URL" \
      -e MUMBAI_URL="$MUMBAI_URL" \
      -e LONDON_URL="$LONDON_URL" \
      -e NYC_URL="$NYC_URL" \
      "$k6_script"
  fi
}

main() {
  banner
  check_dependencies
  ensure_services
  run_k6 "${1:-standard}"
  print_edge_metrics
  echo -e "\n${COLOR_GREEN}${COLOR_BOLD}PASS: k6 load test and validation finished successfully!${COLOR_RESET}\n"
}

main "$@"
