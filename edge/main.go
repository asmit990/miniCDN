package main

import (
    "log"
    "net/http"
)

func main() {
    cfg := DefaultConfig()

    server := NewServer(cfg)
    server.routes()

    log.Printf("Edge node starting on %s", cfg.Port)
    log.Fatal(http.ListenAndServe(cfg.Port, nil))
}