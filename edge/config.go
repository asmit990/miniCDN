package main
import "os"


type Config struct {
	Port      string
	CacheSize int64
	OriginURL string
	RedisURL  string
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

    return Config{
        Port:      port,
        CacheSize: 500 * 1024 * 1024,
        OriginURL: originURL,
        RedisURL:  redisURL,
    }
}