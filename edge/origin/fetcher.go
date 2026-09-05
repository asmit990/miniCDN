package origin

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"golang.org/x/sync/singleflight"
)

var group singleflight.Group
var cb = New(5, 30*time.Second)

var errNotFound = errors.New("file not found")

func Fetch(originURL string, key string, version string) ([]byte, error) {
	var fetchedBytes []byte
	var notFound bool

	fetchKey := key
	if version != "" {
		fetchKey = fmt.Sprintf("%s?v=%s", key, version)
	}

	result, err, _ := group.Do(fetchKey, func() (interface{}, error) {

		cbErr := cb.Call(func() error {
			url := fmt.Sprintf("%s/origin/%s", originURL, key)
			if version != "" {
				url = fmt.Sprintf("%s/origin/%s?v=%s", originURL, key, version)
			}

			resp, err := http.Get(url)
			if err != nil {
				return err
			}
			defer resp.Body.Close()

			if resp.StatusCode == 404 {
				notFound = true
				return nil
			}

			if resp.StatusCode >= 500 {
				return fmt.Errorf("origin server error: %d", resp.StatusCode)
			}

			if resp.StatusCode >= 400 {
				return fmt.Errorf("origin returned status %d", resp.StatusCode)
			}

			bytes, err := io.ReadAll(resp.Body)
			if err != nil {
				return err
			}

			fetchedBytes = bytes
			return nil
		})

		if cbErr != nil {
			return nil, cbErr
		}

		if notFound {
			if version != "" {
				return nil, fmt.Errorf("file not found: %s (version %s)", key, version)
			}
			return nil, fmt.Errorf("file not found: %s", key)
		}

		return fetchedBytes, nil
	})

	if err != nil {
		return nil, err
	}

	return result.([]byte), nil
}
