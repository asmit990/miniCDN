import { Request, Response } from "express"
import axios, { AxiosError } from "axios"
import { detectRegion, pickEdge } from "./router"


const EDGE_TIMEOUT_MS = 5000  


async function fetchWithRetry(
  req: Request,
  region: string,
  attempt = 0
): Promise<{ data: Buffer; headers: Record<string, string>; status: number; region: string }> {
  const edgeURL = pickEdge(region)

  if (!edgeURL) {
    throw new Error("NO_EDGE_AVAILABLE")
  }

  const targetURL = `${edgeURL}${req.path}`

  try {
    const response = await axios.get(targetURL, {
      responseType: "arraybuffer",
      timeout: EDGE_TIMEOUT_MS,
      headers: {
   
        "x-forwarded-for": req.ip,
        "x-original-region": region,
  
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


    if (axiosErr.response?.status === 404) {
      throw new Error("FILE_NOT_FOUND")
    }

  
    if (attempt < 2) {
      console.warn(`Edge ${region} failed (attempt ${attempt + 1}), trying fallback...`)
      const fallbackRegion = getFallbackRegion(region, attempt + 1)
      if (fallbackRegion) {
        return fetchWithRetry(req, fallbackRegion, attempt + 1)
      }
    }

    throw new Error("EDGE_FAILED")
  }
}

// get next region in fallback chain
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


  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" })
    return
  }

  if (req.path.includes("..") || req.path.includes("//")) {
    res.status(400).json({ error: "invalid path" })
    return
  }

 
  const region = detectRegion(req)

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | region=${region} | ip=${req.ip}`)

  try {

    const { data, headers, status, region: servedBy } = await fetchWithRetry(req, region)


    const latency = Date.now() - startTime
    res.set("X-Edge-Region",    servedBy)
    res.set("X-Cache",          headers["x-cache"] || "UNKNOWN")
    res.set("X-Response-Time",  `${latency}ms`)
    res.set("Content-Type",     headers["content-type"] || "application/octet-stream")
    res.set("Cache-Control",    "public, max-age=3600")

    // security headers
    res.set("X-Content-Type-Options",  "nosniff")
    res.set("X-Frame-Options",         "DENY")
    res.set("Strict-Transport-Security","max-age=31536000")

    console.log(`[OK] ${req.path} | region=${servedBy} | latency=${latency}ms | cache=${headers["x-cache"]}`)

    res.status(status).send(data)

  } catch (err: any) {

    const latency = Date.now() - startTime

    if (err.message === "FILE_NOT_FOUND") {
      console.warn(`[404] ${req.path} | latency=${latency}ms`)
      res.status(404).json({ error: "file not found" })
      return
    }

    if (err.message === "NO_EDGE_AVAILABLE") {
      console.error(`[502] all edges down | latency=${latency}ms`)
      res.status(502).json({ error: "no edge nodes available" })
      return
    }

    console.error(`[502] ${req.path} failed after retries | latency=${latency}ms`)
    res.status(502).json({ error: "edge request failed" })
  }
}