

# Mini CDN

A distributed Content Delivery Network built from scratch — no CDN libraries, no shortcuts.

![Architecture](./assets/architecture.png)

---

## What It Does

3 edge nodes (Mumbai, London, NYC) sit behind a TypeScript API Gateway that routes requests by region, runs health checks every 5 seconds, and automatically fails over if a node goes down. Each edge node caches files in RAM using a hand-rolled LRU cache. When files are updated, Redis Pub/Sub invalidates stale cache across all edges in under 5ms.

---

## Architecture

```
                        [ USER ]
                           |
                           | HTTP request
                           v
              +---------------------------+
              |       API GATEWAY         |
              |  - GeoIP routing          |
              |  - Health checks          |
              |  - Rate limiting          |
              |  - Auto failover          |
              +---------------------------+
                /           |           \
               /            |            \
              v             v             v
   +----------+      +----------+      +----------+
   |  EDGE    |      |  EDGE    |      |  EDGE    |
   |  Mumbai  |      |  London  |      |  NYC     |
   |  :8081   |      |  :8082   |      |  :8083   |
   +----------+      +----------+      +----------+
   | LRU Cache|      | LRU Cache|      | LRU Cache|
   | RAM only |      | RAM only |      | RAM only |
   +----+-----+      +----+-----+      +----+-----+
        |                 |                 |
        +-----------------+-----------------+
                          |  cache miss
                          v
             +-------------------+
             |   ORIGIN SERVER   |
             |  - file uploads   |
             |  - serve files    |
             +--------+----------+
                      |
                      v
             +-------------------+
             |   MinIO / S3      |
             |  object storage   |
             +-------------------+

     INVALIDATION
     +-----------------+
     |  Redis Pub/Sub  |  <-- origin publishes PURGE on upload
     +-----------------+
        |         |
     Edge A    Edge B
     (deletes   (deletes
     stale)     stale)
```

---



``` mermaid 
    
    graph TB
    subgraph Clients["Clients / Users"]
        C1["Client (India)"]
        C2["Client (UK / Europe)"]
        C3["Client (US / Americas)"]
    end

    subgraph GatewayLayer["API Gateway (TypeScript / Express)"]
        GW["API Gateway :8080<br/>• GeoIP Routing<br/>• Request Tracing (X-Request-ID)"]
    end

    subgraph EdgeLayer["Edge PoP Layer (Go)"]
        subgraph EdgeMumbai["Edge Mumbai :8081"]
            EM_LRU["LRU Cache + TTL"]
            EM_ETag["ETag & 304 Validation"]
            EM_CB["Circuit Breaker"]
            EM_SF["Singleflight (Dedup)"]
            EM_GZIP["Gzip Compression"]
            EM_Warm["Cache Warmer"]
        end

        subgraph EdgeLondon["Edge London :8082"]
            EL_LRU["LRU Cache + TTL"]
            EL_CB["Circuit Breaker"]
            EL_Warm["Cache Warmer"]
        end

        subgraph EdgeNYC["Edge NYC :8083"]
            EN_LRU["LRU Cache + TTL"]
            EN_CB["Circuit Breaker"]
            EN_Warm["Cache Warmer"]
        end
    end

    subgraph OriginLayer["Origin Server (TypeScript / Node.js) :3000"]
        API_Fetch["GET /origin/:file(?v=n)"]
        API_Upload["POST /upload"]
        API_Admin["GET /admin/files<br/>GET /admin/versions/:file"]
        VerModule["Versioning Module"]
        PurgePub["Purge Publisher"]
    end

    subgraph StorageLayer["Data & Messaging Infrastructure"]
        MinIO[("MinIO (S3 Object Storage) :9000<br/>• latest: file.ext<br/>• versioned: file.ext.v.timestamp")]
        Redis[("Redis :6379<br/>• Pub/Sub: cdn:invalidation<br/>• Lists: versions:key")]
        Prometheus["Prometheus Metrics :9090"]
    end

    %% Client to Gateway
    C1 -->|HTTP Req| GW
    C2 -->|HTTP Req| GW
    C3 -->|HTTP Req| GW

    %% Gateway to Edge
    GW -->|Geo: IN| EdgeMumbai
    GW -->|Geo: GB| EdgeLondon
    GW -->|Geo: US| EdgeNYC

    %% Edge to Origin & Redis
    EM_CB -->|Cache Miss| API_Fetch
    EL_CB -->|Cache Miss| API_Fetch
    EN_CB -->|Cache Miss| API_Fetch

    Redis -.->|PURGE Event Pub/Sub| EM_LRU
    Redis -.->|PURGE Event Pub/Sub| EL_LRU
    Redis -.->|PURGE Event Pub/Sub| EN_LRU

    EM_Warm -->|Startup GET /admin/files| API_Admin

    %% Origin internals
    API_Upload --> VerModule
    VerModule -->|1. Store latest & snapshot| MinIO
    VerModule -->|2. RPUSH timestamp| Redis
    API_Upload --> PurgePub
    PurgePub -->|3. PUBLISH PURGE| Redis

    API_Fetch -->|Read version metadata| Redis
    API_Fetch -->|Fetch object data| MinIO

    %% Metrics
    EdgeMumbai -.->|Scrape /metrics| Prometheus

```


