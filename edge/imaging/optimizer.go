package imaging

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"net/url"
	"sort"
	"strconv"
	"strings"
)

type Params struct {
	Width   int
	Height  int
	Quality int
	Format  string
}

func ParseParams(query url.Values) *Params {
	w := query.Get("w")
	h := query.Get("h")
	q := query.Get("q")
	f := query.Get("fmt")

	if w == "" && h == "" && q == "" && f == "" {
		return nil
	}

	p := &Params{Quality: 80}

	if w != "" {
		if v, err := strconv.Atoi(w); err == nil && v > 0 {
			p.Width = v
		}
	}
	if h != "" {
		if v, err := strconv.Atoi(h); err == nil && v > 0 {
			p.Height = v
		}
	}
	if q != "" {
		if v, err := strconv.Atoi(q); err == nil && v >= 1 && v <= 100 {
			p.Quality = v
		}
	}
	if f != "" {
		f = strings.ToLower(f)
		switch f {
		case "jpeg", "jpg":
			p.Format = "jpeg"
		case "png":
			p.Format = "png"
		case "webp":
			p.Format = "webp"
		}
	}

	return p
}

// CacheKeySuffix builds a deterministic, sorted suffix for the image variant
// cache key. Example: "|fmt=jpeg|h=300|q=80|w=400"
func CacheKeySuffix(p *Params) string {
	if p == nil {
		return ""
	}
	var parts []string
	if p.Width > 0 {
		parts = append(parts, fmt.Sprintf("w=%d", p.Width))
	}
	if p.Height > 0 {
		parts = append(parts, fmt.Sprintf("h=%d", p.Height))
	}
	if p.Quality > 0 && p.Quality != 80 {
		parts = append(parts, fmt.Sprintf("q=%d", p.Quality))
	}
	if p.Format != "" {
		outFmt := p.Format
		if outFmt == "webp" {
			outFmt = "jpeg"
		}
		parts = append(parts, fmt.Sprintf("fmt=%s", outFmt))
	}
	if len(parts) == 0 {
		return ""
	}
	sort.Strings(parts)
	return "|" + strings.Join(parts, "|")
}

func IsImage(contentType string) bool {
	ct := strings.ToLower(contentType)
	for _, t := range []string{
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
	} {
		if strings.Contains(ct, t) {
			return true
		}
	}
	return false
}

func resizeBilinear(src image.Image, targetW, targetH int) *image.RGBA {
	dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	bounds := src.Bounds()
	origW := bounds.Dx()
	origH := bounds.Dy()

	if targetW <= 0 || targetH <= 0 || origW <= 0 || origH <= 0 {
		return dst
	}

	for y := 0; y < targetH; y++ {
		for x := 0; x < targetW; x++ {
			gx := float64(x) * float64(origW-1) / float64(targetW)
			gy := float64(y) * float64(origH-1) / float64(targetH)
			gxi := int(gx)
			gyi := int(gy)

			c00 := src.At(bounds.Min.X+gxi, bounds.Min.Y+gyi)
			c10 := src.At(bounds.Min.X+min(gxi+1, origW-1), bounds.Min.Y+gyi)
			c01 := src.At(bounds.Min.X+gxi, bounds.Min.Y+min(gyi+1, origH-1))
			c11 := src.At(bounds.Min.X+min(gxi+1, origW-1), bounds.Min.Y+min(gyi+1, origH-1))

			r00, g00, b00, a00 := c00.RGBA()
			r10, g10, b10, a10 := c10.RGBA()
			r01, g01, b01, a01 := c01.RGBA()
			r11, g11, b11, a11 := c11.RGBA()

			fx := gx - float64(gxi)
			fy := gy - float64(gyi)

			rTop := float64(r00)*(1-fx) + float64(r10)*fx
			gTop := float64(g00)*(1-fx) + float64(g10)*fx
			bTop := float64(b00)*(1-fx) + float64(b10)*fx
			aTop := float64(a00)*(1-fx) + float64(a10)*fx

			rBot := float64(r01)*(1-fx) + float64(r11)*fx
			gBot := float64(g01)*(1-fx) + float64(g11)*fx
			bBot := float64(b01)*(1-fx) + float64(b11)*fx
			aBot := float64(a01)*(1-fx) + float64(a11)*fx

			r := uint8((rTop*(1-fy) + rBot*fy) / 257)
			g := uint8((gTop*(1-fy) + gBot*fy) / 257)
			b := uint8((bTop*(1-fy) + bBot*fy) / 257)
			a := uint8((aTop*(1-fy) + aBot*fy) / 257)

			dst.SetRGBA(x, y, color.RGBA{R: r, G: g, B: b, A: a})
		}
	}
	return dst
}

// Optimize processes raw image bytes according to params.
func Optimize(data []byte, params *Params) ([]byte, string, error) {
	if params == nil {
		return data, "", fmt.Errorf("no params provided")
	}

	src, srcFmt, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode image: %w", err)
	}

	bounds := src.Bounds()
	origW := bounds.Dx()
	origH := bounds.Dy()

	targetW := params.Width
	targetH := params.Height

	needsResize := targetW > 0 || targetH > 0

	if needsResize {
		if targetW > 0 && targetH == 0 {
			targetH = origH * targetW / origW
			if targetH == 0 {
				targetH = 1
			}
		} else if targetH > 0 && targetW == 0 {
			targetW = origW * targetH / origH
			if targetW == 0 {
				targetW = 1
			}
		}
	}

	var result image.Image = src
	if needsResize && (targetW != origW || targetH != origH) {
		result = resizeBilinear(src, targetW, targetH)
	}

	outFmt := params.Format
	if outFmt == "" {
		outFmt = srcFmt
	}

	// WebP encoding in pure Go falls back to JPEG
	if outFmt == "webp" {
		outFmt = "jpeg"
	}

	var buf bytes.Buffer
	var contentType string

	switch outFmt {
	case "jpeg", "jpg":
		err = jpeg.Encode(&buf, result, &jpeg.Options{Quality: params.Quality})
		contentType = "image/jpeg"
	case "png":
		err = png.Encode(&buf, result)
		contentType = "image/png"
	case "gif":
		err = gif.Encode(&buf, result, nil)
		contentType = "image/gif"
	default:
		err = jpeg.Encode(&buf, result, &jpeg.Options{Quality: params.Quality})
		contentType = "image/jpeg"
	}

	if err != nil {
		return nil, "", fmt.Errorf("failed to encode image as %s: %w", outFmt, err)
	}

	return buf.Bytes(), contentType, nil
}
