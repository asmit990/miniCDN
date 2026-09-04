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
