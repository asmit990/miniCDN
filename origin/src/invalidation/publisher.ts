import Redis from "ioredis"
import config from "../config"


const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
})

redis.on("connect", () => {
    console.log("connected to redis")
})
redis.on("error", (err) => {
    console.error("Redis error:", err) 
})

export async function publishPurge(key: string) {
    const message = JSON.stringify({ key })
    await redis.publish("cdn:invalidation", message)
    console.log(`PUBLISH PURGE ${message}`)
}


