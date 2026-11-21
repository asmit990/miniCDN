package signing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"time"
)

// Validator verifies HMAC-signed URLs with expiry timestamps.
type Validator struct {
	secret string
}

// NewValidator creates a Validator with the given shared secret.
func NewValidator(secret string) *Validator {
	return &Validator{secret: secret}
}

// Validate checks that the HMAC token matches path+expires and that the
// expiry timestamp has not passed. Returns true when the signed URL is valid.
func (v *Validator) Validate(path, token, expires string) bool {
	// Check expiry first
	expireUnix, err := strconv.ParseInt(expires, 10, 64)
	if err != nil {
		return false
	}
	if time.Now().Unix() > expireUnix {
		return false
	}

	// Recompute expected HMAC-SHA256
	mac := hmac.New(sha256.New, []byte(v.secret))
	mac.Write([]byte(path + expires))
	expected := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(expected), []byte(token))
}
