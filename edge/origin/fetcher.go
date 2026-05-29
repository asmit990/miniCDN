package origin

import (
    "fmt"
    "io"
    "net/http"

    "golang.org/x/sync/singleflight"
)

var group singleflight.Group

func Fetch(originURL string, key string) ([]byte, error) {

	result, err, _ := group.Do(key, func() (interface{}, error) {
        url := fmt.Sprintf("%s/origin/%s", originURL, key)

        resp, err := http.Get(url)
        if err != nil {
            return nil, err
        }
        defer resp.Body.Close()

        if resp.StatusCode == 404 {
            return nil, fmt.Errorf("file not found: %s", key)
        }

        bytes, err := io.ReadAll(resp.Body)
        if err != nil {
            return nil, err
        }

        return bytes, nil
    })

    if err != nil {
        return nil, err
    }

    return result.([]byte), nil
}