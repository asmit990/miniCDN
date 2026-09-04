import { Router, Request, Response } from "express"
import { getObject } from "../storage/minio"
import { recordOriginFetch } from "../testing/originFetchCounter"
import { getVersionTimestamp } from "../versioning/versions"

const router = Router()

router.get("/origin/:file", async (req: Request, res: Response) => {
  const fileParam = req.params.file

  if (typeof fileParam !== "string") {
    return res.status(400).json({
      error: "Invalid file name",
    })
  }

  try {
    recordOriginFetch()
    const delay = Number(process.env.TEST_ORIGIN_FETCH_DELAY_MS || "0")
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    let targetKey = fileParam

    if (req.query.v !== undefined) {
      const versionNum = Number(req.query.v)
      if (isNaN(versionNum) || versionNum < 1) {
        return res.status(400).json({ error: "Invalid version number" })
      }

      const timestamp = await getVersionTimestamp(fileParam, versionNum)
      if (!timestamp) {
        return res.status(404).json({ error: "Version not found" })
      }

      targetKey = `${fileParam}.v.${timestamp}`
    }

    const data = await getObject(targetKey)
    res.setHeader("Cache-Control", "public, max-age=3600")
    res.send(data)
  } catch (err) {
    res.status(404).json({ error: "file not found" })
  }
})

export default router
