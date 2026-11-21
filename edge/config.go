package main

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port          string
	CacheSize     int64
	OriginURL     string
	RedisURL      string
	CacheTTL      time.Duration
	StaleDuration time.Duration
	SigningSecret  string
}

func DefaultConfig() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = ":8081"
	}

	originURL := os.Getenv("ORIGIN_URL")
	if originURL == "" {
		originURL = "http://localhost:3000"
	}

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "localhost:6379"
	}

	ttlSeconds := 300 // 5 minutes default
	if v := os.Getenv("CACHE_TTL_SECONDS"); v != "" {
		if s, err := strconv.Atoi(v); err == nil && s > 0 {
			ttlSeconds = s
		}
	}

	staleSeconds := 60 // 1 minute default
	if v := os.Getenv("CACHE_STALE_SECONDS"); v != "" {
		if s, err := strconv.Atoi(v); err == nil && s > 0 {
			staleSeconds = s
		}
	}

	signingSecret := os.Getenv("CDN_SIGNING_SECRET")

	return Config{
		Port:          port,
		CacheSize:     500 * 1024 * 1024,
		OriginURL:     originURL,
		RedisURL:      redisURL,
		CacheTTL:      time.Duration(ttlSeconds) * time.Second,
		StaleDuration: time.Duration(staleSeconds) * time.Second,
		SigningSecret:  signingSecret,
	}
}