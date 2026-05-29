import { Router, Request, Response } from "express"
import multer from "multer"
import { putObject} from "../storage/minio"

import { publishPurge } from "../invalidation/publisher"

const router = Router()

const upload = multer({ storage: multer.memoryStorage()})


router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
    if (!req.file) {
        res.status(400).json({ error: "No file uploaded"})
        return
    }

    const { originalname, buffer, mimetype } = req.file

    try {
        await putObject(originalname, buffer, mimetype)
        console.log(`File ${originalname} uploaded to MinIO`)

        await publishPurge(originalname)
        res.json({ message: "File uploaded and purge published", key: originalname })
    } catch (err) {
        console.error("Upload error:", err)
        res.status(500).json({ error: "Failed to upload file" })
    }
})


export default router

