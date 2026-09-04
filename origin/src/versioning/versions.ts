import Redis from "ioredis"
import config from "../config"

const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
})

redis.on("error", (err) => {
    console.error("Redis versions client error:", err)
})

export async function pushVersion(key: string, timestamp: string | number): Promise<number> {
    return await redis.rpush(`versions:${key}`, String(timestamp))
}

export async function getVersions(key: string): Promise<string[]> {
    return await redis.lrange(`versions:${key}`, 0, -1)
}


export const getVersion = getVersions

export async function getVersionTimestamp(
    key: string,
    versionNumber: number
): Promise<string | null> {
    if (versionNumber < 1) {
        return null
    }
    return await redis.lindex(`versions:${key}`, versionNumber - 1)
}


export const getTimestamp = getVersionTimestamp

export async function getLatestVersion(key: string): Promise<string | null> {
    return await redis.lindex(`versions:${key}`, -1)
}