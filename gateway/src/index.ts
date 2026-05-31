import express from "express"
import config from "./config"
import { rateLimiter } from "./ratelimiter"
import { startHealthCheck } from "./healthcheck"
import { proxyRequest } from "./proxy"

const app = express()

// rate limiting on all requests
app.use(rateLimiter)

// health check for gateway itself
app.get("/health", (req, res) => res.send("gateway ok"))

// proxy all /file/* requests to correct edge
app.get("/file/*", proxyRequest)

// start
startHealthCheck()  // begin polling edges every 5s

app.listen(config.port, () => {
  console.log(`Gateway running on port ${config.port}`)
})