'use client';

import { memo, useMemo } from 'react';
import {
  LineChart,
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

interface CacheHitRateChartProps {
  data: TimeSeries[];
}

function CacheHitRateChartComponent({ data }: CacheHitRateChartProps) {
  const chartData = useMemo(() => {
    return data.map((point) => ({
      time: new Date(point.timestamp).toLocaleTimeString(),
      'us-west': point.cacheHitRate['us-west'] || 0,
      'eu-central': point.cacheHitRate['eu-central'] || 0,
      'ap-south': point.cacheHitRate['ap-south'] || 0,
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card className="border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Cache Hit Rate</CardTitle>
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
        <CardTitle className="text-lg font-semibold">Cache Hit Rate</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="us-west"
                stroke="#3b82f6"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="eu-central"
                stroke="#ec4899"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="ap-south"
                stroke="#10b981"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export const CacheHitRateChart = memo(CacheHitRateChartComponent);
