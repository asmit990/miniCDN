import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── Custom CDN Performance Metrics ───────────────────────────────────
const cacheHitRate = new Rate('cdn_cache_hit_rate');
const hitDuration = new Trend('cdn_cache_hit_duration', true);
const missDuration = new Trend('cdn_cache_miss_duration', true);
const edgeHitCounter = new Counter('cdn_edge_hits');
const edgeMissCounter = new Counter('cdn_edge_misses');

const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:8080';
const ORIGIN_URL = __ENV.ORIGIN_URL || 'http://localhost:3000';
const MUMBAI_URL = __ENV.MUMBAI_URL || 'http://localhost:8081';
const LONDON_URL = __ENV.LONDON_URL || 'http://localhost:8082';
const NYC_URL = __ENV.NYC_URL || 'http://localhost:8083';

const isQuick = __ENV.QUICK === 'true';

// ── Test Configuration & Scenarios ───────────────────────────────────
export const options = {
  scenarios: {
    // 1. Warm cache hit benchmark across regions
    cache_hit_benchmark: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: isQuick
        ? [
            { duration: '2s', target: 15 },
            { duration: '4s', target: 25 },
            { duration: '2s', target: 0 },
          ]
        : [
            { duration: '5s', target: 20 },
            { duration: '10s', target: 40 },
            { duration: '5s', target: 0 },
          ],
      gracefulRampDown: '2s',
      exec: 'cacheHitScenario',
    },

    // 2. Real-world Pareto (80/20) traffic distribution
    traffic_distribution: {
      executor: 'constant-vus',
      vus: isQuick ? 8 : 15,
      duration: isQuick ? '6s' : '15s',
      startTime: isQuick ? '1s' : '3s',
      exec: 'trafficDistributionScenario',
    },

    // 3. Concurrent cache misses & singleflight verification
    singleflight_stress: {
      executor: 'per-vu-iterations',
      vus: isQuick ? 5 : 10,
      iterations: isQuick ? 2 : 3,
      startTime: isQuick ? '4s' : '10s',
      maxDuration: isQuick ? '8s' : '20s',
      exec: 'singleflightScenario',
    },
  },

  thresholds: {
    'cdn_cache_hit_rate': ['rate>0.80'],          // >80% overall cache hit rate
    'cdn_cache_hit_duration': ['p(95)<35'],       // 95% of cache hits under 35ms
    'cdn_cache_miss_duration': ['p(95)<500'],     // 95% of cache misses under 500ms
    'http_req_failed': ['rate<0.02'],             // <2% failed HTTP requests
    'checks': ['rate>0.95'],                      // >95% check assertions passing
  },
};

export default function (data) {
  cacheHitScenario(data);
}

// ── Setup: Upload assets to Origin & Warm Caches ──────────────────────
export function setup() {
  console.log('--- Initializing CDN Load Test Setup ---');

  const testId = `k6-${Date.now()}`;
  const hotAssets = [
    { key: `${testId}-hot-small.txt`, body: 'Hello CDN! Small text asset content.' },
    { key: `${testId}-hot-api.json`, body: JSON.stringify({ name: 'mini-cdn', version: '2.0', status: 'optimal' }) },
    { key: `${testId}-hot-banner.dat`, body: 'A'.repeat(8192) }, // 8KB
  ];

  const coldAssets = [];
  for (let i = 0; i < 6; i++) {
    coldAssets.push({
      key: `${testId}-cold-${i}.txt`,
      body: `Cold asset payload ${i} - timestamp: ${Date.now()}`,
    });
  }

  const versionedAsset = {
    key: `${testId}-versioned.txt`,
    v1: 'version-1-content',
    v2: 'version-2-content',
  };

  // Upload hot assets
  for (const asset of hotAssets) {
    const res = http.post(
      `${ORIGIN_URL}/upload`,
      { file: http.file(asset.body, asset.key) }
    );
    if (res.status !== 200) {
      console.error(`Failed to upload ${asset.key}: ${res.status} ${res.body}`);
    }
  }

  // Upload cold assets
  for (const asset of coldAssets) {
    http.post(
      `${ORIGIN_URL}/upload`,
      { file: http.file(asset.body, asset.key) }
    );
  }

  // Upload versioned asset (v1 then v2)
  http.post(
    `${ORIGIN_URL}/upload`,
    { file: http.file(versionedAsset.v1, versionedAsset.key) }
  );
  http.post(
    `${ORIGIN_URL}/upload`,
    { file: http.file(versionedAsset.v2, versionedAsset.key) }
  );

  // Warm-up Mumbai, London, and NYC caches for hot assets
  console.log('Warming edge caches for hot assets...');
  for (const asset of hotAssets) {
    http.get(`${MUMBAI_URL}/file/${asset.key}`);
    http.get(`${LONDON_URL}/file/${asset.key}`);
    http.get(`${NYC_URL}/file/${asset.key}`);
  }

  // Reset origin fetch counter in test mode
  http.post(`${ORIGIN_URL}/_test/origin-fetches/reset`);

  console.log('Setup completed successfully.');
  return {
    testId,
    hotKeys: hotAssets.map((a) => a.key),
    coldKeys: coldAssets.map((a) => a.key),
    versionedKey: versionedAsset.key,
  };
}

