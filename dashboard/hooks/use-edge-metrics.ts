'use client';

import { useState, useEffect, useRef } from 'react';
import { EdgeMetrics, parsePrometheusMetrics } from '@/lib/metrics-parser';

export interface TimeSeries {
  timestamp: number;
  cacheHitRate: Record<string, number>;
  cacheSizeMB: Record<string, number>;
  evictions: Record<string, number>;
  originLatencyP50: Record<string, number>;
  originLatencyP95: Record<string, number>;
  originLatencyP99: Record<string, number>;
}

interface UseEdgeMetricsReturn {
  timeSeries: TimeSeries[];
  currentMetrics: EdgeMetrics[];
  loading: boolean;
  error: string | null;
}

const EDGES = ['us-west', 'eu-central', 'ap-south'];
const POLL_INTERVAL = 5000; // 5 seconds
const TIMEOUT = 2000; // 2 seconds
const MAX_POINTS = 60; // Keep last 60 data points

export function useEdgeMetrics(): UseEdgeMetricsReturn {
  const [timeSeries, setTimeSeries] = useState<TimeSeries[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<EdgeMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        abortControllerRef.current = new AbortController();
        const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), TIMEOUT);

        const promises = EDGES.map((edge) =>
          fetch(`/api/metrics/${edge}`, {
            signal: abortControllerRef.current?.signal,
          })
            .then((res) => res.text())
            .then((text) => {
              try {
                return parsePrometheusMetrics(text, edge);
              } catch (e) {
                console.error(`[v0] Error parsing metrics for ${edge}:`, e);
                return {
                  node: edge,
                  alive: false,
                  cacheHitRate: 0,
                  cacheSizeMB: 0,
                  evictions: 0,
                  originLatencyP50: 0,
                  originLatencyP95: 0,
                  originLatencyP99: 0,
                };
              }
            })
            .catch((e) => {
              console.error(`[v0] Error fetching metrics for ${edge}:`, e);
              return {
                node: edge,
                alive: false,
                cacheHitRate: 0,
                cacheSizeMB: 0,
                evictions: 0,
                originLatencyP50: 0,
                originLatencyP95: 0,
                originLatencyP99: 0,
              };
            })
        );

        const metrics = await Promise.all(promises);
        clearTimeout(timeoutId);

        setCurrentMetrics(metrics);
        setError(null);

        // Update time series with new data point
        setTimeSeries((prev) => {
          const newPoint: TimeSeries = {
            timestamp: Date.now(),
            cacheHitRate: {},
            cacheSizeMB: {},
            evictions: {},
            originLatencyP50: {},
            originLatencyP95: {},
            originLatencyP99: {},
          };

          metrics.forEach((m) => {
            newPoint.cacheHitRate[m.node] = m.cacheHitRate;
            newPoint.cacheSizeMB[m.node] = m.cacheSizeMB;
            newPoint.evictions[m.node] = m.evictions;
            newPoint.originLatencyP50[m.node] = m.originLatencyP50;
            newPoint.originLatencyP95[m.node] = m.originLatencyP95;
            newPoint.originLatencyP99[m.node] = m.originLatencyP99;
          });

          const updated = [...prev, newPoint];
          // Keep only last MAX_POINTS
          return updated.slice(-MAX_POINTS);
        });

        setLoading(false);
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          console.error('[v0] Error fetching metrics:', e);
          setError(e.message);
        }
      }
    };

    // Initial fetch
    fetchMetrics();

    // Set up polling interval
    const intervalId = setInterval(fetchMetrics, POLL_INTERVAL);

    return () => {
      clearInterval(intervalId);
      abortControllerRef.current?.abort();
    };
  }, []);

  return { timeSeries, currentMetrics, loading, error };
}
