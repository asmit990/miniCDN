'use client';

import { useEdgeMetrics } from '@/hooks/use-edge-metrics';
import { NodeStatusCard } from '@/components/node-status-card';
import { CacheHitRateChart } from '@/components/charts/cache-hit-rate-chart';
import { OriginLatencyChart } from '@/components/charts/origin-latency-chart';
import { CacheSizeChart } from '@/components/charts/cache-size-chart';
import { EvictionsChart } from '@/components/charts/evictions-chart';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function Page() {
  const { timeSeries, currentMetrics, loading, error } = useEdgeMetrics();

  return (
    <main className="min-h-screen bg-slate-950 p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">CDN Monitoring Dashboard</h1>
          <p className="text-slate-400">Real-time edge node performance metrics</p>
        </div>

        {/* Error State */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && currentMetrics.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <p className="text-slate-400">Loading metrics...</p>
          </div>
        )}

        {/* Status Cards */}
        {currentMetrics.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {currentMetrics.map((metrics) => (
              <NodeStatusCard key={metrics.node} metrics={metrics} />
            ))}
          </div>
        )}

        {/* Charts */}
        {timeSeries.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CacheHitRateChart data={timeSeries} />
            <OriginLatencyChart metrics={currentMetrics} />
            <CacheSizeChart data={timeSeries} />
            <EvictionsChart data={timeSeries} />
          </div>
        )}
      </div>
    </main>
  );
}
