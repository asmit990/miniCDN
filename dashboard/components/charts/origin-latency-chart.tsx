'use client';

import { memo, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EdgeMetrics } from '@/lib/metrics-parser';

interface OriginLatencyChartProps {
  metrics: EdgeMetrics[];
}

function OriginLatencyChartComponent({ metrics }: OriginLatencyChartProps) {
  const chartData = useMemo(() => {
    return metrics.map((m) => ({
      node: m.node,
      p50: m.originLatencyP50,
      p95: m.originLatencyP95,
      p99: m.originLatencyP99,
    }));
  }, [metrics]);

  if (chartData.length === 0) {
    return (
      <Card className="border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Origin Fetch Latency (ms)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-slate-500">
            Loading data...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-700">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Origin Fetch Latency (ms)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="node" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Legend />
              <Bar dataKey="p50" fill="#3b82f6" />
              <Bar dataKey="p95" fill="#f59e0b" />
              <Bar dataKey="p99" fill="#ef4444" />
            </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export const OriginLatencyChart = memo(OriginLatencyChartComponent);