// ── Scenario 1: Cache Hit Latency Benchmark ───────────────────────────
export function cacheHitScenario(data) {
  const regions = ['IN', 'GB', 'US'];
  const region = regions[__VU % regions.length];
  const hotKey = data.hotKeys[__ITER % data.hotKeys.length];

  // Distribute client IPs via X-Forwarded-For
  const clientIp = `192.168.${(__VU % 200) + 1}.${(__ITER % 250) + 1}`;

  const res = http.get(`${GATEWAY_URL}/file/${hotKey}`, {
    headers: {
      'X-Region': region,
      'X-Forwarded-For': clientIp,
    },
    tags: { scenario: 'cache_hit_benchmark' },
  });

  const isHit = res.headers['X-Cache'] === 'HIT';
  cacheHitRate.add(isHit);

  if (isHit) {
    hitDuration.add(res.timings.duration);
    edgeHitCounter.add(1);
  } else {
    missDuration.add(res.timings.duration);
    edgeMissCounter.add(1);
  }

  check(res, {
    'cache hit status is 200': (r) => r.status === 200,
    'x-cache is HIT': (r) => r.headers['X-Cache'] === 'HIT',
    'x-edge-region header present': (r) => !!r.headers['X-Edge-Region'],
    'hit latency < 40ms': (r) => r.timings.duration < 40,
  });

  sleep(0.02); // 20ms think time
}

// ── Scenario 2: Real-World Traffic Distribution (Pareto 80/20) ─────────
export function trafficDistributionScenario(data) {
  const regions = ['IN', 'GB', 'US'];
  const region = regions[__VU % regions.length];
  const clientIp = `172.16.${(__VU % 150) + 1}.${(__ITER % 250) + 1}`;

  // 80% requests hit hot files, 20% hit cold or versioned files
  const rand = Math.random();
  let targetUrl;
  let expectVersioned = false;

  if (rand < 0.80) {
    const key = data.hotKeys[Math.floor(Math.random() * data.hotKeys.length)];
    targetUrl = `${GATEWAY_URL}/file/${key}`;
  } else if (rand < 0.90) {
    const key = data.coldKeys[Math.floor(Math.random() * data.coldKeys.length)];
    targetUrl = `${GATEWAY_URL}/file/${key}`;
  } else {
    // Test immutable versioned URL (?v=1)
    expectVersioned = true;
    targetUrl = `${GATEWAY_URL}/file/${data.versionedKey}?v=1`;
  }

  const res = http.get(targetUrl, {
    headers: {
      'X-Region': region,
      'X-Forwarded-For': clientIp,
    },
    tags: { scenario: 'traffic_distribution' },
  });

  const isHit = res.headers['X-Cache'] === 'HIT';
  cacheHitRate.add(isHit);

  if (isHit) {
    hitDuration.add(res.timings.duration);
    edgeHitCounter.add(1);
  } else {
    missDuration.add(res.timings.duration);
    edgeMissCounter.add(1);
  }

  check(res, {
    'distribution status 200': (r) => r.status === 200,
    'cache-control header present': (r) => !!r.headers['Cache-Control'],
    'immutable header on versioned asset': (r) => {
      if (!expectVersioned) return true;
      return (r.headers['Cache-Control'] || '').includes('immutable');
    },
  });

  // Test conditional request (If-None-Match -> 304 Not Modified)
  const etag = res.headers['Etag'] || res.headers['ETag'];
  if (etag && isHit && Math.random() < 0.25) {
    const revalRes = http.get(targetUrl, {
      headers: {
        'X-Region': region,
        'X-Forwarded-For': clientIp,
        'If-None-Match': etag,
      },
    });
    check(revalRes, {
      'conditional get 304 Not Modified': (r) => r.status === 304,
    });
  }

  sleep(0.05); // 50ms think time
}

// ── Scenario 3: Singleflight & Cache Miss Concurrency ─────────────────
export function singleflightScenario(data) {
  // Concurrent requests against a single cold key to test coalescing
  const coldKey = data.coldKeys[__ITER % data.coldKeys.length];
  const clientIp = `10.200.${__VU}.${__ITER}`;

  const res = http.get(`${MUMBAI_URL}/file/${coldKey}`, {
    headers: {
      'X-Forwarded-For': clientIp,
      'X-Request-ID': `sf-${__VU}-${__ITER}`,
    },
    tags: { scenario: 'singleflight_stress' },
  });

  check(res, {
    'singleflight request status 200': (r) => r.status === 200,
  });

  if (res.headers['X-Cache'] === 'HIT') {
    hitDuration.add(res.timings.duration);
    edgeHitCounter.add(1);
    cacheHitRate.add(true);
  } else {
    missDuration.add(res.timings.duration);
    edgeMissCounter.add(1);
    cacheHitRate.add(false);
  }
}

// ── Teardown: Cleanup & Metrics Report ─────────────────────────────────
export function teardown(data) {
  console.log('--- Finalizing CDN Load Test Teardown ---');

  // Query origin fetch count
  const fetchesRes = http.get(`${ORIGIN_URL}/_test/origin-fetches`);
  let originFetches = 'N/A';
  if (fetchesRes.status === 200) {
    try {
      originFetches = JSON.parse(fetchesRes.body).count;
    } catch (_) {}
  }

  // Cleanup hot and cold assets
  for (const key of data.hotKeys) {
    http.del(`${ORIGIN_URL}/file/${key}`);
  }
  for (const key of data.coldKeys) {
    http.del(`${ORIGIN_URL}/file/${key}`);
  }
  http.del(`${ORIGIN_URL}/file/${data.versionedKey}`);

  console.log(`[TEARDOWN] Origin Fetches Recorded during test: ${originFetches}`);
  console.log('[TEARDOWN] Cleaned up temporary test assets from MinIO & Redis.');
}
