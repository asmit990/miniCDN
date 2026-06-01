import express from "express"
import config from "./config"
import { rateLimiter } from "./ratelimiter"
import { startHealthCheck } from "./healthcheck"
import { proxyRequest } from "./proxy"

const app = express()

app.use(rateLimiter)

app.get("/health", (req, res) => res.send("gateway ok"))

// Express 5 wildcard syntax
app.get("/file/*filepath", proxyRequest)

startHealthCheck()

app.listen(config.port, () => {
  console.log(`Gateway running on port ${config.port}`)
})
