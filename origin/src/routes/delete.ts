import { Router, Request, Response } from "express"
import { deleteObject } from "../storage/minio"
import { publishPurge } from "../invalidation/publisher"
import {
  getVersions,
  deleteVersions,
  getVersionTimestamp,
  removeVersion,
} from "../versioning/versions"

const router = Router()

router.delete("/file/:id", async (req: Request, res: Response) => {
  const Id = req.params.id

  if (typeof Id !== "string" || !Id) {
    return res.status(400).json({
      message: "invalid file id",
    })
  }

  try {
    // If specific version is requested to be deleted (e.g. DELETE /file/:id?v=2)
    if (req.query.v !== undefined) {
      const versionNum = Number(req.query.v)
      if (isNaN(versionNum) || versionNum < 1) {
        return res.status(400).json({ error: "Invalid version number" })
      }

      const timestamp = await getVersionTimestamp(Id, versionNum)
      if (!timestamp) {
        return res.status(404).json({ error: "Version not found" })
      }

      await deleteObject(`${Id}.v.${timestamp}`)
      await removeVersion(Id, timestamp)

      return res.json({
        success: true,
        key: Id,
        deletedVersion: versionNum,
        timestamp,
      })
    }

    // Full deletion: remove latest + all version snapshots + redis tracking
    const timestamps = await getVersions(Id)

    // Delete latest object
    await deleteObject(Id)

    // Delete all versioned snapshot objects
    await Promise.all(
      timestamps.map((ts) =>
        deleteObject(`${Id}.v.${ts}`).catch((err) =>
          console.warn(`Could not delete snapshot ${Id}.v.${ts}:`, err)
        )
      )
    )

    // Clean up Redis version list
    await deleteVersions(Id)

    // Broadcast DELETE invalidation to evict from all edge nodes (both latest and versioned entries)
    await publishPurge(Id, "DELETE")

    res.json({
      success: true,
      key: Id,
      versionsDeleted: timestamps.length,
    })
  } catch (err) {
    console.error("Delete error:", err)
    res.status(500).json({ error: "delete failed" })
  }
})

export default router