import { Router, Request, Response } from "express"
import { deleteObject } from "../storage/minio"
import { publishPurge } from "../invalidation/publisher"

const router = Router()


router.delete("/file/:id", async (req: Request, res: Response) => {
   const Id = req.params.id

   if (typeof Id !== "string") {
    return res.status(400).json({
        message: "invalid file id"
    })
   }

  try {
  
    await deleteObject(Id)

    
    await publishPurge(Id)

    res.json({ success: true, key: Id })
  } catch (err) {
    res.status(500).json({ error: "delete failed" })
  }
})

export default router