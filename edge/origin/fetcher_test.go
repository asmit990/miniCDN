package origin

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetch_Success(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/origin/test.txt" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("origin-content-data"))
			return
		}
		http.NotFound(w, r)
	}))
	defer ts.Close()

	data, err := Fetch(ts.URL, "test.txt", "")
	if err != nil {
		t.Fatalf("expected successful fetch, got err: %v", err)
	}
	if string(data) != "origin-content-data" {
		t.Fatalf("expected 'origin-content-data', got %q", string(data))
	}
}

func TestFetch_WithVersion(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/origin/bundle.js" && r.URL.Query().Get("v") == "2" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("version-2-js"))
			return
		}
		http.NotFound(w, r)
	}))
	defer ts.Close()

	data, err := Fetch(ts.URL, "bundle.js", "2")
	if err != nil {
		t.Fatalf("expected successful fetch with version, got err: %v", err)
	}
	if string(data) != "version-2-js" {
		t.Fatalf("expected 'version-2-js', got %q", string(data))
	}
}

func TestFetch_NotFound(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer ts.Close()

	_, err := Fetch(ts.URL, "nonexistent.png", "")
	if err == nil {
		t.Fatal("expected error for nonexistent file, got nil")
	}
}
