package main

import (
	"edge/cache"
	"edge/invalidation"
	"edge/metrics"
	"edge/origin"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Server struct {
	cache  *cache.Cache
	config Config
}

func NewServer(cfg Config) *Server {
	c := cache.NewCache(cfg.CacheSize, 5*time.Minute)
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

	requestId := r.Header.Get("X-Request-ID")
	if requestId == "" {
		requestId = "no-id"
	}
	w.Header().Set("X-Request-ID", requestId)

	rawKey := strings.TrimPrefix(r.URL.Path, "/file/")
	if rawKey == "" {
		http.Error(w, "missing file key", http.StatusBadRequest)
		return
	}

	version := r.URL.Query().Get("v")
	cacheKey := rawKey
	if version != "" {
		cacheKey = fmt.Sprintf("%s?v=%s", rawKey, version)
	}

	acceptsGzip := strings.Contains(r.Header.Get("Accept-Encoding"), "gzip")

	// cache hit
	if data, etag, ok := s.cache.Get(cacheKey); ok {
		log.Printf("HIT  %s | reqID=%s", cacheKey, requestId)
		metrics.RecordHit()
		metrics.CacheSizeBytes.Set(float64(s.cache.Used()))

		w.Header().Set("X-Cache", "HIT")
		w.Header().Set("ETag", etag)
		if version != "" {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			w.Header().Set("X-Version", version)
		} else {
			w.Header().Set("Cache-Control", "public, max-age=3600")
			w.Header().Set("X-Version", "latest")
		}

		// 304 Not Modified — client already has this version
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}

		contentType := http.DetectContentType(data)
		writeResponse(w, data, contentType, acceptsGzip)
		metrics.RequestDuration.Observe(time.Since(start).Seconds())
		return
	}

	log.Printf("MISS %s | reqID=%s", cacheKey, requestId)
	metrics.RecordMiss()

	fetchStart := time.Now()
	data, err := origin.Fetch(s.config.OriginURL, rawKey, version)
	metrics.OriginFetchDuration.Observe(time.Since(fetchStart).Seconds())

	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	s.cache.Set(cacheKey, data)
	metrics.CacheSizeBytes.Set(float64(s.cache.Used()))

	// grab the computed etag from cache
	_, etag, _ := s.cache.Get(cacheKey)

	w.Header().Set("X-Cache", "MISS")
	w.Header().Set("ETag", etag)
	if version != "" {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("X-Version", version)
	} else {
		w.Header().Set("Cache-Control", "public, max-age=3600")
		w.Header().Set("X-Version", "latest")
	}

	contentType := http.DetectContentType(data)
	writeResponse(w, data, contentType, acceptsGzip)
	metrics.RequestDuration.Observe(time.Since(start).Seconds())
}

func writeResponse(w http.ResponseWriter, data []byte, contentType string, acceptsGzip bool) {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Vary", "Accept-Encoding")

	if acceptsGzip && isCompressible(contentType) {
		compressed, err := gzipCompress(data)
		if err == nil {
			w.Header().Set("Content-Encoding", "gzip")
			w.Write(compressed)
			return
		}
		log.Printf("gzip compression failed: %v", err)
	}

	w.Write(data)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "ok")
}
