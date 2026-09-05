import { Router, Request, Response } from "express"
import { listObjects } from "../storage/minio"
import { getVersions } from "../versioning/versions"

const router = Router()

router.get("/admin/files", async (req: Request, res: Response) => {
    try {
        const keys = await listObjects()
        const files = keys.filter(key => !key.includes(".v."))
        res.json({ files, count: files.length })
    } catch (error) {
        console.error("Error fetching files:", error)
        res.status(500).json({ error: "Failed to fetch files" })
    }
})


router.get("/files", async (req: Request, res: Response) => {
    try {
        const keys = await listObjects()
        const files = keys.filter(key => !key.includes(".v."))
        res.json({ files, count: files.length })
    } catch (error) {
        console.error("Error fetching files:", error)
        res.status(500).json({ error: "Failed to fetch files" })
    }
})

router.get("/admin/versions/:file", async (req: Request, res: Response) => {
    try {
        const file = req.params.file
        if (!file || typeof file !== "string") {
            return res.status(400).json({ error: "Invalid file name" })
        }

        const timestamps = await getVersions(file)
        const versions = timestamps.map((timestamp, index) => ({
            version: index + 1,
            timestamp,
        }))

        res.json({
            file,
            count: versions.length,
            versions,
            timestamps,
        })
    } catch (error) {
        console.error("Error fetching versions:", error)
        res.status(500).json({ error: "Failed to fetch versions" })
    }
})

export default router