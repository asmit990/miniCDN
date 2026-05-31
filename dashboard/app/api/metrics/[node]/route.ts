import { NextRequest, NextResponse } from 'next/server';

// Mock metrics generator to simulate real Prometheus data
function generateMockMetrics(node: string, seed: number): string {
  // Create deterministic but varying metrics based on node and time
  const timeVariation = Math.sin(seed / 1000) * 0.3 + 0.7;
  const cacheHitRate = (85 + Math.sin(seed / 500) * 15) * timeVariation;
  const cacheSizeMB = (300 + Math.sin(seed / 1000 + 1) * 100) * timeVariation;
  const evictions = Math.max(0, Math.floor(Math.sin(seed / 800) * 10000 + 5000));
  const latencyP50 = 50 + Math.sin(seed / 1000) * 20;
  const latencyP95 = 150 + Math.sin(seed / 800) * 50;
  const latencyP99 = 400 + Math.sin(seed / 600) * 100;

  return `# HELP cache_hit_rate Cache hit rate ratio
# TYPE cache_hit_rate gauge
cache_hit_rate{node="${node}"} ${cacheHitRate / 100}

# HELP cache_size_bytes Cache size in bytes
# TYPE cache_size_bytes gauge
cache_size_bytes{node="${node}"} ${Math.floor(cacheSizeMB * 1024 * 1024)}

# HELP cache_evictions_total Total cache evictions
# TYPE cache_evictions_total counter
cache_evictions_total{node="${node}"} ${evictions}

# HELP origin_latency_ms Origin fetch latency in milliseconds
# TYPE origin_latency_ms histogram
origin_latency_ms_bucket{node="${node}",quantile="0.5",le="+Inf"} ${Math.floor(latencyP50)}
origin_latency_ms_bucket{node="${node}",quantile="0.95",le="+Inf"} ${Math.floor(latencyP95)}
origin_latency_ms_bucket{node="${node}",quantile="0.99",le="+Inf"} ${Math.floor(latencyP99)}
origin_latency_ms{node="${node}",quantile="0.5"} ${latencyP50}
origin_latency_ms{node="${node}",quantile="0.95"} ${latencyP95}
origin_latency_ms{node="${node}",quantile="0.99"} ${latencyP99}
`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ node: string }> }
) {
  const { node } = await params;

  // Validate node parameter
  const validNodes = ['us-west', 'eu-central', 'ap-south'];
  if (!validNodes.includes(node)) {
    return NextResponse.json({ error: 'Invalid node' }, { status: 400 });
  }

  // Generate mock metrics with time-based seed for realistic variations
  const seed = Date.now();
  const metrics = generateMockMetrics(node, seed);

  return new NextResponse(metrics, {
    headers: {
      'Content-Type': 'text/plain; version=0.0.4',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