## Request Lifecycle
``` mermaid 
sequenceDiagram
    autonumber
    actor Client
    participant GW as API Gateway
    participant Edge as Edge Node (Go)
    participant Origin as Origin (TypeScript)
    participant Redis as Redis (ioredis)
    participant MinIO as MinIO Storage

    Client->>GW: GET /images/cat.png (If-None-Match: "etag123")
    GW->>Edge: Route to nearest PoP (X-Request-ID attached)

    alt Cache Fresh (age <= TTL)
        Edge->>Edge: Check LRU Cache & TTL Expiry
        alt ETag matches (If-None-Match)
            Edge-->>Client: 304 Not Modified
        else Content fresh
            Edge->>Edge: Gzip Compress (if Accept-Encoding: gzip)
            Edge-->>Client: 200 OK (X-Cache: HIT)
        end
    else Cache Stale (TTL < age <= TTL + StaleDuration)
        Edge-->>Client: 200 OK (X-Cache: STALE) [Sub-millisecond response]
        par Background Async Revalidation
            Edge->>Origin: Singleflight GET /origin/cat.png
            Origin-->>Edge: Fresh Binary Data
            Edge->>Edge: Update LRU with fresh data & reset TTL
        end
    else Cache Miss (not in cache or expired beyond stale window)
        Edge->>Edge: Singleflight (collapse duplicate concurrent requests)
        Edge->>Edge: Check Circuit Breaker State (Closed / Open / Half-Open)
        
        alt Circuit Breaker is OPEN
            Edge-->>Client: 503 Service Unavailable (Circuit Open)
        else Circuit Breaker is CLOSED / HALF-OPEN
            alt Request with ?v=1 (Versioned Fetch)
                Edge->>Origin: GET /origin/cat.png?v=1
                Origin->>Redis: LINDEX versions:cat.png (version - 1)
                Redis-->>Origin: timestamp "1788535528543"
                Origin->>MinIO: GET cat.png.v.1788535528543
                MinIO-->>Origin: Binary data
                Origin-->>Edge: 200 OK
            else Normal Fetch (Latest)
                Edge->>Origin: GET /origin/cat.png
                Origin->>MinIO: GET cat.png
                MinIO-->>Origin: Binary data
                Origin-->>Edge: 200 OK
            end

            Edge->>Edge: Calculate MD5 ETag + Store in LRU
            Edge->>Edge: Optional Gzip Encoding
            Edge-->>Client: 200 OK (X-Cache: MISS)
        end
    end

```
## File Upload


``` mermaid

sequenceDiagram
    autonumber
    actor Admin as Admin / Content Publisher
    participant Origin as Origin Server
    participant MinIO as MinIO Storage
    participant Redis as Redis
    participant Edge as Edge Nodes

    Admin->>Origin: POST /upload (file: cat.png)
    Note over Origin: Generate Version Timestamp Date.now()

    Origin->>MinIO: 1. Put latest "cat.png"
    Origin->>MinIO: 2. Put snapshot "cat.png.v.<timestamp>"
    MinIO-->>Origin: Stored successfully

    Origin->>Redis: 3. RPUSH versions:cat.png <timestamp>
    Redis-->>Origin: Stored in version list

    Origin->>Redis: 4. PUBLISH cdn:invalidation {"key": "cat.png", "action": "PURGE"}
    
    par Edge Node Mumbai
        Redis-->>Edge: Receive PURGE "cat.png"
        Edge->>Edge: Evict "cat.png" from LRU Cache
    and Edge Node London
        Redis-->>Edge: Receive PURGE "cat.png"
        Edge->>Edge: Evict "cat.png" from LRU Cache
    and Edge Node NYC
        Redis-->>Edge: Receive PURGE "cat.png"
        Edge->>Edge: Evict "cat.png" from LRU Cache
    end

    Origin-->>Admin: 200 OK { key: "cat.png", version: timestamp }

```

