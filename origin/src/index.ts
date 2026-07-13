import express from "express"
import config from "./config"
import { initBucket } from "./storage/minio"
import uploadRouter from "./routes/upload"
import fetchRouter from "./routes/fetch"
import deleteRouter from "./routes/delete"
import {
  getOriginFetchCount,
  resetOriginFetchCount,
} from "./testing/originFetchCounter"

const app = express()
app.use(express.json())

app.use(uploadRouter)
app.use(fetchRouter)
app.use(deleteRouter)

app.get("/health", (req, res) => res.send("ok"))

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
  app.listen(config.port, () => {
    console.log(`Origin server running on port ${config.port}`)
  })
}

start()
