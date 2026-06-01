import express from "express"
import config from "./config"
import { initBucket } from "./storage/minio"
import uploadRouter from "./routes/upload"
import fetchRouter from "./routes/fetch"
import deleteRouter from "./routes/delete"

const app = express()
app.use(express.json())

app.use(uploadRouter)
app.use(fetchRouter)
app.use(deleteRouter)

app.get("/health", (req, res) => res.send("ok"))

async function start() {
  await initBucket()
  app.listen(config.port, () => {
    console.log(`Origin server running on port ${config.port}`)
  })
}

start()