## cache warming Lifecycle

``` mermaid 

sequenceDiagram
    autonumber
    participant Edge as Edge Node (Warmup Goroutine)
    participant Origin as Origin Server (/admin/files)
    participant MinIO as MinIO Storage

    Note over Edge: Edge service boots up
    Edge->>Edge: Launch go warmer.Warm() (non-blocking)
    Edge->>Origin: GET /admin/files
    Origin->>MinIO: List all objects in bucket
    MinIO-->>Origin: ["cat.png", "logo.png", ...]
    Origin-->>Edge: { files: [...], count: N }

    loop For each file (up to maxFiles)
        Edge->>Origin: GET /origin/<file>
        Origin->>MinIO: Fetch object
        MinIO-->>Origin: Binary data
        Origin-->>Edge: 200 OK
        Edge->>Edge: cache.Set(file, data)
    end
    Note over Edge: Cache Warmup Complete (0 cold start misses for hot files)

```

## Stale-While-Revalidate Lifecycle (RFC 5861)

``` mermaid
sequenceDiagram
    autonumber
    actor Client as User / Browser
    participant Edge as Edge Node (Go)
    participant LRU as In-Memory LRU Cache
    participant Origin as Origin Server (:3000)

    Note over Client,Edge: Asset age: TTL < age <= TTL + StaleDuration (Within Stale Window)
    Client->>Edge: GET /file/bundle.js
    Edge->>LRU: GetWithStale("bundle.js")
    LRU-->>Edge: Stale Data, ETag, StateStale

    Note over Edge,Client: Zero user latency (immediate sub-millisecond response)
    Edge-->>Client: 200 OK (X-Cache: STALE, Cache-Control: stale-while-revalidate=60)

    par Background Revalidation (Non-Blocking Goroutine)
        Edge->>Origin: Singleflight GET /origin/bundle.js
        Origin-->>Edge: Fresh Binary Data
        Edge->>LRU: cache.Set("bundle.js", freshData)
        Note over LRU: Cache refreshed & TTL reset for subsequent users
    end
```

## Instant Version Rollback Lifecycle

``` mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / Deployer
    participant Origin as Origin Server (:3000)
    participant MinIO as MinIO Storage (:9000)
    participant Redis as Redis (:6379)
    participant Edge as Edge Nodes (Mumbai, London, NYC)

    Admin->>Origin: POST /admin/rollback/app.js?v=1
    Origin->>Redis: LINDEX versions:app.js (version 1)
    Redis-->>Origin: timestamp "1788535528543"
    
    Origin->>MinIO: GET app.js.v.1788535528543 (read historical snapshot)
    MinIO-->>Origin: Snapshot Binary Buffer

    Origin->>MinIO: 1. Put active "app.js" (restored content)
    Origin->>MinIO: 2. Put snapshot "app.js.v.<new_timestamp>"
    Origin->>Redis: 3. RPUSH versions:app.js <new_timestamp>
    Origin->>Redis: 4. PUBLISH cdn:invalidation {"key": "app.js", "action": "PURGE"}

    par Edge Invalidation Broadcast (~5ms)
        Redis-->>Edge: Broadcast PURGE "app.js"
        Edge->>Edge: cache.Delete("app.js")
    end

    Origin-->>Admin: 200 OK { success: true, rolledBackToVersion: 1 }
```

## Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| API Gateway | TypeScript (Express) | GeoIP routing, health checks, failover |
| Edge Nodes | Go | Goroutines, fast HTTP, low memory |
| LRU Cache | Go (hand-rolled) | O(1) get/set/evict, no external lib |
| Origin Server | TypeScript (Express) | File uploads, MinIO integration |
| Object Storage | MinIO | S3-compatible, runs in Docker |
| Cache Invalidation | Redis Pub/Sub | Fast, reliable, simple |
| Metrics | Prometheus | Industry standard |
| Dashboard | React + Recharts | Live graphs |
| Containers | Docker Compose | One command startup |

