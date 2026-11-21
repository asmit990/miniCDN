import { Router, Request, Response } from "express"
import crypto from "crypto"
import config from "../config"

const signRouter = Router()

interface SignRequestBody {
  path: string
  expiresIn: number
  v?: number
}

signRouter.post("/admin/sign", (req: Request, res: Response) => {
  const { path, expiresIn, v } = req.body as SignRequestBody

  if (!path || !expiresIn) {
    res.status(400).json({ error: "path and expiresIn are required" })
    return
  }

  const expires = Math.floor(Date.now() / 1000) + expiresIn

  // HMAC-SHA256 of path + expires
  const hmac = crypto.createHmac("sha256", config.signingSecret)
  hmac.update(path + expires.toString())
  const token = hmac.digest("hex")

  // Build the signed URL
  let url = `/file/${path}?expires=${expires}&token=${token}`
  if (v !== undefined) {
    url += `&v=${v}`
  }

  res.json({ url, expires })
})

export default signRouter
