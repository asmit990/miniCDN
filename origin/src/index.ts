import express, { Request, Response, NextFunction } from "express"
import config from "./config"
import { initBucket } from "./storage/minio"
import uploadRouter from "./routes/upload"
import fetchRouter from "./routes/fetch"
import deleteRouter from "./routes/delete"
import adminRouter from "./routes/admin"
import signRouter from "./routes/sign"
import {
  getOriginFetchCount,
  resetOriginFetchCount,
} from "./testing/originFetchCounter"

const app = express()
let isShuttingDown = false

// Drain middleware — reject incoming requests when server is draining
app.use((req: Request, res: Response, next: NextFunction) => {
  if (isShuttingDown) {
    res.setHeader("Connection", "close")
    res.status(503).json({ error: "Service Unavailable: Origin is shutting down" })
    return
  }
  next()
})

app.use(express.json())

app.use(uploadRouter)
app.use(fetchRouter)
app.use(deleteRouter)
app.use(adminRouter)
app.use(signRouter)

app.get("/health", (req, res) => {
  if (isShuttingDown) {
    res.status(503).send("origin shutting down")
    return
  }
  res.send("ok")
})

// Test instrumentation is opt-in so it is never exposed in a normal deployment.
if (process.env.TEST_MODE === "true") {
  app.get("/_test/origin-fetches", (req, res) => {
    res.json({ count: getOriginFetchCount() })
  })

  app.post("/_test/origin-fetches/reset", (req, res) => {
    resetOriginFetchCount()
    res.sendStatus(204)
  })
}

async function start() {
  await initBucket()
  const server = app.listen(config.port, () => {
    console.log(`Origin server running on port ${config.port}`)
  })

  function gracefulShutdown(signal: string) {
    console.log(`Received ${signal}. Initiating graceful shutdown for origin...`)
    isShuttingDown = true

    server.close((err) => {
      if (err) {
        console.error("Error during origin shutdown:", err)
        process.exit(1)
      }
      console.log("Origin server shut down gracefully")
      process.exit(0)
    })

    // Force close after 10 seconds if active requests hang
    setTimeout(() => {
      console.error("Origin shutdown timed out after 10s, forcing exit")
      process.exit(1)
    }, 10000).unref()
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
  process.on("SIGINT", () => gracefulShutdown("SIGINT"))
}

start()
