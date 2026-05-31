/**
 * Parses Prometheus text format metrics
 * Extracts key metrics from the raw text output
 */

export interface EdgeMetrics {
  node: string;
  alive: boolean;
  cacheHitRate: number;
  cacheSizeMB: number;
  evictions: number;
  originLatencyP50: number;
  originLatencyP95: number;
  originLatencyP99: number;
}

export function parsePrometheusMetrics(text: string, nodeName: string): EdgeMetrics {
  const metrics: Partial<EdgeMetrics> = {
    node: nodeName,
    alive: true,
  };

  const lines = text.split('\n');

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;

    // Parse cache_hit_rate
    if (line.includes('cache_hit_rate') && line.includes(`node="${nodeName}"`)) {
      const match = line.match(/}\s+([\d.]+)$/);
      if (match) metrics.cacheHitRate = parseFloat(match[1]) * 100;
    }

    // Parse cache_size_bytes
    if (line.includes('cache_size_bytes') && line.includes(`node="${nodeName}"`)) {
      const match = line.match(/}\s+(\d+)$/);
      if (match) metrics.cacheSizeMB = parseInt(match[1]) / (1024 * 1024);
    }

    // Parse cache_evictions_total
    if (line.includes('cache_evictions_total') && line.includes(`node="${nodeName}"`)) {
      const match = line.match(/}\s+(\d+)$/);
      if (match) metrics.evictions = parseInt(match[1]);
    }

    // Parse origin_latency_p50
    if (
      line.includes('origin_latency_ms') &&
      line.includes(`node="${nodeName}"`) &&
      line.includes('quantile="0.5"')
    ) {
      const match = line.match(/}\s+([\d.]+)$/);
      if (match) metrics.originLatencyP50 = parseFloat(match[1]);
    }

    // Parse origin_latency_p95
    if (
      line.includes('origin_latency_ms') &&
      line.includes(`node="${nodeName}"`) &&
      line.includes('quantile="0.95"')
    ) {
      const match = line.match(/}\s+([\d.]+)$/);
      if (match) metrics.originLatencyP95 = parseFloat(match[1]);
    }

    // Parse origin_latency_p99
    if (
      line.includes('origin_latency_ms') &&
      line.includes(`node="${nodeName}"`) &&
      line.includes('quantile="0.99"')
    ) {
      const match = line.match(/}\s+([\d.]+)$/);
      if (match) metrics.originLatencyP99 = parseFloat(match[1]);
    }
  }

  return metrics as EdgeMetrics;
}
