package invalidation 


import (
	"context"
	"encoding/json"
	"log"

	"github.com/redis/go-redis/v9"
)



type PurgeMessage struct {
	Type   string `json:"type"`
	Action string `json:"action"`
	Key    string `json:"key"`
}

type Cache interface {
	Delete(key string)
	DeleteWithPrefix(prefix string)
}

func StartSubscriber(redisURL string, cache Cache) {
	ctx := context.Background()

	client := redis.NewClient(&redis.Options{
		Addr: redisURL,
	})

	if err := client.Ping(ctx).Err(); err != nil {
		log.Printf("Redis connection failed: %v", err)
		return
	}
	log.Println("Redis connected — listening for PURGE events")

	pubsub := client.Subscribe(ctx, "cdn:invalidation")
	ch := pubsub.Channel()

	go func() {
		for msg := range ch {
			var purge PurgeMessage

			// parse the message
			if err := json.Unmarshal([]byte(msg.Payload), &purge); err != nil {
				log.Printf("Invalid purge message: %v", err)
				continue
			}

			event := purge.Type
			if event == "" {
				event = purge.Action
			}

			switch event {
			case "DELETE", "PURGE_ALL":
				cache.DeleteWithPrefix(purge.Key)
				log.Printf("DELETED %s (and all versioned entries) from cache", purge.Key)
			case "PURGE":
				cache.Delete(purge.Key)
				log.Printf("PURGED %s from cache", purge.Key)
			}
		}
	}()
}
