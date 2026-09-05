import { Request, Response } from "express"
import axios, { AxiosError } from "axios"
import { detectRegion, pickEdge } from "./router"
import { randomUUID } from "crypto"
const EDGE_TIMEOUT_MS = 5000

async function fetchWithRetry(
  req: Request,
  region: string,
  attempt = 0
): Promise<{ data: Buffer; headers: Record<string, string>; status: number; region: string }> {
  const edgeURL = pickEdge(region)

  if (!edgeURL) throw new Error("NO_EDGE_AVAILABLE")


  const filepath = (req.params as any).filepath || ""
  const queryIndex = req.url.indexOf("?")
  const queryString = queryIndex !== -1 ? req.url.slice(queryIndex) : ""
  const targetURL = `${edgeURL}/file/${filepath}${queryString}`

  try {
    const response = await axios.get(targetURL, {
      responseType: "arraybuffer",
      timeout: EDGE_TIMEOUT_MS,
      headers: {
        "x-forwarded-for": req.ip,
        "x-original-region": region,
        "X-Request-ID": randomUUID()

      },

    })

    return {
      data: response.data,
      headers: response.headers as Record<string, string>,
      status: response.status,
      region,
    }

  } catch (err) {
    const axiosErr = err as AxiosError

    if (axiosErr.response?.status === 404) throw new Error("FILE_NOT_FOUND")

    if (attempt < 2) {
      console.warn(`Edge ${region} failed (attempt ${attempt + 1}), trying fallback...`)
      const fallbackRegion = getFallbackRegion(region, attempt + 1)
      if (fallbackRegion) return fetchWithRetry(req, fallbackRegion, attempt + 1)
    }

    throw new Error("EDGE_FAILED")
  }
}

function getFallbackRegion(region: string, skip: number): string | null {
  const chains: Record<string, string[]> = {
    IN: ["IN", "GB", "US"],
    GB: ["GB", "US", "IN"],
    US: ["US", "GB", "IN"],
  }
  const chain = chains[region] || chains["IN"]
  return chain[skip] || null
}

export async function proxyRequest(req: Request, res: Response) {
  const startTime = Date.now()

  if (req.path.includes("..") || req.path.includes("//")) {
    res.status(400).json({ error: "invalid path" })
    return
  }

  const region = detectRegion(req)
  const fullPath = req.originalUrl || req.url
  console.log(`[${new Date().toISOString()}] ${req.method} ${fullPath} | region=${region} | ip=${req.ip}`)

  try {
    const { data, headers, status, region: servedBy } = await fetchWithRetry(req, region)

    const latency = Date.now() - startTime
    res.set("X-Edge-Region", servedBy)
    res.set("X-Cache", headers["x-cache"] || "UNKNOWN")
    res.set("X-Response-Time", `${latency}ms`)
    if (headers["x-version"]) {
      res.set("X-Version", headers["x-version"])
    }
    if (headers["etag"]) {
      res.set("ETag", headers["etag"])
    }
    res.set("Content-Type", headers["content-type"] || "application/octet-stream")
    res.set("Cache-Control", headers["cache-control"] || (req.query.v ? "public, max-age=31536000, immutable" : "public, max-age=3600"))
    res.set("X-Content-Type-Options", "nosniff")
    res.set("X-Frame-Options", "DENY")


    console.log(`[OK] ${fullPath} | region=${servedBy} | latency=${latency}ms | cache=${headers["x-cache"]}`)
    res.status(status).send(data)

  } catch (err: any) {
    const latency = Date.now() - startTime

    if (err.message === "FILE_NOT_FOUND") {
      res.status(404).json({ error: "file not found" })
      return
    }
    if (err.message === "NO_EDGE_AVAILABLE") {
      res.status(502).json({ error: "no edge nodes available" })
      return
    }

    console.error(`[502] ${req.path} failed | latency=${latency}ms`)
    res.status(502).json({ error: "edge request failed" })
  }
}
