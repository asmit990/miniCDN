package cache

import (
	"testing"
	"time"
)

func TestCacheHit(t *testing.T) {
	c := NewCache(1024, 5*time.Second)
	c.Set("cat.png", []byte("imagedata"))

	val, etag, ok := c.Get("cat.png")
	if !ok {
		t.Fatal("expected hit, got miss")
	}
	if string(val) != "imagedata" {
		t.Fatal("wrong value returned")
	}
	if etag == "" {
		t.Fatal("expected etag to be set")
	}
}

func TestCacheMiss(t *testing.T) {
	c := NewCache(1024, 5*time.Second)

	_, _, ok := c.Get("ghost.png")
	if ok {
		t.Fatal("expected miss, got hit")
	}
}

func TestEviction(t *testing.T) {
	// capacity = 10 bytes
	c := NewCache(10, 5*time.Second)

	c.Set("a", []byte("12345"))
	c.Set("b", []byte("12345"))
	c.Set("c", []byte("12345"))

	_, _, ok := c.Get("a")
	if ok {
		t.Fatal("a should have been evicted")
	}
}

func TestDelete(t *testing.T) {
	c := NewCache(1024, 5*time.Second)
	c.Set("logo.png", []byte("data"))
	c.Delete("logo.png")

	_, _, ok := c.Get("logo.png")
	if ok {
		t.Fatal("should have been deleted")
	}
}

func TestDeleteWithPrefix(t *testing.T) {
	c := NewCache(1024, 5*time.Second)
	c.Set("cat.png", []byte("latest"))
	c.Set("cat.png?v=1", []byte("version1"))
	c.Set("cat.png?v=2", []byte("version2"))
	c.Set("dog.png", []byte("dog"))

	c.DeleteWithPrefix("cat.png")

	if _, _, ok := c.Get("cat.png"); ok {
		t.Fatal("cat.png should have been deleted")
	}
	if _, _, ok := c.Get("cat.png?v=1"); ok {
		t.Fatal("cat.png?v=1 should have been deleted")
	}
	if _, _, ok := c.Get("cat.png?v=2"); ok {
		t.Fatal("cat.png?v=2 should have been deleted")
	}
	if _, _, ok := c.Get("dog.png"); !ok {
		t.Fatal("dog.png should NOT have been deleted")
	}
}

func TestLRUOrder(t *testing.T) {
	c := NewCache(10, 5*time.Second)
	c.Set("a", []byte("12345"))
	c.Set("b", []byte("12345"))

	c.Get("a")
	c.Set("c", []byte("12345"))

	_, _, aOk := c.Get("a")
	_, _, bOk := c.Get("b")

	if !aOk {
		t.Fatal("a should still be in cache")
	}
	if bOk {
		t.Fatal("b should have been evicted")
	}
}

func TestStaleWhileRevalidate(t *testing.T) {
	// TTL = 50ms, Stale window = 60ms (Total lifetime before dead: 110ms)
	c := NewCache(1024, 50*time.Millisecond, 60*time.Millisecond)
	c.Set("article.html", []byte("v1-content"))

	// 1. Immediately: should be StateFresh
	val, _, state := c.GetWithStale("article.html")
	if state != StateFresh {
		t.Fatalf("expected StateFresh, got %v", state)
	}
	if string(val) != "v1-content" {
		t.Fatalf("unexpected content: %s", string(val))
	}

	// 2. Wait 70ms: TTL (50ms) has expired, but within Stale window (up to 110ms)
	time.Sleep(70 * time.Millisecond)

	val, _, state = c.GetWithStale("article.html")
	if state != StateStale {
		t.Fatalf("expected StateStale, got %v", state)
	}
	if string(val) != "v1-content" {
		t.Fatalf("expected stale v1 content to still be served, got %s", string(val))
	}

	// 3. Wait another 50ms (total ~120ms): past TTL + Stale duration -> StateMiss
	time.Sleep(50 * time.Millisecond)

	_, _, state = c.GetWithStale("article.html")
	if state != StateMiss {
		t.Fatalf("expected StateMiss after stale window expired, got %v", state)
	}
}

func TestUpdateRefreshesTTL(t *testing.T) {
	c := NewCache(1024, 50*time.Millisecond, 50*time.Millisecond)
	c.Set("page", []byte("old"))

	time.Sleep(60 * time.Millisecond) // now stale

	_, _, state := c.GetWithStale("page")
	if state != StateStale {
		t.Fatalf("expected StateStale, got %v", state)
	}

	// Background revalidation updates the key
	c.Set("page", []byte("new"))

	val, _, state := c.GetWithStale("page")
	if state != StateFresh {
		t.Fatalf("expected StateFresh after Set, got %v", state)
	}
	if string(val) != "new" {
		t.Fatalf("expected 'new', got %s", string(val))
	}
}

