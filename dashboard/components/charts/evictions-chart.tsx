'use client';

import { memo, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TimeSeries } from '@/hooks/use-edge-metrics';

interface EvictionsChartProps {
  data: TimeSeries[];
}

function EvictionsChartComponent({ data }: EvictionsChartProps) {
  const chartData = useMemo(() => {
    return data.map((point, index) => {
      const prevPoint = index > 0 ? data[index - 1] : null;
      const curr = point.evictions;
      const prev = prevPoint?.evictions || {};

      // Calculate deltas to detect spikes
      const usWestDelta = (curr['us-west'] || 0) - (prev['us-west'] || 0);
      const euCentralDelta = (curr['eu-central'] || 0) - (prev['eu-central'] || 0);
      const apSouthDelta = (curr['ap-south'] || 0) - (prev['ap-south'] || 0);

      return {
        time: new Date(point.timestamp).toLocaleTimeString(),
        'us-west': Math.max(0, usWestDelta),
        'eu-central': Math.max(0, euCentralDelta),
        'ap-south': Math.max(0, apSouthDelta),
      };
    });
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card className="border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Cache Evictions (Spike Detection)</CardTitle>
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
        <CardTitle className="text-lg font-semibold">Cache Evictions (Spike Detection)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 12 }} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
              }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Legend />
            <Bar dataKey="us-west" fill="#3b82f6" opacity={0.7} />
            <Bar dataKey="eu-central" fill="#ec4899" opacity={0.7} />
            <Bar dataKey="ap-south" fill="#10b981" opacity={0.7} />
            </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export const EvictionsChart = memo(EvictionsChartComponent);
