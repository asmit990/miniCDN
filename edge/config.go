package main

type Config struct {
	Port      string
	CacheSize int64
	OriginURL string
	RedisURL  string
}

func DefaultConfig() Config {
	return Config{
		Port:      ":8081",
		CacheSize: 500 * 1024 * 1024,
		OriginURL: "http://localhost:9000",
		RedisURL:  "redis://localhost:6379",
	}
}