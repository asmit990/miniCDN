
```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                          MINI CDN — FULL SYSTEM                                  ║
╚══════════════════════════════════════════════════════════════════════════════════╝

         DELHI USER          LONDON USER           NYC USER
             │                    │                    │
             │ HTTP GET           │ HTTP GET           │ HTTP GET
             │ /cat.png           │ /logo.png          │ /video.mp4
             └──────────┬─────────┘                    │
                        │                              │
                        ▼                              │
          ┌─────────────────────────┐                  │
          │       API GATEWAY       │◄─────────────────┘
          │  ┌───────────────────┐  │
          │  │ GeoIP Lookup      │  │
          │  │ IN → :8081        │  │
          │  │ GB → :8082        │  │
          │  │ US → :8083        │  │
          │  └───────────────────┘  │
          │  ┌───────────────────┐  │
          │  │ Health Checker    │  │
          │  │ ● Mumbai  alive   │  │
          │  │ ● London  alive   │  │
          │  │ ○ NYC     dead?   │  │
          │  └───────────────────┘  │
          │  ┌───────────────────┐  │
          │  │ Rate Limiter      │  │
          │  │ Auth              │  │
          │  └───────────────────┘  │
          └──────────┬──────────────┘
                     │
          ┌──────────┼──────────────┐
          │          │              │
          ▼          ▼              ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐
   │ EDGE NODE  │ │ EDGE NODE  │ │ EDGE NODE  │
   │   MUMBAI   │ │   LONDON   │ │    NYC     │
   │   :8081    │ │   :8082    │ │   :8083    │
   │            │ │            │ │            │
   │ ┌────────┐ │ │ ┌────────┐ │ │ ┌────────┐ │
   │ │  LRU   │ │ │ │  LRU   │ │ │ │  LRU   │ │
   │ │ CACHE  │ │ │ │ CACHE  │ │ │ │ CACHE  │ │
   │ │        │ │ │ │        │ │ │ │        │ │
   │ │HashMap │ │ │ │HashMap │ │ │ │HashMap │ │
   │ │   +    │ │ │ │   +    │ │ │ │   +    │ │
   │ │DblList │ │ │ │DblList │ │ │ │DblList │ │
   │ │        │ │ │ │        │ │ │ │        │ │
   │ │500 MB  │ │ │ │500 MB  │ │ │ │500 MB  │ │
   │ │  RAM   │ │ │ │  RAM   │ │ │ │  RAM   │ │
   │ └────────┘ │ │ └────────┘ │ │ └────────┘ │
   │            │ │            │ │            │
   │ /metrics   │ │ /metrics   │ │ /metrics   │
   │ /health    │ │ /health    │ │ /health    │
   └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
         │              │              │
         │   CACHE MISS │              │
         └──────────────┼──────────────┘
                        │ all edges fetch from
                        │ origin on miss
                        ▼
          ┌─────────────────────────┐
          │      ORIGIN SERVER      │
          │                         │
          │  POST /upload           │
          │  GET  /origin/:file     │
          │  DEL  /file/:id         │
          │                         │
          │  on upload/delete:      │
          │  → publish PURGE event  │
          └────────────┬────────────┘
                       │
                       ▼
          ┌─────────────────────────┐
          │       MinIO / S3        │
          │                         │
          │  Bucket: "cdn-files"    │
          │                         │
          │  cat.png   → [bytes]    │
          │  logo.png  → [bytes]    │
          │  video.mp4 → [bytes]    │
          │                         │
          │  port: 9000             │
          │  admin: 9001            │
          └─────────────────────────┘


╔══════════════════════════════════════════════════════════════════════════════════╗
║                         CACHE INVALIDATION FLOW                                  ║
╚══════════════════════════════════════════════════════════════════════════════════╝

  Admin uploads new logo.png
          │
          ▼
   ┌─────────────┐
   │   ORIGIN    │──── stores in MinIO
   │             │
   │             │──── publishes ──────────────────────────────────┐
   └─────────────┘     { type: "PURGE", key: "logo.png" }         │
                                                                   ▼
                                                    ┌─────────────────────────┐
                                                    │     REDIS PUB/SUB       │
                                                    │                         │
                                                    │  channel:               │
                                                    │  "cdn:invalidation"     │
                                                    └──────────┬──────────────┘
                                                               │
                                              ┌────────────────┼────────────────┐
                                              │ subscribe      │ subscribe      │ subscribe
                                              ▼                ▼                ▼
                                       ┌──────────┐    ┌──────────┐    ┌──────────┐
                                       │  MUMBAI  │    │  LONDON  │    │   NYC    │
                                       │ deletes  │    │ deletes  │    │ deletes  │
                                       │ logo.png │    │ logo.png │    │ logo.png │
                                       │ from LRU │    │ from LRU │    │ from LRU │
                                       └──────────┘    └──────────┘    └──────────┘
                                              │
                                              │ next request for logo.png
                                              ▼
                                         cache MISS
                                              │
                                              ▼
                                       fetch new version
                                       from origin ✓


╔══════════════════════════════════════════════════════════════════════════════════╗
║                            LRU CACHE INTERNALS                                   ║
╚══════════════════════════════════════════════════════════════════════════════════╝

   HASHMAP                        DOUBLY LINKED LIST
   ───────                        ──────────────────
                                  HEAD                          TAIL
   "logo"  → ptr ──────────►  [DUMMY]⟷[logo]⟷[cat]⟷[video]⟷[DUMMY]
   "cat"   → ptr ────────────────────────► ↑
   "video" → ptr                     most recent        least recent
                                                         (evict this)

   GET "cat":
   ┌─────────────────────────────────────────────────┐
   │  1. HashMap["cat"] → found ptr                  │
   │  2. unlink [cat] from middle                    │
   │  3. move [cat] to HEAD                          │
   │  4. return bytes                                │
   │                                                 │
   │  BEFORE: [logo]⟷[cat]⟷[video]                  │
   │  AFTER:  [cat]⟷[logo]⟷[video]                  │
   └─────────────────────────────────────────────────┘

   SET new "bg.png" (cache full):
   ┌─────────────────────────────────────────────────┐
   │  1. insert [bg] at HEAD                         │
   │  2. over capacity!                              │
   │  3. evict TAIL = [video]                        │
   │  4. delete HashMap["video"]                     │
   │                                                 │
   │  BEFORE: [logo]⟷[cat]⟷[video]  (full)          │
   │  AFTER:  [bg]⟷[logo]⟷[cat]     (video gone)    │
   └─────────────────────────────────────────────────┘


╔══════════════════════════════════════════════════════════════════════════════════╗
║                          REQUEST FLOW (HIT vs MISS)                              ║
╚══════════════════════════════════════════════════════════════════════════════════╝

  CACHE HIT (~2ms)                    CACHE MISS (~300ms)
  ─────────────────                   ───────────────────

  User → Gateway                      User → Gateway
      │                                   │
      ▼                                   ▼
  Edge Mumbai                         Edge Mumbai
      │                                   │
      ▼                                   ▼
  LRU lookup                          LRU lookup
      │                                   │
      │ FOUND ✓                           │ NOT FOUND ✗
      │                                   │
      ▼                                   ▼
  serve from RAM                      singleflight.Do()
  ← 2ms ✓                                 │
                                          │ 1 request goes to origin
                                          │ 999 others WAIT here
                                          ▼
                                      Origin Server
                                          │
                                          ▼
                                       MinIO
                                          │
                                          ▼
                                      bytes returned
                                          │
                                          ▼
                                      store in LRU
                                          │
                                          ▼
                                      all 1000 served
                                      ← 300ms


╔══════════════════════════════════════════════════════════════════════════════════╗
║                            OBSERVABILITY LAYER                                   ║
╚══════════════════════════════════════════════════════════════════════════════════╝

   Edge :8081/metrics          Edge :8082/metrics          Edge :8083/metrics
   ──────────────────          ──────────────────          ──────────────────
   cache_hits_total 10542      cache_hits_total 8821       cache_hits_total 9123
   cache_misses_total 1203     cache_misses_total 980      cache_misses_total 901
   cache_hit_rate 0.897        cache_hit_rate 0.900        cache_hit_rate 0.910
   cache_size_bytes 486539264  cache_size_bytes 412000000  cache_size_bytes 450000000
   evictions_total 342         evictions_total 280         evictions_total 310
          │                           │                           │
          └───────────────────────────┼───────────────────────────┘
                                      │ scrapes every 5s
                                      ▼
                           ┌─────────────────────┐
                           │     PROMETHEUS       │
                           │   time series DB     │
                           └──────────┬──────────┘
                                      │ queries
                                      ▼
                           ┌─────────────────────┐
                           │  REACT DASHBOARD     │
                           │                      │
                           │  Hit Rate  [======] 91%  │
                           │  Mumbai    [======] 94ms  │
                           │  London    [====  ] 87ms  │
                           │  NYC       [=====  ] 90ms  │
                           │  Evictions ↑ 342          │
                           │  Memory    486MB / 500MB  │
                           └─────────────────────┘


╔══════════════════════════════════════════════════════════════════════════════════╗
║                           FAULT TOLERANCE SCENARIOS                              ║
╚══════════════════════════════════════════════════════════════════════════════════╝

  IF EDGE DIES:            IF REDIS DIES:           IF ORIGIN DIES:
  ─────────────            ──────────────           ───────────────

  Mumbai ✗                 Invalidation             Cache hits
     │                     events lost              still work ✓
     │ gateway detects          │                        │
     ▼                          │                   Cache misses
  reroute to              cache still              return 502 ✗
  London ✓                works fine ✓                   │
     │                          │                  (but cached
     │ Mumbai restarts     stale files              files? still
     ▼                     served until             served to
  back online ✓            TTL expires              millions) ✓

  ```