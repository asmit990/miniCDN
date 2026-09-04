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

func Fetch(originURL string, key string) ([]byte, error) {
	var fetchedBytes []byte
	var notFound bool

	result, err, _ := group.Do(key, func() (interface{}, error) {

		cbErr := cb.Call(func() error {
			url := fmt.Sprintf("%s/origin/%s", originURL, key)

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
			return nil, fmt.Errorf("file not found: %s", key)
		}

		return fetchedBytes, nil
	})

	if err != nil {
		return nil, err
	}

	return result.([]byte), nil
}
