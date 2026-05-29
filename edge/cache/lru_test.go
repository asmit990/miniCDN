package cache

import "testing"

func TestCacheHit(t *testing.T) {
    c := NewCache(1024)
    c.Set("cat.png", []byte("imagedata"))

    val, ok := c.Get("cat.png")
    if !ok {
        t.Fatal("expected hit, got miss")
    }
    if string(val) != "imagedata" {
        t.Fatal("wrong value returned")
    }
}

func TestCacheMiss(t *testing.T) {
    c := NewCache(1024)

    _, ok := c.Get("ghost.png")
    if ok {
        t.Fatal("expected miss, got hit")
    }
}

func TestEviction(t *testing.T) {
    // capacity = 10 bytes
    c := NewCache(10)

    c.Set("a", []byte("12345"))  // 5 bytes
    c.Set("b", []byte("12345"))  // 5 bytes — full
    c.Set("c", []byte("12345"))  // 5 bytes — "a" should be evicted

    _, ok := c.Get("a")
    if ok {
        t.Fatal("a should have been evicted")
    }
}

func TestDelete(t *testing.T) {
    c := NewCache(1024)
    c.Set("logo.png", []byte("data"))
    c.Delete("logo.png")

    _, ok := c.Get("logo.png")
    if ok {
        t.Fatal("should have been deleted")
    }
}

func TestLRUOrder(t *testing.T) {
    // a, b added. then a accessed. b should evict first
    c := NewCache(10)
    c.Set("a", []byte("12345"))  // 5 bytes
    c.Set("b", []byte("12345"))  // 5 bytes

    c.Get("a")                   // a becomes most recent

    c.Set("c", []byte("12345"))  // b should evict, not a

    _, aOk := c.Get("a")
    _, bOk := c.Get("b")

    if !aOk {
        t.Fatal("a should still be in cache")
    }
    if bOk {
        t.Fatal("b should have been evicted")
    }
}