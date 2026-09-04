import { Router, Request, Response } from "express"
import multer from "multer"
import { putVersionObject } from "../storage/minio"
import { pushVersion } from "../versioning/versions"
import { publishPurge } from "../invalidation/publisher"

const router = Router()

const upload = multer({ storage: multer.memoryStorage() })

router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" })
    return
  }

  const { originalname, buffer, mimetype } = req.file
  const fileKey = req.body?.key || originalname

  try {
    const timestamp = await putVersionObject(fileKey, buffer, mimetype)
    console.log(`File ${fileKey} uploaded to MinIO with version timestamp ${timestamp}`)
    await pushVersion(fileKey, timestamp)
    await publishPurge(fileKey)
    res.json({ message: "File uploaded and purge published", key: fileKey, version: timestamp })
  } catch (err) {
    console.error("Upload error:", err)
    res.status(500).json({ error: "Failed to upload file" })
  }
})

export default router
