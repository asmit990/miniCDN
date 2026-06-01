package main

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"edge/cache"
	"edge/invalidation"
	"edge/metrics"
	"edge/origin"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Server struct {
	cache  *cache.Cache
	config Config
}

func NewServer(cfg Config) *Server {
	c := cache.NewCache(cfg.CacheSize)
	invalidation.StartSubscriber(cfg.RedisURL, c)

	return &Server{
		cache:  c,
		config: cfg,
	}
}

func (s *Server) routes() {
	http.HandleFunc("/file/", s.handleGetFile)
	http.HandleFunc("/health", s.handleHealth)
	http.Handle("/metrics", promhttp.Handler())
}

func (s *Server) handleGetFile(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	metrics.ActiveConnections.Inc()
	defer metrics.ActiveConnections.Dec()

	key := strings.TrimPrefix(r.URL.Path, "/file/")
	if key == "" {
		http.Error(w, "missing file key", http.StatusBadRequest)
		return
	}

	// cache hit
	if data, ok := s.cache.Get(key); ok {
		log.Printf("HIT  %s", key)
		metrics.RecordHit()                                        
		metrics.CacheSizeBytes.Set(float64(s.cache.Used()))
		w.Header().Set("X-Cache", "HIT")
		w.Write(data)
		metrics.RequestDuration.Observe(time.Since(start).Seconds())
		return
	}


	log.Printf("MISS %s", key)
	metrics.RecordMiss()                                             

	fetchStart := time.Now()
	data, err := origin.Fetch(s.config.OriginURL, key)
	metrics.OriginFetchDuration.Observe(time.Since(fetchStart).Seconds())

	if err != nil {
		http.Error(w, fmt.Sprintf("file not found: %s", key), http.StatusNotFound)
		return
	}

	s.cache.Set(key, data)
	metrics.CacheSizeBytes.Set(float64(s.cache.Used()))

	w.Header().Set("X-Cache", "MISS")
	w.Write(data)
	metrics.RequestDuration.Observe(time.Since(start).Seconds())
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "ok")
}