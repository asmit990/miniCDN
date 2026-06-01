package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	CacheHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "cdn_cache_hits_total",
		Help: "Total cache hits",
	})

	CacheMisses = promauto.NewCounter(prometheus.CounterOpts{
		Name: "cdn_cache_misses_total",
		Help: "Total cache misses",
	})

	Evictions = promauto.NewCounter(prometheus.CounterOpts{
		Name: "cdn_evictions_total",
		Help: "Total cache evictions",
	})

	CacheSizeBytes = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "cdn_cache_size_bytes",
		Help: "Current cache size in bytes",
	})

	CacheHitRate = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "cdn_cache_hit_rate",
		Help: "Cache hit rate",
	})

	ActiveConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "cdn_active_connections",
		Help: "Active connections",
	})

	OriginFetchDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "cdn_origin_fetch_duration_seconds",
		Help:    "Time taken to fetch from origin",
		Buckets: []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0},
	})

	RequestDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "cdn_request_duration_seconds",
		Help:    "Total request duration",
		Buckets: []float64{0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0},
	})
)

var totalHits float64
var totalMisses float64

func RecordHit() {
	CacheHits.Inc()
	totalHits++
	updateRate()
}

func RecordMiss() {
	CacheMisses.Inc()
	totalMisses++
	updateRate()
}

func updateRate() {
	total := totalHits + totalMisses
	if total == 0 {
		return
	}
	CacheHitRate.Set(totalHits / total)
}