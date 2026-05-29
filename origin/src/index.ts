import express from "express"
import config from "./config"
import { initBusket } from "./storage/minio"
import uploadRouter from "./routes/upload"
import fetchRouter from "./routes/fetch"
import deleteRouter from "./routes/delete"

const app = express()
app.use(express.json())

// routes
app.use(uploadRouter)
app.use(fetchRouter)
app.use(deleteRouter)

// health
app.get("/health", (req, res) => res.send("ok"))

// start
async function start() {
  await initBusket()  // make sure MinIO bucket exists
  app.listen(config.port, () => {
    console.log(`Origin server running on port ${config.port}`)
  })
}

start()