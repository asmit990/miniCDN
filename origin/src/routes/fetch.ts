import { Router, Request, Response } from "express"
import { getObject } from "../storage/minio"

const router = Router()

router.get("/origin/:file", async (req: Request, res: Response) => {
 

    const fileParam = req.params.file

if (typeof fileParam !== "string") {
  return res.status(400).json({
    error: "Invalid file name"
  })
}

  try {
    const data = await getObject(fileParam)
    res.setHeader("Cache-Control", "public, max-age=3600")
    res.send(data)
  } catch (err) {
    res.status(404).json({ error: "file not found" })
  }
})

export default router