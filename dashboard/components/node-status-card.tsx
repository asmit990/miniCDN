'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EdgeMetrics } from '@/lib/metrics-parser';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface NodeStatusCardProps {
  metrics: EdgeMetrics;
}

export function NodeStatusCard({ metrics }: NodeStatusCardProps) {
  const statusColor = metrics.alive ? 'text-green-500' : 'text-red-500';
  const statusBg = metrics.alive ? 'bg-green-500/10' : 'bg-red-500/10';
  const statusIcon = metrics.alive ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />;

  return (
    <Card className={`border-slate-700 ${statusBg}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold capitalize">{metrics.node}</CardTitle>
          <div className={statusColor}>{statusIcon}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm text-slate-400">Cache Hit Rate</p>
          <p className="text-2xl font-bold">{metrics.cacheHitRate.toFixed(1)}%</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-400">Cache Size</p>
            <p className="text-lg font-semibold">{metrics.cacheSizeMB.toFixed(1)} MB</p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Evictions</p>
            <p className="text-lg font-semibold">{metrics.evictions.toLocaleString()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