---

## Features

- **Hand-rolled LRU Cache** — HashMap + Doubly Linked List, every operation O(1)
- **Stale-While-Revalidate (RFC 5861)** — Serves stale content in 0ms while asynchronously refreshing fresh content from Origin in the background
- **Instant Version Rollback** — `/admin/rollback/:file?v=N` rolls back active assets to any snapshot and invalidates all edge nodes in ~5ms
- **3 Edge Nodes** — Mumbai, London, NYC with shared-nothing architecture
- **Singleflight** — Collapses concurrent cache misses and background revalidations into exactly 1 origin request
- **Circuit Breaker** — Trips Open on upstream origin failures to prevent cascading latency spikes
- **ETag & 304 Not Modified** — Automatic MD5 ETag hashing and conditional validation for client-side bandwidth savings
- **Gzip Compression** — Dynamic compression for text, JSON, HTML, CSS, JS, and SVG payloads
- **Cache Invalidation** — Redis Pub/Sub PURGE & DELETE events, ~5ms propagation to all edges
- **Health Checks & Failover** — Gateway polls every 5s, auto-failover across fallback chain (`IN` $\to$ `GB` $\to$ `US`)
- **Fault Tolerance** — Edge dies? Rerouted. Redis dies? Cache still works. Origin dies? Cached files still served.
- **Prometheus Metrics** — Hit rate, P95/P99 latency, evictions, active connections, memory per edge
- **Rate Limiting** — Configurable sliding-window rate limiting per IP at the gateway level

---

## Project Structure

```
mini-cdn/
├── gateway/                  # TypeScript — routing, health checks, proxy
│   └── src/
│       ├── index.ts
│       ├── router.ts         # GeoIP logic, edge selection
│       ├── healthcheck.ts    # polls /health every 5s
│       ├── ratelimiter.ts
│       ├── proxy.ts          # forwards request to edge
│       └── config.ts
│
├── origin/                   # TypeScript — uploads, MinIO, Redis publish
│   └── src/
│       ├── index.ts
│       ├── routes/
│       │   ├── upload.ts     # POST /upload
│       │   ├── fetch.ts      # GET /origin/:file
│       │   └── delete.ts     # DELETE /file/:id
│       ├── storage/
│       │   └── minio.ts      # MinIO client
│       └── invalidation/
│           └── publisher.ts  # Redis PURGE publish
│
├── edge/                     # Go — LRU cache, singleflight, Redis subscribe
│   ├── main.go
│   ├── server.go             # HTTP handlers
│   ├── cache/
│   │   ├── lru.go            # LRU core (HashMap + DLL)
│   │   ├── node.go           # Node struct
│   │   └── lru_test.go
│   ├── origin/
│   │   └── fetcher.go        # singleflight fetch
│   ├── invalidation/
│   │   └── subscriber.go     # Redis PURGE listener
│   └── metrics/
│       └── prometheus.go     # counters, gauges, histograms
│
├── dashboard/                # React — live metrics dashboard
├── config/
│   ├── prometheus.yml        # scrape config
│   └── regions.yml           # region → edge mapping
├── scripts/                  # test scripts
└── docker-compose.yml
```

---

## Getting Started

### Prerequisites

- Docker + Docker Compose
- Go 1.21+
- Node.js 20+

### Run Everything

```bash
git clone https://github.com/asmit990/miniCDN.git
cd miniCDN
docker compose up -d
```

### Services

| Service | URL |
|---------|-----|
| Gateway | http://localhost:8080 |
| Edge Mumbai | http://localhost:8081 |
| Edge London | http://localhost:8082 |
| Edge NYC | http://localhost:8083 |
| Origin | http://localhost:3000 |
| MinIO Console | http://localhost:9001 |
| Prometheus | http://localhost:9090 |
| Dashboard | http://localhost:5173 |

---

## Usage

### Upload a file
```bash
curl -X POST http://localhost:3000/upload \
  -F "file=@cat.png"

# response
{ "success": true, "key": "cat.png" }
```

