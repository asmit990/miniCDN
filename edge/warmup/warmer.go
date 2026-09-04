package warmup

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

type CacheInterface interface {
	Set(key string, value []byte)
}

type warm struct {
	originURL string
	cache     CacheInterface
	maxFiles  int
}

func NewWarmer(originURL string, cache CacheInterface, maxFiles int) *warm {
	return &warm{
		originURL: originURL,
		cache:     cache,
		maxFiles:  maxFiles,
	}
}

func (w *warm) Warm() {
	url := fmt.Sprintf("%s/files", w.originURL)

	res, err := http.Get(url)
	if err != nil {
		log.Printf("failed to get file list: %v", err)
		return
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		log.Printf("failed to read response body: %v", err)
		return
	}

	var resp struct {
		Files []string `json:"files"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		log.Printf("failed to parse JSON: %v", err)
		return
	}

	count := 0
	for _, filename := range resp.Files {
		if count >= w.maxFiles {
			break
		}

		fileURL := fmt.Sprintf("%s/%s", w.originURL, filename)
		fileRes, err := http.Get(fileURL)
		if err != nil {
			log.Printf("failed to fetch %s: %v", filename, err)
			continue
		}

		data, err := io.ReadAll(fileRes.Body)
		fileRes.Body.Close()
		if err != nil {
			log.Printf("failed to read %s: %v", filename, err)
			continue
		}

		w.cache.Set(filename, data)
		count++
	}
}
