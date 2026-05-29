package main 

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"edge/cache"    
    "edge/origin"
)



type Server struct {

	cache *cache.Cache

	config Config
}




func NewServer(cfg Config) *Server {
	return &Server{
		cache: cache.NewCache(cfg.CacheSize),
		config: cfg,
	}
}


func (s *Server) routes() {
	http.HandleFunc("/file/", s.handleGetFile)
	http.HandleFunc("/health", s.handleHealth)
}



func (s *Server) handleGetFile(w http.ResponseWriter, r *http.Request)  {
    

	key := strings.TrimPrefix(r.URL.Path, "/file/")


	if key == "" {
		   http.Error(w, "missing file key", http.StatusBadRequest)
        return
	}

	if data, ok := s.cache.Get(key); ok {
		log.Printf("HIT %s", key)
		w.Header().Set("X-Cache", "HIT")
		w.Write(data)
		return 
	}


	log.Printf("MISS %s", key)
	data, err := origin.Fetch(s.config.OriginURL, key)

	if err != nil {
		http.Error(w, fmt.Sprintf("file not found: %s", key), http.StatusNotFound)
		return
	}



	s.cache.Set(key, data)

	w.Header().Set("X-Cache", "MISS")
	w.Write(data)
}


func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "ok")
}