import express, { Request, Response, NextFunction } from "express"
import config from "./config"
import { rateLimiter } from "./ratelimiter"
import { startHealthCheck, stopHealthCheck } from "./healthcheck"
import { proxyRequest } from "./proxy"

const app = express()
let isShuttingDown = false

app.get("/health", (req, res) => {
  if (isShuttingDown) {
    res.status(503).send("gateway shutting down")
    return
  }
  res.send("gateway ok")
})

app.use((req: Request, res: Response, next: NextFunction) => {
  if (isShuttingDown) {
    res.setHeader("Connection", "close")
    res.status(503).json({ error: "Service Unavailable: Gateway is shutting down" })
    return
  }
  next()
})

app.use(rateLimiter)

app.get("/file/*filepath", proxyRequest)

startHealthCheck()

const server = app.listen(config.port, () => {
  console.log(`Gateway running on port ${config.port}`)
})

function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}. Initiating graceful shutdown...`)
  isShuttingDown = true
  stopHealthCheck()

  server.close((err) => {
    if (err) {
      console.error("Error during gateway shutdown:", err)
      process.exit(1)
    }
    console.log("Gateway shut down gracefully")
    process.exit(0)
  })

  setTimeout(() => {
    console.error("Gateway shutdown timed out after 10s, forcing exit")
    process.exit(1)
  }, 10000).unref()
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))
