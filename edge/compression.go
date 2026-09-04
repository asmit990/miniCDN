package main

import (
	"bytes"
	"compress/gzip"
	"strings"
)

var compressibleTypes = []string{
	"text/html",
	"text/css",
	"text/javascript",
	"application/javascript",
	"application/json",
	"image/svg+xml",
	"text/plain",
}

func isCompressible(contentType string) bool {
	ct := strings.ToLower(contentType)
	for _, t := range compressibleTypes {
		if strings.Contains(ct, t) {
			return true
		}
	}
	return false
}

func gzipCompress(data []byte) ([]byte, error) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)

	if _, err := gz.Write(data); err != nil {
		return nil, err
	}

	if err := gz.Close(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}
