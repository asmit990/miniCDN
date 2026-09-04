package origin

import (
	"errors"
	"sync"
	"time"
)

type State int

const (
	Closed State = iota
	Open
	HalfOpen
)

var ErrOpen = errors.New("circuit breaker is open")

type CircuitBreaker struct {
	mu           sync.Mutex
	state        State
	failures     int
	failureLimit int
	resetTimeout time.Duration
	openedAt     time.Time
}

func New(failureLimit int, resetTimeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		state:        Closed,
		failureLimit: failureLimit,
		resetTimeout: resetTimeout,
	}
}

func (cb *CircuitBreaker) Call(fn func() error) error {
	cb.mu.Lock()
	if cb.state == Open {
		if time.Since(cb.openedAt) > cb.resetTimeout {
			cb.state = HalfOpen
		} else {
			cb.mu.Unlock()
			return ErrOpen
		}
	}

	cb.mu.Unlock()

	err := fn()

	cb.mu.Lock()
	defer cb.mu.Unlock()

	if err != nil {
		cb.failures++
		if cb.state == HalfOpen || cb.failures >= cb.failureLimit {
			cb.state = Open
			cb.openedAt = time.Now()
		}

		return err

	}

	cb.failures = 0
	cb.state = Closed
	return nil
}
