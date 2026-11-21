package imaging

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"net/url"
	"testing"
)

func TestParseParams_WithParams(t *testing.T) {
	q := url.Values{}
	q.Set("w", "400")
	q.Set("h", "300")
	q.Set("q", "90")
	q.Set("fmt", "jpeg")

	p := ParseParams(q)
	if p == nil {
		t.Fatal("expected non-nil params")
	}
	if p.Width != 400 {
		t.Errorf("Width = %d, want 400", p.Width)
	}
	if p.Height != 300 {
		t.Errorf("Height = %d, want 300", p.Height)
	}
	if p.Quality != 90 {
		t.Errorf("Quality = %d, want 90", p.Quality)
	}
	if p.Format != "jpeg" {
		t.Errorf("Format = %q, want %q", p.Format, "jpeg")
	}
}

func TestParseParams_WithoutParams(t *testing.T) {
	q := url.Values{}
	p := ParseParams(q)
	if p != nil {
		t.Error("expected nil params for empty query")
	}
}

func TestParseParams_DefaultQuality(t *testing.T) {
	q := url.Values{}
	q.Set("w", "100")

	p := ParseParams(q)
	if p == nil {
		t.Fatal("expected non-nil params")
	}
	if p.Quality != 80 {
		t.Errorf("Quality = %d, want default 80", p.Quality)
	}
}

func TestParseParams_WebPFormat(t *testing.T) {
	q := url.Values{}
	q.Set("fmt", "webp")

	p := ParseParams(q)
	if p == nil {
		t.Fatal("expected non-nil params")
	}
	if p.Format != "webp" {
		t.Errorf("Format = %q, want %q", p.Format, "webp")
	}
}

func TestIsImage(t *testing.T) {
	tests := []struct {
		contentType string
		want        bool
	}{
		{"image/jpeg", true},
		{"image/png", true},
		{"image/gif", true},
		{"image/webp", true},
		{"image/svg+xml", false},
		{"text/html", false},
		{"application/json", false},
		{"application/octet-stream", false},
	}

	for _, tt := range tests {
		got := IsImage(tt.contentType)
		if got != tt.want {
			t.Errorf("IsImage(%q) = %v, want %v", tt.contentType, got, tt.want)
		}
	}
}

func TestCacheKeySuffix(t *testing.T) {
	p := &Params{Width: 400, Height: 300, Quality: 90, Format: "jpeg"}
	suffix := CacheKeySuffix(p)
	// Parts should be sorted: fmt, h, q, w
	want := "|fmt=jpeg|h=300|q=90|w=400"
	if suffix != want {
		t.Errorf("CacheKeySuffix = %q, want %q", suffix, want)
	}
}

func TestCacheKeySuffix_Nil(t *testing.T) {
	suffix := CacheKeySuffix(nil)
	if suffix != "" {
		t.Errorf("CacheKeySuffix(nil) = %q, want empty", suffix)
	}
}

// createTestPNG generates a small solid-color PNG for testing.
func createTestPNG(w, h int) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.NRGBA{R: 255, G: 0, B: 0, A: 255})
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

// createTestJPEG generates a small solid-color JPEG for testing.
func createTestJPEG(w, h int) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.NRGBA{R: 0, G: 0, B: 255, A: 255})
		}
	}
	var buf bytes.Buffer
	_ = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95})
	return buf.Bytes()
}

func TestOptimizeResize_PNG(t *testing.T) {
	src := createTestPNG(200, 100)

	params := &Params{Width: 50, Quality: 80}
	result, ct, err := Optimize(src, params)
	if err != nil {
		t.Fatalf("Optimize failed: %v", err)
	}
	if ct != "image/png" {
		t.Errorf("content-type = %q, want %q", ct, "image/png")
	}

	// Decode the result and check dimensions
	img, _, err := image.Decode(bytes.NewReader(result))
	if err != nil {
		t.Fatalf("failed to decode result: %v", err)
	}
	bounds := img.Bounds()
	if bounds.Dx() != 50 {
		t.Errorf("result width = %d, want 50", bounds.Dx())
	}
	// Height should be 25 (maintaining 2:1 aspect ratio)
	if bounds.Dy() != 25 {
		t.Errorf("result height = %d, want 25", bounds.Dy())
	}
}

func TestOptimizeResize_JPEG(t *testing.T) {
	src := createTestJPEG(200, 100)

	params := &Params{Width: 100, Height: 50, Quality: 75}
	result, ct, err := Optimize(src, params)
	if err != nil {
		t.Fatalf("Optimize failed: %v", err)
	}
	if ct != "image/jpeg" {
		t.Errorf("content-type = %q, want %q", ct, "image/jpeg")
	}

	img, _, err := image.Decode(bytes.NewReader(result))
	if err != nil {
		t.Fatalf("failed to decode result: %v", err)
	}
	bounds := img.Bounds()
	if bounds.Dx() != 100 {
		t.Errorf("result width = %d, want 100", bounds.Dx())
	}
	if bounds.Dy() != 50 {
		t.Errorf("result height = %d, want 50", bounds.Dy())
	}
}

func TestOptimizeFormatConversion(t *testing.T) {
	src := createTestPNG(100, 100)

	params := &Params{Format: "jpeg", Quality: 85}
	_, ct, err := Optimize(src, params)
	if err != nil {
		t.Fatalf("Optimize failed: %v", err)
	}
	if ct != "image/jpeg" {
		t.Errorf("content-type = %q, want %q", ct, "image/jpeg")
	}
}

func TestOptimizeWebPFallsBackToJPEG(t *testing.T) {
	src := createTestPNG(100, 100)

	params := &Params{Format: "webp", Quality: 80}
	_, ct, err := Optimize(src, params)
	if err != nil {
		t.Fatalf("Optimize failed: %v", err)
	}
	// WebP should fall back to JPEG
	if ct != "image/jpeg" {
		t.Errorf("content-type = %q, want %q (webp fallback to jpeg)", ct, "image/jpeg")
	}
}
