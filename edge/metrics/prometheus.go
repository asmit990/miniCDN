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

	// GAUGES — upar neeche jaate hain
	CacheSizeBytes = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "cdn_cache_size_bytes",
		Help: "Current cache size in bytes",
	})

	CacheHitRate = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "cdn_cache_hit_rate",
		Help: "Cache hit rate (hits / total requests)",
	})

	ActiveConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "cdn_active_connections",
		Help: "Active connections right now",
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





func UpdateHitRate() {
	hits := getCounterValue(CacheHits)
	misses := getCounterValue(CacheMisses)
	total := hits + misses

	if total == 0 {
		return 
	}
	CacheHitRate.Set(hits / total)
}


func getCounterValue(c prometheus.Counter) float64 {
	ch := make(chan prometheus.Metric, 1)
	c.Collect(ch)
	m := <-ch
	var dto dto.Metric
	m.Write(&dto)
	return dto.Counter.GetValue()

}