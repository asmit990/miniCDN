package tracing

import (
	"fmt"
	"time"

	"crypto/rand"
	"encoding/hex"
)

// Span represents a single timed unit of work in a distributed trace.
type Span struct {
	TraceID   string            `json:"traceId"`
	SpanID    string            `json:"spanId"`
	Service   string            `json:"service"`
	StartTime int64             `json:"startMs"`
	Duration  float64           `json:"durationMs"`
	Status    string            `json:"status"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

// NewSpan creates a span for the current service.
func NewSpan(traceID, service string) *Span {
	b := make([]byte, 8)
	rand.Read(b)
	return &Span{
		TraceID:   traceID,
		SpanID:    hex.EncodeToString(b),
		Service:   service,
		StartTime: time.Now().UnixMilli(),
	}
}

// End marks the span as finished, computes duration from StartTime.
func (s *Span) End() {
	s.Duration = float64(time.Now().UnixMilli()-s.StartTime)
}

// ToHeader serializes the span as a compact header value.
// Format: "service=edge;dur=2.5;status=HIT"
func (s *Span) ToHeader() string {
	return fmt.Sprintf("service=%s;dur=%.1f;status=%s", s.Service, s.Duration, s.Status)
}