### Fetch a file (via gateway)
```bash
# Indian user → Mumbai edge
curl -H "X-Region: IN" http://localhost:8080/file/cat.png

# London user → London edge
curl -H "X-Region: GB" http://localhost:8080/file/cat.png

# NYC user → NYC edge
curl -H "X-Region: US" http://localhost:8080/file/cat.png

# Fetch historical version 1 (immutable CDN caching)
curl -H "X-Region: IN" http://localhost:8080/file/cat.png?v=1
```

### Rollback to previous version
```bash
# Instantly restore cat.png to version 1 and broadcast purge to all edges
curl -X POST "http://localhost:3000/admin/rollback/cat.png?v=1"

# response
{
  "success": true,
  "message": "Successfully rolled back cat.png to version 1",
  "file": "cat.png",
  "rolledBackToVersion": 1,
  "newVersionTimestamp": "1795153135085"
}
```

### Watch cache states (MISS → HIT → STALE)
```bash
# 1. First request — cache miss (fetches from origin)
curl -v http://localhost:8080/file/cat.png
# Header: X-Cache: MISS

# 2. Second request — cache hit (served from edge RAM in <1ms)
curl -v http://localhost:8080/file/cat.png
# Header: X-Cache: HIT

# 3. Request after TTL expires (during stale window)
curl -v http://localhost:8080/file/cat.png
# Header: X-Cache: STALE (served instantly while background goroutine refreshes from Origin)

# 4. Upload new version or Rollback
curl -X POST http://localhost:3000/upload -F "file=@new_cat.png"
# Redis Pub/Sub PURGE published → invalidated across all 3 edges in ~5ms
```

### View metrics
```bash
curl http://localhost:8081/metrics

# output
cdn_cache_hits_total 42
cdn_cache_misses_total 5
cdn_cache_hit_rate 0.894
cdn_cache_size_bytes 486539264
cdn_evictions_total 3
```

---

## Running Tests

### 1. Unit Tests (Go)
```bash
cd edge
go test -v ./...
```
Tests:
- **`cache`**: LRU order, capacity evictions, TTL expirations, prefix purging, `stale-while-revalidate` state transitions (`StateFresh` $\to$ `StateStale` $\to$ `StateMiss`).
- **`origin`**: Circuit breaker state machine (Closed $\to$ Open $\to$ HalfOpen), failure threshold trips, origin HTTP fetcher with versions.
- **`compression`**: Dynamic MIME-type compressibility checks and Gzip decompression integrity.

### 2. End-to-End Integration Tests
Run the entire cluster and execute the complete test suite:

```bash
docker compose up -d

./scripts/integration_test.sh && \
./scripts/test_versioning.sh && \
./scripts/test_hit.sh && \
./scripts/test_miss.sh && \
./scripts/test_invalidation.sh
```

| Script | What It Tests |
|---|---|
| `integration_test.sh` | MISS $\to$ HIT, cross-edge invalidation, Gateway failover (Mumbai $\to$ London fallback), singleflight under 50 concurrent requests (1 origin fetch). |
| `test_versioning.sh` | Multi-version uploads, unversioned vs versioned cache isolation (`?v=1`), snapshot storage, version rollback, and purge cleanup. |
| `test_hit.sh` | Cache warming, sub-millisecond response validation, and byte payload integrity. |
| `test_miss.sh` | 404 response handling for non-existent assets and initial cache MISS headers. |
| `test_invalidation.sh` | Cache priming across all 3 PoPs (8081, 8082, 8083), file update triggering Redis Pub/Sub, and synchronized edge eviction. |

### 3. Load & Performance Benchmarks (k6)
```bash
./scripts/load_test.sh --quick    # Quick benchmark (~8s)
./scripts/load_test.sh            # Standard benchmark (~22s)
./scripts/load_test.sh --stress   # High concurrency stress test
```

---

## What This Demonstrates

- LRU Cache from scratch (not just "used Redis")
- Concurrency in Go (goroutines, mutexes, singleflight)
- Distributed systems thinking (fault tolerance, eventual consistency)
- Event-driven architecture (pub/sub invalidation)
- Observability (Prometheus metrics, live dashboard)
- Infrastructure design (stateless compute, stateful storage)
- Networking (HTTP proxying, WebSocket, streaming)

---

## License

MIT
