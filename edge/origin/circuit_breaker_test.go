package origin

import (
	"errors"
	"testing"
	"time"
)

func TestCircuitBreaker_Success(t *testing.T) {
	cb := New(3, 100*time.Millisecond)

	err := cb.Call(func() error {
		return nil
	})
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if cb.state != Closed {
		t.Fatalf("expected Closed state, got %v", cb.state)
	}
}

func TestCircuitBreaker_TripsOpen(t *testing.T) {
	cb := New(3, 100*time.Millisecond)
	dummyErr := errors.New("upstream failed")

	for i := 0; i < 3; i++ {
		_ = cb.Call(func() error {
			return dummyErr
		})
	}

	if cb.state != Open {
		t.Fatalf("expected Open state after 3 failures, got %v", cb.state)
	}

	// Should reject immediately without calling fn
	called := false
	err := cb.Call(func() error {
		called = true
		return nil
	})
	if !errors.Is(err, ErrOpen) {
		t.Fatalf("expected ErrOpen, got %v", err)
	}
	if called {
		t.Fatal("expected function NOT to be called when breaker is Open")
	}
}

func TestCircuitBreaker_HalfOpenAndRecovery(t *testing.T) {
	cb := New(2, 50*time.Millisecond)
	dummyErr := errors.New("fail")

	_ = cb.Call(func() error { return dummyErr })
	_ = cb.Call(func() error { return dummyErr })

	if cb.state != Open {
		t.Fatalf("expected Open state, got %v", cb.state)
	}

	// Wait for reset timeout
	time.Sleep(60 * time.Millisecond)

	// Next call should probe in HalfOpen and succeed -> Closed
	err := cb.Call(func() error {
		return nil
	})
	if err != nil {
		t.Fatalf("expected successful call, got %v", err)
	}
	if cb.state != Closed {
		t.Fatalf("expected Closed state after recovery, got %v", cb.state)
	}
	if cb.failures != 0 {
		t.Fatalf("expected failures counter reset to 0, got %d", cb.failures)
	}
}

func TestCircuitBreaker_HalfOpenReTrips(t *testing.T) {
	cb := New(2, 50*time.Millisecond)
	dummyErr := errors.New("fail")

	_ = cb.Call(func() error { return dummyErr })
	_ = cb.Call(func() error { return dummyErr })

	time.Sleep(60 * time.Millisecond)

	// Call fails in HalfOpen state -> trips back to Open immediately
	err := cb.Call(func() error {
		return dummyErr
	})
	if !errors.Is(err, dummyErr) {
		t.Fatalf("expected dummyErr, got %v", err)
	}
	if cb.state != Open {
		t.Fatalf("expected Open state after failure in HalfOpen, got %v", cb.state)
	}
}

