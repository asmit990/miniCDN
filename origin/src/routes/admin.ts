import { Router, Request, Response } from "express"
import { listObjects, getObject, putVersionObject, statObject } from "../storage/minio"
import { getVersions, getVersionTimestamp, pushVersion } from "../versioning/versions"
import { publishPurge } from "../invalidation/publisher"

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

const handleRollback = async (req: Request, res: Response) => {
    try {
        const file = req.params.file

        if (!file || typeof file !== "string") {
            return res.status(400).json({ error: "Invalid file name" })
        }

        const versionParam = req.query.v ?? req.body?.v ?? req.body?.version
        if (versionParam === undefined) {
            return res.status(400).json({ error: "Version parameter 'v' is required (e.g. ?v=2)" })
        }

        const versionNum = Number(versionParam)
        if (isNaN(versionNum) || versionNum < 1 || !Number.isInteger(versionNum)) {
            return res.status(400).json({ error: "Invalid version number" })
        }

        const timestamp = await getVersionTimestamp(file, versionNum)
        if (!timestamp) {
            return res.status(404).json({ error: `Version ${versionNum} not found for file ${file}` })
        }

        const snapshotKey = `${file}.v.${timestamp}`
        let snapshotBuffer: Buffer
        try {
            snapshotBuffer = await getObject(snapshotKey)
        } catch (err) {
            return res.status(404).json({ error: `Snapshot file ${snapshotKey} not found in storage` })
        }

        let contentType = "application/octet-stream"
        try {
            const stat = await statObject(snapshotKey)
            if (stat.metaData && stat.metaData["content-type"]) {
                contentType = stat.metaData["content-type"]
            }
        } catch {

        }


        const newTimestamp = await putVersionObject(file, snapshotBuffer, contentType)


        await pushVersion(file, newTimestamp)


        await publishPurge(file)

        return res.json({
            success: true,
            message: `Successfully rolled back ${file} to version ${versionNum}`,
            file,
            rolledBackToVersion: versionNum,
            sourceTimestamp: timestamp,
            newVersionTimestamp: newTimestamp,
        })
    } catch (err) {
        console.error("Rollback error:", err)
        return res.status(500).json({ error: "Failed to rollback version" })
    }
}

router.post("/admin/rollback/:file", handleRollback)
router.get("/admin/rollback/:file", handleRollback)

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