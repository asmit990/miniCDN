package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	cfg := DefaultConfig()

	server := NewServer(cfg)

	httpServer := &http.Server{
		Addr:              cfg.Port,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Channel to listen for interrupt/termination signals
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	// Run server in background goroutine
	go func() {
		log.Printf("Edge node starting on %s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Edge node server error: %v", err)
		}
	}()

	// Block until signal received
	sig := <-stopChan
	log.Printf("Received signal %s: shutting down edge node gracefully...", sig)

	// Context with 10 second timeout for draining active in-flight requests
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("Graceful shutdown failed: %v, forcing exit", err)
		os.Exit(1)
	}

	log.Println("Edge node stopped gracefully")
}
