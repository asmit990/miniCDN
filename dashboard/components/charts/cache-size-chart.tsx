'use client';

import { memo, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TimeSeries } from '@/hooks/use-edge-metrics';

interface CacheSizeChartProps {
  data: TimeSeries[];
}

function CacheSizeChartComponent({ data }: CacheSizeChartProps) {
  const chartData = useMemo(() => {
    return data.map((point) => ({
      time: new Date(point.timestamp).toLocaleTimeString(),
      'us-west': point.cacheSizeMB['us-west'] || 0,
      'eu-central': point.cacheSizeMB['eu-central'] || 0,
      'ap-south': point.cacheSizeMB['ap-south'] || 0,
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card className="border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Cache Size (MB)</CardTitle>
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
        <CardTitle className="text-lg font-semibold">Cache Size (MB)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="colorUsWest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorEuCentral" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorApSouth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <ReferenceLine y={500} stroke="#64748b" strokeDasharray="5 5" label="500 MB Limit" />
            <Area
              type="monotone"
              dataKey="us-west"
              stroke="#3b82f6"
              fillOpacity={1}
              fill="url(#colorUsWest)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="eu-central"
              stroke="#ec4899"
              fillOpacity={1}
              fill="url(#colorEuCentral)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="ap-south"
              stroke="#10b981"
              fillOpacity={1}
              fill="url(#colorApSouth)"
              isAnimationActive={false}
            />
            </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export const CacheSizeChart = memo(CacheSizeChartComponent);
