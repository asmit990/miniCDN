import Redis from "ioredis"
import {Request, Response, NextFunction} from "express"
import config from "./config"

const redis = new Redis({
      host: config.redis.HOST ||  "localhost",
      port: config.redis.PORT || 6379,
})


const WINDOW_SECOND = 60 * 1000
const MAX_REQUESTS = 100

export async function rateLimiter(
    req: Request,
    res: Response,
    next: NextFunction
) {
   const ip = req.ip || req.header("x-forwarded-for") || req.connection.remoteAddress
   const now = Date.now()
   const key = `ratelimits this ${ip}`


   try {
    const count = await redis.incr(key)

    if (count === 1) {
        await redis.pexpire(key, WINDOW_SECOND)

    }

   res.set("X-RateLimit-Limit", String( MAX_REQUESTS.toString() ))
   res.set("X-RateLimit-Remaining", String(Math.max(0, MAX_REQUESTS - count)))
   

   if(count  > MAX_REQUESTS) {
   res.status(429).json({
        error:  `too many requests in ${WINDOW_SECOND / 1000} seconds timestamp: ${now}`,
        retryAfter: `${WINDOW_SECOND / 1000} seconds`,
      })
      return 

   }
      next()
   } 
   catch (err) {
     console.error("Rate Limiter error:", err)
     next()
   }
}


